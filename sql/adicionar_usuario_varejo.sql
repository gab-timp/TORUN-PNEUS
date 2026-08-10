-- O login varejo@timptrade.com.br já existe no Supabase Auth, mas nunca ganhou
-- uma linha em user_roles — por isso não aparecia no painel de Administração
-- (e provavelmente não conseguia nem entrar no sistema ainda).
--
-- Cria como Editor, não-admin. Dá pra ajustar nome/papel depois direto pela
-- aba Administração, sem precisar de SQL de novo.
--
-- Rode no SQL Editor do Supabase.

insert into user_roles (user_id, email, nome, role, is_admin)
select '82c145b0-472f-4f37-8b1e-ec98efe71c1a', 'varejo@timptrade.com.br', 'varejo@timptrade.com.br', 'editor', false
where not exists (select 1 from user_roles where user_id = '82c145b0-472f-4f37-8b1e-ec98efe71c1a');

-- Confira:
select user_id, email, nome, role, is_admin from user_roles where email = 'varejo@timptrade.com.br';
