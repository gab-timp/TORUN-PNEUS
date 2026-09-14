-- Diagnóstico (só leitura): achado por acidente investigando o "OUTRA" no
-- Dashboard -- parece que "produtos.codigo" NÃO é único. Vários registros com
-- o MESMO código, mas medida (produto) diferente. Isso é sério porque todo o
-- sistema usa "codigo" pra identificar o produto -- estoque, preço, catálogo,
-- pedido, tudo. Se o código colidiu, saldo/movimentação de produtos
-- diferentes pode estar sendo tratado como se fosse um produto só.

-- 1) Quantas linhas "produtos" existem por código -- só os que aparecem mais
--    de uma vez. Se vier vazio, "codigo" é único de verdade e o achado da
--    pergunta anterior foi coincidência de leitura -- ótima notícia.
select codigo, count(*) as qtd_linhas
from produtos
group by codigo
having count(*) > 1
order by qtd_linhas desc;

-- 2) Detalhe de cada linha duplicada, com criado_em (se existir a coluna) pra
--    entender a ordem em que foram cadastradas, e quantas vendas/movimentos
--    cada "codigo" (não cada linha -- o banco não distingue) já acumulou.
select p.codigo, p.medida, p.created_at,
       (select count(*) from movimentos m where m.codigo = p.codigo) as total_movimentos_do_codigo
from produtos p
where p.codigo in (
  select codigo from produtos group by codigo having count(*) > 1
)
order by p.codigo, p.created_at;

-- 3) Existe uma constraint de chave única/primária em "codigo" hoje? Se
--    "conname" vier vazio, confirma que nunca existiu -- explica como essas
--    duplicatas entraram sem erro nenhum.
select conname, contype, pg_get_constraintdef(oid) as definicao
from pg_constraint
where conrelid = 'produtos'::regclass
  and pg_get_constraintdef(oid) ilike '%codigo%';
