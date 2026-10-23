-- CRM Atacado e Encomenda, etapa 1 (núcleo): papel do usuário, carteira, contatos, ligações e histórico
-- de etapas do kanban.
--
-- O CRM mora dentro do Sem Venda (branch sem-venda) e usa o mesmo login. Quem manda no acesso é o
-- PAPEL gravado em Administração > Usuários:
--   executivo  -> vê e mexe só na própria carteira, do sistema dele (Atacado ou Encomenda);
--   financeiro -> a Beth: lê todas as carteiras dos dois sistemas (a digitação do faturamento vem na etapa 2);
--   gestao     -> gestão e direção: lê tudo e pode redistribuir carteira. Administrador conta como gestão.
-- A trava é de verdade no banco (RLS), não só esconder o menu.
--
-- Tudo aditivo: nenhuma coluna ou tabela existente é alterada além de duas colunas novas e opcionais em
-- user_roles. O site lê o perfil do CRM numa consulta à parte, então este SQL pode rodar antes ou depois
-- do deploy sem derrubar o login de ninguém; sem ele o CRM só avisa "tabela não encontrada".
--
-- Rode o script INTEIRO no SQL Editor do Supabase (ele mostra só o resultado da última consulta).

-- ---------------------------------------------------------------- papel no cadastro de usuários
alter table user_roles add column if not exists crm_papel text;
alter table user_roles add column if not exists crm_sistema text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'user_roles_crm_papel_check') then
    alter table user_roles add constraint user_roles_crm_papel_check
      check (crm_papel is null or crm_papel in ('executivo', 'financeiro', 'gestao'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'user_roles_crm_sistema_check') then
    alter table user_roles add constraint user_roles_crm_sistema_check
      check (crm_sistema is null or crm_sistema in ('atacado', 'encomenda'));
  end if;
  -- executivo sem sistema não saberia qual carteira enxergar
  if not exists (select 1 from pg_constraint where conname = 'user_roles_crm_executivo_sistema_check') then
    alter table user_roles add constraint user_roles_crm_executivo_sistema_check
      check (crm_papel is distinct from 'executivo' or crm_sistema is not null);
  end if;
end $$;

create or replace function current_user_crm_papel()
returns text
language sql
stable
security definer
set search_path = public
as $$
  -- administrador sem papel marcado conta como gestão; se marcarem um papel no cadastro dele (ex.: executivo,
  -- para testar), vale o papel marcado
  select coalesce(crm_papel, case when is_admin then 'gestao' end)
  from user_roles where user_id = auth.uid();
$$;

create or replace function current_user_crm_sistema()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select crm_sistema from user_roles where user_id = auth.uid();
$$;

-- pode ver o sistema p_sistema? (gestão e financeiro veem os dois; executivo só o dele)
create or replace function crm_pode_sistema(p_sistema text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case current_user_crm_papel()
    when 'gestao' then true
    when 'financeiro' then true
    when 'executivo' then current_user_crm_sistema() = p_sistema
    else false
  end;
$$;

-- quem escreve: não pode ser "somente leitura" do sistema
create or replace function crm_pode_escrever()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(current_user_role() <> 'viewer', true);
$$;

grant execute on function current_user_crm_papel() to authenticated;
grant execute on function current_user_crm_sistema() to authenticated;
grant execute on function crm_pode_sistema(text) to authenticated;
grant execute on function crm_pode_escrever() to authenticated;

-- ---------------------------------------------------------------- carteira (cliente x executivo x sistema)
create table if not exists crm_carteira (
  id uuid primary key default gen_random_uuid(),
  sistema text not null check (sistema in ('atacado', 'encomenda')),
  cliente text not null references clientes(nome) on update cascade,
  executivo_user_id uuid not null,
  executivo_nome text,
  -- etapa do kanban (só o Atacado usa; vazio = "sem etapa")
  etapa text check (etapa is null or etapa in ('Estimativa enviada', 'Em negociação', 'Fechamento', 'Fechado', 'Declinou')),
  etapa_desde timestamptz,
  -- cliente que ainda não tem ligação aparece em Hoje nesta data
  primeiro_followup date not null default current_date,
  tambem_outro_sistema boolean not null default false,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  -- cada cliente tem UM executivo por sistema (nos dois sistemas, um em cada, com histórico separado)
  unique (sistema, cliente)
);
create index if not exists idx_crm_carteira_executivo on crm_carteira (sistema, executivo_user_id);

alter table crm_carteira enable row level security;

drop policy if exists crm_carteira_select on crm_carteira;
create policy crm_carteira_select on crm_carteira for select to authenticated
  using (
    current_user_crm_papel() in ('gestao', 'financeiro')
    or (current_user_crm_papel() = 'executivo' and executivo_user_id = auth.uid() and sistema = current_user_crm_sistema())
  );

drop policy if exists crm_carteira_insert on crm_carteira;
create policy crm_carteira_insert on crm_carteira for insert to authenticated
  with check (
    crm_pode_escrever() and (
      current_user_crm_papel() = 'gestao'
      or (current_user_crm_papel() = 'executivo' and executivo_user_id = auth.uid() and sistema = current_user_crm_sistema())
    )
  );

drop policy if exists crm_carteira_update on crm_carteira;
create policy crm_carteira_update on crm_carteira for update to authenticated
  using (
    crm_pode_escrever() and (
      current_user_crm_papel() = 'gestao'
      or (current_user_crm_papel() = 'executivo' and executivo_user_id = auth.uid() and sistema = current_user_crm_sistema())
    )
  )
  with check (
    current_user_crm_papel() = 'gestao'
    or (current_user_crm_papel() = 'executivo' and executivo_user_id = auth.uid() and sistema = current_user_crm_sistema())
  );

drop policy if exists crm_carteira_delete on crm_carteira;
create policy crm_carteira_delete on crm_carteira for delete to authenticated
  using (crm_pode_escrever() and current_user_crm_papel() = 'gestao');

-- ---------------------------------------------------------------- contatos do cliente (por sistema)
create table if not exists crm_contatos (
  id uuid primary key default gen_random_uuid(),
  sistema text not null check (sistema in ('atacado', 'encomenda')),
  cliente text not null,
  nome text not null,
  cargo text,
  telefone text,
  whatsapp text,
  email text,
  principal boolean not null default false,
  created_at timestamptz not null default now(),
  foreign key (sistema, cliente) references crm_carteira (sistema, cliente) on update cascade on delete cascade
);
create index if not exists idx_crm_contatos_cliente on crm_contatos (sistema, cliente);

alter table crm_contatos enable row level security;

-- as políticas das outras tabelas perguntam à carteira: quem enxerga a linha da carteira enxerga o resto
drop policy if exists crm_contatos_select on crm_contatos;
create policy crm_contatos_select on crm_contatos for select to authenticated
  using (exists (select 1 from crm_carteira c where c.sistema = crm_contatos.sistema and c.cliente = crm_contatos.cliente));

drop policy if exists crm_contatos_insert on crm_contatos;
create policy crm_contatos_insert on crm_contatos for insert to authenticated
  with check (
    crm_pode_escrever() and current_user_crm_papel() in ('executivo', 'gestao')
    and exists (select 1 from crm_carteira c where c.sistema = crm_contatos.sistema and c.cliente = crm_contatos.cliente)
  );

drop policy if exists crm_contatos_update on crm_contatos;
create policy crm_contatos_update on crm_contatos for update to authenticated
  using (
    crm_pode_escrever() and current_user_crm_papel() in ('executivo', 'gestao')
    and exists (select 1 from crm_carteira c where c.sistema = crm_contatos.sistema and c.cliente = crm_contatos.cliente)
  )
  with check (
    exists (select 1 from crm_carteira c where c.sistema = crm_contatos.sistema and c.cliente = crm_contatos.cliente)
  );

drop policy if exists crm_contatos_delete on crm_contatos;
create policy crm_contatos_delete on crm_contatos for delete to authenticated
  using (
    crm_pode_escrever() and current_user_crm_papel() in ('executivo', 'gestao')
    and exists (select 1 from crm_carteira c where c.sistema = crm_contatos.sistema and c.cliente = crm_contatos.cliente)
  );

-- ---------------------------------------------------------------- ligações (histórico: só entra, não se edita)
create table if not exists crm_ligacoes (
  id uuid primary key default gen_random_uuid(),
  sistema text not null check (sistema in ('atacado', 'encomenda')),
  cliente text not null,
  contato_nome text,
  resultado text not null check (resultado in ('Não atendeu', 'Pediu retorno', 'Interesse', 'Estimativa enviada', 'Fechou negócio', 'Sem interesse')),
  observacao text,
  proximo_followup date,
  -- etapa do kanban DEPOIS da ligação (só quando a ligação mudou a etapa)
  etapa_para text check (etapa_para is null or etapa_para in ('Estimativa enviada', 'Em negociação', 'Fechamento', 'Fechado', 'Declinou')),
  executivo_user_id uuid not null default auth.uid(),
  executivo_nome text,
  created_at timestamptz not null default now(),
  foreign key (sistema, cliente) references crm_carteira (sistema, cliente) on update cascade on delete restrict,
  -- Pediu retorno, Interesse e Estimativa enviada exigem a data do próximo follow-up (regra do mockup)
  check (resultado not in ('Pediu retorno', 'Interesse', 'Estimativa enviada') or proximo_followup is not null)
);
create index if not exists idx_crm_ligacoes_cliente on crm_ligacoes (sistema, cliente, created_at desc);
create index if not exists idx_crm_ligacoes_executivo on crm_ligacoes (executivo_user_id, created_at desc);

alter table crm_ligacoes enable row level security;

drop policy if exists crm_ligacoes_select on crm_ligacoes;
create policy crm_ligacoes_select on crm_ligacoes for select to authenticated
  using (exists (select 1 from crm_carteira c where c.sistema = crm_ligacoes.sistema and c.cliente = crm_ligacoes.cliente));

-- só o executivo da carteira registra ligação (gestão e financeiro só leem)
drop policy if exists crm_ligacoes_insert on crm_ligacoes;
create policy crm_ligacoes_insert on crm_ligacoes for insert to authenticated
  with check (
    crm_pode_escrever() and current_user_crm_papel() = 'executivo'
    and executivo_user_id = auth.uid()
    and exists (select 1 from crm_carteira c where c.sistema = crm_ligacoes.sistema and c.cliente = crm_ligacoes.cliente and c.executivo_user_id = auth.uid())
  );

-- ---------------------------------------------------------------- mudanças de etapa do kanban
create table if not exists crm_etapa_historico (
  id uuid primary key default gen_random_uuid(),
  sistema text not null check (sistema in ('atacado', 'encomenda')),
  cliente text not null,
  de text,
  para text,
  origem text not null default 'kanban' check (origem in ('kanban', 'ligacao', 'ficha')),
  por_user_id uuid not null default auth.uid(),
  por_nome text,
  quando timestamptz not null default now(),
  foreign key (sistema, cliente) references crm_carteira (sistema, cliente) on update cascade on delete restrict
);
create index if not exists idx_crm_etapa_hist_cliente on crm_etapa_historico (sistema, cliente, quando desc);

alter table crm_etapa_historico enable row level security;

drop policy if exists crm_etapa_hist_select on crm_etapa_historico;
create policy crm_etapa_hist_select on crm_etapa_historico for select to authenticated
  using (exists (select 1 from crm_carteira c where c.sistema = crm_etapa_historico.sistema and c.cliente = crm_etapa_historico.cliente));

drop policy if exists crm_etapa_hist_insert on crm_etapa_historico;
create policy crm_etapa_hist_insert on crm_etapa_historico for insert to authenticated
  with check (
    crm_pode_escrever() and current_user_crm_papel() in ('executivo', 'gestao')
    and por_user_id = auth.uid()
    and exists (select 1 from crm_carteira c where c.sistema = crm_etapa_historico.sistema and c.cliente = crm_etapa_historico.cliente)
  );

-- ---------------------------------------------------------------- funções de apoio (security definer)
-- Quem já tem o cliente na carteira (o RLS esconde a carteira dos outros executivos, e a tela precisa
-- avisar "já está na carteira de fulano" ao adicionar). Só devolve cliente e nome do executivo.
create or replace function crm_carteira_ocupada(p_sistema text)
returns table(cliente text, executivo_nome text)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not crm_pode_sistema(p_sistema) then
    return;
  end if;
  return query select c.cliente, c.executivo_nome from crm_carteira c where c.sistema = p_sistema;
end;
$$;

-- Executivos de um sistema (para a gestão escolher o responsável ao adicionar cliente).
create or replace function crm_executivos(p_sistema text)
returns table(user_id uuid, nome text)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not crm_pode_sistema(p_sistema) then
    return;
  end if;
  return query
    select u.user_id, coalesce(nullif(u.nome, ''), u.email)
    from user_roles u
    where u.crm_papel = 'executivo' and u.crm_sistema = p_sistema
    order by 2;
end;
$$;

-- Excluir/mesclar cliente do Torun: a carteira do CRM aponta pro cliente por chave estrangeira
-- "restrict". Mesmo esquema de clientes_com_reserva_sem_venda: devolve só a quantidade.
create or replace function clientes_na_carteira_crm(p_nomes text[])
returns table(cliente text, carteiras bigint)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if coalesce(current_user_role(), '') = 'representante' then
    return;
  end if;
  return query
    select c.cliente, count(*)::bigint from crm_carteira c where c.cliente = any(p_nomes) group by c.cliente;
end;
$$;

grant execute on function crm_carteira_ocupada(text) to authenticated;
grant execute on function crm_executivos(text) to authenticated;
grant execute on function clientes_na_carteira_crm(text[]) to authenticated;

-- ---------------------------------------------------------------- confere (deve vir 1 linha por item, ok = true)
select item, ok from (values
  ('colunas crm_papel e crm_sistema em user_roles',
    (select count(*) = 2 from information_schema.columns where table_name = 'user_roles' and column_name in ('crm_papel', 'crm_sistema'))),
  ('4 tabelas do CRM', (select count(*) = 4 from information_schema.tables where table_name in ('crm_carteira', 'crm_contatos', 'crm_ligacoes', 'crm_etapa_historico'))),
  ('RLS ligado nas 4 tabelas', (select count(*) = 4 from pg_class where relname in ('crm_carteira', 'crm_contatos', 'crm_ligacoes', 'crm_etapa_historico') and relrowsecurity)),
  ('funções de acesso e apoio', (select count(*) = 7 from pg_proc where proname in ('current_user_crm_papel', 'current_user_crm_sistema', 'crm_pode_sistema', 'crm_pode_escrever', 'crm_carteira_ocupada', 'crm_executivos', 'clientes_na_carteira_crm')))
) as t(item, ok);
