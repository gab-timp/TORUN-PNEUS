-- Diagnóstico de alcance: bug corrigido no commit "Corrige bug: editar pedido apagava
-- reserva/origem/tabela de preco" (site/app.js).
--
-- O bug: toda edição comum de um pedido pelo modal "Editar pedido" (trocar transportadora,
-- corrigir data, mudar etapa etc.) resetava silenciosamente, no registro salvo:
--   origem -> 'interno' (mesmo que tivesse vindo do portal do representante)
--   reserva -> false
--   reserva_status -> null
--   reserva_expira_em -> null
--   tabela_preco_regiao / tabela_preco_condicao / tabela_preco_tipo_cliente -> null
--   razao_social / documento_cliente / condicao_frete / finalidade / obs_impressao_nf -> null
--
-- IMPORTANTE: essa ação específica (editar pelo modal e salvar) nunca gravou nada em
-- log_alteracoes -- só cancelamento, exclusão, toggle de CTE e anexo logam. Então não dá
-- pra listar com 100% de certeza QUAIS pedidos foram pegos pelo bug depois do fato; as
-- consultas abaixo são heurísticas (candidatos), não uma lista definitiva. Rode no SQL
-- Editor do Supabase.

-- 1) Visão geral agora: quantos pedidos existem e quantos ainda mostram
-- origem/reserva/tabela de preço preenchidos hoje (esses definitivamente NÃO foram
-- resetados, ou nunca foram editados pelo modal depois de criados).
select
  count(*) as total_pedidos,
  count(*) filter (where origem = 'representante') as origem_representante_hoje,
  count(*) filter (where reserva = true) as reserva_ativa_hoje,
  count(*) filter (where tabela_preco_regiao is not null) as com_tabela_preco_hoje,
  count(*) filter (where updated_at > created_at + interval '2 minutes') as editados_pelo_menos_uma_vez
from entregas;

-- 2) Candidatos fortes: pedidos que HOJE aparecem como origem='interno' e sem tabela de
-- preço, mas foram editados depois de criados (updated_at bem depois de created_at) E têm
-- pelo menos um item com valorUnitario no JSON -- sinal de que o pedido nasceu com preço
-- de catálogo puxado (ou seja, muito provavelmente veio do representante), mas isso não
-- aparece mais nos campos de topo.
select
  id, numero_pedido, numero_nf, cliente, etapa, cancelado,
  created_at, updated_at, (updated_at - created_at) as intervalo_ate_ultima_edicao,
  itens
from entregas
where origem = 'interno'
  and tabela_preco_regiao is null
  and updated_at > created_at + interval '2 minutes'
  and exists (
    select 1 from jsonb_array_elements(itens) it
    where (it ->> 'valorUnitario') is not null
  )
order by updated_at desc;

-- 3) Mesma heurística, mas olhando reserva=false: pedidos editados depois de criados,
-- sem tabela de preço hoje, com item(ns) precificado(s) no JSON -- candidatos a terem tido
-- uma reserva ativa cancelada silenciosamente pelo bug.
select
  id, numero_pedido, numero_nf, cliente, etapa, cancelado,
  created_at, updated_at, (updated_at - created_at) as intervalo_ate_ultima_edicao
from entregas
where reserva = false
  and tabela_preco_regiao is null
  and updated_at > created_at + interval '2 minutes'
  and exists (
    select 1 from jsonb_array_elements(itens) it
    where (it ->> 'valorUnitario') is not null
  )
order by updated_at desc;

-- 4) Se o Supabase mantiver backups / Point-in-Time Recovery no plano do projeto, o único
-- jeito de confirmar de verdade (não só por heurística) os valores originais de
-- origem/reserva/tabela_preco_* dos pedidos listados em (2) e (3) é restaurar um branch/
-- snapshot de antes da primeira edição de cada um (created_at) e comparar linha a linha.
