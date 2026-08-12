-- O campo "Nº do processo" deixa de ser um valor único pro pedido inteiro e
-- passa a ser por medida/item (entregas.itens[i].processo) -- assim um pedido
-- com duas medidas de processos diferentes gera duas movimentações, cada uma
-- com o processo certo, em vez de tudo caindo no mesmo processo.
--
-- A coluna entregas.processo (criada em sql/processo_pedido.sql) fica sem uso
-- a partir de agora -- não é apagada aqui (mudança não-destrutiva), só para de
-- ser lida/escrita pelo site e pela trigger.
--
-- Rode este SQL no SQL Editor do Supabase (depois de já ter rodado
-- baixa_automatica_e_cancelamento_pedidos.sql, processo_pedido.sql e
-- nf_e_cliente_na_movimentacao.sql).

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
  cliente_mudou boolean;
  numero_mudou boolean;
  obs_baixa text;
  r record;
  linhas_afetadas int;
begin
  if TG_OP = 'UPDATE' then
    estava_cancelado := coalesce(OLD.cancelado, false);
    itens_mudaram := NEW.itens is distinct from OLD.itens;
    cliente_mudou := NEW.cliente is distinct from OLD.cliente;
    numero_mudou := NEW.numero_nf is distinct from OLD.numero_nf or NEW.numero_pedido is distinct from OLD.numero_pedido;

    if estava_cancelado and not coalesce(NEW.cancelado, false) then
      raise exception 'Não é possível reativar um pedido cancelado.';
    end if;

    -- itens_mudaram já cobre mudança de processo por medida (processo agora
    -- mora dentro de cada item do array itens, não é mais campo solto do pedido).
    if not itens_mudaram
       and not cliente_mudou
       and not numero_mudou
       and NEW.etapa is not distinct from OLD.etapa
       and coalesce(NEW.cancelado, false) is not distinct from estava_cancelado then
      return NEW;
    end if;
  else
    estava_cancelado := false;
    itens_mudaram := false;
    cliente_mudou := false;
    numero_mudou := false;
  end if;

  idx_new := array_position(ordem, NEW.etapa);
  passou_ag := idx_new is not null and idx_new > idx_ag;

  ja_deduziu := exists (
    select 1 from movimentos where entrega_id = NEW.id and tipo = 'venda'
  );

  -- 1) Cancelamento: estorna o que já tinha sido baixado (se houver) e para por aqui.
  -- Usa m.processo (o processo já gravado em cada movimento original -- que já é
  -- por medida desde a baixa), não um campo do pedido.
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

  -- 3) Já tinha baixado antes e itens (inclusive processo por medida), cliente
  -- ou NF/nº do pedido mudaram: resincroniza tudo -- INDEPENDENTE da etapa atual.
  -- Agrupa por (código, processo): duas linhas do mesmo produto com processos
  -- diferentes geram/mantêm DUAS movimentações separadas, cada uma rastreável
  -- ao processo certo.
  if ja_deduziu and (itens_mudaram or cliente_mudou or numero_mudou) then
    obs_baixa := 'Baixa automática de estoque — recalculada após edição do pedido — Cliente: ' || coalesce(NEW.cliente, '—');

    for r in
      select
        item->>'codigo' as codigo,
        nullif(item->>'processo', '') as processo,
        sum((item->>'quantidade')::numeric) as quantidade
      from jsonb_array_elements(coalesce(NEW.itens, '[]'::jsonb)) as item
      where item->>'codigo' is not null
        and coalesce((item->>'quantidade')::numeric, 0) > 0
      group by item->>'codigo', nullif(item->>'processo', '')
    loop
      update movimentos
        set quantidade = r.quantidade,
            numero = NEW.numero_nf,
            pedido = NEW.numero_pedido,
            obs = obs_baixa
        where entrega_id = NEW.id and tipo = 'venda' and codigo = r.codigo
          and processo is not distinct from r.processo;
      get diagnostics linhas_afetadas = row_count;
      if linhas_afetadas = 0 then
        insert into movimentos (id, data, tipo, codigo, quantidade, numero, pedido, processo, obs, entrega_id, created_by)
        values (
          'mov_' || gen_random_uuid(),
          current_date, 'venda', r.codigo, r.quantidade,
          NEW.numero_nf, NEW.numero_pedido, r.processo, obs_baixa,
          NEW.id, auth.uid()
        );
      end if;
    end loop;

    -- Remove combinação (código, processo) que saiu do pedido.
    delete from movimentos m
    where m.entrega_id = NEW.id and m.tipo = 'venda'
      and not exists (
        select 1
        from jsonb_array_elements(coalesce(NEW.itens, '[]'::jsonb)) as item
        where item->>'codigo' = m.codigo
          and nullif(item->>'processo', '') is not distinct from m.processo
      );
    return NEW;
  end if;

  -- 4) Primeira baixa: passou de Autorização de Gerência pela primeira vez.
  -- Uma movimentação por combinação (código, processo).
  if passou_ag and not ja_deduziu then
    insert into movimentos (id, data, tipo, codigo, quantidade, numero, pedido, processo, obs, entrega_id, created_by)
    select
      'mov_' || gen_random_uuid(),
      current_date, 'venda', agregados.codigo, agregados.quantidade,
      NEW.numero_nf, NEW.numero_pedido, agregados.processo, 'Baixa automática de estoque — pedido autorizado — Cliente: ' || coalesce(NEW.cliente, '—'),
      NEW.id, auth.uid()
    from (
      select
        item->>'codigo' as codigo,
        nullif(item->>'processo', '') as processo,
        sum((item->>'quantidade')::numeric) as quantidade
      from jsonb_array_elements(coalesce(NEW.itens, '[]'::jsonb)) as item
      where item->>'codigo' is not null
        and coalesce((item->>'quantidade')::numeric, 0) > 0
      group by item->>'codigo', nullif(item->>'processo', '')
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
