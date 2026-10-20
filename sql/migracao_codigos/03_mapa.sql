-- ============================================================================
-- 03 · MAPA DE CÓDIGOS (de-para)  — rode DEPOIS do 02_backup.sql
-- ============================================================================
-- Cria (uma vez só) a tabela do mapa antigo -> novo e a do histórico. O motor
-- (04_migracao_torun.sql / 04b_migracao_semvenda.sql) lê SÓ esta tabela, então
-- nenhum código fica escrito dentro do script de migração.
--
-- As tabelas ficam com RLS ligada e SEM política: o app e a API não enxergam;
-- só o SQL Editor.
--
-- Rode cada bloco separado, na ordem (A, B, C). O SQL Editor só mostra o
-- resultado do ÚLTIMO comando quando vários rodam juntos.
-- ============================================================================

-- ---------------------------------------------------------------- BLOCO A
-- Cria as tabelas (pode rodar de novo sem problema).
create table if not exists migracao_codigos_mapa (
  sistema text not null default 'torun' check (sistema in ('torun', 'semvenda')),
  antigo  text not null,
  novo    text not null,
  primary key (sistema, antigo),
  unique (sistema, novo),
  check (antigo <> novo)
);
alter table migracao_codigos_mapa enable row level security;

create table if not exists migracao_codigos_historico (
  id          bigint generated always as identity primary key,
  aplicado_em timestamptz not null default now(),
  sistema     text not null,
  antigo      text not null,
  novo        text not null
);
alter table migracao_codigos_historico enable row level security;

-- ---------------------------------------------------------------- BLOCO B
-- Preenche o mapa. UMA linha por produto que muda de código.
--   sistema = 'torun'     -> produtos do Torun (Varejo)
--   sistema = 'semvenda'  -> produtos do Sem Venda (cadastro separado)
-- Exemplo (apague os "--" e troque pelos códigos de verdade):
--
-- insert into migracao_codigos_mapa (sistema, antigo, novo) values
--   ('torun', 'ASCEN000112', '200300'),
--   ('torun', 'ROADT000003', '200301');
--
-- Se errou, limpe e refaça (só enquanto a migração REAL ainda não rodou):
--   delete from migracao_codigos_mapa where sistema = 'torun';

-- ---------------------------------------------------------------- BLOCO C
-- PRÉVIA: confira linha por linha, com os olhos, antes de seguir. Cada código
-- antigo precisa ser o produto certo (medida e marca) e o novo não pode existir.
-- Atenção: o prefixo do código NÃO identifica a marca (ROADT = ROADTRACK e
-- ROADCRUZA). Confie na coluna marca, não no prefixo.
select
  m.antigo,
  m.novo,
  p.medida,
  p.marca,
  p.modelo,
  p.situacao,
  exists (select 1 from produtos x where x.codigo = m.novo) as novo_ja_existe,
  (select count(*) from movimentos mv where mv.codigo = m.antigo) as movimentos,
  (select count(*) from produtos_precos pp where pp.codigo = m.antigo) as precos,
  (select count(*)
     from entregas e,
          jsonb_array_elements(case when jsonb_typeof(e.itens) = 'array' then e.itens else '[]'::jsonb end) i
    where i ->> 'codigo' = m.antigo) as itens_em_pedidos,
  (select count(*)
     from previsoes pr,
          jsonb_array_elements(case when jsonb_typeof(pr.itens) = 'array' then pr.itens else '[]'::jsonb end) i
    where i ->> 'codigo' = m.antigo) as itens_em_previstos
from migracao_codigos_mapa m
left join produtos p on p.codigo = m.antigo
where m.sistema = 'torun'
order by m.antigo;
