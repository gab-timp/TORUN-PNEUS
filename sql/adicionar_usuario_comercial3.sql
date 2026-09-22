-- Cria a linha de permissões pro novo login comercial3@timptrade.com.br,
-- copiando exatamente o que varejo@timptrade.com.br tem hoje (role, admin,
-- telas visíveis, tabelas editáveis, autorizações extras) -- assim não
-- precisa hardcodar valor nenhum, e se o perfil do varejo for ajustado
-- depois pela aba Administração, é só rodar de novo que ele acompanha.
--
-- Pré-requisito: o login comercial3@timptrade.com.br já precisa existir no
-- Supabase Auth (Authentication > Users > Add user, com "Auto Confirm User"
-- marcado). Sem isso a consulta não encontra o auth.users.id e não insere nada.
--
-- Rode no SQL Editor do Supabase.

insert into user_roles (user_id, email, nome, role, is_admin, visible_views, editable_tables, pode_autorizar_gerencia, pode_exportar_backup)
select nu.id, nu.email, nu.email, v.role, v.is_admin, v.visible_views, v.editable_tables, v.pode_autorizar_gerencia, v.pode_exportar_backup
from auth.users nu
cross join user_roles v
where nu.email = 'comercial3@timptrade.com.br'
  and v.email = 'varejo@timptrade.com.br'
  and not exists (select 1 from user_roles where user_id = nu.id);

-- Confira:
select user_id, email, nome, role, is_admin, visible_views, editable_tables, pode_autorizar_gerencia, pode_exportar_backup
from user_roles
where email in ('varejo@timptrade.com.br', 'comercial3@timptrade.com.br');
