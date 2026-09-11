-- Troca a lista de condições de pagamento do Catálogo de "dias corridos"
-- (30/60, 30/60/90...) pra "quantidade de parcelas" (2X, 3X...), a pedido do
-- usuário. Lista final: A VISTA / 30 DIAS / 2X / 3X / 4X / 5X / 6X.
--
-- "A VISTA" e "30 DIAS" não mudam. O "1X" que foi cogitado ficou de fora --
-- o usuário decidiu ignorar (não teria preço antigo pra migrar pra ele mesmo).
--
-- Migração pedida: renomeia pela QUANTIDADE DE PARCELAS de cada condição
-- antiga (30/60 = 2 parcelas -> 2X, 30/60/90 = 3 parcelas -> 3X, etc.) --
-- preserva o preço já cadastrado, só troca o rótulo da condição.
--
-- Não existe CHECK constraint em produtos_precos.condicao_pagamento (é texto
-- livre), então o rename abaixo não esbarra em restrição nenhuma.
--
-- Idempotente: se rodar de novo depois de já ter migrado, os WHERE não acham
-- mais nada com o valor antigo e não fazem nada.

-- 1) Diagnóstico -- quantos preços existem em cada condição hoje. Roda antes
--    de migrar pra saber o tamanho do impacto.
select condicao_pagamento, count(*) as qtd
from produtos_precos
group by condicao_pagamento
order by condicao_pagamento;

-- 2) Migração
update produtos_precos set condicao_pagamento = '2X' where condicao_pagamento = '30/60';
update produtos_precos set condicao_pagamento = '3X' where condicao_pagamento = '30/60/90';
update produtos_precos set condicao_pagamento = '4X' where condicao_pagamento = '30/60/90/120';
update produtos_precos set condicao_pagamento = '5X' where condicao_pagamento = '30/60/90/120/150';
update produtos_precos set condicao_pagamento = '6X' where condicao_pagamento = '30/60/90/120/150/180';

-- 3) Confirmação -- só deve aparecer A VISTA / 30 DIAS / 2X / 3X / 4X / 5X / 6X.
select condicao_pagamento, count(*) as qtd
from produtos_precos
group by condicao_pagamento
order by condicao_pagamento;

-- NOTA: entregas.tabela_preco_condicao (a condição que ficou registrada em
-- pedidos já feitos, só pra exibição no card) NÃO foi migrada de propósito --
-- é histórico de qual condição foi usada no momento do pedido, não precisa
-- bater com a lista atual do Catálogo.
