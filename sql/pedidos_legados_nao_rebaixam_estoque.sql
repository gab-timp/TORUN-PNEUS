-- Impede que editar um pedido ANTIGO (de antes da baixa automática existir) baixe
-- o estoque uma segunda vez.
--
-- Problema: a trigger sincronizar_estoque_pedido() baixa o estoque quando o pedido
-- está depois de "Autorização de Gerência" e NÃO tem nenhuma baixa vinculada
-- (movimentos.entrega_id). Pedidos de antes de 12/08/2026 tiveram o estoque
-- baixado na mão, sem entrega_id -- então qualquer edição de itens, etapa ou
-- cancelamento neles faz a trigger baixar de novo. Foi isso que gerou as 16
-- baixas duplicadas na migração de códigos de 01/10/2026
-- (ver sql/corrige_baixas_duplicadas_migracao_codigos.sql).
--
-- Correção: coluna entregas.baixa_manual_legada. Os pedidos que HOJE já passaram
-- de Autorização de Gerência, têm itens, não estão cancelados e não têm baixa
-- vinculada são marcados como legados (true), e a trigger não faz a baixa
-- automática de primeira vez neles. Pedido novo nasce com false e se comporta
-- exatamente como antes. Só a condição da baixa de primeira vez muda; o resto da
-- função é idêntico à versão de sql/corrige_nf_na_baixa_automatica.sql.
--
-- O marcador só pega pedidos com data até 12/08/2026 (dia em que a baixa
-- automática entrou). Se existir pedido mais novo, autorizado e sem baixa
-- vinculada, isso NÃO é pedido legado: o script aborta e mostra quantos são,
-- pra investigar antes de marcar qualquer coisa.
--
-- Roda em transação. Durante o preenchimento da coluna as triggers de entregas
-- ficam desligadas (e voltam a ligar no mesmo bloco), pra o UPDATE não disparar
-- nada.

-- ============================================================================
-- PARTE 1 -- coluna, marcação dos pedidos legados e nova função da trigger
-- ============================================================================
begin;

alter table entregas add column if not exists baixa_manual_legada boolean not null default false;

do $$
declare n_depois int;
begin
  select count(*) into n_depois
  from entregas e
  where coalesce(e.cancelado, false) = false
    and e.etapa in ('ANALISE_CREDITO','AGUARDANDO_PAGAMENTO','VALIDACAO_TRANSPORTE',
                    'FATURAMENTO','SEPARACAO','AGUARDANDO_COLETA','COLETA','RASTREIO','FINALIZADOS')
    and e.data::date > date '2026-08-12'
    and not exists (select 1 from movimentos m where m.entrega_id = e.id and m.tipo = 'venda')
    and exists (
      select 1 from jsonb_array_elements(coalesce(e.itens, '[]'::jsonb)) it
      where it->>'codigo' is not null and coalesce((it->>'quantidade')::numeric, 0) > 0
    );

  if n_depois > 0 then
    raise exception 'Abortando: % pedido(s) de depois de 12/08/2026, autorizado(s) e sem baixa vinculada. Isso não é pedido legado, precisa investigar antes de marcar.', n_depois;
  end if;
end $$;

alter table entregas disable trigger user;

update entregas e
set baixa_manual_legada = true
where coalesce(e.cancelado, false) = false
  and e.etapa in ('ANALISE_CREDITO','AGUARDANDO_PAGAMENTO','VALIDACAO_TRANSPORTE',
                  'FATURAMENTO','SEPARACAO','AGUARDANDO_COLETA','COLETA','RASTREIO','FINALIZADOS')
  and e.data::date <= date '2026-08-12'
  and not exists (select 1 from movimentos m where m.entrega_id = e.id and m.tipo = 'venda')
  and exists (
    select 1 from jsonb_array_elements(coalesce(e.itens, '[]'::jsonb)) it
    where it->>'codigo' is not null and coalesce((it->>'quantidade')::numeric, 0) > 0
  );

alter table entregas enable trigger user;

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

commit;

-- Quantos pedidos foram marcados como legados (só leitura).
select count(*) as pedidos_legados_marcados,
       min(data::date) as mais_antigo,
       max(data::date) as mais_recente
from entregas
where baixa_manual_legada;

-- ============================================================================
-- PARTE 2 -- teste (rodar DEPOIS da parte 1; nada é gravado)
-- ============================================================================
-- Edita a quantidade do pedido da NF 4256 (um dos pedidos que a migração
-- baixou em duplicidade) e conta as baixas vinculadas. O RAISE EXCEPTION no fim
-- desfaz tudo, então nada fica gravado; o número aparece na mensagem de erro.
-- Esperado: 0. Se vier 1 ou mais, a correção não funcionou.
do $$
declare
  v_id text;
  n int;
begin
  select id into v_id from entregas where numero_nf = '4256' and baixa_manual_legada limit 1;
  if v_id is null then
    raise exception 'TESTE: pedido da NF 4256 não foi marcado como legado (ou não existe).';
  end if;

  update entregas
  set itens = jsonb_set(itens, '{0,quantidade}', to_jsonb(coalesce((itens->0->>'quantidade')::numeric, 0) + 1))
  where id = v_id;

  select count(*) into n from movimentos where entrega_id = v_id and tipo = 'venda';

  raise exception 'TESTE OK se n = 0: baixas vinculadas depois de editar o pedido legado = %. Nada foi gravado (rollback).', n;
end $$;
