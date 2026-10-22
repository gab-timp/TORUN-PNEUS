-- Libera o portal do representante (pedido-representante.html) pra um login do escritório, SEM virar
-- administrador e SEM perder o painel normal, e põe a Franciane como vendedora.
--
-- 1) user_roles.pode_acessar_portal_representante (padrão false): permissão própria, no mesmo molde da
--    pode_acessar_sem_venda. O portal só aceitava papel Representante ou administrador.
-- 2) representantes_ativos() passa a devolver também quem tem essa permissão. É a lista de vendedores do
--    sistema: alimenta o campo "Representante" do Estoque Previsto e agora também o seletor de vendedor de
--    Faturamento e Pedido (vendedor novo não depende mais de já ter uma venda lançada).
-- 3) Só o login varejo@timptrade.com.br muda: nome vira FRANCIANE (o portal liga as vendas à pessoa pelo
--    nome) e ganha a permissão do portal. Papel, telas e o resto continuam como estão.
--
-- Ordem: rode este SQL ANTES ou junto do deploy. Se o site novo chegar primeiro, nada quebra: o portal só
-- consulta a permissão de quem não é representante nem administrador, e sem a coluna esse login continua
-- sem acesso, como hoje.
--
-- Rode no SQL Editor do Supabase.

alter table user_roles add column if not exists pode_acessar_portal_representante boolean not null default false;

create or replace function representantes_ativos()
returns table(nome text)
language sql
security definer
set search_path = public
as $$
  select ur.nome
  from user_roles ur
  where ur.role = 'representante' or ur.pode_acessar_portal_representante
  order by ur.nome;
$$;

grant execute on function representantes_ativos() to authenticated;

do $$
begin
  update user_roles
  set nome = 'FRANCIANE', pode_acessar_portal_representante = true
  where email = 'varejo@timptrade.com.br';
  if not found then
    raise exception 'varejo@timptrade.com.br não tem linha em user_roles; confira o e-mail.';
  end if;
end $$;

-- Confira (deve vir 1 linha: nome FRANCIANE, permissão true, papel e telas como antes, e ela na lista de vendedores):
select u.user_id, u.email, u.nome, u.role, u.is_admin, u.pode_acessar_portal_representante, u.visible_views,
       exists (select 1 from representantes_ativos() r where r.nome = 'FRANCIANE') as na_lista_de_vendedores
from user_roles u
where u.email = 'varejo@timptrade.com.br';
