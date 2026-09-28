-- Parcela por parcela na venda: cada parcela ganha seu próprio valor/vencimento/status,
-- em vez de UM status pra venda inteira (vendas_status_pagamento.sql). Vendas antigas
-- (sem parcelas_detalhe) continuam funcionando exatamente como hoje -- essa coluna é
-- opcional, só vendas NOVAS com 2+ parcelas passam a preenchê-la.

alter table vendas add column if not exists parcelas_detalhe jsonb;

-- saldo_em_aberto_clientes (usada pelo "Disponível" do Limite de Crédito e do portal do
-- representante) passa a somar só as parcelas em aberto quando a venda tem
-- parcelas_detalhe; sem isso, cai no comportamento de hoje (venda inteira conta se
-- status_pagamento = 'em_aberto'). Mesma segurança de antes (security definer, só
-- agregado, nunca linha a linha).
create or replace function saldo_em_aberto_clientes(p_nomes text[])
returns table(cliente text, saldo numeric)
language sql
security definer
set search_path = public
as $$
  select v.cliente, coalesce(sum(
    case
      when v.parcelas_detalhe is not null and jsonb_array_length(v.parcelas_detalhe) > 0
        then (select coalesce(sum((p->>'valor')::numeric), 0)
              from jsonb_array_elements(v.parcelas_detalhe) p
              where p->>'status' = 'em_aberto')
      when v.status_pagamento = 'em_aberto' then v.valor_venda
      else 0
    end
  ), 0) as saldo
  from vendas v
  where v.cliente = any(p_nomes)
  group by v.cliente;
$$;

grant execute on function saldo_em_aberto_clientes(text[]) to authenticated;

-- confira: a função deve continuar existindo com o novo corpo
select pg_get_functiondef('saldo_em_aberto_clientes'::regproc);
