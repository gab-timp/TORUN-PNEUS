-- ============================================================================
-- 04b · MIGRAÇÃO DE CÓDIGOS DE PRODUTO — SEM VENDA
-- ============================================================================
-- O Sem Venda tem cadastro de produtos PRÓPRIO (sv_produtos), separado do
-- Torun. Este arquivo troca, para os códigos do mapa com sistema = 'semvenda':
--   sv_produtos.codigo (chave) · sv_reservas.codigo (chave estrangeira,
--   ON DELETE RESTRICT, sem ON UPDATE CASCADE) · sv_previsoes.itens[].codigo
--
-- Mesma segurança do 04_migracao_torun.sql: transação única, ENSAIO por
-- padrão (grava nada, mostra o resumo no erro "ENSAIO CONCLUÍDO"), trava de
-- tabelas, gatilhos desligados e religados, chaves recriadas, updated_at
-- carimbado e conferências antes/depois (nenhum código antigo sobra, nenhuma
-- linha some, quantidades por código idênticas).
--
-- As fotos do Sem Venda ficam no Storage em pastas com o código ANTIGO no nome
-- (sem-venda-fotos/<codigo>/...). Isso NÃO quebra nada: a coluna foto_path
-- guarda o caminho completo e continua valendo; só fotos novas irão para a
-- pasta do código novo.
--
-- COMO USAR: igual ao 04: 1) rode como está (ENSAIO) e espere o erro
-- "ENSAIO CONCLUÍDO"; 2) troque 'ENSAIO' por 'REAL' e rode de novo;
-- 3) confira com o 05_verificacao.sql.
-- ============================================================================

BEGIN;

SET LOCAL lock_timeout = '15s';
SET LOCAL statement_timeout = '120s';

-- >>>>>>>>>>>> MODO: 'ENSAIO' (padrão, não grava nada) ou 'REAL' <<<<<<<<<<<<
CREATE TEMP TABLE tmp_modo ON COMMIT DROP AS SELECT 'ENSAIO'::text AS modo;
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>

CREATE TEMP TABLE tmp_mapa ON COMMIT DROP AS
  SELECT antigo, novo FROM migracao_codigos_mapa WHERE sistema = 'semvenda';

LOCK TABLE sv_produtos, sv_reservas, sv_previsoes IN ACCESS EXCLUSIVE MODE;

DO $$
DECLARE
  v int;
  lista text;
BEGIN
  IF (SELECT count(*) FROM tmp_mapa) = 0 THEN
    RAISE EXCEPTION 'Abortando: o mapa (sistema semvenda) está vazio. Preencha pelo 03_mapa.sql.';
  END IF;

  SELECT count(*), string_agg(antigo, ', ') INTO v, lista
  FROM tmp_mapa m WHERE NOT EXISTS (SELECT 1 FROM sv_produtos p WHERE p.codigo = m.antigo);
  IF v > 0 THEN
    RAISE EXCEPTION 'Abortando: % código(s) antigo(s) não existem em sv_produtos: %', v, lista;
  END IF;

  SELECT count(*), string_agg(novo, ', ') INTO v, lista
  FROM tmp_mapa m WHERE EXISTS (SELECT 1 FROM sv_produtos p WHERE p.codigo = m.novo);
  IF v > 0 THEN
    RAISE EXCEPTION 'Abortando: % código(s) novo(s) já existem em sv_produtos (colisão; inclui troca encadeada, que deve ser feita em duas etapas): %', v, lista;
  END IF;

  SELECT count(*), string_agg(novo, ', ') INTO v, lista
  FROM tmp_mapa WHERE novo <> btrim(novo) OR antigo <> btrim(antigo) OR btrim(novo) = '';
  IF v > 0 THEN
    RAISE EXCEPTION 'Abortando: % código(s) com espaço sobrando ou vazio no mapa: %', v, lista;
  END IF;
END $$;

-- Retrato de ANTES
CREATE TEMP TABLE tmp_antes ON COMMIT DROP AS
SELECT
  (SELECT count(*) FROM sv_produtos)  AS produtos,
  (SELECT count(*) FROM sv_reservas)  AS reservas,
  (SELECT count(*) FROM sv_previsoes) AS previsoes;

-- quantidade reservada e quantidade em processos, por código já final
CREATE TEMP TABLE tmp_qtd_antes ON COMMIT DROP AS
SELECT 'reserva'::text AS origem, coalesce(m.novo, r.codigo) AS codigo_final, sum(r.quantidade) AS qtd
FROM sv_reservas r LEFT JOIN tmp_mapa m ON m.antigo = r.codigo
GROUP BY 2
UNION ALL
SELECT 'previsto', coalesce(m.novo, i ->> 'codigo'), sum((i ->> 'quantidade')::numeric)
FROM sv_previsoes pr,
     jsonb_array_elements(CASE WHEN jsonb_typeof(pr.itens) = 'array' THEN pr.itens ELSE '[]'::jsonb END) i
LEFT JOIN tmp_mapa m ON m.antigo = i ->> 'codigo'
WHERE i ->> 'codigo' IS NOT NULL
GROUP BY 2;

CREATE TEMP TABLE tmp_resumo (ordem serial, etapa text, linhas bigint) ON COMMIT DROP;

-- Desliga os gatilhos que estavam ligados (guarda os nomes para religar)
CREATE TEMP TABLE tmp_triggers (tabela text, nome text) ON COMMIT DROP;

DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT c.relname AS tabela, t.tgname AS nome
    FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    WHERE NOT t.tgisinternal
      AND t.tgenabled = 'O'
      AND c.relnamespace = 'public'::regnamespace
      AND c.relname IN ('sv_produtos', 'sv_reservas', 'sv_previsoes')
  LOOP
    INSERT INTO tmp_triggers VALUES (r.tabela, r.nome);
    EXECUTE format('ALTER TABLE %I DISABLE TRIGGER %I', r.tabela, r.nome);
  END LOOP;
END $$;

-- Derruba as chaves estrangeiras que apontam para sv_produtos (guarda a definição)
CREATE TEMP TABLE tmp_fks (tabela text, nome text, definicao text) ON COMMIT DROP;

DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT con.conrelid::regclass::text AS tabela, con.conname AS nome, pg_get_constraintdef(con.oid) AS def
    FROM pg_constraint con
    WHERE con.contype = 'f' AND con.confrelid = 'sv_produtos'::regclass
  LOOP
    INSERT INTO tmp_fks VALUES (r.tabela, r.nome, r.def);
    EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I', r.tabela, r.nome);
  END LOOP;
END $$;

-- A TROCA
DO $$
DECLARE n bigint;
BEGIN
  UPDATE sv_reservas r SET codigo = m.novo, updated_at = now()
  FROM tmp_mapa m WHERE r.codigo = m.antigo;
  GET DIAGNOSTICS n = ROW_COUNT;
  INSERT INTO tmp_resumo (etapa, linhas) VALUES ('sv_reservas.codigo', n);

  UPDATE sv_produtos p SET codigo = m.novo
  FROM tmp_mapa m WHERE p.codigo = m.antigo;
  GET DIAGNOSTICS n = ROW_COUNT;
  INSERT INTO tmp_resumo (etapa, linhas) VALUES ('sv_produtos.codigo', n);

  UPDATE sv_previsoes pr
  SET itens = sub.novos_itens, updated_at = now()
  FROM (
    SELECT pr2.id AS id,
           jsonb_agg(
             CASE WHEN m.novo IS NOT NULL THEN jsonb_set(item, '{codigo}', to_jsonb(m.novo)) ELSE item END
             ORDER BY ord
           ) AS novos_itens
    FROM sv_previsoes pr2
    CROSS JOIN LATERAL jsonb_array_elements(pr2.itens) WITH ORDINALITY AS t(item, ord)
    LEFT JOIN tmp_mapa m ON m.antigo = item ->> 'codigo'
    WHERE jsonb_typeof(pr2.itens) = 'array'
    GROUP BY pr2.id
  ) sub
  WHERE pr.id = sub.id
    AND jsonb_typeof(pr.itens) = 'array'
    AND EXISTS (SELECT 1 FROM jsonb_array_elements(pr.itens) x WHERE x ->> 'codigo' IN (SELECT antigo FROM tmp_mapa));
  GET DIAGNOSTICS n = ROW_COUNT;
  INSERT INTO tmp_resumo (etapa, linhas) VALUES ('sv_previsoes.itens (processos)', n);
END $$;

-- Recria as chaves e religa os gatilhos
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT * FROM tmp_fks LOOP
    EXECUTE format('ALTER TABLE %s ADD CONSTRAINT %I %s', r.tabela, r.nome, r.definicao);
  END LOOP;
  FOR r IN SELECT * FROM tmp_triggers LOOP
    EXECUTE format('ALTER TABLE %I ENABLE TRIGGER %I', r.tabela, r.nome);
  END LOOP;
END $$;

-- CONFERÊNCIAS DEPOIS: qualquer falha desfaz tudo
DO $$
DECLARE
  v int;
  v_modo text;
  v_resumo text;
BEGIN
  SELECT
    (SELECT count(*) FROM sv_produtos p JOIN tmp_mapa m ON p.codigo = m.antigo)
  + (SELECT count(*) FROM sv_reservas r JOIN tmp_mapa m ON r.codigo = m.antigo)
  + (SELECT count(*) FROM sv_previsoes pr, jsonb_array_elements(CASE WHEN jsonb_typeof(pr.itens) = 'array' THEN pr.itens ELSE '[]'::jsonb END) i JOIN tmp_mapa m ON m.antigo = i ->> 'codigo')
  INTO v;
  IF v > 0 THEN
    RAISE EXCEPTION 'Desfeito: sobraram % referência(s) a código antigo.', v;
  END IF;

  SELECT count(*) INTO v FROM tmp_mapa m WHERE NOT EXISTS (SELECT 1 FROM sv_produtos p WHERE p.codigo = m.novo);
  IF v > 0 THEN
    RAISE EXCEPTION 'Desfeito: % código(s) novo(s) não aparecem em sv_produtos.', v;
  END IF;

  SELECT count(*) INTO v FROM tmp_antes a
  WHERE a.produtos  <> (SELECT count(*) FROM sv_produtos)
     OR a.reservas  <> (SELECT count(*) FROM sv_reservas)
     OR a.previsoes <> (SELECT count(*) FROM sv_previsoes);
  IF v > 0 THEN
    RAISE EXCEPTION 'Desfeito: a contagem de linhas de alguma tabela mudou.';
  END IF;

  SELECT count(*) INTO v
  FROM tmp_qtd_antes a
  FULL JOIN (
    SELECT 'reserva'::text AS origem, codigo AS codigo_final, sum(quantidade) AS qtd FROM sv_reservas GROUP BY 2
    UNION ALL
    SELECT 'previsto', i ->> 'codigo', sum((i ->> 'quantidade')::numeric)
    FROM sv_previsoes pr,
         jsonb_array_elements(CASE WHEN jsonb_typeof(pr.itens) = 'array' THEN pr.itens ELSE '[]'::jsonb END) i
    WHERE i ->> 'codigo' IS NOT NULL
    GROUP BY 2
  ) d USING (origem, codigo_final)
  WHERE a.qtd IS DISTINCT FROM d.qtd;
  IF v > 0 THEN
    RAISE EXCEPTION 'Desfeito: a quantidade reservada ou em processos de % código(s) ficou diferente da de antes.', v;
  END IF;

  SELECT count(*) INTO v FROM tmp_fks f
  WHERE NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    WHERE con.contype = 'f' AND con.confrelid = 'sv_produtos'::regclass AND con.conname = f.nome
  );
  IF v > 0 THEN
    RAISE EXCEPTION 'Desfeito: % chave(s) estrangeira(s) não foram recriadas.', v;
  END IF;

  SELECT string_agg(r.etapa || ': ' || r.linhas, E'\n' ORDER BY r.ordem) INTO v_resumo FROM tmp_resumo r;
  SELECT t.modo INTO v_modo FROM tmp_modo t;

  IF v_modo IS DISTINCT FROM 'REAL' THEN
    RAISE EXCEPTION E'ENSAIO CONCLUÍDO — NADA FOI GRAVADO.\nProdutos no mapa: %\nLinhas que seriam alteradas:\n%\nSe o resumo está como esperado, troque ''ENSAIO'' por ''REAL'' e rode de novo.',
      (SELECT count(*) FROM tmp_mapa), v_resumo;
  END IF;

  INSERT INTO migracao_codigos_historico (sistema, antigo, novo)
  SELECT 'semvenda', antigo, novo FROM tmp_mapa;
  DELETE FROM migracao_codigos_mapa WHERE sistema = 'semvenda';
END $$;

COMMIT;
