-- Suporte para: (1) tela "Administração" (admin edita outros usuários sem SQL manual),
-- (2) auto-edição do próprio nome de exibição pelas configurações pessoais.
--
-- Hoje o site NUNCA escreve na tabela user_roles, só lê — por isso essas permissões
-- não existiam ainda. current_user_role() já existe no projeto (usado em várias
-- policies de outras tabelas), mas nunca checa is_admin. Criamos um helper irmão,
-- mesma convenção (security definer, pra não recursar RLS ao ser usado numa
-- policy da própria user_roles).
--
-- Rode no SQL Editor do Supabase.

create or replace function current_user_is_admin()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select coalesce((select is_admin from user_roles where user_id = auth.uid()), false);
$$;

-- Coluna de e-mail, só pra exibição no painel admin (fica dessincronizada se o
-- e-mail mudar no Supabase Auth depois — aceitável, é só display, não usada em
-- nenhuma lógica de permissão).
alter table user_roles add column if not exists email text;

update user_roles set email = u.email
from auth.users u
where u.id = user_roles.user_id and user_roles.email is null;

alter table user_roles enable row level security;

-- Leitura: cada um lê a própria linha (mantém o login de app.js/pedido-representante.js
-- funcionando exatamente como hoje).
drop policy if exists "usuario le propria linha" on user_roles;
create policy "usuario le propria linha" on user_roles for select
  using (user_id = auth.uid());

-- Leitura: admin lê todas as linhas (tabela de usuários do painel Administração).
drop policy if exists "admin le todas as linhas" on user_roles;
create policy "admin le todas as linhas" on user_roles for select
  using (current_user_is_admin());

-- Escrita: só admin, e só via este mecanismo (sem policy de update pra usuário
-- comum — a auto-edição do nome passa exclusivamente pela função abaixo, nunca
-- por um UPDATE direto na tabela).
drop policy if exists "admin atualiza qualquer linha" on user_roles;
create policy "admin atualiza qualquer linha" on user_roles for update
  using (current_user_is_admin())
  with check (current_user_is_admin());

-- RPC pra auto-edição do nome: roda com privilégio de dono, então ignora as
-- policies acima e só permite mexer na própria linha e só na coluna nome —
-- assim um usuário comum não consegue se promover a admin nem mudar seu papel.
create or replace function atualizar_meu_nome(novo_nome text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if novo_nome is null or length(trim(novo_nome)) = 0 then
    raise exception 'Nome não pode ficar em branco.';
  end if;
  update user_roles set nome = trim(novo_nome) where user_id = auth.uid();
end;
$$;
grant execute on function atualizar_meu_nome(text) to authenticated;
grant execute on function current_user_is_admin() to authenticated;

-- Confira depois de rodar:
select policyname, cmd from pg_policies where tablename = 'user_roles';
select user_id, email, nome, role, is_admin from user_roles limit 20;
