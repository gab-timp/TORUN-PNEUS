-- ============================================================================
-- 02 · BACKUP — rode DEPOIS do levantamento e ANTES do mapa e da migração
-- ============================================================================
-- Copia, para tabelas bkp_migcod_*, tudo o que a migração pode alterar. Se o
-- backup já existir o comando falha de propósito (assim ninguém sobrescreve um
-- backup bom por engano). As cópias ficam com RLS ligada e sem política: o app
-- e a API não enxergam; só o SQL Editor.
--
-- Além disso: o Supabase Pro guarda backup diário por 7 dias (não é ponto no
-- tempo) e o app tem "Exportar backup (JSON)" na barra lateral — faça os dois
-- também antes da migração real.
--
-- Rode cada bloco separado.
-- ============================================================================

-- ---------------------------------------------------------------- BLOCO A
create table bkp_migcod_produtos        as table produtos;
create table bkp_migcod_produtos_precos as table produtos_precos;
create table bkp_migcod_movimentos      as table movimentos;
create table bkp_migcod_entregas        as table entregas;
create table bkp_migcod_previsoes       as table previsoes;
create table bkp_migcod_log_alteracoes  as table log_alteracoes;
create table bkp_migcod_notificacoes    as table notificacoes;
create table bkp_migcod_sv_produtos     as table sv_produtos;
create table bkp_migcod_sv_reservas     as table sv_reservas;
create table bkp_migcod_sv_previsoes    as table sv_previsoes;

alter table bkp_migcod_produtos        enable row level security;
alter table bkp_migcod_produtos_precos enable row level security;
alter table bkp_migcod_movimentos      enable row level security;
alter table bkp_migcod_entregas        enable row level security;
alter table bkp_migcod_previsoes       enable row level security;
alter table bkp_migcod_log_alteracoes  enable row level security;
alter table bkp_migcod_notificacoes    enable row level security;
alter table bkp_migcod_sv_produtos     enable row level security;
alter table bkp_migcod_sv_reservas     enable row level security;
alter table bkp_migcod_sv_previsoes    enable row level security;

-- ---------------------------------------------------------------- BLOCO B
-- Conferência: a coluna "igual" tem que ser true em todas as linhas.
select 'produtos' as tabela, (select count(*) from produtos) as original, (select count(*) from bkp_migcod_produtos) as copia,
       (select count(*) from produtos) = (select count(*) from bkp_migcod_produtos) as igual
union all select 'produtos_precos', (select count(*) from produtos_precos), (select count(*) from bkp_migcod_produtos_precos), (select count(*) from produtos_precos) = (select count(*) from bkp_migcod_produtos_precos)
union all select 'movimentos', (select count(*) from movimentos), (select count(*) from bkp_migcod_movimentos), (select count(*) from movimentos) = (select count(*) from bkp_migcod_movimentos)
union all select 'entregas', (select count(*) from entregas), (select count(*) from bkp_migcod_entregas), (select count(*) from entregas) = (select count(*) from bkp_migcod_entregas)
union all select 'previsoes', (select count(*) from previsoes), (select count(*) from bkp_migcod_previsoes), (select count(*) from previsoes) = (select count(*) from bkp_migcod_previsoes)
union all select 'log_alteracoes', (select count(*) from log_alteracoes), (select count(*) from bkp_migcod_log_alteracoes), (select count(*) from log_alteracoes) = (select count(*) from bkp_migcod_log_alteracoes)
union all select 'notificacoes', (select count(*) from notificacoes), (select count(*) from bkp_migcod_notificacoes), (select count(*) from notificacoes) = (select count(*) from bkp_migcod_notificacoes)
union all select 'sv_produtos', (select count(*) from sv_produtos), (select count(*) from bkp_migcod_sv_produtos), (select count(*) from sv_produtos) = (select count(*) from bkp_migcod_sv_produtos)
union all select 'sv_reservas', (select count(*) from sv_reservas), (select count(*) from bkp_migcod_sv_reservas), (select count(*) from sv_reservas) = (select count(*) from bkp_migcod_sv_reservas)
union all select 'sv_previsoes', (select count(*) from sv_previsoes), (select count(*) from bkp_migcod_sv_previsoes), (select count(*) from sv_previsoes) = (select count(*) from bkp_migcod_sv_previsoes);

-- ---------------------------------------------------------------- BLOCO C (só depois de tudo conferido, uns 30 dias depois)
-- Apaga os backups. NÃO rode antes de ter certeza de que está tudo certo.
-- drop table bkp_migcod_produtos, bkp_migcod_produtos_precos, bkp_migcod_movimentos,
--            bkp_migcod_entregas, bkp_migcod_previsoes, bkp_migcod_log_alteracoes,
--            bkp_migcod_notificacoes, bkp_migcod_sv_produtos, bkp_migcod_sv_reservas,
--            bkp_migcod_sv_previsoes;
