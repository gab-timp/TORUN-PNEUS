-- Anexos no pré-cadastro de cliente (representantes)
-- Rode isso uma vez no SQL Editor do Supabase.

-- 1) Coluna de anexos (mesmo formato usado em entregas.anexos)
alter table clientes_pendentes add column if not exists anexos jsonb not null default '[]'::jsonb;

-- 2) Permitir que o representante atualize o PRÓPRIO pré-cadastro (só pra anexar arquivo).
--    O "with check" trava o status em 'pendente', então o representante não consegue se auto-aprovar por essa via.
drop policy if exists "representante atualiza proprio precadastro" on clientes_pendentes;
create policy "representante atualiza proprio precadastro" on clientes_pendentes for update
  using (created_by = auth.uid() and current_user_role() = 'representante')
  with check (created_by = auth.uid() and status = 'pendente');

-- 3) Bucket de armazenamento: criar manualmente no Supabase Dashboard
--    Storage > New bucket > nome "clientes-pendentes-anexos" > Public bucket = OFF (privado)

-- 4) Políticas do bucket: só o dono do pré-cadastro (quem criou) ou o editor podem ver/enviar arquivos.
--    Usa o primeiro segmento do caminho do arquivo (pasta) como o id do pré-cadastro.
drop policy if exists "dono ou editor ve anexos precadastro" on storage.objects;
create policy "dono ou editor ve anexos precadastro" on storage.objects for select using (
  bucket_id = 'clientes-pendentes-anexos' and (
    current_user_role() = 'editor'
    or exists (
      select 1 from clientes_pendentes cp
      where cp.id::text = (storage.foldername(name))[1] and cp.created_by = auth.uid()
    )
  )
);

drop policy if exists "dono ou editor sobe anexo precadastro" on storage.objects;
create policy "dono ou editor sobe anexo precadastro" on storage.objects for insert with check (
  bucket_id = 'clientes-pendentes-anexos' and (
    current_user_role() = 'editor'
    or exists (
      select 1 from clientes_pendentes cp
      where cp.id::text = (storage.foldername(name))[1] and cp.created_by = auth.uid()
    )
  )
);
