-- Diagnóstico (só leitura): de onde vem o "OUTRA" no card "Pneus Mais Vendidos
-- (por Medida)" do Dashboard.
--
-- O card lê as movimentações de venda, acha o produto pelo código e extrai só a
-- "medida base" (ex.: "295/80R22.5") do início do texto da medida cadastrada,
-- com esta regra: começa com 3 dígitos / 2 dígitos R 1 ou 2 dígitos (com
-- opcional ",X" ou ".X" decimal) -- ex. "295/80R22.5". Duas situações caem em
-- "OUTRA":
--   1) o texto da medida do produto não começa nesse formato (pneu de carga/
--      agrícola/OTR costuma usar outra notação, tipo "11R22.5" sem o "/80",
--      ou "23.5-25"), ou
--   2) a venda referencia um código de produto que não existe mais em
--      "produtos" (produto foi apagado depois de já ter vendido).

-- 1) Produtos cujo texto de "medida" NÃO bate com o formato esperado -- e
--    quantas vendas (linhas de movimento tipo venda) cada um já teve. É bem
--    provável que a maior parte do "OUTRA" venha daqui.
select p.codigo, p.medida,
       count(m.id) filter (where m.tipo = 'venda') as qtd_vendas,
       coalesce(sum(m.quantidade) filter (where m.tipo = 'venda'), 0) as pneus_vendidos
from produtos p
left join movimentos m on m.codigo = p.codigo
where p.medida !~* '^\s*[0-9]{3}/[0-9]{2}\s?r\s?[0-9]{1,2}([.,][0-9])?'
group by p.codigo, p.medida
order by pneus_vendidos desc;

-- 2) Vendas que referenciam um código de produto que não existe mais (produto
--    foi excluído do cadastro depois de já ter movimentação de venda).
select m.codigo, count(*) as qtd_movimentos, sum(m.quantidade) as pneus_vendidos
from movimentos m
where m.tipo = 'venda'
  and not exists (select 1 from produtos p where p.codigo = m.codigo)
group by m.codigo
order by pneus_vendidos desc;
