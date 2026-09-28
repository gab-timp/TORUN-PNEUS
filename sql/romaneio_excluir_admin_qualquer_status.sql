-- Estende o "Excluir de vez" da Coleta: admin passa a poder excluir romaneio em qualquer
-- status (assinado, aguardando assinatura ou cancelado), não só cancelado. Continua só
-- admin (current_user_is_admin()) -- ninguém mais vê ou consegue acionar esse delete,
-- reforçado aqui na RLS, não só escondendo o botão na UI. Rode no SQL Editor do Supabase.

drop policy if exists "admin exclui romaneio cancelado" on romaneios;
create policy "admin exclui romaneio" on romaneios for delete
  using (current_user_is_admin());

-- a política de limpeza da assinatura no Storage já não tinha a restrição de "cancelado"
-- (sql/romaneio_excluir_admin.sql) -- nada a mudar nela.

-- Confira depois de rodar:
select policyname, cmd from pg_policies
where tablename = 'romaneios' and policyname = 'admin exclui romaneio';
