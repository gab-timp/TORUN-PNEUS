-- Botão "Excluir de vez" na Coleta, só pra admin, só em romaneio já cancelado (nunca num
-- assinado/ativo -- isso continua existindo só pra sempre, cancelar é o único jeito de "remover"
-- pela UI normal). Rode no SQL Editor do Supabase.

drop policy if exists "admin exclui romaneio cancelado" on romaneios;
create policy "admin exclui romaneio cancelado" on romaneios for delete
  using (current_user_is_admin() and cancelado);

-- limpeza do arquivo de assinatura no Storage, se um dia existir um cancelado com assinatura
-- (hoje não existe: cancelarRomaneioAtual() recusa cancelar um já assinado) -- defensivo.
drop policy if exists "admin apaga assinatura romaneio" on storage.objects;
create policy "admin apaga assinatura romaneio" on storage.objects for delete using (
  bucket_id = 'romaneios-assinaturas' and current_user_is_admin()
);

-- Confira depois de rodar (as duas políticas devem aparecer):
select policyname, cmd from pg_policies
where (tablename = 'romaneios' and policyname = 'admin exclui romaneio cancelado')
   or (tablename = 'objects' and policyname = 'admin apaga assinatura romaneio');
