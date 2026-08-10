-- produtos_precos ganha uma 3ª dimensão: tipo_cliente (REVENDA / FROTA / CONSUMO /
-- CONSUMO_DIFAL), além de região e condição de pagamento. "SC REVENDA" era um
-- remendo: mesma geografia de SC/RS, preço de revenda. Vira tipo_cliente='REVENDA'
-- com regiao='SC/RS'.
--
-- ⚠️ IMPORTANTE — JANELA DE RISCO: depois de rodar este script, a região "SC REVENDA"
-- deixa de existir (vira SC/RS + tipo REVENDA) e a trava de duplicidade da tabela
-- muda de formato. O código ATUAL do site (ainda olhando só região+condição) pode
-- mostrar o preço errado pra SC/RS nesse intervalo, e "Editar preços" no Catálogo
-- passa a dar erro. Rode isso imediatamente antes de publicar o app.js /
-- pedido-representante.js atualizados — de preferência fora do horário em que
-- representantes estão com o sistema aberto.
--
-- Rode no SQL Editor do Supabase.

alter table produtos_precos add column if not exists tipo_cliente text;

-- Tira a trava de duplicidade ANTIGA primeiro (codigo, regiao, condicao_pagamento) --
-- senão o UPDATE abaixo (que muda "SC REVENDA" pra "SC/RS") esbarra nela, já que
-- nesse momento ainda não existe o tipo_cliente pra diferenciar as duas linhas.
-- O nome abaixo é o que o Postgres gera automaticamente pra um "unique(...)"
-- declarado inline no create table original (catalogo_setup_agosto2026.sql).
alter table produtos_precos drop constraint if exists produtos_precos_codigo_regiao_condicao_pagamento_key;

update produtos_precos set regiao = 'SC/RS', tipo_cliente = 'REVENDA' where regiao = 'SC REVENDA';
update produtos_precos set tipo_cliente = 'CONSUMO' where tipo_cliente is null;

alter table produtos_precos alter column tipo_cliente set not null;
alter table produtos_precos drop constraint if exists produtos_precos_tipo_cliente_check;
alter table produtos_precos add constraint produtos_precos_tipo_cliente_check check (
  tipo_cliente in ('REVENDA', 'FROTA', 'CONSUMO', 'CONSUMO_DIFAL')
);

-- Agora sim, a trava nova com as 4 colunas.
alter table produtos_precos drop constraint if exists produtos_precos_codigo_regiao_tipo_condicao_key;
alter table produtos_precos add constraint produtos_precos_codigo_regiao_tipo_condicao_key
  unique (codigo, regiao, tipo_cliente, condicao_pagamento);

-- Confira se a trava de duplicidade ficou certa (deve aparecer só a nova, 4 colunas):
select conname, pg_get_constraintdef(oid) from pg_constraint
  where conrelid = 'produtos_precos'::regclass and contype = 'u';

-- Confira a distribuição depois da migração (deve bater com 466 linhas no total,
-- 91 delas agora em SC/RS + REVENDA):
select regiao, tipo_cliente, count(*) from produtos_precos group by regiao, tipo_cliente order by regiao, tipo_cliente;
