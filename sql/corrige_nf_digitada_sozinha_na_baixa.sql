-- BAIXA AUTOMÁTICA: A NF NÃO CHEGAVA NAS MOVIMENTAÇÕES QUANDO ERA DIGITADA SOZINHA NO PEDIDO.
--
-- Causa: no começo de sincronizar_estoque_pedido() há um "return NEW" para quando nada de estoque mudou
-- (itens, etapa e cancelamento iguais). Digitar ou corrigir só o Nº NF / Nº pedido cai nesse caso e a
-- função sai ANTES do trecho que copia a NF para as baixas (movimentos tipo 'venda'). A movimentação
-- fica com "–" na coluna Nº NF/Processo. (O bug de 2026 em arquivo/corrige_nf_na_baixa_automatica.sql
-- consertou só o caso de a NF vir junto com edição de itens.)
--
-- Correção: antes desse "return NEW", propagar NF/pedido para as baixas já existentes.
--
-- COMO RODAR (cada passo separado, o SQL Editor mostra só a última consulta):
--   0) rode a CONSULTA 0 (a função viva é a do repositório? tem que dar true). Se der false, NÃO rode o
--      passo 2: me mande o resultado de select pg_get_functiondef('sincronizar_estoque_pedido'::regproc);
--   1) rode a CONSULTA 1 (diagnóstico, só lê): lista as baixas sem NF cujo pedido tem NF;
--   2) rode a PARTE 2 (a função corrigida; vale daqui pra frente);
--   3) rode a CONSULTA 3 (triggers de movimentos) e, só se estiver tudo normal, a PARTE 4 (conserta as já erradas).

-- ============================================================================
-- CONSULTA 0 -- a função viva é a do repositório? (rodar sozinha; só lê)
-- ============================================================================
-- select position('baixa_manual_legada' in pg_get_functiondef('sincronizar_estoque_pedido'::regproc)) > 0
--    and position('recalculada ao sair da Autorização de Gerência' in pg_get_functiondef('sincronizar_estoque_pedido'::regproc)) > 0
--   as funcao_viva_e_a_do_repositorio;

-- ============================================================================
-- CONSULTA 1 -- diagnóstico: baixas sem NF/pedido cujo pedido já tem (rodar sozinha; só lê)
-- ============================================================================
-- select e.numero_nf, e.numero_pedido, e.cliente, e.etapa, e.data,
--        count(*) as baixas_sem_nf, sum(m.quantidade) as pneus
-- from movimentos m
-- join entregas e on e.id = m.entrega_id
-- where m.tipo = 'venda'
--   and coalesce(m.numero, '') = '' and coalesce(e.numero_nf, '') <> ''
-- group by 1,2,3,4,5
-- order by e.data desc;

-- ============================================================================
-- PARTE 2 -- função corrigida (a única mudança é o bloco marcado com "CORREÇÃO")
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
  passou_ag_antes boolean := false;
  ja_deduziu boolean;
  estava_cancelado boolean;
  itens_mudaram boolean;
  obs_recalculo text;
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
      -- CORREÇÃO: só NF/pedido mudou -> copia para as baixas que já existem (antes saía daqui sem copiar)
      if NEW.numero_nf is distinct from OLD.numero_nf or NEW.numero_pedido is distinct from OLD.numero_pedido then
        update movimentos
          set numero = NEW.numero_nf, pedido = NEW.numero_pedido
          where entrega_id = NEW.id and tipo = 'venda';
      end if;
      return NEW;
    end if;

    -- em que lado da gerência o pedido estava ANTES desta atualização
    passou_ag_antes := coalesce(array_position(ordem, OLD.etapa) > idx_ag, false);
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

  -- Recalcula as baixas só com o pedido DEPOIS da gerência:
  --   * editou itens com o pedido já depois da gerência (caso de sempre); ou
  --   * acabou de sair da gerência (ou de antes dela) para a frente: acerta uma vez as baixas que
  --     ficaram congeladas enquanto ele esteve lá.
  -- Com o pedido na gerência ou antes, nada disso roda: a baixa fica como está.
  if ja_deduziu and passou_ag and (itens_mudaram or not passou_ag_antes) then
    obs_recalculo := case
      when itens_mudaram then 'Baixa automática de estoque — recalculada após edição do pedido'
      else 'Baixa automática de estoque — recalculada ao sair da Autorização de Gerência'
    end;

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
            obs = obs_recalculo
        where entrega_id = NEW.id and tipo = 'venda' and codigo = r.codigo
          and processo is not distinct from r.processo;
      get diagnostics linhas_afetadas = row_count;
      if linhas_afetadas = 0 then
        insert into movimentos (id, data, tipo, codigo, quantidade, numero, pedido, processo, obs, entrega_id, created_by)
        values (
          'mov_' || gen_random_uuid(),
          current_date, 'venda', r.codigo, r.quantidade,
          NEW.numero_nf, NEW.numero_pedido, r.processo,
          obs_recalculo,
          NEW.id, auth.uid()
        );
      end if;
    end loop;

    -- Remove combinação código+processo que saiu do pedido (precisa casar os dois, já que uma mesma
    -- medida pode trocar de processo sem sair do pedido).
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

  -- Só propaga NF/pedido para as baixas já existentes (não mexe em quantidade, vale em qualquer etapa).
  if ja_deduziu and TG_OP = 'UPDATE' then
    if (NEW.numero_nf is distinct from OLD.numero_nf or NEW.numero_pedido is distinct from OLD.numero_pedido) then
      update movimentos
        set numero = NEW.numero_nf, pedido = NEW.numero_pedido
        where entrega_id = NEW.id and tipo = 'venda';
      return NEW;
    end if;
  end if;

  -- Pedido legado (estoque baixado na mão, antes da automação) não baixa de novo.
  if passou_ag and not ja_deduziu and not coalesce(NEW.baixa_manual_legada, false) then
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

-- ============================================================================
-- CONSULTA 3 -- triggers de movimentos (rodar sozinha; só lê). Se aparecer algo além do esperado
-- (ex.: gatilho que recalcula estoque ou notifica a cada update), me mande antes da PARTE 4.
-- ============================================================================
-- select tgname, tgenabled from pg_trigger where tgrelid = 'movimentos'::regclass and not tgisinternal;

-- ============================================================================
-- PARTE 4 -- conserta as baixas que já ficaram sem NF (só depois de ver a CONSULTA 1 e a 3)
-- Só preenche onde a NF/pedido da baixa está EM BRANCO; não mexe em quantidade nem em baixa que já tem NF.
-- ============================================================================
-- update movimentos m
--    set numero = e.numero_nf
--   from entregas e
--  where m.entrega_id = e.id and m.tipo = 'venda'
--    and coalesce(m.numero, '') = '' and coalesce(e.numero_nf, '') <> '';
-- update movimentos m
--    set pedido = e.numero_pedido
--   from entregas e
--  where m.entrega_id = e.id and m.tipo = 'venda'
--    and coalesce(m.pedido, '') = '' and coalesce(e.numero_pedido, '') <> '';
