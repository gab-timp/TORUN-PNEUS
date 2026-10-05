-- Sem Venda, etapa 2: cadastro de produtos próprio e Estoque Previsto.
--
-- Duas tabelas novas, separadas das do Torun (produtos / previsoes):
--   sv_produtos   -- cadastro de produtos do Sem Venda (código é a chave, como no Torun)
--   sv_previsoes  -- processos de compra em andamento; cada processo tem um armazém de
--                    destino. Quando o processo vira "CHEGOU", os itens contam como
--                    estoque desse armazém -- esse saldo vai ser CALCULADO a partir dos
--                    processos (etapa 3), sem tabela de movimentação e sem trigger.
--
-- Acesso: só quem passa em current_user_pode_acessar_sem_venda() (admin ou permissão
-- liberada, ver sql/sem_venda_acesso.sql -- rode aquele primeiro) lê; escrever exige o
-- mesmo e papel "editor" (mesmo padrão das outras tabelas). Nenhuma outra tela do
-- sistema lê estas tabelas.
--
-- Aditivo e seguro: só cria tabelas novas; não mexe em nada que já existe.
-- Rode no SQL Editor do Supabase.

create table if not exists sv_produtos (
  codigo text primary key,
  medida text not null,
  marca text,
  modelo text,
  categoria text,
  carcaca text,
  situacao text not null default 'ATIVO',
  ic_iv text,
  pr text,
  cap_carga text,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists sv_previsoes (
  id text primary key,
  numero_processo text not null,
  itens jsonb not null default '[]'::jsonb,
  data_chegada date,
  status text not null default 'AGUARDANDO PRONTIDÃO',
  armazem text,
  obs text,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- RLS ligado logo depois de criar cada tabela (de novo no bloco das políticas, mais abaixo):
-- se o script for interrompido no meio, nenhuma tabela fica aberta.
alter table sv_produtos enable row level security;
alter table sv_previsoes enable row level security;

-- updated_at automático (a tela usa pra detectar edição simultânea)
create or replace function sv_set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists sv_produtos_updated_at on sv_produtos;
create trigger sv_produtos_updated_at before update on sv_produtos
  for each row execute function sv_set_updated_at();

drop trigger if exists sv_previsoes_updated_at on sv_previsoes;
create trigger sv_previsoes_updated_at before update on sv_previsoes
  for each row execute function sv_set_updated_at();

-- RLS: mesmas 4 políticas nas duas tabelas
do $$
declare t text;
begin
  foreach t in array array['sv_produtos', 'sv_previsoes'] loop
    execute format('alter table %I enable row level security', t);

    execute format('drop policy if exists "sem venda le" on %I', t);
    execute format('create policy "sem venda le" on %I for select using (current_user_pode_acessar_sem_venda())', t);

    execute format('drop policy if exists "sem venda insere" on %I', t);
    execute format('create policy "sem venda insere" on %I for insert with check (current_user_pode_acessar_sem_venda() and current_user_role() = ''editor'')', t);

    execute format('drop policy if exists "sem venda atualiza" on %I', t);
    execute format('create policy "sem venda atualiza" on %I for update using (current_user_pode_acessar_sem_venda() and current_user_role() = ''editor'') with check (current_user_pode_acessar_sem_venda() and current_user_role() = ''editor'')', t);

    execute format('drop policy if exists "sem venda exclui" on %I', t);
    execute format('create policy "sem venda exclui" on %I for delete using (current_user_pode_acessar_sem_venda() and current_user_role() = ''editor'')', t);
  end loop;
end $$;

-- Confere (deve listar 8 políticas: 4 por tabela):
select tablename, policyname, cmd
from pg_policies
where tablename in ('sv_produtos', 'sv_previsoes')
order by tablename, cmd;
