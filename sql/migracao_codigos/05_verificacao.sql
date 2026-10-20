-- ============================================================================
-- 05 · VERIFICAÇÃO — rode DEPOIS da migração REAL (só leitura)
-- ============================================================================
-- Usa migracao_codigos_historico (gravado pelo motor) e os backups do 02.
-- Rode UM BLOCO POR VEZ e compare com o "esperado" de cada um.
-- ============================================================================

-- ---------------------------------------------------------------- BLOCO 1
-- ESPERADO: todas as linhas com 0. Se alguma tiver número, sobrou código antigo.
with h as (select antigo from migracao_codigos_historico where sistema = 'torun')
select 'produtos' as tabela, count(*) as sobrou_codigo_antigo from produtos p join h on p.codigo = h.antigo
union all select 'produtos_precos', count(*) from produtos_precos pp join h on pp.codigo = h.antigo
union all select 'movimentos', count(*) from movimentos mv join h on mv.codigo = h.antigo
union all select 'log_alteracoes', count(*) from log_alteracoes la join h on la.registro_id = h.antigo and la.tabela = 'produtos'
union all select 'notificacoes', count(*) from notificacoes n join h on n.link_id = h.antigo and n.tipo = 'estoque_baixo'
union all select 'entregas.itens', count(*) from entregas e, jsonb_array_elements(case when jsonb_typeof(e.itens) = 'array' then e.itens else '[]'::jsonb end) i join h on h.antigo = i ->> 'codigo'
union all select 'previsoes.itens', count(*) from previsoes pr, jsonb_array_elements(case when jsonb_typeof(pr.itens) = 'array' then pr.itens else '[]'::jsonb end) i join h on h.antigo = i ->> 'codigo';

-- ---------------------------------------------------------------- BLOCO 2
-- ESPERADO: 1 linha só, com existem = quantos_no_mapa (todos os códigos novos existem).
select (select count(*) from migracao_codigos_historico where sistema = 'torun') as quantos_no_mapa,
       (select count(*) from produtos p join migracao_codigos_historico h on h.novo = p.codigo and h.sistema = 'torun') as existem;

-- ---------------------------------------------------------------- BLOCO 3
-- SALDO por produto: antes (backup) x agora. ESPERADO: nenhuma linha.
-- (Mostra só os produtos cujo saldo mudou. Movimentações feitas DEPOIS da
-- migração, por quem usou o sistema, aparecem aqui — confira a data.)
with antes as (
  select coalesce(h.novo, b.codigo) as codigo,
         sum(case when b.tipo = 'entrada' then b.quantidade else -b.quantidade end) as saldo
  from bkp_migcod_movimentos b
  left join migracao_codigos_historico h on h.antigo = b.codigo and h.sistema = 'torun'
  group by 1
), agora as (
  select codigo, sum(case when tipo = 'entrada' then quantidade else -quantidade end) as saldo
  from movimentos group by 1
)
select coalesce(a.codigo, g.codigo) as codigo, a.saldo as saldo_antes, g.saldo as saldo_agora
from antes a full join agora g on g.codigo = a.codigo
where a.saldo is distinct from g.saldo
order by 1;

-- ---------------------------------------------------------------- BLOCO 4
-- Itens de pedidos e de estoque previsto cujo código NÃO existe em produtos.
-- Alguns podem ser antigos (códigos já extintos, anteriores a esta migração);
-- compare com o resultado "Itens com código inexistente" do ensaio. Se
-- apareceu código antigo do mapa aqui, algo ficou para trás.
select 'pedido' as origem, e.id, i ->> 'codigo' as codigo
from entregas e, jsonb_array_elements(case when jsonb_typeof(e.itens) = 'array' then e.itens else '[]'::jsonb end) i
where i ->> 'codigo' is not null and not exists (select 1 from produtos p where p.codigo = i ->> 'codigo')
union all
select 'previsto', pr.id, i ->> 'codigo'
from previsoes pr, jsonb_array_elements(case when jsonb_typeof(pr.itens) = 'array' then pr.itens else '[]'::jsonb end) i
where i ->> 'codigo' is not null and not exists (select 1 from produtos p where p.codigo = i ->> 'codigo')
order by 1, 3;

-- ---------------------------------------------------------------- BLOCO 5
-- Gatilhos: ESPERADO igual ao do 01_levantamento (BLOCO 2): os que eram
-- "ligado" continuam "ligado".
select c.relname as tabela, t.tgname as gatilho,
       case t.tgenabled when 'O' then 'ligado' when 'D' then 'DESLIGADO' else t.tgenabled::text end as estado
from pg_trigger t join pg_class c on c.oid = t.tgrelid
where not t.tgisinternal and c.relnamespace = 'public'::regnamespace
  and c.relname in ('produtos', 'produtos_precos', 'movimentos', 'entregas', 'previsoes',
                    'log_alteracoes', 'notificacoes', 'sv_produtos', 'sv_reservas', 'sv_previsoes')
order by 1, 2;

-- ---------------------------------------------------------------- BLOCO 6
-- Chaves estrangeiras: ESPERADO igual ao do 01_levantamento (BLOCO 1).
select con.conrelid::regclass::text as tabela, con.conname as chave, pg_get_constraintdef(con.oid) as definicao
from pg_constraint con
where con.contype = 'f' and con.confrelid in ('produtos'::regclass, 'sv_produtos'::regclass)
order by 1, 2;

-- ---------------------------------------------------------------- BLOCO 7 (Sem Venda, só se mexeu nele)
-- ESPERADO: todas as linhas com 0.
with h as (select antigo from migracao_codigos_historico where sistema = 'semvenda')
select 'sv_produtos' as tabela, count(*) as sobrou_codigo_antigo from sv_produtos p join h on p.codigo = h.antigo
union all select 'sv_reservas', count(*) from sv_reservas r join h on r.codigo = h.antigo
union all select 'sv_previsoes.itens', count(*) from sv_previsoes pr, jsonb_array_elements(case when jsonb_typeof(pr.itens) = 'array' then pr.itens else '[]'::jsonb end) i join h on h.antigo = i ->> 'codigo';
