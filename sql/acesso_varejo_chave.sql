-- Chave "Acesso ao Torun (Varejo)" por pessoa.
--
-- user_roles.pode_acessar_varejo (padrão LIGADO): quem tem a chave desligada não vê o cartão do Torun (Varejo) na escolha de
-- sistema e não abre nenhuma tela dele; abre direto os outros sistemas que tiver (Sem Venda, Atacado, Encomenda).
-- Administrador sempre tem acesso, mesmo com a chave desligada.
--
-- Todo mundo que já existe continua com o Torun LIGADO: nada muda até alguém desligar a chave em Administração > Usuários >
-- Editar acesso. Os perfis novos de Executivo e de Gestão já nascem com a chave desligada.
--
-- O bloqueio é no sistema (cartão, menu e telas). As tabelas do Varejo no banco não mudam.
--
-- ORDEM: pode rodar antes ou depois de publicar o site: sem a coluna a tela esconde a chave e todo mundo segue como hoje.
-- Rode o script INTEIRO no SQL Editor do Supabase.

alter table user_roles add column if not exists pode_acessar_varejo boolean not null default true;

notify pgrst, 'reload schema';

-- confere: a coluna existe e todos os logins atuais seguem com o Torun ligado
select
  (select count(*) = 1 from information_schema.columns where table_name = 'user_roles' and column_name = 'pode_acessar_varejo') as coluna,
  (select count(*) from user_roles where pode_acessar_varejo) as com_torun,
  (select count(*) from user_roles where not pode_acessar_varejo) as sem_torun;
