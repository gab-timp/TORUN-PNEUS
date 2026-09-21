-- SUBSTITUÍDO por sql/marca_roadtrack_descontinuada.sql (o Catálogo agora esconde pneu com
-- Situação = Descontinuado; não precisa mais apagar preço pra tirar uma marca da lista).
--
-- Histórico: este script foi rodado em 21/09/2026 pra tirar o Roadtrack do Catálogo apagando os
-- preços dele. A versão que rodou pegava também o PREFIXO do código (ROADT%), e o prefixo ROADT
-- é compartilhado com a marca ROADCRUZA (ROADT000002 e ROADT000006) -- então os preços desses
-- dois, se existiam, foram apagados junto. A condição abaixo já está corrigida pra usar só a
-- marca; não há motivo pra rodar de novo.

delete from produtos_precos
where codigo in (
  select codigo from produtos
  where upper(marca) = 'ROADTRACK'
);
