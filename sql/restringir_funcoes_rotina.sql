-- Restringe as duas funções de ROTINA (pg_cron) para que ninguém as chame pela API.
--
--   verificar_pedidos_parados()    -> roda de hora em hora (cron 'verificar-pedidos-parados')
--   verificar_previstos_chegando() -> roda todo dia às 8h (cron 'verificar-previstos-chegando')
--
-- Elas foram criadas como security definer e sem revoke, então o Supabase deixava qualquer pessoa com a chave pública do
-- site (inclusive sem login) chamá-las por /rest/v1/rpc/... O efeito era só gerar notificações legítimas e sem repetir, mas
-- não há motivo para elas ficarem expostas: o site nunca as chama; só o agendador do banco.
--
-- O agendador (pg_cron) roda com o dono da função (postgres), que continua podendo executá-las. Nada muda no uso do sistema.
-- Pode rodar de novo. Não precisa publicar nada no site.
--
-- Rode o script INTEIRO no SQL Editor do Supabase (ele mostra só o resultado da última consulta).

revoke execute on function verificar_pedidos_parados() from public, anon, authenticated;
revoke execute on function verificar_previstos_chegando() from public, anon, authenticated;

-- ---------------------------------------------------------------- confere (esperado: as 4 primeiras colunas false, as 2 últimas true)
select
  has_function_privilege('anon', 'verificar_pedidos_parados()', 'execute') as anon_pedidos,
  has_function_privilege('authenticated', 'verificar_pedidos_parados()', 'execute') as logado_pedidos,
  has_function_privilege('anon', 'verificar_previstos_chegando()', 'execute') as anon_previstos,
  has_function_privilege('authenticated', 'verificar_previstos_chegando()', 'execute') as logado_previstos,
  (select count(*) = 2 from cron.job where jobname in ('verificar-pedidos-parados', 'verificar-previstos-chegando')) as agendamentos_continuam,
  has_function_privilege('postgres', 'verificar_pedidos_parados()', 'execute') as dono_executa;
