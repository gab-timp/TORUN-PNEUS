-- Continuação de sql/relatorio_frete_divergencias.sql. Aquele relatório fechou
-- junho e setembro no centavo, mas deixou uma diferença líquida de R$ 1.992,95
-- (Dashboard maior) em maio (+1.743,13), julho (+422,82) e agosto (-173,00).
--
-- O Dashboard conta o frete pelo mês da VENDA; o Relatório de Frete conta pelo mês
-- da COTAÇÃO. Se a cotação e a venda caem em meses diferentes, o valor aparece num
-- mês em um lado e em outro mês no outro. Esta consulta procura duas causas:
--   1. Cotação e venda ligadas, mas de meses diferentes (inclui cotação de antes de
--      maio ligada a venda de maio em diante, que o relatório anterior escondia).
--   2. Venda ligada a mais de uma cotação contratada (o relatório soma as duas
--      cotações, o Dashboard conta a venda uma vez só).
--
-- Mesma regra de ligação do relatório anterior (NF com 3+ dígitos dentro da
-- referência; pedido com 3+ dígitos e janela de datas). Só leitura.

with params as (
  select date '2026-05-01' as desde
),
cot as (
  select f.id, f.referencia, f.data::date as data_cotacao,
         (select (c->>'valorFrete')::numeric from jsonb_array_elements(f.cotacoes) c
            where c->>'id' = f.contratada_id limit 1) as frete_cotacao,
         array(select ltrim(m.g[1], '0')
                 from regexp_matches(f.referencia, '\d+', 'g') as m(g)) as numeros
  from fretes f
  where f.contratada_id is not null
),
ligacao as (
  select c.id as cot_id, v.id as venda_id
  from cot c
  join vendas v on
       ( length(regexp_replace(coalesce(v.numero_nf_venda::text, ''), '\D', '', 'g')) >= 3
         and ltrim(regexp_replace(coalesce(v.numero_nf_venda::text, ''), '\D', '', 'g'), '0') = any (c.numeros) )
    or ( length(ltrim(regexp_replace(coalesce(v.numero_pedido::text, ''), '\D', '', 'g'), '0')) >= 3
         and ltrim(regexp_replace(coalesce(v.numero_pedido::text, ''), '\D', '', 'g'), '0') = any (c.numeros)
         and v.data::date between c.data_cotacao - 30 and c.data_cotacao + 90 )
),
pares as (
  select c.referencia, c.data_cotacao, c.frete_cotacao,
         v.id as venda_id, v.numero_nf_venda::text as nf_venda, v.data::date as data_venda,
         v.valor_frete::numeric as frete_venda, v.cliente,
         count(*) over (partition by v.id) as qtd_cotacoes_da_venda
  from cot c
  join ligacao l on l.cot_id = c.id
  join vendas v on v.id = l.venda_id
)
select * from (
  select 'Mês da cotação diferente do mês da venda' as motivo,
         p.referencia, p.data_cotacao, p.frete_cotacao as valor_cotacao,
         p.nf_venda, p.data_venda, p.frete_venda as valor_venda, p.cliente as detalhe
  from pares p
  where to_char(p.data_cotacao, 'YYYY-MM') <> to_char(p.data_venda, 'YYYY-MM')
    and coalesce(p.frete_venda, 0) > 0
    and (p.data_cotacao >= (select desde from params) or p.data_venda >= (select desde from params))
  union all
  select 'Venda ligada a mais de uma cotação contratada',
         p.referencia, p.data_cotacao, p.frete_cotacao,
         p.nf_venda, p.data_venda, p.frete_venda, p.cliente
  from pares p
  where p.qtd_cotacoes_da_venda >= 2
    and coalesce(p.frete_venda, 0) > 0
    and (p.data_cotacao >= (select desde from params) or p.data_venda >= (select desde from params))
) t
order by motivo, data_venda, referencia;
