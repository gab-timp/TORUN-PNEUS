-- Perfil de usuário completo: avatar, telefone, tamanho da letra.
-- E-mail não precisa de coluna nova -- já vem de auth.users via currentUser.email
-- no client.
--
-- Aditivo -- não mexe em atualizar_meu_nome() nem em nenhuma policy existente.
-- atualizar_meu_nome continua em uso por pedido-representante.js, por isso a
-- nova função de salvar nome+telefone é uma RPC separada (atualizar_meu_perfil).
--
-- Rode no SQL Editor do Supabase.

-- 1) Colunas novas
alter table user_roles add column if not exists telefone text;
alter table user_roles add column if not exists avatar_path text;

alter table user_preferences add column if not exists tamanho_letra text;
alter table user_preferences drop constraint if exists user_preferences_tamanho_letra_check;
alter table user_preferences add constraint user_preferences_tamanho_letra_check
  check (tamanho_letra is null or tamanho_letra in ('pequeno', 'medio', 'grande'));

-- Nenhuma alteração de RLS necessária em user_preferences: a policy de self
-- select/insert/update por user_id (sql/user_preferences_tema_notif.sql) já
-- cobre a coluna nova automaticamente (RLS é por linha, não por coluna) --
-- mesma lógica que já vale hoje pra "tema".

-- 2) RPC nova pra nome + telefone (não mexe em atualizar_meu_nome, que
-- continua existindo e sendo usada por pedido-representante.js).
create or replace function atualizar_meu_perfil(novo_nome text, novo_telefone text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if novo_nome is null or length(trim(novo_nome)) = 0 then
    raise exception 'Nome não pode ficar em branco.';
  end if;
  update user_roles
    set nome = trim(novo_nome),
        telefone = nullif(trim(coalesce(novo_telefone, '')), '')
    where user_id = auth.uid();
end;
$$;
grant execute on function atualizar_meu_perfil(text, text) to authenticated;

-- 3) RPC pra avatar (salva na hora do upload, fora do fluxo do botão Salvar).
-- Valida que o path começa com o próprio uid -- evita que alguém aponte
-- avatar_path pra pasta de outro usuário via chamada direta do RPC.
create or replace function atualizar_meu_avatar(novo_avatar_path text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if novo_avatar_path is not null and novo_avatar_path not like (auth.uid()::text || '/%') then
    raise exception 'Caminho de avatar inválido.';
  end if;
  update user_roles set avatar_path = novo_avatar_path where user_id = auth.uid();
end;
$$;
grant execute on function atualizar_meu_avatar(text) to authenticated;

-- 4) Storage: bucket "avatares-usuarios".
-- Criar o bucket manualmente: Supabase Dashboard > Storage > New bucket >
-- nome "avatares-usuarios" > Public bucket = ON (mesma convenção do
-- "produtos-fotos", ver sql/catalogo_setup_agosto2026.sql).
--
-- Diferente de produtos-fotos (que restringe insert/delete por
-- current_user_role() = 'editor'), aqui QUALQUER usuário autenticado pode
-- gravar -- mas só dentro da própria pasta (uid como primeiro segmento do
-- path), via storage.foldername(). Select é aberto a qualquer autenticado
-- (avatares precisam ser visíveis a outros, ex.: lista de usuários do
-- admin, no futuro).
drop policy if exists "autenticado ve avatares" on storage.objects;
create policy "autenticado ve avatares" on storage.objects for select
  using (bucket_id = 'avatares-usuarios');

drop policy if exists "usuario sobe seu avatar" on storage.objects;
create policy "usuario sobe seu avatar" on storage.objects for insert
  with check (bucket_id = 'avatares-usuarios' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "usuario remove seu avatar" on storage.objects;
create policy "usuario remove seu avatar" on storage.objects for delete
  using (bucket_id = 'avatares-usuarios' and (storage.foldername(name))[1] = auth.uid()::text);

-- Confira depois de rodar:
select policyname, cmd from pg_policies where tablename = 'objects' and schemaname = 'storage' and policyname like '%avatar%';
select column_name from information_schema.columns where table_name = 'user_roles' and column_name in ('telefone','avatar_path');
select column_name from information_schema.columns where table_name = 'user_preferences' and column_name = 'tamanho_letra';
