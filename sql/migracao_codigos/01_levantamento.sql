-- ============================================================================
-- 01 · LEVANTAMENTO — rode ANTES de qualquer coisa (só leitura, não altera nada)
-- ============================================================================
-- Serve para conferir se o banco ainda tem a mesma "cara" que o roteiro
-- (LEIAME.md) assume. Em 01/10/2026 a migração de códigos falhou/causou
-- estrago porque alguém só procurou ONDE o código fica gravado e esqueceu de
-- olhar as chaves estrangeiras e os gatilhos das tabelas.
--
-- Rode UM BLOCO POR VEZ (o SQL Editor só mostra o resultado da última consulta
-- quando várias rodam juntas) e compare com o que está escrito acima de cada um.
-- ============================================================================

-- ---------------------------------------------------------------- BLOCO 1
-- Chaves estrangeiras que apontam para o código de produto.
-- Esperado hoje: movimentos e produtos_precos -> produtos(codigo);
--                sv_reservas -> sv_produtos(codigo). Se aparecer OUTRA tabela,
-- o motor trata sozinho (ele derruba e recria todas), mas avise antes de seguir.
select con.conrelid::regclass::text as tabela,
       con.conname                  as chave,
       pg_get_constraintdef(con.oid) as definicao
from pg_constraint con
where con.contype = 'f'
  and con.confrelid in ('produtos'::regclass, 'sv_produtos'::regclass)
order by 1, 2;

-- ---------------------------------------------------------------- BLOCO 2
-- Gatilhos das tabelas que a migração toca. O motor desliga os que estiverem
-- LIGADOS e religa só esses. Atenção a qualquer um que apareça DESLIGADO aqui:
-- ele continuará desligado depois (de propósito).
select c.relname as tabela,
       t.tgname  as gatilho,
       p.proname as funcao,
       case t.tgenabled when 'O' then 'ligado' when 'D' then 'DESLIGADO' else t.tgenabled::text end as estado
from pg_trigger t
join pg_class c on c.oid = t.tgrelid
join pg_proc  p on p.oid = t.tgfoid
where not t.tgisinternal
  and c.relnamespace = 'public'::regnamespace
  and c.relname in ('produtos', 'produtos_precos', 'movimentos', 'entregas', 'previsoes',
                    'log_alteracoes', 'notificacoes', 'sv_produtos', 'sv_reservas', 'sv_previsoes')
order by 1, 2;

-- ---------------------------------------------------------------- BLOCO 3
-- Todas as colunas do banco que podem guardar código de produto. Esperado hoje:
--   produtos.codigo, produtos_precos.codigo, movimentos.codigo, sv_produtos.codigo,
--   sv_reservas.codigo, entregas.itens, previsoes.itens, sv_previsoes.itens,
--   log_alteracoes.registro_id, notificacoes.link_id.
-- Qualquer coluna de outra tabela que pareça guardar código = precisa ser
-- analisada ANTES (alguma tabela nova desde a última vez?).
select table_name as tabela, column_name as coluna, data_type as tipo
from information_schema.columns
where table_schema = 'public'
  and table_name not like 'bkp\_migcod\_%'
  and (column_name ilike '%codigo%' or column_name ilike '%produto%'
       or column_name in ('itens', 'link_id', 'registro_id'))
order by 1, 2;

-- ---------------------------------------------------------------- BLOCO 4
-- Funções (RPC, gatilhos) cujo texto cita "codigo": são as que podem agir sobre
-- o código sozinhas (baixa automática, avisos de estoque baixo, etc.).
select p.proname as funcao
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.prokind = 'f'
  and pg_get_functiondef(p.oid) ilike '%codigo%'
order by 1;

-- ---------------------------------------------------------------- BLOCO 5
-- Views que citam "codigo" (se houver alguma, ela precisa ser conferida).
select schemaname as esquema, viewname as visao
from pg_views
where schemaname = 'public' and definition ilike '%codigo%'
order by 1, 2;

-- ---------------------------------------------------------------- BLOCO 6
-- Tamanho do que vai ser mexido (para ter ideia do tempo e do que conferir).
select 'produtos' as tabela, count(*) as linhas from produtos
union all select 'produtos_precos', count(*) from produtos_precos
union all select 'movimentos', count(*) from movimentos
union all select 'entregas', count(*) from entregas
union all select 'previsoes', count(*) from previsoes
union all select 'log_alteracoes', count(*) from log_alteracoes
union all select 'notificacoes', count(*) from notificacoes
union all select 'sv_produtos', count(*) from sv_produtos
union all select 'sv_reservas', count(*) from sv_reservas
union all select 'sv_previsoes', count(*) from sv_previsoes;
