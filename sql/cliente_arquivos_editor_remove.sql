-- Arquivos anexados ao cliente: qualquer EDITOR passa a poder remover (antes só o administrador).
-- Rode ANTES de publicar o app.js v277. Pode rodar de novo sem estragar nada.
-- Uma consulta por bloco no Supabase mostra só a última: rode o arquivo inteiro e confira a tabela final.

drop policy if exists "admin remove arquivo de cliente" on cliente_arquivos;
drop policy if exists "editor remove arquivo de cliente" on cliente_arquivos;
create policy "editor remove arquivo de cliente" on cliente_arquivos for delete
  using (current_user_role() = 'editor' or current_user_is_admin());

drop policy if exists "admin apaga arquivos de cliente" on storage.objects;
drop policy if exists "editor apaga arquivos de cliente" on storage.objects;
create policy "editor apaga arquivos de cliente" on storage.objects for delete using (
  bucket_id = 'clientes-arquivos' and (current_user_role() = 'editor' or current_user_is_admin())
);

-- Confira: deve vir 1 linha em cada (a antiga "admin ..." some e a "editor ..." aparece)
select tablename, policyname, cmd from pg_policies
where policyname in ('editor remove arquivo de cliente', 'editor apaga arquivos de cliente');
