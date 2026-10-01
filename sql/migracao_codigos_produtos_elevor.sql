-- Migração de código de produto (padronização interna, base: Planilha Elevor).
-- 43 produtos trocam de código. Os outros 29 (ASCENSO x6, GOLDCROWN x2, PETLAS
-- inteira, ROADTRACK descontinuados) ficam com o código atual por decisão do
-- usuário -- não aparecem neste script.
--
-- ASCEN000110 é um caso especial: o "Código Hoje" dele na planilha Elevor
-- aponta pra um pneu diferente (600/65R34 TDR650). Por isso NÃO usamos o
-- código novo da planilha pra ele -- em vez disso, vira ASCEN000117 (próximo
-- código livre na mesma numeração ASCEN), mantendo a descrição atual.
--
-- Tabelas afetadas, na ordem:
--   1) produtos_precos.codigo  e  movimentos.codigo -- ambas têm FK real pra
--      produtos, sem ON UPDATE CASCADE (confirmado por consulta em
--      pg_constraint). Por isso TODAS as FKs que apontam pra produtos são
--      derrubadas antes das trocas e recriadas depois, de forma genérica.
--   2) produtos.codigo          (chave primária)
--   3) entregas.itens[].codigo  (jsonb)
--   4) previsoes.itens[].codigo (jsonb)
--   5) log_alteracoes.registro_id (texto livre, só onde tabela = 'produtos')
--   6) notificacoes.link_id       (texto livre, só onde tipo = 'estoque_baixo')
--
-- Roda tudo dentro de uma transação. Antes de mexer em qualquer tabela, um
-- bloco de segurança CONFERE se os 43 códigos antigos existem e se nenhum dos
-- 43 códigos novos já está em uso -- se alguma coisa não bater, a migração
-- inteira é abortada (RAISE EXCEPTION) e nada é alterado.

BEGIN;

CREATE TEMP TABLE tmp_mapa_codigos (
  antigo text PRIMARY KEY,
  novo   text NOT NULL
) ON COMMIT DROP;

INSERT INTO tmp_mapa_codigos (antigo, novo) VALUES
  ('ASCEN000103', '709019'),
  ('ASCEN000104', '709020'),
  ('ASCEN000105', '709078'),
  ('ASCEN000106', '709085'),
  ('ASCEN000107', '709086'),
  ('ASCEN000108', '709083'),
  ('ASCEN000109', '709084'),
  ('ASCEN000110', 'ASCEN000117'),
  ('GOLDENC000002', '200113'),
  ('LANV000006', '200182'),
  ('LANV000009', '200270'),
  ('LANV000010', '200272'),
  ('LLING000001', '200136'),
  ('LROADC000011', '200223'),
  ('LROADC000014', '200234'),
  ('LROADC000027', '200109'),
  ('LROADC000028', '200110'),
  ('ROADC000029', '100473'),
  ('ROADC000063', '100123'),
  ('ROADC000078', '100133'),
  ('ROADC000109', '100476'),
  ('ROADC000111', '100479'),
  ('ROADC000120', '100268'),
  ('ROADC000168', '100634'),
  ('ROADC000170', '100184'),
  ('ROADC000171', '100185'),
  ('ROADC000172', '100647'),
  ('ROADC000173', '100648'),
  ('ROYALB000001', '200257'),
  ('ROYALB000002', '200258'),
  ('ROYALB000003', '200259'),
  ('ROYALB000004', '200288'),
  ('ROYALB000005', '200273'),
  ('ROYALB000006', '200142'),
  ('ROYALB000007', '200279'),
  ('ROYALB000008', '200280'),
  ('ROYALB000009', '200281'),
  ('ROYALB000010', '200282'),
  ('ROYALB000011', '200283'),
  ('ROYALB000012', '200020'),
  ('ROYALB000013', '200021'),
  ('TRI000001', '200158'),
  ('TRI000018', '200193');

-- Bloco de segurança: aborta a transação inteira se algo não bater.
DO $$
DECLARE
  v_faltando int;
  v_colisao  int;
BEGIN
  SELECT count(*) INTO v_faltando
  FROM tmp_mapa_codigos m
  WHERE NOT EXISTS (SELECT 1 FROM produtos p WHERE p.codigo = m.antigo);

  IF v_faltando > 0 THEN
    RAISE EXCEPTION 'Abortando: % código(s) antigo(s) da lista não existem mais em produtos.codigo', v_faltando;
  END IF;

  SELECT count(*) INTO v_colisao
  FROM tmp_mapa_codigos m
  WHERE EXISTS (
    SELECT 1 FROM produtos p
    WHERE p.codigo = m.novo
      AND p.codigo NOT IN (SELECT antigo FROM tmp_mapa_codigos)
  );

  IF v_colisao > 0 THEN
    RAISE EXCEPTION 'Abortando: % código(s) novo(s) já existem em produtos.codigo (colisão de chave).', v_colisao;
  END IF;
END $$;

-- 1) Derruba TODAS as FKs que apontam pra produtos (hoje são 2: produtos_precos
--    e movimentos -- confirmado por consulta em pg_constraint antes de rodar
--    isso aqui, mas o bloco é genérico de propósito, pra não depender de eu
--    ter achado todas na hora de escrever o script). Guarda nome/tabela/coluna/
--    regra de ON DELETE original pra recriar exatamente igual depois.
CREATE TEMP TABLE tmp_fks_dropadas (
  constraint_name text,
  tabela text,
  coluna text,
  delete_rule text
) ON COMMIT DROP;

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT con.conname, rel.relname AS tabela, att.attname AS coluna, con.confdeltype
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    JOIN pg_attribute att ON att.attrelid = con.conrelid AND att.attnum = ANY(con.conkey)
    WHERE con.confrelid = 'produtos'::regclass
      AND con.contype = 'f'
  LOOP
    INSERT INTO tmp_fks_dropadas (constraint_name, tabela, coluna, delete_rule)
    VALUES (r.conname, r.tabela, r.coluna,
      CASE r.confdeltype
        WHEN 'c' THEN 'CASCADE'
        WHEN 'r' THEN 'RESTRICT'
        WHEN 'n' THEN 'SET NULL'
        WHEN 'd' THEN 'SET DEFAULT'
        ELSE 'NO ACTION'
      END);
    EXECUTE format('ALTER TABLE %I DROP CONSTRAINT %I', r.tabela, r.conname);
  END LOOP;
END $$;

-- 2) produtos_precos.codigo
UPDATE produtos_precos pp
SET codigo = m.novo
FROM tmp_mapa_codigos m
WHERE pp.codigo = m.antigo;

-- 3) movimentos.codigo (tem FK também, por isso foi derrubada acima junto)
UPDATE movimentos mv
SET codigo = m.novo
FROM tmp_mapa_codigos m
WHERE mv.codigo = m.antigo;

-- 4) produtos.codigo (chave primária)
UPDATE produtos p
SET codigo = m.novo
FROM tmp_mapa_codigos m
WHERE p.codigo = m.antigo;

-- 5) Recria, uma por uma, todas as FKs derrubadas no passo 1 -- com o mesmo
--    nome, mesma coluna e mesma regra de ON DELETE de antes.
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN SELECT * FROM tmp_fks_dropadas LOOP
    EXECUTE format(
      'ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES produtos(codigo) ON DELETE %s',
      r.tabela, r.constraint_name, r.coluna, r.delete_rule
    );
  END LOOP;
END $$;

-- 3) entregas.itens[].codigo (jsonb, atualiza elemento por elemento)
UPDATE entregas e
SET itens = sub.novos_itens
FROM (
  SELECT e2.id AS id, jsonb_agg(
    CASE WHEN m.novo IS NOT NULL
      THEN jsonb_set(item, '{codigo}', to_jsonb(m.novo))
      ELSE item
    END
    ORDER BY ord
  ) AS novos_itens
  FROM entregas e2
  CROSS JOIN LATERAL jsonb_array_elements(e2.itens) WITH ORDINALITY AS t(item, ord)
  LEFT JOIN tmp_mapa_codigos m ON m.antigo = item ->> 'codigo'
  WHERE e2.itens IS NOT NULL
  GROUP BY e2.id
) sub
WHERE e.id = sub.id
  AND EXISTS (
    SELECT 1 FROM jsonb_array_elements(e.itens) x
    WHERE x ->> 'codigo' IN (SELECT antigo FROM tmp_mapa_codigos)
  );

-- 4) previsoes.itens[].codigo (jsonb, mesmo padrão)
UPDATE previsoes pr
SET itens = sub.novos_itens
FROM (
  SELECT pr2.id AS id, jsonb_agg(
    CASE WHEN m.novo IS NOT NULL
      THEN jsonb_set(item, '{codigo}', to_jsonb(m.novo))
      ELSE item
    END
    ORDER BY ord
  ) AS novos_itens
  FROM previsoes pr2
  CROSS JOIN LATERAL jsonb_array_elements(pr2.itens) WITH ORDINALITY AS t(item, ord)
  LEFT JOIN tmp_mapa_codigos m ON m.antigo = item ->> 'codigo'
  WHERE pr2.itens IS NOT NULL
  GROUP BY pr2.id
) sub
WHERE pr.id = sub.id
  AND EXISTS (
    SELECT 1 FROM jsonb_array_elements(pr.itens) x
    WHERE x ->> 'codigo' IN (SELECT antigo FROM tmp_mapa_codigos)
  );

-- 5) log_alteracoes.registro_id (só histórico de produtos)
UPDATE log_alteracoes la
SET registro_id = m.novo
FROM tmp_mapa_codigos m
WHERE la.tabela = 'produtos' AND la.registro_id = m.antigo;

-- 6) notificacoes.link_id (só notificações de estoque baixo)
UPDATE notificacoes n
SET link_id = m.novo
FROM tmp_mapa_codigos m
WHERE n.tipo = 'estoque_baixo' AND n.link_id = m.antigo;

COMMIT;

-- =========================================================================
-- VERIFICAÇÃO (rodar DEPOIS do bloco acima já ter sido commitado, só leitura).
-- São duas consultas -- rode CADA UMA SEPARADA (o Supabase só mostra o
-- resultado da última consulta quando cola várias juntas).
--
-- Consulta A (abaixo): todas as linhas devem mostrar 0 -- se alguma mostrar
-- número > 0, sobrou código antigo em algum lugar.
-- =========================================================================
WITH mapa(antigo, novo) AS (
  VALUES
    ('ASCEN000103', '709019'), ('ASCEN000104', '709020'), ('ASCEN000105', '709078'),
    ('ASCEN000106', '709085'), ('ASCEN000107', '709086'), ('ASCEN000108', '709083'),
    ('ASCEN000109', '709084'), ('ASCEN000110', 'ASCEN000117'), ('GOLDENC000002', '200113'),
    ('LANV000006', '200182'), ('LANV000009', '200270'), ('LANV000010', '200272'),
    ('LLING000001', '200136'), ('LROADC000011', '200223'), ('LROADC000014', '200234'),
    ('LROADC000027', '200109'), ('LROADC000028', '200110'), ('ROADC000029', '100473'),
    ('ROADC000063', '100123'), ('ROADC000078', '100133'), ('ROADC000109', '100476'),
    ('ROADC000111', '100479'), ('ROADC000120', '100268'), ('ROADC000168', '100634'),
    ('ROADC000170', '100184'), ('ROADC000171', '100185'), ('ROADC000172', '100647'),
    ('ROADC000173', '100648'), ('ROYALB000001', '200257'), ('ROYALB000002', '200258'),
    ('ROYALB000003', '200259'), ('ROYALB000004', '200288'), ('ROYALB000005', '200273'),
    ('ROYALB000006', '200142'), ('ROYALB000007', '200279'), ('ROYALB000008', '200280'),
    ('ROYALB000009', '200281'), ('ROYALB000010', '200282'), ('ROYALB000011', '200283'),
    ('ROYALB000012', '200020'), ('ROYALB000013', '200021'), ('TRI000001', '200158'),
    ('TRI000018', '200193')
)
SELECT 'produtos' AS tabela, count(*) AS restantes_com_codigo_antigo
FROM produtos p JOIN mapa m ON p.codigo = m.antigo
UNION ALL
SELECT 'produtos_precos', count(*) FROM produtos_precos pp JOIN mapa m ON pp.codigo = m.antigo
UNION ALL
SELECT 'movimentos', count(*) FROM movimentos mv JOIN mapa m ON mv.codigo = m.antigo
UNION ALL
SELECT 'log_alteracoes', count(*) FROM log_alteracoes la JOIN mapa m ON la.registro_id = m.antigo AND la.tabela = 'produtos'
UNION ALL
SELECT 'notificacoes', count(*) FROM notificacoes n JOIN mapa m ON n.link_id = m.antigo AND n.tipo = 'estoque_baixo'
UNION ALL
SELECT 'entregas_itens', count(*) FROM entregas e, jsonb_array_elements(e.itens) item JOIN mapa m ON m.antigo = item ->> 'codigo'
UNION ALL
SELECT 'previsoes_itens', count(*) FROM previsoes pr, jsonb_array_elements(pr.itens) item JOIN mapa m ON m.antigo = item ->> 'codigo';

-- Consulta B (rodar separada, depois da A): checagem positiva -- os 43
-- produtos devem aparecer com o código novo. Deve trazer 43 linhas.
SELECT codigo, medida, marca, situacao
FROM produtos
WHERE codigo IN (
  '709019','709020','709078','709085','709086','709083','709084','ASCEN000117',
  '200113','200182','200270','200272','200136','200223','200234','200109','200110',
  '100473','100123','100133','100476','100479','100268','100634','100184','100185',
  '100647','100648','200257','200258','200259','200288','200273','200142','200279',
  '200280','200281','200282','200283','200020','200021','200158','200193'
)
ORDER BY codigo;
