-- Diagnóstico + correção: cards de Entregas (Kanban) não atualizam sozinhos,
-- só quando a página é recarregada -- enquanto as outras telas (Estoque,
-- Produtos, Clientes, Faturamento) atualizam normalmente.
--
-- O código do app (subscribeRealtime() em site/app.js) trata "entregas" do
-- mesmo jeito que as outras tabelas -- não é bug de código.
--
-- HIPÓTESE 1 (DESCARTADA): tabela fora da publicação supabase_realtime.
--   `alter publication supabase_realtime add table public.entregas` retornou
--   "relation already member of publication" -- ou seja, já está publicada.
--
-- HIPÓTESE 2 (PROVÁVEL): falta REPLICA IDENTITY FULL na tabela entregas.
--   O Realtime, com RLS ligado, avalia a policy contra a LINHA ANTIGA pra
--   decidir se manda o evento de UPDATE/DELETE pro assinante. Sem REPLICA
--   IDENTITY FULL, a linha antiga só traz a chave primária -- a policy não
--   consegue ser avaliada e o evento é descartado em silêncio. INSERT continua
--   indo (linha nova vem completa), por isso pedido novo aparece mas
--   arrastar/editar card não propaga. entregas tem RLS com filtro por linha
--   (representante só enxerga os próprios pedidos), então é candidato certo.

-- 1) Ver o replica identity de todas as tabelas monitoradas pelo realtime.
--    Se "entregas" aparecer como 'default (só PK)' enquanto as que funcionam
--    (produtos/clientes/vendas...) aparecem como 'full', achamos a causa.
select c.relname as tabela,
       case c.relreplident
         when 'd' then 'default (só PK)'
         when 'n' then 'nothing'
         when 'f' then 'full'
         when 'i' then 'index'
       end as replica_identity
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in (
    'entregas','produtos','produtos_precos','movimentos','fretes',
    'clientes','vendas','previsoes','notificacoes'
  )
order by replica_identity, c.relname;

-- 2) Corrige: faz a linha antiga vir completa nos eventos de UPDATE/DELETE,
--    pra o Realtime conseguir aplicar a RLS e entregar o evento.
--    (rode se o passo 1 confirmar que entregas NÃO está como 'full')
alter table public.entregas replica identity full;

-- 3) Confirmação: rode o SELECT do passo 1 de novo -- "entregas" deve
--    aparecer como 'full' agora. Depois testa no app: abre Entregas em duas
--    abas, arrasta um card numa e vê se a outra atualiza sozinha, sem F5.

-- OBS: se alguma outra tabela que HOJE atualiza em tempo real também estiver
-- sem 'full', não precisa mexer -- ela funciona porque a RLS dela deve ser
-- mais simples (sem filtro por linha) ou inexistente. Só mexa em entregas.
