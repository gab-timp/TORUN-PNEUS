-- O portal do representante calculava "saldo em aberto" (base do "Disponível" de
-- limite de crédito) só com as vendas do próprio vendedor (RLS de "vendas" só deixa
-- ele ler as próprias linhas) -- mas limite_credito é da empresa inteira. Se o
-- representante de um cliente mudar ao longo do tempo, vendas antigas do vendedor
-- anterior ficavam fora da conta, inflando o "Disponível" mostrado.
--
-- Esta função soma o saldo em aberto de TODAS as vendas do cliente (qualquer
-- vendedor), mas devolve só o número agregado por cliente -- nunca linha de venda,
-- nem vendedor, nem comissão -- então não expõe dado de venda de outro representante.

create or replace function saldo_em_aberto_clientes(p_nomes text[])
returns table(cliente text, saldo numeric)
language sql
security definer
set search_path = public
as $$
  select v.cliente, coalesce(sum(greatest(0, v.valor_venda - coalesce(v.valor_recebido, 0))), 0) as saldo
  from vendas v
  where v.cliente = any(p_nomes)
  group by v.cliente;
$$;

grant execute on function saldo_em_aberto_clientes(text[]) to authenticated;
