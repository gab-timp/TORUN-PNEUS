-- Nova permissão granular, mesmo padrão de pode_autorizar_gerencia
-- (sql/restringir_saida_autorizacao_gerencia.sql): dá pra liberar "Exportar
-- backup" pra alguém sem precisar torná-la admin completo (admin também
-- ganharia acesso à tela inteira de Administração, incluindo gerenciar o
-- papel de todo mundo -- pedido do usuário foi liberar só o backup).
--
-- Só controla visibilidade do botão no cliente -- o export em si só lê dado
-- já carregado em state (que já respeita as políticas de SELECT existentes),
-- não é insert/update/delete pra precisar de uma trava a mais no banco.
--
-- Aditivo e seguro -- pode rodar a qualquer momento, não quebra nada que já existe.
-- Rode no SQL Editor do Supabase.

alter table user_roles add column if not exists pode_exportar_backup boolean not null default false;
