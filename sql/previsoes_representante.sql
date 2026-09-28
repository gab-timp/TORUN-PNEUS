-- Estoque previsto por representante: permite vincular um processo previsto a um
-- representante (select no formulário admin) e mostrar isso pra ele no portal.
--
-- previsoes já tem RLS ativo com uma restritiva "representante nao le previsoes"
-- (coalesce(current_user_role(),'') <> 'representante', sem exceção nenhuma) -- mesmo
-- padrão de bug já corrigido em entregas/clientes_pendentes (corrige_rls_representante.sql):
-- bloqueia geral demais, sem abrir exceção pro caso que a gente quer liberar agora.
-- A correção só ACRESCENTA uma exceção (OR) -- não mexe em UPDATE/INSERT/DELETE
-- (continuam só editor) nem tira o acesso que editor/admin/viewer já têm.

alter table previsoes add column if not exists representante text;

drop policy if exists "representante nao le previsoes" on previsoes;
create policy "representante nao le previsoes" on previsoes
  for select
  using (
    coalesce(current_user_role(), '') <> 'representante'
    or exists (
      select 1 from user_roles ur
      where ur.user_id = auth.uid()
        and trim(lower(ur.nome)) = trim(lower(previsoes.representante))
    )
  );

create index if not exists idx_previsoes_representante on previsoes (representante);

-- confira: a policy deve aparecer com a condição nova (o "or exists(...)" no final de qual)
select policyname, cmd, permissive, qual
from pg_policies
where tablename = 'previsoes' and policyname = 'representante nao le previsoes';
