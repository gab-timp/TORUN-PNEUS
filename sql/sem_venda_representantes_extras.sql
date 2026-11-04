-- SEM VENDA: representantes sem login, para a lista de "Representante" da Reserva.
--
-- Hoje a lista da Reserva vem das pessoas com login de representante. Esta tabela guarda os representantes que não têm login:
-- eles aparecem na Reserva junto com os que já existem. O cadastro é feito em Administração > Representantes do Sem Venda
-- (mesmo molde de Vendedores internos): todo mundo com acesso ao Sem Venda lê; só o administrador escreve.
--
-- Aditivo: nada existente muda. Rode ANTES de publicar o site (sem a tabela a Reserva só mostra os representantes de antes).
-- Rode o script INTEIRO no SQL Editor do Supabase.

create table if not exists sv_representantes (
  id text primary key,
  nome text not null check (length(btrim(nome)) > 0),
  created_by uuid,
  created_at timestamptz not null default now()
);
alter table sv_representantes enable row level security;

create unique index if not exists sv_representantes_nome_idx on sv_representantes (lower(btrim(nome)));

drop policy if exists "sem venda le" on sv_representantes;
create policy "sem venda le" on sv_representantes for select
  using (current_user_pode_acessar_sem_venda());

drop policy if exists "admin insere" on sv_representantes;
create policy "admin insere" on sv_representantes for insert
  with check (current_user_is_admin());

drop policy if exists "admin atualiza" on sv_representantes;
create policy "admin atualiza" on sv_representantes for update
  using (current_user_is_admin())
  with check (current_user_is_admin());

drop policy if exists "admin exclui" on sv_representantes;
create policy "admin exclui" on sv_representantes for delete
  using (current_user_is_admin());

-- os cinco representantes de hoje (se já existirem, não duplica)
insert into sv_representantes (id, nome) values
  ('svrep_andre_cabral', 'André Cabral'),
  ('svrep_tiago_e_joao', 'Tiago e João'),
  ('svrep_fabio', 'Fábio'),
  ('svrep_agnaldo', 'Agnaldo'),
  ('svrep_lourival', 'Lourival')
on conflict do nothing;

notify pgrst, 'reload schema';

-- confere: 4 políticas e os 5 nomes
select
  (select count(*) from pg_policies where tablename = 'sv_representantes') as politicas,
  (select string_agg(nome, ', ' order by nome) from sv_representantes) as representantes;
