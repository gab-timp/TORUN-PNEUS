-- Diagnóstico: por que o "Valor total de frete contratado" do Relatório de Frete
-- (Visão geral) não bate com o "Custo de frete" dos Indicadores Gerais do Dashboard?
--
-- São duas fontes independentes, sem vínculo automático entre elas:
--   * Relatório de Frete  -> tabela `fretes` (Cotação de Frete): soma o valor da
--     cotação marcada como "contratada", filtrando pela DATA DA COTAÇÃO.
--   * Dashboard           -> tabela `vendas` (Faturamento): soma `valor_frete` da
--     venda, filtrando pela DATA DA VENDA (mês selecionado).
-- Contratar uma cotação NÃO grava nada em vendas, e registrar uma venda NÃO cria
-- cotação -- cada lado é digitado à mão.
--
-- Só leitura, nada é alterado. Rode UMA consulta por vez (o SQL Editor só mostra
-- o resultado da última quando roda várias juntas).

-- CONSULTA A -- mês a mês, lado a lado (mostra se é diferença de data/mês):
with contratado as (
  select f.data::date as data,
         (select (c->>'valorFrete')::numeric
            from jsonb_array_elements(f.cotacoes) c
            where c->>'id' = f.contratada_id
            limit 1) as frete_contratado
  from fretes f
)
select to_char(m, 'YYYY-MM') as mes,
       coalesce((select sum(frete_contratado) from contratado where date_trunc('month', data) = m), 0) as relatorio_frete_contratado,
       coalesce((select sum(valor_frete) from vendas where date_trunc('month', data::date) = m), 0) as dashboard_custo_frete
from generate_series(
  date_trunc('month', least((select min(data::date) from fretes), (select min(data::date) from vendas))),
  date_trunc('month', current_date),
  interval '1 month'
) m
order by m desc;

-- CONSULTA B -- cada cotação contratada, cruzada com a venda de mesmo NF/pedido
-- (mostra quantas batem, quantas não têm venda, quantas têm valor diferente):
with contratado as (
  select f.id, f.referencia, f.data::date as data_cotacao,
         (select (c->>'valorFrete')::numeric
            from jsonb_array_elements(f.cotacoes) c
            where c->>'id' = f.contratada_id
            limit 1) as frete_contratado
  from fretes f
  where f.contratada_id is not null
)
select
  case
    when v.id is null then '1. Cotação contratada, mas sem venda com esse NF/pedido'
    when coalesce(v.valor_frete, 0) = c.frete_contratado then '2. Bate certinho com a venda'
    else '3. Tem venda, mas o valor do frete é diferente'
  end as situacao,
  count(*) as qtd,
  sum(c.frete_contratado) as soma_cotacao,
  sum(v.valor_frete) as soma_na_venda
from contratado c
left join vendas v on v.numero_nf_venda = c.referencia or v.numero_pedido = c.referencia
group by 1
order by 1;

-- CONSULTA C -- vendas que têm frete lançado mas NENHUMA cotação com esse NF/pedido
-- (frete que entra no Dashboard e nunca aparece no Relatório de Frete):
select count(*) as qtd_vendas, sum(v.valor_frete) as soma_frete_sem_cotacao
from vendas v
where coalesce(v.valor_frete, 0) > 0
  and not exists (
    select 1 from fretes f
    where f.referencia = v.numero_nf_venda or f.referencia = v.numero_pedido
  );
