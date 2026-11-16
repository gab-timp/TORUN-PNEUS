-- ============================================================================
-- MAPA · RODADA 1 de 3 (Torun) — preenche migracao_codigos_mapa
-- ============================================================================
-- 84 trocas sem dependência: o código novo está livre. Rode primeiro (ENSAIO, depois REAL).
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
  ('torun', '100123', '100365'),  -- ROADCRUZA
  ('torun', '100133', '100370'),  -- ROADCRUZA
  ('torun', '100184', '100429'),  -- ROADCRUZA
  ('torun', '100185', '100430'),  -- ROADCRUZA
  ('torun', '100268', '100394'),  -- ROADCRUZA
  ('torun', '100473', '100355'),  -- ROADCRUZA
  ('torun', '100476', '100386'),  -- ROADCRUZA
  ('torun', '100479', '100388'),  -- ROADCRUZA
  ('torun', '100634', '100427'),  -- ROADCRUZA
  ('torun', '100647', '100431'),  -- ROADCRUZA
  ('torun', '100648', '100432'),  -- ROADCRUZA
  ('torun', '200020', '200277'),  -- ROYALBLACK
  ('torun', '200021', '200278'),  -- ROYALBLACK
  ('torun', '200109', '200119'),  -- ROADCRUZA
  ('torun', '200110', '200120'),  -- ROADCRUZA
  ('torun', '200113', '200016'),  -- GOLDEN CROWN
  ('torun', '200136', '200082'),  -- LINGLONG
  ('torun', '200142', '200271'),  -- ROYALBLACK
  ('torun', '200158', '200313'),  -- TRIANGLE
  ('torun', '200182', '200052'),  -- LANVIGATOR
  ('torun', '200193', '200314'),  -- TRIANGLE
  ('torun', '200223', '200103'),  -- ROADCRUZA
  ('torun', '200234', '200106'),  -- ROADCRUZA
  ('torun', '200257', '200266'),  -- ROYALBLACK
  ('torun', '200258', '200267'),  -- ROYALBLACK
  ('torun', '200259', '200268'),  -- ROYALBLACK
  ('torun', '200270', '200054'),  -- LANVIGATOR
  ('torun', '200272', '200055'),  -- LANVIGATOR
  ('torun', '200281', '200274'),  -- ROYALBLACK
  ('torun', '200282', '200275'),  -- ROYALBLACK
  ('torun', '200283', '200276'),  -- ROYALBLACK
  ('torun', '200288', '200269'),  -- ROYALBLACK
  ('torun', '709019', '709076'),  -- ASCENSO
  ('torun', '709020', '709077'),  -- ASCENSO
  ('torun', '709083', '709081'),  -- ASCENSO
  ('torun', '709084', '709082'),  -- ASCENSO
  ('torun', '709085', '709079'),  -- ASCENSO
  ('torun', '709086', '709080'),  -- ASCENSO
  ('torun', 'APTA000028', '100028'),  -- APTANY
  ('torun', 'APTA000031', '100031'),  -- APTANY
  ('torun', 'APTA000032', '100032'),  -- APTANY
  ('torun', 'APTA000033', '100033'),  -- APTANY
  ('torun', 'GOLDENC000004', '200018'),  -- GOLDEN CROWN
  ('torun', 'LANV002', '200061'),  -- LANVIGATOR
  ('torun', 'LANV003', '200060'),  -- LANVIGATOR
  ('torun', 'LANV004', '200057'),  -- LANVIGATOR
  ('torun', 'LANV006', '200062'),  -- LANVIGATOR
  ('torun', 'LANV007', '200058'),  -- LANVIGATOR
  ('torun', 'LANV009', '200063'),  -- LANVIGATOR
  ('torun', 'LANV010', '200064'),  -- LANVIGATOR
  ('torun', 'LOY000001', '100271'),  -- LOYFER
  ('torun', 'LOY000002', '100272'),  -- LOYFER
  ('torun', 'LOY000003', '100273'),  -- LOYFER
  ('torun', 'LOY000004', '100274'),  -- LOYFER
  ('torun', 'LOY000005', '100275'),  -- LOYFER
  ('torun', 'LOY000006', '100276'),  -- LOYFER
  ('torun', 'LOY000007', '100277'),  -- LOYFER
  ('torun', 'LROADC000032', '200124'),  -- ROADCRUZA
  ('torun', 'LROADC000033', '200125'),  -- ROADCRUZA
  ('torun', 'LROADC000034', '200126'),  -- ROADCRUZA
  ('torun', 'LROADC000035', '200127'),  -- ROADCRUZA
  ('torun', 'ORIENTX000004', '100344'),  -- ORIENTX
  ('torun', 'ORIENTX000006', '100346'),  -- ORIENTX
  ('torun', 'PET000001', '709118'),  -- PETLAS
  ('torun', 'PET000002', '709119'),  -- PETLAS
  ('torun', 'PET000003', '709120'),  -- PETLAS
  ('torun', 'PET000004', '709121'),  -- PETLAS
  ('torun', 'PET000005', '709122'),  -- PETLAS
  ('torun', 'PET000006', '709123'),  -- PETLAS
  ('torun', 'PET000007', '709124'),  -- PETLAS
  ('torun', 'PET000008', '709125'),  -- PETLAS
  ('torun', 'PET000009', '709126'),  -- PETLAS
  ('torun', 'PET000010', '709127'),  -- PETLAS
  ('torun', 'PET000011', '709128'),  -- PETLAS
  ('torun', 'PET000012', '709129'),  -- PETLAS
  ('torun', 'ROADC000008', '100352'),  -- ROADCRUZA
  ('torun', 'ROADC000056', '100361'),  -- ROADCRUZA
  ('torun', 'ROADC000086', '100375'),  -- ROADCRUZA
  ('torun', 'ROADC000095', '100380'),  -- ROADCRUZA
  ('torun', 'ROADC000126', '100400'),  -- ROADCRUZA
  ('torun', 'ROADT000001', '200255'),  -- ROADTRACK
  ('torun', 'ROADT000002', '200256'),  -- ROADTRACK
  ('torun', 'ROADT000008', '200261'),  -- ROADTRACK
  ('torun', 'SUNF000038', '100664');  -- SUNFULL
