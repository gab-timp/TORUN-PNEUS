-- Sem Venda, etapa 4: Frete e valores do produto (custo e preço de proposta).
--
-- Pré-requisitos (já rodados nas etapas anteriores): sql/sem_venda_acesso.sql,
-- sql/sem_venda_produtos_e_estoque_previsto.sql e sql/sem_venda_catalogo_e_reservas.sql.
--
--   sv_fretes                      -- um lançamento por frete: quem pagou (NOSSO ou CLIENTE),
--                                     transportadora, valor e a que se refere (pedido/proposta)
--   sv_produtos.custo_unitario     -- usado no "valor investido" (Dashboard e Armazenagem)
--   sv_produtos.preco_proposta     -- vem preenchido no Relatório de Preço
--
-- Os dois valores do produto são opcionais: produto sem custo ou sem preço só fica de fora dos
-- valores em R$. Nada aqui mexe em dados existentes (aditivo e seguro). Rode no SQL Editor do
-- Supabase ANTES de abrir a tela de Frete.

alter table sv_produtos add column if not exists custo_unitario numeric(14,2) check (custo_unitario is null or custo_unitario >= 0);
alter table sv_produtos add column if not exists preco_proposta numeric(14,2) check (preco_proposta is null or preco_proposta >= 0);

create table if not exists sv_fretes (
  id text primary key,
  data date not null,
  pago_por text not null check (pago_por in ('NOSSO', 'CLIENTE')),
  transportadora text not null,
  valor numeric(14,2) not null default 0 check (valor >= 0),
  referente text not null,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table sv_fretes enable row level security;

create index if not exists sv_fretes_data_idx on sv_fretes (data desc);

drop trigger if exists sv_fretes_updated_at on sv_fretes;
create trigger sv_fretes_updated_at before update on sv_fretes
  for each row execute function sv_set_updated_at();

drop policy if exists "sem venda le" on sv_fretes;
create policy "sem venda le" on sv_fretes for select
  using (current_user_pode_acessar_sem_venda());

drop policy if exists "sem venda insere" on sv_fretes;
create policy "sem venda insere" on sv_fretes for insert
  with check (current_user_pode_acessar_sem_venda() and current_user_role() = 'editor');

drop policy if exists "sem venda atualiza" on sv_fretes;
create policy "sem venda atualiza" on sv_fretes for update
  using (current_user_pode_acessar_sem_venda() and current_user_role() = 'editor')
  with check (current_user_pode_acessar_sem_venda() and current_user_role() = 'editor');

drop policy if exists "sem venda exclui" on sv_fretes;
create policy "sem venda exclui" on sv_fretes for delete
  using (current_user_pode_acessar_sem_venda() and current_user_role() = 'editor');

-- Confere (deve listar 4 políticas de sv_fretes):
select tablename, policyname, cmd
from pg_policies
where tablename = 'sv_fretes'
order by cmd;
