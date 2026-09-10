-- Bug: cards de Entregas (Kanban) não atualizavam em tempo real -- só no F5.
-- As outras telas atualizavam normal. RESOLVIDO em set/2026.
--
-- CAUSA RAIZ (não era do banco): o app registrava os 9 postgres_changes no
-- MESMO canal do Realtime. Bug conhecido do realtime-js -- com muitas
-- assinaturas num canal, os IDs que o servidor devolve desalinham e os bindings
-- do fim da lista (entregas = 8ª, notificacoes = 9ª) nunca casam os eventos.
-- Corrigido em site/app.js: subscribeRealtime() -> um canal por tabela
-- (commit "Realtime: um canal por tabela").
--
-- Confirmado no console: canal com 1 binding só recebia o evento de entregas;
-- o canal principal com 9 não disparava o handler.
--
-- ------------------------------------------------------------------------------
-- O QUE FOI APLICADO NO BANCO junto (não era a causa, mas é o setup correto e
-- fica): REPLICA IDENTITY FULL em entregas. A policy de SELECT de entregas
-- filtra por linha ("representante nao ve os proprios pedidos", olha
-- origem/vendedor). Pro Realtime avaliar essa RLS na linha ANTIGA de um
-- UPDATE/DELETE, a linha antiga precisa vir completa no WAL -- e sem REPLICA
-- IDENTITY FULL ela só traz a PK. (entregas já estava na publicação
-- supabase_realtime -- isso foi verificado e não era o problema.)

alter table public.entregas replica identity full;

-- Confirmação -- deve retornar 'full':
select case c.relreplident
         when 'd' then 'default (só PK)' when 'n' then 'nothing'
         when 'f' then 'full' when 'i' then 'index'
       end as replica_identity_entregas
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relname = 'entregas';
