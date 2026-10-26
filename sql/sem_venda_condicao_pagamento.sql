-- SEM VENDA: condição de pagamento na Reserva.
--
-- 1) Tabela sv_condicoes_pagamento: lista de condições (ex: "30/60/90 dias"), cadastrada pelo administrador
--    (Administração > Condições de pagamento). Todo mundo com acesso ao Sem Venda lê; só admin escreve.
--    Começa VAZIA: até o admin cadastrar, a Reserva avisa e não deixa reservar (igual aos vendedores internos).
-- 2) sv_reservas ganha condicao_pagamento (texto, o nome da condição no dia): excluir uma condição da lista
--    não muda as reservas que já foram feitas com ela. Reservas antigas ficam com a coluna vazia e a tela
--    pede a condição na hora de confirmar a venda.
--
-- Aditivo: dá pra rodar antes do deploy. Rode ANTES de abrir o preview novo: a tela nova grava
-- condicao_pagamento ao reservar e falha sem a coluna.

create table if not exists sv_condicoes_pagamento (
  id text primary key,
  nome text not null check (length(btrim(nome)) > 0),
  created_by uuid,
  created_at timestamptz not null default now()
);
alter table sv_condicoes_pagamento enable row level security;

-- o mesmo nome não entra duas vezes (sem diferenciar maiúscula nem espaço nas pontas)
create unique index if not exists sv_condicoes_pagamento_nome_idx on sv_condicoes_pagamento (lower(btrim(nome)));

drop policy if exists "sem venda le" on sv_condicoes_pagamento;
create policy "sem venda le" on sv_condicoes_pagamento for select
  using (current_user_pode_acessar_sem_venda());

drop policy if exists "admin insere" on sv_condicoes_pagamento;
create policy "admin insere" on sv_condicoes_pagamento for insert
  with check (current_user_is_admin());

drop policy if exists "admin atualiza" on sv_condicoes_pagamento;
create policy "admin atualiza" on sv_condicoes_pagamento for update
  using (current_user_is_admin())
  with check (current_user_is_admin());

drop policy if exists "admin exclui" on sv_condicoes_pagamento;
create policy "admin exclui" on sv_condicoes_pagamento for delete
  using (current_user_is_admin());

alter table sv_reservas add column if not exists condicao_pagamento text;

notify pgrst, 'reload schema';

-- Confere (deve listar 4 políticas de sv_condicoes_pagamento, 1 coluna nova em sv_reservas e 0 condições cadastradas):
select 'politicas' as item, count(*)::text as valor from pg_policies where tablename = 'sv_condicoes_pagamento'
union all
select 'coluna nova em sv_reservas', count(*)::text
  from information_schema.columns
  where table_name = 'sv_reservas' and column_name = 'condicao_pagamento'
union all
select 'condicoes cadastradas', count(*)::text from sv_condicoes_pagamento;
