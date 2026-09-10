-- Diagnóstico + correção: cards de Entregas (Kanban) não atualizam sozinhos,
-- só quando a página é recarregada -- enquanto as outras telas (Estoque,
-- Produtos, Clientes, Faturamento) atualizam normalmente.
--
-- O código do app (subscribeRealtime() em site/app.js) trata "entregas" do
-- mesmo jeito que as outras tabelas -- não é bug de código. A causa mais
-- provável é a tabela "entregas" não estar na publicação de Realtime do
-- Supabase (configuração por tabela, separada de RLS -- fácil de passar
-- batido numa tabela criada/alterada depois das outras).

-- 1) Ver quais tabelas estão publicadas pro Realtime hoje.
--    Rode isso primeiro: se "entregas" NÃO aparecer na lista, é essa a causa.
select schemaname, tablename
from pg_publication_tables
where pubname = 'supabase_realtime'
order by tablename;

-- 2) Se "entregas" não apareceu no passo 1, rode isto pra adicionar
--    (idempotente na prática -- se já estiver incluída, dá erro "already
--    member of publication", só ignore e pule pro passo 3):
alter publication supabase_realtime add table public.entregas;

-- 3) Confirmação: rode o SELECT do passo 1 de novo -- "entregas" deve
--    aparecer agora na lista.
