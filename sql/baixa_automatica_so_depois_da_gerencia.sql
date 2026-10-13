-- Baixa automática de estoque: pedido em "Autorização de Gerência" (ou antes) NÃO mexe nas baixas.
--
-- Problema: o trecho de recálculo da trigger sincronizar_estoque_pedido() rodava sempre que o pedido
-- já tinha baixa e os itens mudavam (`if ja_deduziu and itens_mudaram`), sem olhar a etapa. Um pedido
-- que já passou da gerência e foi arrastado de volta para "Autorização de Gerência" (qualquer um pode
-- entrar nela; só sair exige permissão) continuava com a baixa, e editar os itens ali alterava as
-- quantidades das baixas, criava baixa de item novo e apagava a de item removido. O mesmo valia para
-- Pré-venda e Entrada.
--
-- Regra nova (decidida com o usuário em 13/10/2026):
--   1. Enquanto o pedido está em Autorização de Gerência ou antes, as baixas ficam CONGELADAS: editar
--      itens ali não cria, não altera e não apaga baixa nenhuma.
--   2. Quando o pedido sai da gerência para a frente (etapa depois dela), as baixas são acertadas UMA
--      vez para bater com os itens de agora. Sem isso o estoque ficaria baseado nos itens antigos até a
--      próxima edição.
--   3. Pedido que já está depois da gerência continua exatamente como era: editar itens recalcula.
--   4. Cancelamento, estorno, propagação de NF/pedido nas baixas e a baixa de primeira vez (inclusive a
--      trava dos pedidos legados) NÃO mudam.
--
-- É um `create or replace` completo da função. Parte da versão de
-- sql/pedidos_legados_nao_rebaixam_estoque.sql (02/10/2026). ANTES de rodar, confira que a função que
-- está viva no banco é essa versão (consulta no fim deste arquivo, "CONFERE A FUNÇÃO VIVA").
--
-- Só o texto de `obs` muda quando o acerto acontece na saída da gerência: "recalculada ao sair da
-- Autorização de Gerência" (em vez de "recalculada após edição do pedido").

-- ============================================================================
-- PARTE 1 -- nova função da trigger
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
-- PARTE 2 -- teste (rodar DEPOIS da parte 1; nada é gravado)
-- ============================================================================
-- Pega um pedido que HOJE já passou da gerência, tem baixa e cujo primeiro item tem baixa, e faz,
-- tudo dentro de uma transação que o RAISE EXCEPTION do fim desfaz:
--   a) edita a quantidade do primeiro item (+5) com o pedido depois da gerência;
--   b) arrasta o pedido de volta para Autorização de Gerência;
--   c) edita a quantidade do primeiro item de novo (+3), agora na gerência;
--   d) tira o pedido da gerência para a frente (FATURAMENTO).
-- Esperado (a mensagem de erro mostra os números):
--   baixas depois de (a) = antes + 5      (recalcula, como sempre);
--   baixas depois de (c) = depois de (a)  (congeladas na gerência: a trava funcionando);
--   baixas depois de (d) = soma dos itens (acertadas na saída).
-- Se rodar ESTA parte ANTES da parte 1, o passo (c) mostra o problema: as baixas sobem +3 na gerência.
do $$
declare
  v_id text;
  v_ped text;
  n_antes numeric;
  n_a numeric;
  n_b numeric;
  n_c numeric;
  n_d numeric;
  soma_itens numeric;
begin
  select e.id, e.numero_pedido into v_id, v_ped
  from entregas e
  where coalesce(e.cancelado, false) = false
    and e.etapa in ('FATURAMENTO','SEPARACAO','AGUARDANDO_COLETA','COLETA','RASTREIO','FINALIZADOS')
    and (e.itens->0->>'codigo') is not null
    and exists (
      select 1 from movimentos m
      where m.entrega_id = e.id and m.tipo = 'venda' and m.codigo = e.itens->0->>'codigo'
    )
  order by e.data desc
  limit 1;

  if v_id is null then
    raise exception 'TESTE: não achei um pedido depois da gerência com baixa vinculada para testar.';
  end if;

  select coalesce(sum(quantidade), 0) into n_antes from movimentos where entrega_id = v_id and tipo = 'venda';

  -- a) edita com o pedido depois da gerência
  update entregas
  set itens = jsonb_set(itens, '{0,quantidade}', to_jsonb(coalesce((itens->0->>'quantidade')::numeric, 0) + 5))
  where id = v_id;
  select coalesce(sum(quantidade), 0) into n_a from movimentos where entrega_id = v_id and tipo = 'venda';

  -- b) volta para a gerência (entrar é permitido a qualquer um)
  update entregas set etapa = 'AUTORIZACAO_GERENCIA' where id = v_id;
  select coalesce(sum(quantidade), 0) into n_b from movimentos where entrega_id = v_id and tipo = 'venda';

  -- c) edita na gerência
  update entregas
  set itens = jsonb_set(itens, '{0,quantidade}', to_jsonb(coalesce((itens->0->>'quantidade')::numeric, 0) + 3))
  where id = v_id;
  select coalesce(sum(quantidade), 0) into n_c from movimentos where entrega_id = v_id and tipo = 'venda';

  -- d) sai da gerência para a frente. O SQL Editor não tem usuário logado, então a trava "só quem tem
  -- permissão sai da gerência" é desligada só dentro desta transação (volta sozinha no rollback).
  alter table entregas disable trigger trg_bloquear_saida_autorizacao_gerencia;
  update entregas set etapa = 'FATURAMENTO' where id = v_id;
  select coalesce(sum(quantidade), 0) into n_d from movimentos where entrega_id = v_id and tipo = 'venda';

  select coalesce(sum((it->>'quantidade')::numeric), 0) into soma_itens
  from entregas e, jsonb_array_elements(coalesce(e.itens, '[]'::jsonb)) it
  where e.id = v_id and it->>'codigo' is not null and coalesce((it->>'quantidade')::numeric, 0) > 0;

  raise exception
    'TESTE (pedido %; nada foi gravado): baixas antes=%; a) editou +5 depois da gerência=% (esperado %); b) voltou para a gerência=% (esperado %); c) editou +3 na gerência=% (esperado % = congelada); d) saiu da gerência=% (esperado % = soma dos itens).',
    v_ped, n_antes, n_a, n_antes + 5, n_b, n_a, n_c, n_b, n_d, soma_itens;
end $$;

-- ============================================================================
-- CONFERE A FUNÇÃO VIVA (rodar ANTES da parte 1, sozinha; só lê)
-- ============================================================================
-- Deve voltar true: a função que está no banco é a de 02/10 (tem a trava dos pedidos legados), que é a
-- base desta correção. Se vier false, o banco tem outra versão: NÃO rode a parte 1, me mande o resultado
-- de `select pg_get_functiondef('sincronizar_estoque_pedido'::regproc);`.
-- select position('baixa_manual_legada' in pg_get_functiondef('sincronizar_estoque_pedido'::regproc)) > 0
--   as funcao_viva_e_a_de_02_10;
