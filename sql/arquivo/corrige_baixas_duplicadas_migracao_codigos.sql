-- Corrige efeito colateral da migração de códigos de produto
-- (sql/migracao_codigos_produtos_elevor.sql, rodada em 01/10/2026).
--
-- O que aconteceu: a migração fez UPDATE em entregas.itens. A trigger
-- sincronizar_estoque_pedido() dispara a cada mudança de itens e, pra pedido já
-- autorizado SEM nenhuma baixa vinculada (entrega_id), insere uma baixa nova
-- ("Baixa automática de estoque — pedido autorizado"). Os pedidos de antes de
-- 12/08/2026 (antes da automação existir) tiveram o estoque baixado na mão, então
-- não têm baixa vinculada -- a trigger baixou de novo. Resultado: 16 baixas
-- duplicadas datadas de 01/10/2026, estoque negativo em 6 códigos, e um aviso
-- falso de "Estoque baixo" no sino pra cada baixa inserida.
--
-- Como foram identificadas as 16 linhas (consulta de diagnóstico, só leitura):
-- tipo 'venda', obs de baixa automática, data 01/10/2026, created_by vazio (foi
-- criada pelo SQL Editor, não por usuário do app), pedidos FINALIZADOS de
-- 29/07 a 07/08. A soma por código bate exatamente com os saldos negativos:
--   200258 = 80, 200259 = 64, 200282 = 50, 200288 = 40, 200020 = 14, 200280 = 12.
--
-- Cada parte roda em transação própria, com cópia de segurança das linhas antes
-- de apagar (tabela com RLS ligado e sem policy = fechada pra API) e trava de
-- contagem: se o número de linhas não bater, aborta sem apagar nada.
-- Rode a PARTE 1 primeiro e confira, depois a PARTE 2.

-- ============================================================================
-- PARTE 1 -- apaga as 16 baixas duplicadas (conserta o estoque negativo)
-- ============================================================================
begin;

create table movimentos_backup_migracao_codigos as
select * from movimentos
where id in (
  'mov_18357244-5183-4f33-9df3-ef835110ce82',
  'mov_87462a92-1f76-4a2f-9742-17317ef1e5fa',
  'mov_e0eb1eff-051c-4469-bf26-9d6e0f559d38',
  'mov_f151f656-fc34-423e-9244-9426eee947ab',
  'mov_824767a7-d97e-4c9b-99ff-7aba09b0bf24',
  'mov_f4d66100-a1aa-443c-91e1-9675c5bb7141',
  'mov_60ec7801-ef7f-424c-8a48-2e0eed20b526',
  'mov_0808ccf9-7893-4401-b7cb-882566404948',
  'mov_53bf3483-9d8a-42ce-a4da-4ebf1c4dfcaf',
  'mov_927ea02f-fcab-44cf-82b3-7d82cd6ebb4c',
  'mov_d10abb17-f197-4cfd-b508-46408700ca22',
  'mov_6873ffc7-5dcb-4311-91a8-5b0438495588',
  'mov_3a613d3c-d91a-45e9-b4d9-7fe1dbc6cbf0',
  'mov_8538ac74-7e88-4208-befb-986519b04428',
  'mov_23f8c954-677c-48fd-84ce-d29e85319650',
  'mov_8d0b4784-fc3c-4f29-87cc-ce722bdb7115'
)
  and tipo = 'venda'
  and created_by is null
  and data = date '2026-10-01'
  and obs = 'Baixa automática de estoque — pedido autorizado';

alter table movimentos_backup_migracao_codigos enable row level security;

do $$
declare n int;
begin
  select count(*) into n from movimentos_backup_migracao_codigos;
  if n <> 16 then
    raise exception 'Abortando: esperava 16 baixas duplicadas, achei %', n;
  end if;
end $$;

delete from movimentos
where id in (select id from movimentos_backup_migracao_codigos);

commit;

-- ============================================================================
-- PARTE 2 -- apaga os avisos falsos de "Estoque baixo" gerados no mesmo momento
-- ============================================================================
-- Todos nasceram na mesma transação da migração, então têm o MESMO created_at
-- (now() é o início da transação): 2026-10-01 19:43:41.337417+00, 19 avisos
-- (16 das baixas duplicadas + 3 de movimentações que a trigger também mexeu --
-- ver PARTE 3). A trava exige exatamente 19; se não bater, aborta e nada é apagado.
begin;

create table notificacoes_backup_migracao_codigos as
select * from notificacoes
where tipo = 'estoque_baixo'
  and created_at = timestamptz '2026-10-01 19:43:41.337417+00';

alter table notificacoes_backup_migracao_codigos enable row level security;

do $$
declare n int;
begin
  select count(*) into n from notificacoes_backup_migracao_codigos;
  if n <> 19 then
    raise exception 'Abortando: esperava 19 avisos falsos de estoque baixo, achei %', n;
  end if;
end $$;

delete from notificacoes
where id in (select id from notificacoes_backup_migracao_codigos);

commit;

-- ============================================================================
-- PARTE 3 -- devolve processo e data às 3 baixas que a trigger recriou
-- ============================================================================
-- Pedidos 165, 166 e 167 (11 e 12/08) já tinham baixa vinculada. A trigger
-- comparou o processo da medida no pedido (vazio) com o da baixa antiga (preenchido),
-- achou diferente, criou uma baixa nova sem processo e com data 01/10 e apagou a
-- antiga. O total de cada medida não mudou, mas o saldo por processo ficou
-- torto: 200020 com (sem processo) = -38 e 3033-26 = +38; 200259 com
-- (sem processo) = -12 e 3092-26 = +12 (e o pedido 165 guarda processo 3092-26).
-- A data original foi apagada junto com a linha antiga -- usa a data da venda
-- (12/08/2026, igual nas 3 NFs) como estimativa.
begin;

create table movimentos_backup_recalculadas_migracao as
select * from movimentos
where id in (
  'mov_d5c15684-0f2d-40f5-a029-6179d63e1861',
  'mov_76ad0412-b714-4f12-847d-154b8a641ff6',
  'mov_bf580834-855b-4032-b2e7-cca69237cf1b'
)
  and created_by is null
  and data = date '2026-10-01'
  and processo is null;

alter table movimentos_backup_recalculadas_migracao enable row level security;

do $$
declare n int;
begin
  select count(*) into n from movimentos_backup_recalculadas_migracao;
  if n <> 3 then
    raise exception 'Abortando: esperava 3 baixas recalculadas, achei %', n;
  end if;
end $$;

-- 200259, 12 un., pedido 165 (NF 4368)
update movimentos
set processo = '3092-26', data = date '2026-08-12'
where id = 'mov_d5c15684-0f2d-40f5-a029-6179d63e1861';

-- 200020, 30 un. (pedido 166, NF 4370) e 8 un. (pedido 167, NF 4371)
update movimentos
set processo = '3033-26', data = date '2026-08-12'
where id in (
  'mov_76ad0412-b714-4f12-847d-154b8a641ff6',
  'mov_bf580834-855b-4032-b2e7-cca69237cf1b'
);

commit;
