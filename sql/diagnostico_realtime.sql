-- Diagnóstico: o painel escuta mudanças em tempo real nas tabelas:
-- produtos, produtos_precos, movimentos, fretes, clientes, vendas, previsoes, entregas
--
-- Pra isso funcionar, cada uma dessas tabelas precisa:
--   1) estar na publicação "supabase_realtime" (senão o Supabase nunca avisa o navegador
--      que a tabela mudou), e
--   2) ter uma política de SELECT que libere pro papel que está logado (editor/viewer) —
--      senão o evento chega mas vem sem dado (silenciosamente).
--
-- Rode as duas consultas abaixo no SQL Editor do Supabase e me mande o resultado.

-- 1) Quais tabelas estão com Realtime habilitado agora:
select schemaname, tablename
from pg_publication_tables
where pubname = 'supabase_realtime'
order by tablename;

-- 2) Políticas de leitura (SELECT) hoje, nas tabelas que o painel escuta:
select tablename, policyname, cmd, roles, qual
from pg_policies
where schemaname = 'public'
  and tablename in ('produtos','produtos_precos','movimentos','fretes','clientes','vendas','previsoes','entregas')
  and cmd = 'SELECT'
order by tablename;

-- Se alguma das 8 tabelas acima NÃO aparecer no resultado da consulta 1,
-- rode isto pra habilitar o Realtime nela (troque "produtos" pela que faltar,
-- ou rode a lista inteira de uma vez):
--
-- alter publication supabase_realtime add table produtos, produtos_precos, movimentos, fretes, clientes, vendas, previsoes, entregas;
