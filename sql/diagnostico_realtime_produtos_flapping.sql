-- Diagnóstico (só leitura): usuário reportou console cheio de
-- "Realtime desconectado (produtos: CLOSED) — reconectando em 5s." em loop
-- contínuo, alternando com "Realtime conectado" -- ou seja, o canal de
-- "produtos" conecta, fecha de novo poucos segundos depois, reconecta, repete
-- indefinidamente. Os outros 8 canais (produtos_precos, movimentos, fretes,
-- clientes, vendas, previsoes, entregas, notificacoes) não aparecem no loop,
-- só "produtos".

-- 1) "produtos" está na publicação supabase_realtime? Se não vier na lista,
--    o canal nunca deveria nem conseguir se inscrever de verdade -- mas como
--    ele CONECTA antes de fechar, provavelmente está sim. Serve de
--    confirmação.
select schemaname, tablename
from pg_publication_tables
where pubname = 'supabase_realtime'
order by tablename;

-- 2) REPLICA IDENTITY de "produtos" -- mesma causa que já resolvemos em
--    "entregas" (RLS de SELECT que filtra por linha precisa da linha ANTIGA
--    completa no WAL pra UPDATE/DELETE, senão só vem a chave primária).
select case c.relreplident
         when 'd' then 'default (só PK)' when 'n' then 'nothing'
         when 'f' then 'full' when 'i' then 'index'
       end as replica_identity_produtos
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relname = 'produtos';

-- 3) Policies de RLS em "produtos" -- se a de SELECT filtrar por linha (em
--    vez de liberar geral pra quem está autenticado), pode ser a mesma causa
--    do item 2.
select polname, cmd, qual, with_check
from pg_policies
where schemaname = 'public' and tablename = 'produtos';

-- 4) Volume de "produtos" e de movimentações recentes -- só pra descartar
--    "tabela mudando toda hora, disparando evento atrás de evento". "produtos"
--    não tem coluna updated_at (só created_at), então não dá pra medir UPDATE
--    recente direto -- movimentos serve de proxy (toda venda/entrada mexe
--    indiretamente no saldo calculado, mas não na linha de "produtos" em si).
select
  (select count(*) from produtos) as total_produtos,
  (select count(*) from produtos where created_at > now() - interval '10 minutes') as produtos_criados_ultimos_10min,
  (select count(*) from movimentos where created_at > now() - interval '10 minutes') as movimentos_ultimos_10min;
