-- Quando o representante gera uma proposta (pré-venda), ele escolhe uma tabela de preço
-- (região) e uma condição de pagamento no Catálogo pra puxar o valor unitário dos itens.
-- Isso ficava só na tela, sem ser gravado -- agora fica salvo junto com o pedido, pra
-- aparecer no card das Entregas e o escritório saber qual tabela/condição foi usada.
--
-- Rode este SQL no SQL Editor do Supabase.

alter table entregas add column if not exists tabela_preco_regiao text;
alter table entregas add column if not exists tabela_preco_condicao text;
