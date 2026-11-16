-- ============================================================================
-- MAPA · RODADA 2 de 3 (Torun) — preenche migracao_codigos_mapa
-- ============================================================================
-- 5 trocas cujo código novo era o código atual de outro produto, liberado na rodada 1. Só rode DEPOIS da rodada 1 estar REAL (antes disso o ensaio aborta: novo já existe).
-- Origem: planilha CODIGOS.xlsx (aba "Elevor Novo"), cruzada com o cadastro de 16/11/2026.
-- Fora desta troca (ficam com o código atual): 10 com medida errada na planilha
-- (ASCEN000111-115, 117; PET000013, 014, 015, 018), 6 sem linha na planilha
-- (ASCEN000116, LANV001, LANV005, LANV008, ROYALDM311, ROYALDM325) e 709078 (já correto).
--
-- Roteiro: rode 03_mapa.sql bloco C (prévia) -> 04_migracao_torun.sql em ENSAIO -> REAL
-- -> 05_verificacao.sql. O motor LIMPA o mapa ao final do REAL; por isso cada rodada
-- repõe o seu. Rode este arquivo INTEIRO de uma vez (são dois comandos).

delete from migracao_codigos_mapa where sistema = 'torun';

insert into migracao_codigos_mapa (sistema, antigo, novo) values
  ('torun', '200273', '200270'),  -- ROYALBLACK
  ('torun', '200279', '200272'),  -- ROYALBLACK
  ('torun', 'GOLDENC000006', '200020'),  -- GOLDEN CROWN
  ('torun', 'ROADT000003', '200257'),  -- ROADTRACK
  ('torun', 'ROADT000006', '200259');  -- ROADTRACK
