-- Bug relatado pelo usuário: pedidos com processo informado em cada medida
-- (site/index.html, campo "Processo" dentro de cada item de "Novo Pedido")
-- davam baixa de estoque certinho, mas a movimentação gerada não ficava
-- vinculada ao número do processo daquela medida.
--
-- Causa raiz: a trigger sincronizar_estoque_pedido() (baixa_automatica_e_
-- cancelamento_pedidos.sql, depois ajustada em corrige_delete_recalculo_
-- baixa_estoque.sql) sempre agrupou os itens do pedido SÓ por código,
-- somando quantidade -- nunca leu nem gravou item->>'processo' em lugar
-- nenhum. Isso existe desde a criação dessa trigger, não é regressão de
-- uma mudança recente.
--
-- Efeito: (1) toda baixa automática saía com processo em branco, mesmo tendo
-- sido informado na medida; (2) se o MESMO código aparecesse em duas medidas
-- do pedido com processos DIFERENTES, as quantidades eram somadas numa única
-- movimentação -- perdendo de vez a separação por processo, não só o rótulo.
--
-- Correção: agrupa por (código, processo) em vez de só código -- cada
-- combinação vira sua própria linha em movimentos, com o processo certo.
-- Idempotente, pode rodar a qualquer momento. Rode no SQL Editor do Supabase.
--
-- IMPORTANTE: isso só corrige daqui pra frente (próxima vez que um pedido for
-- criado/editado). Não conserta pedidos que já baixaram estoque sem processo
-- antes de rodar este script -- pra isso, ver
-- sql/diagnostico_baixa_sem_processo.sql (só leitura, pra decidir o que fazer
-- com o histórico antes de corrigir dado já gravado).

create or replace function sincronizar_estoque_pedido()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  ordem text[] := array[
    'PRE_VENDA','ENTRADA','AUTORIZACAO_GERENCIA','ANALISE_CREDITO','AGUARDANDO_PAGAMENTO',
    'VALIDACAO_TRANSPORTE','FATURAMENTO','SEPARACAO','AGUARDANDO_COLETA','COLETA','RASTREIO','FINALIZADOS'
  ];
  idx_ag int := array_position(ordem, 'AUTORIZACAO_GERENCIA');
  idx_new int;
  passou_ag boolean;
  ja_deduziu boolean;
  estava_cancelado boolean;
  itens_mudaram boolean;
  r record;
  linhas_afetadas int;
begin
  if TG_OP = 'UPDATE' then
    estava_cancelado := coalesce(OLD.cancelado, false);
    itens_mudaram := NEW.itens is distinct from OLD.itens;

    if estava_cancelado and not coalesce(NEW.cancelado, false) then
      raise exception 'Não é possível reativar um pedido cancelado.';
    end if;

    if not itens_mudaram
       and NEW.etapa is not distinct from OLD.etapa
       and coalesce(NEW.cancelado, false) is not distinct from estava_cancelado then
      return NEW;
    end if;
  else
    estava_cancelado := false;
    itens_mudaram := false;
  end if;

  idx_new := array_position(ordem, NEW.etapa);
  passou_ag := idx_new is not null and idx_new > idx_ag;

  ja_deduziu := exists (
    select 1 from movimentos where entrega_id = NEW.id and tipo = 'venda'
  );

  if coalesce(NEW.cancelado, false) and not estava_cancelado then
    if ja_deduziu then
      insert into movimentos (id, data, tipo, codigo, quantidade, numero, pedido, processo, obs, entrega_id, created_by)
      select
        'mov_' || gen_random_uuid(),
        current_date, 'entrada', m.codigo, m.quantidade,
        NEW.numero_nf, NEW.numero_pedido, m.processo,
        'Estorno automático — pedido cancelado'
          || case when NEW.cancelado_motivo is not null and NEW.cancelado_motivo <> ''
                   then ' (' || NEW.cancelado_motivo || ')' else '' end,
        NEW.id, auth.uid()
      from movimentos m
      where m.entrega_id = NEW.id and m.tipo = 'venda';
    end if;
    return NEW;
  end if;

  if estava_cancelado then
    return NEW;
  end if;

  if ja_deduziu and itens_mudaram then
    for r in
      select item->>'codigo' as codigo, item->>'processo' as processo,
             sum((item->>'quantidade')::numeric) as quantidade
      from jsonb_array_elements(coalesce(NEW.itens, '[]'::jsonb)) as item
      where item->>'codigo' is not null
        and coalesce((item->>'quantidade')::numeric, 0) > 0
      group by item->>'codigo', item->>'processo'
    loop
      update movimentos
        set quantidade = r.quantidade,
            obs = 'Baixa automática de estoque — recalculada após edição do pedido'
        where entrega_id = NEW.id and tipo = 'venda' and codigo = r.codigo
          and processo is not distinct from r.processo;
      get diagnostics linhas_afetadas = row_count;
      if linhas_afetadas = 0 then
        insert into movimentos (id, data, tipo, codigo, quantidade, numero, pedido, processo, obs, entrega_id, created_by)
        values (
          'mov_' || gen_random_uuid(),
          current_date, 'venda', r.codigo, r.quantidade,
          NEW.numero_nf, NEW.numero_pedido, r.processo,
          'Baixa automática de estoque — recalculada após edição do pedido',
          NEW.id, auth.uid()
        );
      end if;
    end loop;

    -- Remove combinação código+processo que saiu do pedido (antes só olhava
    -- código -- agora precisa casar os dois, já que uma mesma medida pode
    -- trocar de processo sem sair do pedido).
    delete from movimentos
    where entrega_id = NEW.id and tipo = 'venda'
      and not exists (
        select 1
        from jsonb_array_elements(coalesce(NEW.itens, '[]'::jsonb)) as item
        where item->>'codigo' = movimentos.codigo
          and item->>'processo' is not distinct from movimentos.processo
          and coalesce((item->>'quantidade')::numeric, 0) > 0
      );
    return NEW;
  end if;

  if ja_deduziu and TG_OP = 'UPDATE' then
    if (NEW.numero_nf is distinct from OLD.numero_nf or NEW.numero_pedido is distinct from OLD.numero_pedido) then
      update movimentos
        set numero = NEW.numero_nf, pedido = NEW.numero_pedido
        where entrega_id = NEW.id and tipo = 'venda';
      return NEW;
    end if;
  end if;

  if passou_ag and not ja_deduziu then
    insert into movimentos (id, data, tipo, codigo, quantidade, numero, pedido, processo, obs, entrega_id, created_by)
    select
      'mov_' || gen_random_uuid(),
      current_date, 'venda', agregados.codigo, agregados.quantidade,
      NEW.numero_nf, NEW.numero_pedido, agregados.processo, 'Baixa automática de estoque — pedido autorizado',
      NEW.id, auth.uid()
    from (
      select item->>'codigo' as codigo, item->>'processo' as processo,
             sum((item->>'quantidade')::numeric) as quantidade
      from jsonb_array_elements(coalesce(NEW.itens, '[]'::jsonb)) as item
      where item->>'codigo' is not null
        and coalesce((item->>'quantidade')::numeric, 0) > 0
      group by item->>'codigo', item->>'processo'
    ) as agregados;
  end if;

  return NEW;
end;
$$;

drop trigger if exists trg_sincronizar_estoque_pedido on entregas;
create trigger trg_sincronizar_estoque_pedido
after insert or update on entregas
for each row
execute function sincronizar_estoque_pedido();
