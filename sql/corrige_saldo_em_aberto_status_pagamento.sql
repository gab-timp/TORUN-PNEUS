-- Substitui o cálculo de saldo_em_aberto_clientes (usado pelo "Disponível" do portal
-- do representante) pra usar o status_pagamento de verdade em vez de valor_recebido
-- (que só existe pra Boleto Trademaster -- ver sql/vendas_status_pagamento.sql).
-- RODAR só depois de sql/vendas_status_pagamento.sql (a coluna precisa existir antes).

create or replace function saldo_em_aberto_clientes(p_nomes text[])
returns table(cliente text, saldo numeric)
language sql
security definer
set search_path = public
as $$
  select v.cliente, coalesce(sum(v.valor_venda), 0) as saldo
  from vendas v
  where v.cliente = any(p_nomes)
    and v.status_pagamento = 'em_aberto'
  group by v.cliente;
$$;

grant execute on function saldo_em_aberto_clientes(text[]) to authenticated;
