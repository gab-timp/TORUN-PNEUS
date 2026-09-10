-- Bug relatado pelo usuário: algumas movimentações de baixa automática ficaram
-- SEM o número da nota fiscal ("–" na coluna Nº NF/Processo), enquanto outras do
-- mesmo produto/processo puxaram a NF normalmente.
--
-- Causa raiz: o ramo de RECÁLCULO da trigger sincronizar_estoque_pedido()
-- (dispara quando os itens do pedido mudam e o estoque já tinha sido baixado)
-- atualizava só `quantidade` e `obs` na movimentação existente -- nunca `numero`
-- (NF) nem `pedido`. E logo depois dá `return NEW`, o que pula o ramo que
-- sincroniza a NF (mais abaixo na função).
--
-- Efeito: pedido é autorizado sem NF (a NF só sai no Faturamento) -> movimentação
-- nasce com numero em branco. Depois a NF é preenchida NUMA EDIÇÃO QUE TAMBÉM
-- MEXEU NOS ITENS (ajuste de quantidade/medida no faturamento, bem comum) -> o
-- ramo de recálculo roda, corrige a quantidade e retorna, sem nunca copiar a NF.
-- Nas edições seguintes o ramo de sincronização de NF não dispara mais (só roda
-- quando numero_nf MUDA, e a essa altura os dois lados já têm o mesmo valor).
-- A movimentação fica sem NF permanentemente.
--
-- As baixas que puxaram a NF certo são de pedidos onde a NF foi digitada numa
-- edição que NÃO mexeu nos itens -- aí o ramo de sincronização rodou limpo.
--
-- Correção: o ramo de recálculo passa a setar também numero = NEW.numero_nf e
-- pedido = NEW.numero_pedido, igual o INSERT de fallback logo abaixo dele já faz.
-- Idempotente, pode rodar a qualquer momento no SQL Editor do Supabase.
--
-- Isso corrige daqui pra frente. Pra consertar as movimentações que já ficaram
-- sem NF, ver a PARTE 2 (diagnóstico) e a PARTE 3 (backfill) no fim deste arquivo.

-- ============================================================================
-- PARTE 1 -- corrige a trigger (daqui pra frente)
-- ============================================================================

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
            numero = NEW.numero_nf,
            pedido = NEW.numero_pedido,
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


-- ============================================================================
-- PARTE 2 -- diagnóstico do histórico (só leitura -- rode antes do backfill)
-- ============================================================================

-- 2a) Movimentações de venda SEM NF cujo pedido JÁ TEM NF preenchida.
--     Essas são o bug -- o backfill da PARTE 3 conserta.
select m.id, m.data, m.codigo, m.quantidade, m.pedido, m.processo,
       e.numero_nf as nf_do_pedido, e.etapa, coalesce(e.cancelado, false) as cancelado
from movimentos m
join entregas e on e.id = m.entrega_id
where m.tipo = 'venda'
  and coalesce(m.numero, '') = ''
  and coalesce(e.numero_nf, '') <> ''
order by m.data desc;

-- 2b) Movimentações de venda SEM NF cujo pedido TAMBÉM não tem NF ainda.
--     Isso NÃO é bug -- a NF simplesmente ainda não foi emitida/digitada.
--     (contagem só pra referência)
select count(*) as movimentos_sem_nf_porque_pedido_sem_nf
from movimentos m
join entregas e on e.id = m.entrega_id
where m.tipo = 'venda'
  and coalesce(m.numero, '') = ''
  and coalesce(e.numero_nf, '') = '';


-- ============================================================================
-- PARTE 3 -- backfill (rode depois de conferir a PARTE 2a)
-- ============================================================================

-- Copia a NF do pedido pra movimentação de venda que ficou sem.
-- Não mexe em pedido/processo (já estão certos) nem em quantidade.
update movimentos m
set numero = e.numero_nf
from entregas e
where m.entrega_id = e.id
  and m.tipo = 'venda'
  and coalesce(m.numero, '') = ''
  and coalesce(e.numero_nf, '') <> '';

-- 3b) Confirmação: deve retornar 0.
select count(*) as ainda_sem_nf
from movimentos m
join entregas e on e.id = m.entrega_id
where m.tipo = 'venda'
  and coalesce(m.numero, '') = ''
  and coalesce(e.numero_nf, '') <> '';
