-- Sub-representantes na venda (Torun > Faturamento).
--
-- A venda continua com UM representante principal nas colunas de sempre (vendedor, comissao_percentual,
-- comissao). Os sub-representantes ficam numa lista nova, vendas.sub_representantes (jsonb):
--   [ { "nome": "Ana Paula Reis", "pct": 0.5, "valor": 260.00 }, ... ]
-- "pct" é a % do sub sobre o valor TOTAL da venda; "valor" é o resultado em R$ (já calculado pelo site).
-- Venda sem sub-representante fica com a coluna vazia (null): nada muda nas vendas que já existem.
--
-- ORDEM: rode este SQL ANTES de publicar o site novo. Com o site novo no ar e sem a coluna, salvar uma
-- venda COM sub-representante dá erro ("column sub_representantes does not exist"); venda sem sub continua
-- salvando normalmente.

alter table vendas add column if not exists sub_representantes jsonb;

-- Garante que a coluna é sempre uma lista (ou vazia), nunca um objeto solto ou um texto
alter table vendas drop constraint if exists vendas_sub_representantes_lista;
alter table vendas add constraint vendas_sub_representantes_lista
  check (sub_representantes is null or jsonb_typeof(sub_representantes) = 'array');

-- Confira 1: a coluna existe e as vendas atuais estão com ela vazia
select count(*) as vendas, count(sub_representantes) as com_sub from vendas;

-- Confira 2 (PORTAL DO REPRESENTANTE): o representante só enxerga as vendas liberadas pela política de leitura
-- da tabela vendas. Essa política não está nos arquivos do projeto. Rode a consulta abaixo e me mande o resultado:
-- se ela libera a venda só quando vendas.vendedor bate com o nome da pessoa, o sub-representante vai ver as
-- vendas dele só depois de ajustarmos essa política (o site já está pronto pra mostrar a parte dele).
select policyname, cmd, permissive, qual
from pg_policies
where tablename = 'vendas'
order by policyname;
