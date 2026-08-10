-- Tabela de uma linha só (singleton) pra config do site hoje fixa no código:
-- limite de estoque baixo (hoje sempre 20 em app.js) e validade da proposta
-- (hoje sempre 14 dias em pedido-representante.js).
--
-- Depende de current_user_is_admin(), criada em user_roles_admin_settings.sql —
-- rode aquele arquivo primeiro.
--
-- Rode no SQL Editor do Supabase.

create table if not exists configuracoes_site (
  id boolean primary key default true,
  estoque_baixo_limite integer not null default 20,
  proposta_validade_dias integer not null default 14,
  constraint configuracoes_site_singleton check (id)
);

insert into configuracoes_site (id) values (true) on conflict (id) do nothing;

alter table configuracoes_site enable row level security;

drop policy if exists "autenticado le config do site" on configuracoes_site;
create policy "autenticado le config do site" on configuracoes_site for select
  using (auth.role() = 'authenticated');

drop policy if exists "admin atualiza config do site" on configuracoes_site;
create policy "admin atualiza config do site" on configuracoes_site for update
  using (current_user_is_admin())
  with check (current_user_is_admin());

select * from configuracoes_site;
