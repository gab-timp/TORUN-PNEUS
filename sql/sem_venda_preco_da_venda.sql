-- SEM VENDA: preço e data da venda, para o Dashboard (Vendedores e Valor vendido).
--
-- Ao "Confirmar venda" a tela passa a gravar o preço por unidade e o dia da venda:
--   preco_unitario  preço de venda por unidade, em R$ (vazio nas vendas confirmadas antes desta mudança)
--   vendido_em      dia em que a venda foi confirmada (vazio nas vendas antigas: a tela usa a data da
--                   última alteração da reserva)
-- Vendas antigas, sem preço gravado, usam o preço de proposta do produto no Dashboard.
--
-- Aditivo (só cria colunas): dá pra rodar antes do deploy; quem ainda estiver com a tela antiga continua
-- confirmando vendas normalmente, só que sem preço.

alter table sv_reservas add column if not exists preco_unitario numeric(14,2)
  check (preco_unitario is null or preco_unitario >= 0);
alter table sv_reservas add column if not exists vendido_em date;

notify pgrst, 'reload schema';

-- Confere (deve voltar 2):
select count(*) as colunas_novas
from information_schema.columns
where table_name = 'sv_reservas' and column_name in ('preco_unitario', 'vendido_em');
