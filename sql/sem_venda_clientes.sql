-- Sem Venda: cadastro de clientes PRÓPRIO (separado da tabela clientes do Torun).
-- Rode ANTES de publicar a versão nova do semvenda.js (v25). Pode rodar de novo sem estragar nada.
--
-- 1) Tabela sv_clientes. Quem tem acesso ao Sem Venda lê, cadastra e edita; só admin exclui.
-- 2) Copia para ela os clientes do Torun que já têm reserva (nada fica órfão).
-- 3) sv_reservas.cliente deixa de apontar para clientes(nome) e passa a apontar para sv_clientes(nome)
--    (renomear cliente atualiza as reservas; cliente com reserva não pode ser apagado).

create table if not exists sv_clientes (
  id text primary key,
  nome text not null check (length(btrim(nome)) > 0),
  tipo_pessoa text not null default 'PJ' check (tipo_pessoa in ('PF','PJ')),
  documento text,
  contato text,
  telefone text,
  email text,
  cidade text,
  estado text,
  unidade_negocio text not null default 'AMBOS' check (unidade_negocio in ('ATACADO','ENCOMENDA','AMBOS')),
  obs text,
  created_by uuid,
  created_at timestamptz not null default now(),
  constraint sv_clientes_nome_key unique (nome)
);

alter table sv_clientes enable row level security;

create unique index if not exists sv_clientes_nome_idx on sv_clientes (lower(btrim(nome)));

drop policy if exists "sem venda le" on sv_clientes;
create policy "sem venda le" on sv_clientes for select
  using (current_user_pode_acessar_sem_venda());

drop policy if exists "sem venda insere" on sv_clientes;
create policy "sem venda insere" on sv_clientes for insert
  with check (current_user_pode_acessar_sem_venda());

drop policy if exists "sem venda atualiza" on sv_clientes;
create policy "sem venda atualiza" on sv_clientes for update
  using (current_user_pode_acessar_sem_venda())
  with check (current_user_pode_acessar_sem_venda());

drop policy if exists "admin exclui" on sv_clientes;
create policy "admin exclui" on sv_clientes for delete
  using (current_user_is_admin());

-- clientes do Torun que já têm reserva: levam os dados que existirem (a unidade vem das reservas dele)
insert into sv_clientes (id, nome, tipo_pessoa, documento, contato, telefone, email, cidade, estado, unidade_negocio)
select 'svcli_' || replace(gen_random_uuid()::text, '-', ''), c.nome,
       case when c.tipo_pessoa in ('PF','PJ') then c.tipo_pessoa else 'PJ' end,
       c.documento, c.contato, c.telefone, c.email, c.cidade, c.estado,
       case
         when count(distinct r.unidade_negocio) filter (where r.unidade_negocio is not null) = 1
           then max(r.unidade_negocio)
         else 'AMBOS'
       end
from clientes c
join sv_reservas r on r.cliente = c.nome
group by c.nome, c.tipo_pessoa, c.documento, c.contato, c.telefone, c.email, c.cidade, c.estado
on conflict (nome) do nothing;

-- troca a chave estrangeira das reservas
do $$
declare f text;
begin
  for f in
    select conname from pg_constraint
    where conrelid = 'sv_reservas'::regclass and contype = 'f' and confrelid = 'clientes'::regclass
  loop
    execute format('alter table sv_reservas drop constraint %I', f);
  end loop;
end $$;

alter table sv_reservas drop constraint if exists sv_reservas_cliente_sv_fkey;
alter table sv_reservas add constraint sv_reservas_cliente_sv_fkey
  foreign key (cliente) references sv_clientes(nome) on update cascade on delete restrict;

-- Confere (rode sozinho): 4 políticas, 0 reservas sem cliente no cadastro novo e quantos clientes foram copiados
select 'politicas' as item, count(*)::text as valor from pg_policies where tablename = 'sv_clientes'
union all
select 'reservas sem cliente no cadastro novo', count(*)::text
  from sv_reservas r where not exists (select 1 from sv_clientes c where c.nome = r.cliente)
union all
select 'clientes copiados', count(*)::text from sv_clientes;
