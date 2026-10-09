-- SEM VENDA: vendedor interno e representante na Reserva.
--
-- 1) Tabela sv_vendedores: lista de vendedores internos, cadastrada pelo administrador
--    (Administração > Vendedores internos). Todo mundo com acesso ao Sem Venda lê; só admin escreve.
-- 2) sv_reservas ganha vendedor_interno e representante. Representante vazio = "Sem representante".
--    O campo antigo `responsavel` fica na tabela (sem uso novo): deixa de ser obrigatório, e o nome
--    que já estava nele é copiado para vendedor_interno nas reservas que existem hoje.
--
-- Aditivo: dá pra rodar antes do deploy, e quem ainda estiver com a versão antiga da tela continua
-- reservando normalmente (a tela nova mostra o responsável antigo quando vendedor_interno vier vazio).

create table if not exists sv_vendedores (
  id text primary key,
  nome text not null check (length(btrim(nome)) > 0),
  created_by uuid,
  created_at timestamptz not null default now()
);
alter table sv_vendedores enable row level security;

-- o mesmo nome não entra duas vezes (sem diferenciar maiúscula nem espaço nas pontas)
create unique index if not exists sv_vendedores_nome_idx on sv_vendedores (lower(btrim(nome)));

drop policy if exists "sem venda le" on sv_vendedores;
create policy "sem venda le" on sv_vendedores for select
  using (current_user_pode_acessar_sem_venda());

drop policy if exists "admin insere" on sv_vendedores;
create policy "admin insere" on sv_vendedores for insert
  with check (current_user_is_admin());

drop policy if exists "admin atualiza" on sv_vendedores;
create policy "admin atualiza" on sv_vendedores for update
  using (current_user_is_admin())
  with check (current_user_is_admin());

drop policy if exists "admin exclui" on sv_vendedores;
create policy "admin exclui" on sv_vendedores for delete
  using (current_user_is_admin());

alter table sv_reservas add column if not exists vendedor_interno text;
alter table sv_reservas add column if not exists representante text;
alter table sv_reservas alter column responsavel drop not null;

update sv_reservas
set vendedor_interno = responsavel
where vendedor_interno is null and responsavel is not null;

notify pgrst, 'reload schema';

-- Confere (deve listar 4 políticas de sv_vendedores, as 2 colunas novas e 0 reservas sem vendedor):
select 'politicas' as item, count(*)::text as valor from pg_policies where tablename = 'sv_vendedores'
union all
select 'colunas novas em sv_reservas', count(*)::text
  from information_schema.columns
  where table_name = 'sv_reservas' and column_name in ('vendedor_interno', 'representante')
union all
select 'reservas sem vendedor_interno', count(*)::text from sv_reservas where vendedor_interno is null;
