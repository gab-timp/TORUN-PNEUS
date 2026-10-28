-- CRM Atacado e Encomenda: perfil completo do cliente (cadastro, perfil, fiscal, comercial, financeiro,
-- inteligência), filiais e o Raio-X por tipo de pneu.
--
-- O perfil é do CLIENTE, não do sistema: o mesmo cliente que está no Atacado e na Encomenda tem um perfil só.
-- As tabelas apontam para clientes(nome), a mesma chave que a carteira já usa. Os contatos continuam na
-- tabela crm_contatos (a função vai no campo cargo; o decisor é o contato marcado como principal).
--
-- Quem lê e quem escreve segue a carteira, como nos contatos:
--   lê      -> quem enxerga o cliente em alguma carteira (executivo da carteira, financeiro, gestão);
--   escreve -> executivo da carteira ou gestão, e não pode ser "somente leitura" do sistema.
--
-- Tudo aditivo: nenhuma tabela ou coluna existente é alterada. O site lê estas tabelas em consultas à parte,
-- então este SQL pode rodar antes ou depois do deploy; sem ele a ficha só mostra "perfil ainda não preenchido".
--
-- Rode o script INTEIRO no SQL Editor do Supabase (ele mostra só o resultado da última consulta).

-- ---------------------------------------------------------------- perfil (1 por cliente)
create table if not exists crm_cliente_perfil (
  cliente text primary key references clientes(nome) on update cascade on delete cascade,
  -- 1. dados cadastrais
  razao_social text,
  nome_fantasia text,
  cnpj text,
  inscricao_estadual text,
  cnae text,
  regime_tributario text,
  cep text,
  cidade_uf text,
  endereco text,
  -- 2. perfil do cliente
  segmento text,
  tempo_mercado_anos integer check (tempo_mercado_anos is null or tempo_mercado_anos >= 0),
  porte text,
  funcionarios integer check (funcionarios is null or funcionarios >= 0),
  -- 3. fiscal
  possui_ttd boolean,
  ttd_numero text,
  ttd_vencimento date,
  fatura_sem_st boolean,
  estados_beneficio text[] not null default '{}',
  obs_fiscal text,
  -- 4. comercial (o resto é a tabela crm_cliente_pneus)
  obs_crescimento text,
  -- 6. financeiro
  cliente_desde date,
  condicao_pagamento text,
  limite_credito numeric(14,2) check (limite_credito is null or limite_credito >= 0),
  inadimplencia text,
  obs_financeiro text,
  -- 7. inteligência comercial
  concorrentes text,
  ficar_no_pe text,
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid()
);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'crm_cliente_perfil_segmento_check') then
    alter table crm_cliente_perfil add constraint crm_cliente_perfil_segmento_check
      check (segmento is null or segmento in ('Revenda', 'Auto Center', 'Reformadora', 'Borracharia', 'Transportadora', 'Frota', 'Agro', 'Indústria', 'Outros'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'crm_cliente_perfil_porte_check') then
    alter table crm_cliente_perfil add constraint crm_cliente_perfil_porte_check
      check (porte is null or porte in ('Pequeno', 'Médio', 'Grande'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'crm_cliente_perfil_inadimplencia_check') then
    alter table crm_cliente_perfil add constraint crm_cliente_perfil_inadimplencia_check
      check (inadimplencia is null or inadimplencia in ('Nenhuma', 'Em atraso', 'Protestado'));
  end if;
end $$;

-- ---------------------------------------------------------------- filiais
create table if not exists crm_cliente_filiais (
  id uuid primary key default gen_random_uuid(),
  cliente text not null references clientes(nome) on update cascade on delete cascade,
  cnpj text,
  cidade_uf text,
  ordem integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists idx_crm_cliente_filiais_cliente on crm_cliente_filiais (cliente, ordem);

-- ---------------------------------------------------------------- Raio-X: o que ele compra por tipo de pneu
create table if not exists crm_cliente_pneus (
  id uuid primary key default gen_random_uuid(),
  cliente text not null references clientes(nome) on update cascade on delete cascade,
  tipo text not null,
  marcas_fornecedores text,
  compra_mes integer check (compra_mes is null or compra_mes >= 0),
  potencial_mes integer check (potencial_mes is null or potencial_mes >= 0),
  ordem integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists idx_crm_cliente_pneus_cliente on crm_cliente_pneus (cliente, ordem);

-- ---------------------------------------------------------------- RLS (as 3 tabelas seguem a carteira)
do $$
declare
  t text;
begin
  foreach t in array array['crm_cliente_perfil', 'crm_cliente_filiais', 'crm_cliente_pneus'] loop
    execute format('alter table %I enable row level security', t);

    execute format('drop policy if exists %I on %I', t || '_select', t);
    execute format($p$create policy %I on %I for select to authenticated
      using (exists (select 1 from crm_carteira c where c.cliente = %I.cliente))$p$, t || '_select', t, t);

    execute format('drop policy if exists %I on %I', t || '_insert', t);
    execute format($p$create policy %I on %I for insert to authenticated
      with check (
        crm_pode_escrever() and current_user_crm_papel() in ('executivo', 'gestao')
        and exists (select 1 from crm_carteira c where c.cliente = %I.cliente)
      )$p$, t || '_insert', t, t);

    execute format('drop policy if exists %I on %I', t || '_update', t);
    execute format($p$create policy %I on %I for update to authenticated
      using (
        crm_pode_escrever() and current_user_crm_papel() in ('executivo', 'gestao')
        and exists (select 1 from crm_carteira c where c.cliente = %I.cliente)
      )
      with check (exists (select 1 from crm_carteira c where c.cliente = %I.cliente))$p$, t || '_update', t, t, t);

    execute format('drop policy if exists %I on %I', t || '_delete', t);
    execute format($p$create policy %I on %I for delete to authenticated
      using (
        crm_pode_escrever() and current_user_crm_papel() in ('executivo', 'gestao')
        and exists (select 1 from crm_carteira c where c.cliente = %I.cliente)
      )$p$, t || '_delete', t, t);
  end loop;
end $$;

-- ---------------------------------------------------------------- confere
select table_name,
       (select count(*) from pg_policies p where p.tablename = t.table_name) as politicas
from information_schema.tables t
where table_schema = 'public' and table_name in ('crm_cliente_perfil', 'crm_cliente_filiais', 'crm_cliente_pneus')
order by table_name;
