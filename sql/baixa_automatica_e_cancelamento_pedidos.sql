-- Automatiza dois pontos hoje 100% manuais/desacoplados entre o Kanban de Entregas
-- (tabela entregas, coluna etapa) e o livro de estoque (tabela movimentos):
--
--   1) Baixa automática: quando um pedido passa de "Autorização de Gerência" pra
--      frente pela primeira vez, gera uma saída "venda" em movimentos pra cada
--      item do pedido (entregas.itens).
--   2) Cancelamento com estorno: novo botão "Cancelar pedido" (a partir da etapa
--      Entrada em diante). Marca o pedido como cancelado (some do Kanban, mas fica
--      salvo/rastreável) e, se o estoque já tinha sido baixado, lança uma ENTRADA
--      de compensação (não apaga a saída original -- mantém as duas, uma cancelando
--      a outra, pra manter histórico).
--   3) Edição pós-baixa: se os itens/quantidades de um pedido que já baixou
--      estoque forem editados, a baixa é recalculada automaticamente.
--
-- Por que trigger no banco (não JS no cliente): existem dois clientes que escrevem
-- em entregas.etapa (site/app.js e site/pedido-representante.js) -- duplicar essa
-- regra em JS nos dois seria frágil. Mesma convenção de restringir_pular_autorizacao_
-- gerencia.sql (security definer, set search_path, auth.uid(), mesma array "ordem"),
-- mas AFTER em vez de BEFORE porque aqui escrevemos numa tabela diferente
-- (movimentos) como efeito colateral, não validamos/bloqueamos a própria linha.
--
-- Idempotência: a fonte da verdade sobre "esse pedido já baixou estoque?" NÃO é
-- comparar a posição antiga/nova da etapa (quebraria se o card for arrastado pra
-- trás e pra frente de novo) -- é a existência de pelo menos um movimento tipo
-- 'venda' com entrega_id = NEW.id.
--
-- Rode este SQL no SQL Editor do Supabase.

-- 1) Colunas novas em entregas: estado de cancelamento.
-- Reaproveitar a coluna "etapa" pra representar "cancelado" foi descartado de
-- propósito -- ver sql/corrigir_check_etapa_entregas.sql: etapa tem uma CHECK
-- constraint com lista fechada, mexer nela de novo é risco desnecessário.
alter table entregas add column if not exists cancelado boolean not null default false;
alter table entregas add column if not exists cancelado_motivo text;
alter table entregas add column if not exists cancelado_em timestamptz;
alter table entregas add column if not exists cancelado_por uuid references auth.users(id);

-- 2) Coluna nova em movimentos: link rastreável com o pedido que gerou o
-- lançamento automático (lançamentos manuais continuam com entrega_id nulo).
-- entregas.id e movimentos.id são text (ver uid() em site/app.js:70-72), não
-- uuid -- por isso o FK é text -> text. ON DELETE SET NULL: hoje só dá pra
-- excluir de verdade (hard delete) um pedido em PRE_VENDA, que nunca teve
-- baixa -- mas fica seguro mesmo assim.
alter table movimentos add column if not exists entrega_id text references entregas(id) on delete set null;
create index if not exists idx_movimentos_entrega_id on movimentos(entrega_id);

-- 3) Função da trigger.
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
  -- Em INSERT, OLD não existe de verdade (referenciar OLD.campo aqui quebra com
  -- "record 'old' is not assigned yet") -- por isso todo acesso a OLD fica
  -- dentro de "if TG_OP = 'UPDATE'", nunca em condições soltas tipo
  -- "TG_OP = 'UPDATE' and OLD.x is distinct from ..." (não confiar em
  -- short-circuit do AND pra isso).
  if TG_OP = 'UPDATE' then
    estava_cancelado := coalesce(OLD.cancelado, false);
    itens_mudaram := NEW.itens is distinct from OLD.itens;

    -- Trava "sem reativação": uma vez cancelado, não pode voltar a false por
    -- nenhum caminho (edição futura, SQL direto no editor etc.) -- vira uma
    -- garantia de banco, não só "não tem botão pra isso na tela". Sem isso,
    -- reativar reapareceria no Kanban como pedido ativo SEM o estoque baixado
    -- de novo (o estorno já devolveu pro estoque).
    if estava_cancelado and not coalesce(NEW.cancelado, false) then
      raise exception 'Não é possível reativar um pedido cancelado.';
    end if;

    -- Nada relevante mudou (edição de campo tipo destino/transportadora/obs):
    -- sai cedo, evita reprocessar à toa.
    if not itens_mudaram
       and NEW.etapa is not distinct from OLD.etapa
       and coalesce(NEW.cancelado, false) is not distinct from estava_cancelado then
      return NEW;
    end if;
  else
    estava_cancelado := false;
    itens_mudaram := false; -- pedido novo nunca aciona recálculo, só a 1ª baixa
  end if;

  idx_new := array_position(ordem, NEW.etapa);
  passou_ag := idx_new is not null and idx_new > idx_ag;

  ja_deduziu := exists (
    select 1 from movimentos where entrega_id = NEW.id and tipo = 'venda'
  );

  -- 1) Cancelamento: estorna o que já tinha sido baixado (se houver) e para por aqui.
  if coalesce(NEW.cancelado, false) and not estava_cancelado then
    if ja_deduziu then
      insert into movimentos (id, data, tipo, codigo, quantidade, numero, pedido, obs, entrega_id, created_by)
      select
        'mov_' || gen_random_uuid(),
        current_date, 'entrada', m.codigo, m.quantidade,
        NEW.numero_nf, NEW.numero_pedido,
        'Estorno automático — pedido cancelado'
          || case when NEW.cancelado_motivo is not null and NEW.cancelado_motivo <> ''
                   then ' (' || NEW.cancelado_motivo || ')' else '' end,
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

  -- 3) Já tinha baixado antes e os itens mudaram: recalcula -- INDEPENDENTE da
  -- etapa atual (ver "recálculo desacoplado" no plano).
  if ja_deduziu and itens_mudaram then
    for r in
      select item->>'codigo' as codigo, sum((item->>'quantidade')::numeric) as quantidade
      from jsonb_array_elements(coalesce(NEW.itens, '[]'::jsonb)) as item
      where item->>'codigo' is not null
        and coalesce((item->>'quantidade')::numeric, 0) > 0
      group by item->>'codigo'
    loop
      update movimentos
        set quantidade = r.quantidade,
            obs = 'Baixa automática de estoque — recalculada após edição do pedido'
        where entrega_id = NEW.id and tipo = 'venda' and codigo = r.codigo;
      get diagnostics linhas_afetadas = row_count;
      if linhas_afetadas = 0 then
        insert into movimentos (id, data, tipo, codigo, quantidade, numero, pedido, obs, entrega_id, created_by)
        values (
          'mov_' || gen_random_uuid(),
          current_date, 'venda', r.codigo, r.quantidade,
          NEW.numero_nf, NEW.numero_pedido,
          'Baixa automática de estoque — recalculada após edição do pedido',
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

  -- 3b) NF/número do pedido chegaram depois (normal -- NF só sai no Faturamento,
  -- que vem DEPOIS de Autorização de Gerência) e os itens não mudaram: mantém as
  -- linhas de venda já lançadas com o número atualizado, pra rastreabilidade.
  if ja_deduziu and TG_OP = 'UPDATE' then
    if (NEW.numero_nf is distinct from OLD.numero_nf or NEW.numero_pedido is distinct from OLD.numero_pedido) then
      update movimentos
        set numero = NEW.numero_nf, pedido = NEW.numero_pedido
        where entrega_id = NEW.id and tipo = 'venda';
      return NEW;
    end if;
  end if;

  -- 4) Primeira baixa: passou de Autorização de Gerência pela primeira vez.
  if passou_ag and not ja_deduziu then
    insert into movimentos (id, data, tipo, codigo, quantidade, numero, pedido, obs, entrega_id, created_by)
    select
      'mov_' || gen_random_uuid(),
      current_date, 'venda', agregados.codigo, agregados.quantidade,
      NEW.numero_nf, NEW.numero_pedido, 'Baixa automática de estoque — pedido autorizado',
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
  -- Autorização de Gerência, ou foi arrastado de volta pra trás sem itens
  -- mudarem -- não faz nada. Esperado, não é bug: só "Cancelar pedido" reverte
  -- estoque já baixado.
  return NEW;
end;
$$;

drop trigger if exists trg_sincronizar_estoque_pedido on entregas;
create trigger trg_sincronizar_estoque_pedido
after insert or update on entregas
for each row
execute function sincronizar_estoque_pedido();

-- Confira se a trigger ficou instalada:
select tgname, tgrelid::regclass, tgenabled from pg_trigger where tgname = 'trg_sincronizar_estoque_pedido';
