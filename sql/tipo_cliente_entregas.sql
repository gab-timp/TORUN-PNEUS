-- Guarda também o tipo de cliente usado ao gerar a proposta (mesma ideia de
-- tabela_preco_regiao / tabela_preco_condicao em proposta_tabela_preco.sql),
-- pra aparecer no card das Entregas e na proposta impressa.
--
-- Aditivo e seguro — pode rodar a qualquer momento. Rode no SQL Editor do Supabase.

alter table entregas add column if not exists tabela_preco_tipo_cliente text;
