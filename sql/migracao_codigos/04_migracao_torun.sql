-- ============================================================================
-- 04 · MIGRAÇÃO DE CÓDIGOS DE PRODUTO — TORUN (Varejo)
-- ============================================================================
-- O QUE FAZ: troca o código dos produtos listados em migracao_codigos_mapa
-- (sistema = 'torun') em TODOS os lugares onde ele fica gravado:
--   produtos.codigo (chave) · produtos_precos.codigo · movimentos.codigo
--   entregas.itens[].codigo (jsonb) · previsoes.itens[].codigo (jsonb)
--   log_alteracoes.registro_id (onde tabela = 'produtos')
--   notificacoes.link_id (onde tipo = 'estoque_baixo')
--
-- POR QUE É SEGURO:
--  * Tudo numa transação: se qualquer conferência falhar, NADA é gravado.
--  * Começa em modo ENSAIO: roda tudo de verdade, confere e DESFAZ no fim,
--    mostrando um resumo. Só vale com o modo 'REAL' (ver a linha abaixo).
--  * Trava as tabelas durante a troca (segundos) e aborta se não conseguir
--    em 15 s, em vez de ficar pendurado.
--  * Desliga os gatilhos das tabelas tocadas e religa exatamente os que
--    estavam ligados. (Em 01/10/2026 o gatilho de baixa automática disparou
--    com o UPDATE de entregas.itens e gerou 16 baixas duplicadas.)
--  * Derruba e recria as chaves estrangeiras que apontam para produtos, com a
--    definição original (movimentos e produtos_precos não têm ON UPDATE
--    CASCADE; sem isso a troca da chave primária é recusada).
--  * Carimba updated_at das linhas alteradas: quem estiver com um pedido,
--    processo ou movimentação aberta na tela recebe o aviso de conflito em
--    vez de salvar de volta o código antigo.
--  * Confere antes e depois: nenhum código antigo sobra, todo código novo
--    existe, nenhuma linha some e o SALDO de cada produto fica idêntico.
--
-- COMO USAR (nesta ordem, sem pular):
--   1. Ensaio: rode este arquivo como está (modo ENSAIO). O resultado esperado
--      é um ERRO que começa com "ENSAIO CONCLUÍDO". É isso que queremos: a
--      mensagem traz o resumo e nada foi gravado. Qualquer outro erro = há algo
--      a corrigir; leia a mensagem.
--   2. Real: troque 'ENSAIO' por 'REAL' na linha marcada e rode de novo.
--      Termina sem erro (COMMIT).
--   3. Rode o 05_verificacao.sql (consultas separadas).
--
-- NÃO rode no meio do expediente: peça a todos para fechar o sistema (ou
-- faça fora do horário) e para recarregar a página (F5) depois.
-- ============================================================================

BEGIN;

SET LOCAL lock_timeout = '15s';
SET LOCAL statement_timeout = '120s';

-- >>>>>>>>>>>> MODO: 'ENSAIO' (padrão, não grava nada) ou 'REAL' <<<<<<<<<<<<
CREATE TEMP TABLE tmp_modo ON COMMIT DROP AS SELECT 'ENSAIO'::text AS modo;
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>

CREATE TEMP TABLE tmp_mapa ON COMMIT DROP AS
  SELECT antigo, novo FROM migracao_codigos_mapa WHERE sistema = 'torun';

-- Nenhuma outra sessão escreve nessas tabelas até o fim da transação.
LOCK TABLE produtos, produtos_precos, movimentos, entregas, previsoes, log_alteracoes, notificacoes
  IN ACCESS EXCLUSIVE MODE;

-- ---------------------------------------------------------------------------
-- CONFERÊNCIAS ANTES DE MEXER EM QUALQUER COISA
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v int;
  lista text;
BEGIN
  IF (SELECT count(*) FROM tmp_mapa) = 0 THEN
    RAISE EXCEPTION 'Abortando: o mapa (sistema torun) está vazio. Preencha pelo 03_mapa.sql.';
  END IF;

  SELECT count(*), string_agg(antigo, ', ') INTO v, lista
  FROM tmp_mapa m WHERE NOT EXISTS (SELECT 1 FROM produtos p WHERE p.codigo = m.antigo);
  IF v > 0 THEN
    RAISE EXCEPTION 'Abortando: % código(s) antigo(s) não existem em produtos: %', v, lista;
  END IF;

  SELECT count(*), string_agg(novo, ', ') INTO v, lista
  FROM tmp_mapa m WHERE EXISTS (SELECT 1 FROM produtos p WHERE p.codigo = m.novo);
  IF v > 0 THEN
    RAISE EXCEPTION 'Abortando: % código(s) novo(s) já existem em produtos (colisão; inclui troca encadeada A->B, B->C, que deve ser feita em duas etapas): %', v, lista;
  END IF;

  SELECT count(*), string_agg(novo, ', ') INTO v, lista
  FROM tmp_mapa WHERE novo <> btrim(novo) OR antigo <> btrim(antigo) OR btrim(novo) = '';
  IF v > 0 THEN
    RAISE EXCEPTION 'Abortando: % código(s) com espaço sobrando ou vazio no mapa: %', v, lista;
  END IF;
END $$;

-- Retrato de ANTES (contagens e saldo por produto, já no código final).
CREATE TEMP TABLE tmp_antes ON COMMIT DROP AS
SELECT
  (SELECT count(*) FROM produtos)        AS produtos,
  (SELECT count(*) FROM produtos_precos) AS precos,
  (SELECT count(*) FROM movimentos)      AS movimentos,
  (SELECT count(*) FROM entregas)        AS entregas,
  (SELECT count(*) FROM previsoes)       AS previsoes,
  (SELECT count(*) FROM log_alteracoes)  AS logs,
  (SELECT count(*) FROM notificacoes)    AS notificacoes;

CREATE TEMP TABLE tmp_saldo_antes ON COMMIT DROP AS
SELECT coalesce(m.novo, mv.codigo) AS codigo_final,
       sum(CASE WHEN mv.tipo = 'entrada' THEN mv.quantidade ELSE -mv.quantidade END) AS saldo
FROM movimentos mv
LEFT JOIN tmp_mapa m ON m.antigo = mv.codigo
GROUP BY 1;

CREATE TEMP TABLE tmp_resumo (ordem serial, etapa text, linhas bigint) ON COMMIT DROP;

-- ---------------------------------------------------------------------------
-- DESLIGA OS GATILHOS que estavam ligados (guarda os nomes para religar)
-- ---------------------------------------------------------------------------
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
      AND c.relname IN ('produtos', 'produtos_precos', 'movimentos', 'entregas', 'previsoes', 'log_alteracoes', 'notificacoes')
  LOOP
    INSERT INTO tmp_triggers VALUES (r.tabela, r.nome);
    EXECUTE format('ALTER TABLE %I DISABLE TRIGGER %I', r.tabela, r.nome);
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- DERRUBA todas as chaves estrangeiras que apontam para produtos(codigo),
-- guardando a definição exata para recriar igual.
-- ---------------------------------------------------------------------------
CREATE TEMP TABLE tmp_fks (tabela text, nome text, definicao text) ON COMMIT DROP;

DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT con.conrelid::regclass::text AS tabela, con.conname AS nome, pg_get_constraintdef(con.oid) AS def
    FROM pg_constraint con
    WHERE con.contype = 'f' AND con.confrelid = 'produtos'::regclass
  LOOP
    INSERT INTO tmp_fks VALUES (r.tabela, r.nome, r.def);
    EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I', r.tabela, r.nome);
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- A TROCA
-- ---------------------------------------------------------------------------
DO $$
DECLARE n bigint;
BEGIN
  UPDATE produtos_precos pp SET codigo = m.novo
  FROM tmp_mapa m WHERE pp.codigo = m.antigo;
  GET DIAGNOSTICS n = ROW_COUNT;
  INSERT INTO tmp_resumo (etapa, linhas) VALUES ('produtos_precos.codigo', n);

  UPDATE movimentos mv SET codigo = m.novo, updated_at = now()
  FROM tmp_mapa m WHERE mv.codigo = m.antigo;
  GET DIAGNOSTICS n = ROW_COUNT;
  INSERT INTO tmp_resumo (etapa, linhas) VALUES ('movimentos.codigo', n);

  UPDATE produtos p SET codigo = m.novo
  FROM tmp_mapa m WHERE p.codigo = m.antigo;
  GET DIAGNOSTICS n = ROW_COUNT;
  INSERT INTO tmp_resumo (etapa, linhas) VALUES ('produtos.codigo', n);
END $$;

DO $$
DECLARE n bigint;
BEGIN
  UPDATE entregas e
  SET itens = sub.novos_itens, updated_at = now()
  FROM (
    SELECT e2.id AS id,
           jsonb_agg(
             CASE WHEN m.novo IS NOT NULL THEN jsonb_set(item, '{codigo}', to_jsonb(m.novo)) ELSE item END
             ORDER BY ord
           ) AS novos_itens
    FROM entregas e2
    CROSS JOIN LATERAL jsonb_array_elements(e2.itens) WITH ORDINALITY AS t(item, ord)
    LEFT JOIN tmp_mapa m ON m.antigo = item ->> 'codigo'
    WHERE jsonb_typeof(e2.itens) = 'array'
    GROUP BY e2.id
  ) sub
  WHERE e.id = sub.id
    AND jsonb_typeof(e.itens) = 'array'
    AND EXISTS (SELECT 1 FROM jsonb_array_elements(e.itens) x WHERE x ->> 'codigo' IN (SELECT antigo FROM tmp_mapa));
  GET DIAGNOSTICS n = ROW_COUNT;
  INSERT INTO tmp_resumo (etapa, linhas) VALUES ('entregas.itens (pedidos)', n);

  UPDATE previsoes pr
  SET itens = sub.novos_itens, updated_at = now()
  FROM (
    SELECT pr2.id AS id,
           jsonb_agg(
             CASE WHEN m.novo IS NOT NULL THEN jsonb_set(item, '{codigo}', to_jsonb(m.novo)) ELSE item END
             ORDER BY ord
           ) AS novos_itens
    FROM previsoes pr2
    CROSS JOIN LATERAL jsonb_array_elements(pr2.itens) WITH ORDINALITY AS t(item, ord)
    LEFT JOIN tmp_mapa m ON m.antigo = item ->> 'codigo'
    WHERE jsonb_typeof(pr2.itens) = 'array'
    GROUP BY pr2.id
  ) sub
  WHERE pr.id = sub.id
    AND jsonb_typeof(pr.itens) = 'array'
    AND EXISTS (SELECT 1 FROM jsonb_array_elements(pr.itens) x WHERE x ->> 'codigo' IN (SELECT antigo FROM tmp_mapa));
  GET DIAGNOSTICS n = ROW_COUNT;
  INSERT INTO tmp_resumo (etapa, linhas) VALUES ('previsoes.itens (estoque previsto)', n);

  UPDATE log_alteracoes la SET registro_id = m.novo
  FROM tmp_mapa m WHERE la.tabela = 'produtos' AND la.registro_id = m.antigo;
  GET DIAGNOSTICS n = ROW_COUNT;
  INSERT INTO tmp_resumo (etapa, linhas) VALUES ('log_alteracoes.registro_id', n);

  UPDATE notificacoes nt SET link_id = m.novo
  FROM tmp_mapa m WHERE nt.tipo = 'estoque_baixo' AND nt.link_id = m.antigo;
  GET DIAGNOSTICS n = ROW_COUNT;
  INSERT INTO tmp_resumo (etapa, linhas) VALUES ('notificacoes.link_id', n);
END $$;

-- ---------------------------------------------------------------------------
-- RECRIA as chaves estrangeiras e RELIGA os gatilhos
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- CONFERÊNCIAS DEPOIS: qualquer falha aqui desfaz tudo
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v int;
  v_modo text;
  v_resumo text;
  orfaos_depois int;
BEGIN
  -- 1) nenhum código antigo sobrou em lugar nenhum
  SELECT
    (SELECT count(*) FROM produtos p JOIN tmp_mapa m ON p.codigo = m.antigo)
  + (SELECT count(*) FROM produtos_precos pp JOIN tmp_mapa m ON pp.codigo = m.antigo)
  + (SELECT count(*) FROM movimentos mv JOIN tmp_mapa m ON mv.codigo = m.antigo)
  + (SELECT count(*) FROM log_alteracoes la JOIN tmp_mapa m ON la.registro_id = m.antigo AND la.tabela = 'produtos')
  + (SELECT count(*) FROM notificacoes nt JOIN tmp_mapa m ON nt.link_id = m.antigo AND nt.tipo = 'estoque_baixo')
  + (SELECT count(*) FROM entregas e, jsonb_array_elements(CASE WHEN jsonb_typeof(e.itens) = 'array' THEN e.itens ELSE '[]'::jsonb END) i JOIN tmp_mapa m ON m.antigo = i ->> 'codigo')
  + (SELECT count(*) FROM previsoes pr, jsonb_array_elements(CASE WHEN jsonb_typeof(pr.itens) = 'array' THEN pr.itens ELSE '[]'::jsonb END) i JOIN tmp_mapa m ON m.antigo = i ->> 'codigo')
  INTO v;
  IF v > 0 THEN
    RAISE EXCEPTION 'Desfeito: sobraram % referência(s) a código antigo.', v;
  END IF;

  -- 2) todo código novo existe em produtos
  SELECT count(*) INTO v FROM tmp_mapa m WHERE NOT EXISTS (SELECT 1 FROM produtos p WHERE p.codigo = m.novo);
  IF v > 0 THEN
    RAISE EXCEPTION 'Desfeito: % código(s) novo(s) não aparecem em produtos.', v;
  END IF;

  -- 3) nenhuma linha apareceu nem sumiu
  SELECT count(*) INTO v FROM tmp_antes a
  WHERE a.produtos      <> (SELECT count(*) FROM produtos)
     OR a.precos        <> (SELECT count(*) FROM produtos_precos)
     OR a.movimentos    <> (SELECT count(*) FROM movimentos)
     OR a.entregas      <> (SELECT count(*) FROM entregas)
     OR a.previsoes     <> (SELECT count(*) FROM previsoes)
     OR a.logs          <> (SELECT count(*) FROM log_alteracoes)
     OR a.notificacoes  <> (SELECT count(*) FROM notificacoes);
  IF v > 0 THEN
    RAISE EXCEPTION 'Desfeito: a contagem de linhas de alguma tabela mudou.';
  END IF;

  -- 4) o saldo de cada produto é idêntico ao de antes
  SELECT count(*) INTO v
  FROM tmp_saldo_antes a
  FULL JOIN (
    SELECT codigo AS codigo_final,
           sum(CASE WHEN tipo = 'entrada' THEN quantidade ELSE -quantidade END) AS saldo
    FROM movimentos GROUP BY 1
  ) d USING (codigo_final)
  WHERE a.saldo IS DISTINCT FROM d.saldo;
  IF v > 0 THEN
    RAISE EXCEPTION 'Desfeito: o saldo de % produto(s) ficou diferente do de antes.', v;
  END IF;

  -- 5) as chaves estrangeiras voltaram todas
  SELECT count(*) INTO v FROM tmp_fks f
  WHERE NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    WHERE con.contype = 'f' AND con.confrelid = 'produtos'::regclass AND con.conname = f.nome
  );
  IF v > 0 THEN
    RAISE EXCEPTION 'Desfeito: % chave(s) estrangeira(s) não foram recriadas.', v;
  END IF;

  -- informativo: itens de pedidos/previstos cujo código não existe em produtos
  SELECT
    (SELECT count(*) FROM entregas e, jsonb_array_elements(CASE WHEN jsonb_typeof(e.itens) = 'array' THEN e.itens ELSE '[]'::jsonb END) i
       WHERE i ->> 'codigo' IS NOT NULL AND NOT EXISTS (SELECT 1 FROM produtos p WHERE p.codigo = i ->> 'codigo'))
  + (SELECT count(*) FROM previsoes pr, jsonb_array_elements(CASE WHEN jsonb_typeof(pr.itens) = 'array' THEN pr.itens ELSE '[]'::jsonb END) i
       WHERE i ->> 'codigo' IS NOT NULL AND NOT EXISTS (SELECT 1 FROM produtos p WHERE p.codigo = i ->> 'codigo'))
  INTO orfaos_depois;

  SELECT string_agg(r.etapa || ': ' || r.linhas, E'\n' ORDER BY r.ordem) INTO v_resumo FROM tmp_resumo r;
  SELECT t.modo INTO v_modo FROM tmp_modo t;

  IF v_modo IS DISTINCT FROM 'REAL' THEN
    RAISE EXCEPTION E'ENSAIO CONCLUÍDO — NADA FOI GRAVADO.\nProdutos no mapa: %\nLinhas que seriam alteradas:\n%\nItens de pedido/previsto com código inexistente (informativo, já existiam?): %\nSe o resumo está como esperado, troque ''ENSAIO'' por ''REAL'' e rode de novo.',
      (SELECT count(*) FROM tmp_mapa), v_resumo, orfaos_depois;
  END IF;

  -- modo REAL: registra o de-para no histórico e limpa o mapa (assim rodar de
  -- novo falha na conferência de antigos, em vez de repetir a troca)
  INSERT INTO migracao_codigos_historico (sistema, antigo, novo)
  SELECT 'torun', antigo, novo FROM tmp_mapa;
  DELETE FROM migracao_codigos_mapa WHERE sistema = 'torun';
END $$;

COMMIT;
