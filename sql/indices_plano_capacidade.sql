-- Plano de capacidade, camada "fazer em breve" (artifact
-- claude.ai/code/artifact/cb5a7144-f0c7-41b0-8c68-57681ed74a8c): índices nas
-- colunas que o sistema realmente usa pra filtrar e ordenar. Hoje só existem
-- os índices automáticos de chave primária/unique -- com poucas centenas de
-- linhas isso não se sente, mas cresce em custo de corrigir quanto mais dado
-- acumular antes de mexer.
--
-- codigo em produtos NÃO entra aqui -- já é chave primária (produtos_pkey) E
-- unique (produtos_codigo_key), então já tem índice automático; confirmado
-- via sql/diagnostico_codigo_produto_duplicado.sql nesta mesma sessão.
--
-- Aditivo e seguro -- pode rodar a qualquer momento, não quebra nada que já
-- existe. Tabelas pequenas hoje, então o lock breve de criar o índice não é
-- perceptível (sem precisar de CONCURRENTLY, que não roda em transação).
-- Rode no SQL Editor do Supabase.

create index if not exists idx_movimentos_data on movimentos (data);
create index if not exists idx_vendas_data on vendas (data);
create index if not exists idx_entregas_data on entregas (data);
create index if not exists idx_entregas_etapa on entregas (etapa);
create index if not exists idx_clientes_nome on clientes (nome);

-- Confira depois (deve listar os 5 índices acima, além dos de PK/unique já existentes):
select indexname, tablename from pg_indexes
where schemaname = 'public' and indexname like 'idx_%'
order by tablename, indexname;
