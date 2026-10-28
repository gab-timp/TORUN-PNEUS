-- CRM Atacado e Encomenda: cadastro de clientes PRÓPRIO do CRM (separado da tabela clientes do Torun).
--
-- Até aqui o CRM só aceitava cliente que já existia no cadastro do Torun (Varejo). Agora o executivo ou a gestão
-- também cadastra cliente novo direto no CRM, ou importa um cliente do Torun (a importação COPIA os dados; depois
-- disso os dois cadastros são independentes, como já é no Sem Venda com sv_clientes).
--
--   lê      -> qualquer pessoa com papel no CRM (executivo, financeiro, gestão): o cadastro é compartilhado pelos dois
--              sistemas e é preciso enxergar para avisar "esse cliente já existe". A CARTEIRA, as ligações e o perfil
--              continuam protegidos pela carteira, como antes;
--   cria    -> executivo e gestão (financeiro só lê), e não pode ser "somente leitura" do sistema;
--   edita   -> idem;
--   exclui  -> só gestão (e administrador), e só se o cliente não estiver em nenhuma carteira (chave estrangeira).
--
-- O que muda por baixo:
--   1) cria crm_clientes e copia para ela os clientes do Torun que JÁ estão em alguma carteira ou têm perfil (nada
--      fica órfão);
--   2) crm_carteira e as tabelas de perfil (crm_cliente_perfil, crm_cliente_filiais, crm_cliente_pneus) deixam de
--      apontar para clientes(nome) e passam a apontar para crm_clientes(nome) (renomear atualiza tudo em cascata).
--      Daí em diante excluir ou mesclar cliente no Torun não é mais barrado pelo CRM.
--
-- ORDEM: rode ANTES de publicar a versão nova do site (crm.js v8 / crm-perfil.js v2). O site novo, sem este SQL,
-- continua lendo os clientes do Torun e avisa que o cadastro do CRM ainda não existe. Pode rodar de novo sem estragar.
--
-- Rode o script INTEIRO no SQL Editor do Supabase (ele mostra só o resultado da última consulta).

-- ---------------------------------------------------------------- tabela
create table if not exists crm_clientes (
  id text primary key,
  nome text not null check (length(btrim(nome)) > 0),
  tipo_pessoa text check (tipo_pessoa is null or tipo_pessoa in ('PF', 'PJ')),
  documento text,
  razao_social text,
  contato text,
  telefone text,
  email text,
  cep text,
  endereco text,
  cidade text,
  estado text,
  limite_credito numeric(14,2) check (limite_credito is null or limite_credito >= 0),
  -- de onde veio: copiado do Torun (importação ou migração) ou cadastrado direto no CRM
  origem text not null default 'novo' check (origem in ('torun', 'novo')),
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  constraint crm_clientes_nome_key unique (nome)
);

alter table crm_clientes enable row level security;

-- ---------------------------------------------------------------- políticas
drop policy if exists crm_clientes_select on crm_clientes;
create policy crm_clientes_select on crm_clientes for select to authenticated
  using (current_user_crm_papel() is not null);

drop policy if exists crm_clientes_insert on crm_clientes;
create policy crm_clientes_insert on crm_clientes for insert to authenticated
  with check (crm_pode_escrever() and current_user_crm_papel() in ('executivo', 'gestao'));

drop policy if exists crm_clientes_update on crm_clientes;
create policy crm_clientes_update on crm_clientes for update to authenticated
  using (crm_pode_escrever() and current_user_crm_papel() in ('executivo', 'gestao'))
  with check (crm_pode_escrever() and current_user_crm_papel() in ('executivo', 'gestao'));

drop policy if exists crm_clientes_delete on crm_clientes;
create policy crm_clientes_delete on crm_clientes for delete to authenticated
  using (crm_pode_escrever() and current_user_crm_papel() = 'gestao');

-- ---------------------------------------------------------------- copia os clientes que o CRM já usa
-- (on conflict sem alvo: ignora qualquer repetição, inclusive nomes que só diferem em maiúscula)
insert into crm_clientes (id, nome, tipo_pessoa, documento, razao_social, contato, telefone, email, cep, endereco, cidade, estado, limite_credito, origem)
select 'crmcli_' || replace(gen_random_uuid()::text, '-', ''), c.nome,
       case when c.tipo_pessoa in ('PF', 'PJ') then c.tipo_pessoa else null end,
       c.documento, c.razao_social, c.contato, c.telefone, c.email, c.cep, c.endereco, c.cidade, c.estado, c.limite_credito, 'torun'
from clientes c
where c.nome in (
  select cliente from crm_carteira
  union select cliente from crm_cliente_perfil
  union select cliente from crm_cliente_filiais
  union select cliente from crm_cliente_pneus
)
on conflict do nothing;

-- nome sem diferença de maiúscula/espaço, e CNPJ/CPF (só números) não se repetem. Se já houver repetido na cópia
-- acima, o índice não é criado e o aviso aparece na conferência (o site confere os dois casos mesmo assim).
do $$
begin
  begin
    create unique index if not exists crm_clientes_nome_idx on crm_clientes (lower(btrim(nome)));
  exception when others then
    raise notice 'índice de nome não criado: %', sqlerrm;
  end;
  begin
    create unique index if not exists crm_clientes_documento_idx on crm_clientes (regexp_replace(documento, '\D', '', 'g'))
      where length(regexp_replace(coalesce(documento, ''), '\D', '', 'g')) >= 11;
  exception when others then
    raise notice 'índice de documento não criado: %', sqlerrm;
  end;
end $$;

-- ---------------------------------------------------------------- troca as chaves estrangeiras
do $$
declare
  alvo text;
  f text;
begin
  foreach alvo in array array['crm_carteira', 'crm_cliente_perfil', 'crm_cliente_filiais', 'crm_cliente_pneus'] loop
    for f in
      select conname from pg_constraint
      where conrelid = alvo::regclass and contype = 'f' and confrelid = 'clientes'::regclass
    loop
      execute format('alter table %I drop constraint %I', alvo, f);
    end loop;
    execute format('alter table %I drop constraint if exists %I', alvo, alvo || '_cliente_crm_fkey');
  end loop;
end $$;

-- a carteira não deixa apagar cliente que está nela; o perfil some junto com o cliente (como era)
alter table crm_carteira add constraint crm_carteira_cliente_crm_fkey
  foreign key (cliente) references crm_clientes(nome) on update cascade on delete restrict;
alter table crm_cliente_perfil add constraint crm_cliente_perfil_cliente_crm_fkey
  foreign key (cliente) references crm_clientes(nome) on update cascade on delete cascade;
alter table crm_cliente_filiais add constraint crm_cliente_filiais_cliente_crm_fkey
  foreign key (cliente) references crm_clientes(nome) on update cascade on delete cascade;
alter table crm_cliente_pneus add constraint crm_cliente_pneus_cliente_crm_fkey
  foreign key (cliente) references crm_clientes(nome) on update cascade on delete cascade;

-- ---------------------------------------------------------------- confere (rode sozinho; ok = true em todas as linhas)
select item, ok from (values
  ('4 políticas em crm_clientes', (select count(*) = 4 from pg_policies where tablename = 'crm_clientes')),
  ('carteira sem cliente no cadastro novo (deve ser 0)', (select count(*) = 0 from crm_carteira c where not exists (select 1 from crm_clientes k where k.nome = c.cliente))),
  ('4 chaves novas apontando para crm_clientes', (select count(*) = 4 from pg_constraint where confrelid = 'crm_clientes'::regclass and contype = 'f')),
  ('índice de nome criado', (select count(*) = 1 from pg_indexes where indexname = 'crm_clientes_nome_idx')),
  ('índice de documento criado', (select count(*) = 1 from pg_indexes where indexname = 'crm_clientes_documento_idx'))
) as t(item, ok);
