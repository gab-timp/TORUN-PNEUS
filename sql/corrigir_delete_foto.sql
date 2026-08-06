-- Reforça a política de exclusão de fotos no bucket produtos-fotos
-- (idempotente — seguro rodar de novo mesmo se já existir).
-- Rode no SQL Editor do Supabase.

drop policy if exists "editor remove foto produto" on storage.objects;
create policy "editor remove foto produto" on storage.objects for delete using (
  bucket_id = 'produtos-fotos' and current_user_role() = 'editor'
);

-- Confira se a política existe agora:
select policyname, cmd, roles from pg_policies
where tablename = 'objects' and schemaname = 'storage' and policyname = 'editor remove foto produto';

-- Confira também o SEU papel (precisa ser 'editor' pra conseguir apagar foto):
select current_user_role();
