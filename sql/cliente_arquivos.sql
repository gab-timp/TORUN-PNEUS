-- Arquivos anexados a cada cliente (botão "Arquivos" na tela Clientes).
--
-- Quem pode o quê:
--   ver e baixar ........ qualquer usuário do escritório (editor ou somente leitura); representante não
--   anexar .............. editor
--   remover ............. só administrador
--   mudar de cliente .... editor (é o que a mesclagem de clientes faz com os arquivos do duplicado)
--
-- PASSO MANUAL ANTES de rodar este SQL: criar o bucket no Supabase Dashboard
--   Storage > New bucket > nome "clientes-arquivos" > Public bucket = OFF (privado)
-- (o bucket do romaneio já foi esquecido uma vez; a consulta do final mostra se ele existe).
--
-- Rode no SQL Editor do Supabase.

-- 1) Tabela: uma linha por arquivo. cliente acompanha o renomear do cliente (on update cascade) e
--    NÃO apaga em cascata: excluir um cliente que ainda tem arquivo dá erro, e o sistema avisa antes.
create table if not exists cliente_arquivos (
  id uuid primary key default gen_random_uuid(),
  cliente text not null references clientes(nome) on update cascade,
  nome text not null,                      -- nome original do arquivo, como aparece na lista
  path text not null unique,               -- caminho dentro do bucket clientes-arquivos
  tamanho bigint,
  tipo text,                               -- tipo do arquivo (mime), quando o navegador informa
  criado_por text,                         -- e-mail de quem anexou
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);
create index if not exists idx_cliente_arquivos_cliente on cliente_arquivos (cliente, created_at desc);

-- 2) Só o cliente pode mudar numa linha existente (mesclagem de clientes). Nome, caminho, tamanho e
--    autoria são imutáveis: um editor não consegue reescrever o histórico de quem anexou o quê.
create or replace function cliente_arquivos_so_cliente_muda()
returns trigger
language plpgsql
as $$
begin
  if new.id is distinct from old.id
     or new.nome is distinct from old.nome
     or new.path is distinct from old.path
     or new.tamanho is distinct from old.tamanho
     or new.tipo is distinct from old.tipo
     or new.criado_por is distinct from old.criado_por
     or new.created_by is distinct from old.created_by
     or new.created_at is distinct from old.created_at then
    raise exception 'Em cliente_arquivos só a coluna cliente pode ser alterada.';
  end if;
  return new;
end;
$$;
drop trigger if exists trg_cliente_arquivos_so_cliente_muda on cliente_arquivos;
create trigger trg_cliente_arquivos_so_cliente_muda
  before update on cliente_arquivos
  for each row execute function cliente_arquivos_so_cliente_muda();

-- 3) Permissões da tabela.
alter table cliente_arquivos enable row level security;

drop policy if exists "escritorio le arquivos de cliente" on cliente_arquivos;
create policy "escritorio le arquivos de cliente" on cliente_arquivos for select
  using (coalesce(current_user_role(), '') <> 'representante');

drop policy if exists "editor anexa arquivo de cliente" on cliente_arquivos;
create policy "editor anexa arquivo de cliente" on cliente_arquivos for insert
  with check (current_user_role() = 'editor' and created_by = auth.uid());

drop policy if exists "editor muda cliente do arquivo" on cliente_arquivos;
create policy "editor muda cliente do arquivo" on cliente_arquivos for update
  using (current_user_role() = 'editor')
  with check (current_user_role() = 'editor');

drop policy if exists "admin remove arquivo de cliente" on cliente_arquivos;
create policy "admin remove arquivo de cliente" on cliente_arquivos for delete
  using (current_user_is_admin());

-- 4) Permissões do bucket (mesmo critério da tabela).
drop policy if exists "escritorio ve arquivos de cliente" on storage.objects;
create policy "escritorio ve arquivos de cliente" on storage.objects for select using (
  bucket_id = 'clientes-arquivos' and coalesce(current_user_role(), '') <> 'representante'
);

drop policy if exists "editor sobe arquivos de cliente" on storage.objects;
create policy "editor sobe arquivos de cliente" on storage.objects for insert with check (
  bucket_id = 'clientes-arquivos' and current_user_role() = 'editor'
);

drop policy if exists "admin apaga arquivos de cliente" on storage.objects;
create policy "admin apaga arquivos de cliente" on storage.objects for delete using (
  bucket_id = 'clientes-arquivos' and current_user_is_admin()
);

-- Confira (deve vir 1 linha: bucket_existe = 1, politicas_tabela = 4, politicas_storage = 3):
select
  (select count(*) from storage.buckets where id = 'clientes-arquivos') as bucket_existe,
  (select count(*) from pg_policies where tablename = 'cliente_arquivos') as politicas_tabela,
  (select count(*) from pg_policies where tablename = 'objects' and policyname in
     ('escritorio ve arquivos de cliente', 'editor sobe arquivos de cliente', 'admin apaga arquivos de cliente')) as politicas_storage;
