-- Sem Venda, etapa 3: foto do produto (Catálogo) e Reservas.
--
-- Pré-requisitos (já rodados nas etapas anteriores): sql/sem_venda_acesso.sql e
-- sql/sem_venda_produtos_e_estoque_previsto.sql.
--
--   sv_produtos.foto_path   -- caminho da foto no bucket "sem-venda-fotos" (público, como o
--                              de fotos do Torun; os nomes de arquivo levam data e sufixo)
--   sv_reservas             -- reserva de pneu pra um cliente do Torun. Ou é de ESTOQUE
--                              (armazem preenchido: pneu que já chegou) ou de PROCESSO
--                              (previsao_id preenchido: pneu do Estoque Previsto que ainda
--                              não chegou) -- nunca os dois (check no fim da tabela).
--
-- O saldo (disponível por produto e armazém) NÃO é gravado em lugar nenhum: a tela calcula a
-- partir dos processos "CHEGOU" menos as reservas ativas e as vendidas. Por isso não há trigger.
-- Situação da reserva: ATIVA | VENDIDA | CANCELADA ("aguardando chegada" a tela deduz do status
-- do processo ligado).
--
-- Produto, cliente e processo com reserva não podem ser apagados (on delete restrict).
-- Aditivo e seguro. Rode no SQL Editor do Supabase.

alter table sv_produtos add column if not exists foto_path text;

-- bucket de fotos (público: a URL da foto abre sem login, igual ao bucket de fotos do Torun)
insert into storage.buckets (id, name, public)
values ('sem-venda-fotos', 'sem-venda-fotos', true)
on conflict (id) do nothing;

drop policy if exists "sem venda le foto" on storage.objects;
create policy "sem venda le foto" on storage.objects for select
  using (bucket_id = 'sem-venda-fotos' and current_user_pode_acessar_sem_venda());

drop policy if exists "sem venda sobe foto" on storage.objects;
create policy "sem venda sobe foto" on storage.objects for insert
  with check (bucket_id = 'sem-venda-fotos' and current_user_pode_acessar_sem_venda() and current_user_role() = 'editor');

drop policy if exists "sem venda remove foto" on storage.objects;
create policy "sem venda remove foto" on storage.objects for delete
  using (bucket_id = 'sem-venda-fotos' and current_user_pode_acessar_sem_venda() and current_user_role() = 'editor');

create table if not exists sv_reservas (
  id text primary key,
  codigo text not null references sv_produtos(codigo) on delete restrict,
  quantidade integer not null check (quantidade > 0),
  cliente text not null references clientes(nome) on update cascade on delete restrict,
  responsavel text not null,
  armazem text,
  previsao_id text references sv_previsoes(id) on delete restrict,
  situacao text not null default 'ATIVA',
  data date not null,
  obs text,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((armazem is not null) <> (previsao_id is not null))
);
alter table sv_reservas enable row level security;

create index if not exists sv_reservas_codigo_idx on sv_reservas (codigo);
create index if not exists sv_reservas_previsao_idx on sv_reservas (previsao_id);

drop trigger if exists sv_reservas_updated_at on sv_reservas;
create trigger sv_reservas_updated_at before update on sv_reservas
  for each row execute function sv_set_updated_at();

drop policy if exists "sem venda le" on sv_reservas;
create policy "sem venda le" on sv_reservas for select
  using (current_user_pode_acessar_sem_venda());

drop policy if exists "sem venda insere" on sv_reservas;
create policy "sem venda insere" on sv_reservas for insert
  with check (current_user_pode_acessar_sem_venda() and current_user_role() = 'editor');

drop policy if exists "sem venda atualiza" on sv_reservas;
create policy "sem venda atualiza" on sv_reservas for update
  using (current_user_pode_acessar_sem_venda() and current_user_role() = 'editor')
  with check (current_user_pode_acessar_sem_venda() and current_user_role() = 'editor');

drop policy if exists "sem venda exclui" on sv_reservas;
create policy "sem venda exclui" on sv_reservas for delete
  using (current_user_pode_acessar_sem_venda() and current_user_role() = 'editor');

-- Confere (deve listar 4 políticas de sv_reservas e 3 do bucket de fotos):
select tablename, policyname, cmd
from pg_policies
where (tablename = 'sv_reservas')
   or (tablename = 'objects' and policyname like 'sem venda%foto')
order by tablename, cmd;
