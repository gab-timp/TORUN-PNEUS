-- Romaneio de Coleta (aba "Coleta", aninhada em Fretes no menu).
-- Um romaneio por Nota Fiscal, ligado ao pedido (entregas) que já existe. Motorista assina no
-- aparelho de quem gera, na hora do carregamento -- a imagem da assinatura vai pro Storage.
--
-- RODE ISTO ANTES de publicar o código novo (site/app.js) -- ele já pede a tabela no boot
-- (loadState()). Rodar depois derruba o carregamento pra todo mundo, do mesmo jeito que já
-- aconteceu com pode_exportar_backup (ver memória "SQL antes do deploy").
--
-- Depois deste arquivo, ainda falta criar o bucket manualmente no Dashboard -- ver passo 4 abaixo.

-- 1) Tabela ------------------------------------------------------------------

create table if not exists romaneios (
  id uuid primary key default gen_random_uuid(),
  entrega_id uuid not null references entregas(id) on delete cascade,
  transportadora text not null default '',
  motorista_nome text not null default '',
  motorista_documento text not null default '',
  veiculo_placa text not null default '',
  data_coleta date,
  assinatura_path text,
  assinado_em timestamptz,
  cancelado boolean not null default false,
  cancelado_motivo text,
  cancelado_em timestamptz,
  cancelado_por uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id)
);

-- só pode existir 1 romaneio ATIVO (não cancelado) por pedido -- cancelar libera pra gerar outro
create unique index if not exists romaneios_entrega_ativo_key
  on romaneios (entrega_id) where not cancelado;

create index if not exists romaneios_entrega_id_idx on romaneios (entrega_id);

-- updated_at automático (mesmo padrão já usado nas outras tabelas do sistema)
create or replace function romaneios_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
drop trigger if exists romaneios_updated_at on romaneios;
create trigger romaneios_updated_at before update on romaneios
  for each row execute function romaneios_set_updated_at();

-- 2) RLS -----------------------------------------------------------------------
-- Mesmo modelo de Fretes/Entregas: qualquer usuário autenticado lê; só Editor (que é quem o
-- galpão usa -- decisão do usuário, sem papel novo) grava.

alter table romaneios enable row level security;

drop policy if exists "autenticado le romaneios" on romaneios;
create policy "autenticado le romaneios" on romaneios for select
  using (auth.role() = 'authenticated');

drop policy if exists "editor insere romaneios" on romaneios;
create policy "editor insere romaneios" on romaneios for insert
  with check (current_user_role() = 'editor' and created_by = auth.uid());

drop policy if exists "editor atualiza romaneios" on romaneios;
create policy "editor atualiza romaneios" on romaneios for update
  using (current_user_role() = 'editor');

-- 3) Realtime --------------------------------------------------------------
-- Se a tabela não aparecer sozinha nas outras telas em tempo real, confirme em Database >
-- Replication no Dashboard que "romaneios" está marcada (equivalente ao comando abaixo).
alter publication supabase_realtime add table romaneios;

-- 4) Bucket de armazenamento (não dá pra criar por SQL no plano gratuito/padrão -- crie no
--    Dashboard): Storage > New bucket > nome EXATO "romaneios-assinaturas" > Public bucket = OFF
--    (privado, igual entregas-anexos e clientes-pendentes-anexos). Depois de criar, rode o bloco
--    abaixo (as políticas do bucket ficam no banco, essas sim por SQL).

drop policy if exists "autenticado ve assinatura romaneio" on storage.objects;
create policy "autenticado ve assinatura romaneio" on storage.objects for select using (
  bucket_id = 'romaneios-assinaturas' and auth.role() = 'authenticated'
);

drop policy if exists "editor sobe assinatura romaneio" on storage.objects;
create policy "editor sobe assinatura romaneio" on storage.objects for insert with check (
  bucket_id = 'romaneios-assinaturas' and current_user_role() = 'editor'
);

-- Confira depois de rodar tudo (espera 0 linhas -- só confirma que criou sem erro):
select * from romaneios limit 0;
