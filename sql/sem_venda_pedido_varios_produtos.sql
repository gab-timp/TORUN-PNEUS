-- Sem Venda: reserva com varios produtos (um "pedido").
--
-- Cada produto continua sendo uma linha propria em sv_reservas (com a sua situacao, venda, preco e cancelamento).
-- Os produtos do mesmo pedido ficam ligados por um mesmo pedido_id; a tela agrupa numa linha so, que abre pra
-- mostrar os produtos. Reserva de um produto so e as antigas ficam com pedido_id vazio e aparecem como antes.
--
-- Coluna nova (opcional, nada existente muda):
--   pedido_id   texto que liga as linhas do mesmo pedido (ex: svped_...)
--
-- Rode este SQL ANTES de publicar o site: a tela passa a gravar pedido_id quando o pedido tem 2 ou mais
-- produtos. (Reserva de um produto so continua funcionando mesmo sem o SQL.)
-- Rode o script INTEIRO no SQL Editor do Supabase (ele mostra so o resultado da ultima consulta).

alter table sv_reservas add column if not exists pedido_id text;
create index if not exists sv_reservas_pedido_idx on sv_reservas (pedido_id) where pedido_id is not null;

-- ---------------------------------------------------------------- confere
select
  (select count(*) = 1 from information_schema.columns where table_name = 'sv_reservas' and column_name = 'pedido_id') as coluna,
  (select count(*) = 1 from pg_indexes where indexname = 'sv_reservas_pedido_idx') as indice,
  (select count(*) from sv_reservas where pedido_id is not null) as linhas_com_pedido;
