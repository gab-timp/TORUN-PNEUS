-- SEM VENDA: tipo de transporte e transportadora na Reserva.
--
-- 1) Tabela sv_transportadoras: lista de transportadoras, cadastrada pelo administrador
--    (Administração > Transportadoras). Todo mundo com acesso ao Sem Venda lê; só admin escreve.
--    Começa VAZIA: até o admin cadastrar, a Reserva avisa e não deixa reservar (igual aos vendedores
--    internos e às condições de pagamento).
-- 2) sv_reservas ganha tipo_transporte ('NOSSO' = frete nosso, 'CLIENTE' = frete do cliente) e
--    transportadora (texto, o nome no dia): excluir uma transportadora da lista não muda as reservas
--    que já foram feitas com ela. Reservas antigas ficam com as duas colunas vazias e a tela pede os
--    dois na hora de confirmar a venda.
--
-- Aditivo: dá pra rodar antes do deploy. Rode ANTES de abrir o preview novo: a tela nova grava
-- tipo_transporte e transportadora ao reservar e falha sem as colunas.

create table if not exists sv_transportadoras (
  id text primary key,
  nome text not null check (length(btrim(nome)) > 0),
  created_by uuid,
  created_at timestamptz not null default now()
);
alter table sv_transportadoras enable row level security;

-- o mesmo nome não entra duas vezes (sem diferenciar maiúscula nem espaço nas pontas)
create unique index if not exists sv_transportadoras_nome_idx on sv_transportadoras (lower(btrim(nome)));

drop policy if exists "sem venda le" on sv_transportadoras;
create policy "sem venda le" on sv_transportadoras for select
  using (current_user_pode_acessar_sem_venda());

drop policy if exists "admin insere" on sv_transportadoras;
create policy "admin insere" on sv_transportadoras for insert
  with check (current_user_is_admin());

drop policy if exists "admin atualiza" on sv_transportadoras;
create policy "admin atualiza" on sv_transportadoras for update
  using (current_user_is_admin())
  with check (current_user_is_admin());

drop policy if exists "admin exclui" on sv_transportadoras;
create policy "admin exclui" on sv_transportadoras for delete
  using (current_user_is_admin());

alter table sv_reservas add column if not exists tipo_transporte text;
alter table sv_reservas add column if not exists transportadora text;

-- só os dois valores do tipo (vazio vale para as reservas antigas)
alter table sv_reservas drop constraint if exists sv_reservas_tipo_transporte_check;
alter table sv_reservas add constraint sv_reservas_tipo_transporte_check
  check (tipo_transporte is null or tipo_transporte in ('NOSSO', 'CLIENTE'));

notify pgrst, 'reload schema';

-- Confere (deve listar 4 políticas de sv_transportadoras, 2 colunas novas em sv_reservas, a regra do tipo e 0 transportadoras):
select 'politicas' as item, count(*)::text as valor from pg_policies where tablename = 'sv_transportadoras'
union all
select 'colunas novas em sv_reservas', count(*)::text
  from information_schema.columns
  where table_name = 'sv_reservas' and column_name in ('tipo_transporte', 'transportadora')
union all
select 'regra do tipo de transporte', count(*)::text
  from pg_constraint where conname = 'sv_reservas_tipo_transporte_check'
union all
select 'transportadoras cadastradas', count(*)::text from sv_transportadoras;
