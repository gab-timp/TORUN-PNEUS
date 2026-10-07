-- Dois ajustes na trigger de baixa automática/estorno (mesmo trigger de
-- sql/baixa_automatica_e_cancelamento_pedidos.sql + sql/processo_pedido.sql,
-- só a função muda de novo):
--
--   1) Corrige um bug real: se SÓ o Nº da NF (ou o Nº do pedido) fosse editado
--      depois da baixa -- sem mexer em itens/processo -- a trigger saía cedo
--      no early-return e nunca propagava o NF pra Movimentações. Isso importa
--      na prática porque a NF normalmente só é preenchida depois (na etapa
--      Faturamento, que vem DEPOIS de Autorização de Gerência, quando a baixa
--      já aconteceu). Corrigido: NF/nº do pedido mudando agora entra no mesmo
--      gatilho de recálculo que já existia pra itens/processo.
--   2) Padroniza o nome do cliente na OBS de toda movimentação gerada pela
--      trigger (baixa, recálculo e estorno) -- fica fácil identificar de quem
--      é a venda direto na tela de Movimentações, sem precisar abrir o pedido.
--
-- Rode este SQL no SQL Editor do Supabase (depois de já ter rodado
-- baixa_automatica_e_cancelamento_pedidos.sql e processo_pedido.sql).

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
  processo_mudou boolean;
  cliente_mudou boolean;
  numero_mudou boolean;
  obs_baixa text;
  r record;
  linhas_afetadas int;
begin
  if TG_OP = 'UPDATE' then
    estava_cancelado := coalesce(OLD.cancelado, false);
    itens_mudaram := NEW.itens is distinct from OLD.itens;
    processo_mudou := NEW.processo is distinct from OLD.processo;
    cliente_mudou := NEW.cliente is distinct from OLD.cliente;
    numero_mudou := NEW.numero_nf is distinct from OLD.numero_nf or NEW.numero_pedido is distinct from OLD.numero_pedido;

    if estava_cancelado and not coalesce(NEW.cancelado, false) then
      raise exception 'Não é possível reativar um pedido cancelado.';
    end if;

    -- Precisa incluir numero_mudou/cliente_mudou aqui também -- senão editar só
    -- o Nº da NF (ou só corrigir o nome do cliente) depois da baixa nunca chega
    -- a rodar o bloco que propaga isso pra Movimentações (era exatamente o bug).
    if not itens_mudaram
       and not processo_mudou
       and not cliente_mudou
       and not numero_mudou
       and NEW.etapa is not distinct from OLD.etapa
       and coalesce(NEW.cancelado, false) is not distinct from estava_cancelado then
      return NEW;
    end if;
  else
    estava_cancelado := false;
    itens_mudaram := false;
    processo_mudou := false;
    cliente_mudou := false;
    numero_mudou := false;
  end if;

  idx_new := array_position(ordem, NEW.etapa);
  passou_ag := idx_new is not null and idx_new > idx_ag;

  ja_deduziu := exists (
    select 1 from movimentos where entrega_id = NEW.id and tipo = 'venda'
  );

  -- 1) Cancelamento: estorna o que já tinha sido baixado (se houver) e para por aqui.
  if coalesce(NEW.cancelado, false) and not estava_cancelado then
    if ja_deduziu then
      insert into movimentos (id, data, tipo, codigo, quantidade, numero, pedido, processo, obs, entrega_id, created_by)
      select
        'mov_' || gen_random_uuid(),
        current_date, 'entrada', m.codigo, m.quantidade,
        NEW.numero_nf, NEW.numero_pedido, m.processo,
        'Estorno automático — pedido cancelado'
          || case when NEW.cancelado_motivo is not null and NEW.cancelado_motivo <> ''
                   then ' (' || NEW.cancelado_motivo || ')' else '' end
          || ' — Cliente: ' || coalesce(NEW.cliente, '—'),
        NEW.id, auth.uid()
      from movimentos m
      where m.entrega_id = NEW.id and m.tipo = 'venda';
    end if;
    return NEW;
  end if;

  -- 2) Já estava cancelado antes (e continua): estado congelado, não mexe em nada.
  if estava_cancelado then
    return NEW;
  end if;

  -- 3) Já tinha baixado antes e itens, processo, cliente OU NF/nº do pedido
  -- mudaram: resincroniza tudo de uma vez (quantidade, processo, numero,
  -- pedido e obs) -- INDEPENDENTE da etapa atual, mesmo raciocínio de sempre.
  if ja_deduziu and (itens_mudaram or processo_mudou or cliente_mudou or numero_mudou) then
    obs_baixa := 'Baixa automática de estoque — recalculada após edição do pedido — Cliente: ' || coalesce(NEW.cliente, '—');

    for r in
      select item->>'codigo' as codigo, sum((item->>'quantidade')::numeric) as quantidade
      from jsonb_array_elements(coalesce(NEW.itens, '[]'::jsonb)) as item
      where item->>'codigo' is not null
        and coalesce((item->>'quantidade')::numeric, 0) > 0
      group by item->>'codigo'
    loop
      update movimentos
        set quantidade = r.quantidade,
            processo = NEW.processo,
            numero = NEW.numero_nf,
            pedido = NEW.numero_pedido,
            obs = obs_baixa
        where entrega_id = NEW.id and tipo = 'venda' and codigo = r.codigo;
      get diagnostics linhas_afetadas = row_count;
      if linhas_afetadas = 0 then
        insert into movimentos (id, data, tipo, codigo, quantidade, numero, pedido, processo, obs, entrega_id, created_by)
        values (
          'mov_' || gen_random_uuid(),
          current_date, 'venda', r.codigo, r.quantidade,
          NEW.numero_nf, NEW.numero_pedido, NEW.processo, obs_baixa,
          NEW.id, auth.uid()
        );
      end if;
    end loop;

    -- Remove código que saiu do pedido.
    delete from movimentos
    where entrega_id = NEW.id and tipo = 'venda'
      and codigo not in (
        select item->>'codigo'
        from jsonb_array_elements(coalesce(NEW.itens, '[]'::jsonb)) as item
        where item->>'codigo' is not null
      );
    return NEW;
  end if;

  -- 4) Primeira baixa: passou de Autorização de Gerência pela primeira vez.
  if passou_ag and not ja_deduziu then
    insert into movimentos (id, data, tipo, codigo, quantidade, numero, pedido, processo, obs, entrega_id, created_by)
    select
      'mov_' || gen_random_uuid(),
      current_date, 'venda', agregados.codigo, agregados.quantidade,
      NEW.numero_nf, NEW.numero_pedido, NEW.processo,
      'Baixa automática de estoque — pedido autorizado — Cliente: ' || coalesce(NEW.cliente, '—'),
      NEW.id, auth.uid()
    from (
      select item->>'codigo' as codigo, sum((item->>'quantidade')::numeric) as quantidade
      from jsonb_array_elements(coalesce(NEW.itens, '[]'::jsonb)) as item
      where item->>'codigo' is not null
        and coalesce((item->>'quantidade')::numeric, 0) > 0
      group by item->>'codigo'
    ) as agregados;
  end if;

  -- Se não passou_ag e não caiu em nenhum caso acima: card ainda antes/na etapa
  -- Autorização de Gerência, ou foi arrastado de volta pra trás -- não faz nada.
  -- Esperado, não é bug: só "Cancelar pedido" reverte estoque já baixado.
  return NEW;
end;
$$;

-- O trigger em si não muda, só a função. Recriar aqui também por segurança,
-- caso este script rode sozinho:
drop trigger if exists trg_sincronizar_estoque_pedido on entregas;
create trigger trg_sincronizar_estoque_pedido
after insert or update on entregas
for each row
execute function sincronizar_estoque_pedido();
