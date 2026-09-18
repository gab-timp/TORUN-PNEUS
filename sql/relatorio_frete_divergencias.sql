-- Relatório de divergências de frete: lista linha a linha o que não bate entre o
-- Relatório de Frete (cotações contratadas, tabela `fretes`) e o "Custo de frete"
-- do Dashboard (frete lançado nas vendas, `vendas.valor_frete`).
-- Ver sql/diagnostico_frete_cotacao_vs_vendas.sql pro contexto.
--
-- A cotação é ligada à venda pelo NF que aparece DENTRO da referência da cotação
-- (ex: "4-4631" -> 4631, "4309-71" -> 4309, "3599/3601/3602" -> 3 NFs), porque a
-- referência é texto livre e a venda guarda NF e pedido em campos separados.
--   * NF: precisa ter 3+ dígitos e bater com vendas.numero_nf_venda (sem zeros à esquerda)
--   * Pedido: precisa ter 3+ dígitos e bater com vendas.numero_pedido, e a venda tem que
--     estar entre 30 dias antes e 90 dias depois da cotação. (Antes aceitava pedido curto:
--     "2-4547" casava o pedido "2" com outras vendas e aparecia como divergência falsa.)
-- Referência com vários NFs soma o frete de todas as vendas encontradas antes de comparar.
--
-- Só leitura, nada é alterado. Troque a data em `params` pra olhar outro período
-- (antes de 2026-05 não havia cotação registrada).

with params as (
  select date '2026-05-01' as desde
),
cot as (
  select f.id, f.referencia, f.data::date as data_cotacao,
         (select c->>'transportadora' from jsonb_array_elements(f.cotacoes) c
            where c->>'id' = f.contratada_id limit 1) as transportadora,
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
agg as (
  select c.id,
         count(v.id) as qtd_vendas,
         sum(v.valor_frete::numeric) as frete_vendas,
         string_agg(coalesce(v.numero_nf_venda::text, v.numero_pedido::text, '?')
                    || ' (' || to_char(v.data::date, 'DD/MM') || ')', ', ') as vendas_achadas
  from cot c
  left join ligacao l on l.cot_id = c.id
  left join vendas v on v.id = l.venda_id
  group by c.id
)
select * from (
  select 'Cotação' as origem, c.referencia, c.data_cotacao as data, c.transportadora,
         c.frete_cotacao as valor_cotacao, a.frete_vendas as valor_venda,
         coalesce(a.frete_vendas, 0) - c.frete_cotacao as diferenca,
         a.vendas_achadas as detalhe,
         case when a.qtd_vendas = 0 then 'Cotação contratada sem venda encontrada'
              else 'Frete da venda diferente do da cotação' end as situacao
  from cot c
  join agg a on a.id = c.id
  where c.data_cotacao >= (select desde from params)
    and (a.qtd_vendas = 0 or round(coalesce(a.frete_vendas, 0), 2) <> round(c.frete_cotacao, 2))
  union all
  select 'Venda', coalesce(v.numero_nf_venda::text, v.numero_pedido::text), v.data::date, v.transportadora,
         null::numeric, v.valor_frete::numeric, v.valor_frete::numeric, v.cliente,
         'Venda com frete lançado, sem cotação contratada'
  from vendas v
  where v.data::date >= (select desde from params)
    and coalesce(v.valor_frete, 0) > 0
    and not exists (select 1 from ligacao l where l.venda_id = v.id)
) t
order by situacao, data desc;
