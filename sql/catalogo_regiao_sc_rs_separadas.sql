-- Catálogo de preços: a região "SC/RS" vira duas colunas separadas, SC e RS.
--
-- Os preços que hoje estão em "SC/RS" passam para "SC" (nada é apagado nem alterado no valor). A região "RS" nasce vazia:
-- os preços do RS serão cadastrados depois, na tela do Catálogo (coluna RS).
--
-- Só muda a tabela produtos_precos (a coluna regiao). Pedidos antigos (entregas) que guardam "SC/RS" como texto da tabela de
-- preço usada continuam como estão: são só um rótulo histórico e não são tocados (mexer em entregas dispara gatilhos).
--
-- ORDEM: rode ANTES de publicar o site. Se o site novo chegar primeiro, o Catálogo mostra a coluna SC vazia até o SQL rodar.
-- Rode no SQL Editor do Supabase.

update produtos_precos set regiao = 'SC' where regiao = 'SC/RS';

-- confere: nenhuma linha deve restar em SC/RS; RS começa com zero
select
  (select count(*) from produtos_precos where regiao = 'SC/RS') as ainda_sc_rs,
  (select count(*) from produtos_precos where regiao = 'SC') as linhas_sc,
  (select count(*) from produtos_precos where regiao = 'RS') as linhas_rs;
