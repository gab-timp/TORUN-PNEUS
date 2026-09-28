-- Mesmo erro do sql/previsoes_representante.sql, só que nessas duas políticas o
-- bug já estava em produção desde corrige_rls_representante.sql (rodado numa sessão
-- anterior): o "drop policy" + "create policy" ali não tinha "as restrictive", então
-- o Postgres criou as duas como PERMISSIVE em vez de RESTRICTIVE.
--
-- As duas têm uma policy PERMISSIVE "irmã" mais ampla que já concede a mesma linha
-- sem a condição extra (representante_atualiza_propria_entrega / representante
-- atualiza proprio precadastro) -- permissivas se combinam com OR, não AND, então a
-- condição extra (etapa = 'PRE_VENDA' / status = 'pendente') nunca chegava a
-- restringir nada de verdade.
--
-- Impacto real: um representante consegue hoje, via chamada direta à API (a tela já
-- esconde os botões certos, mas RLS é a barreira de verdade), atualizar a própria
-- entrega mesmo fora da Pré-venda (depois que o processo já passou pra equipe
-- interna), e atualizar/anexar no próprio pré-cadastro mesmo depois de aprovado ou
-- rejeitado. Rode este SQL no SQL Editor do Supabase.

drop policy if exists "representante atualiza propria entrega em pre-venda" on entregas;
create policy "representante atualiza propria entrega em pre-venda" on entregas
  as restrictive
  for update
  using (
    coalesce(current_user_role(), '') <> 'representante'
    or (created_by = auth.uid() and etapa = 'PRE_VENDA')
  )
  with check (
    coalesce(current_user_role(), '') <> 'representante'
    or created_by = auth.uid()
  );

drop policy if exists "representante so gerencia proprio pre-cadastro" on clientes_pendentes;
create policy "representante so gerencia proprio pre-cadastro" on clientes_pendentes
  as restrictive
  for update
  using (
    coalesce(current_user_role(), '') <> 'representante'
    or (created_by = auth.uid() and status = 'pendente')
  );

-- confira: as duas devem aparecer como RESTRICTIVE agora
select tablename, policyname, cmd, permissive, qual
from pg_policies
where tablename in ('entregas', 'clientes_pendentes')
  and policyname in (
    'representante atualiza propria entrega em pre-venda',
    'representante so gerencia proprio pre-cadastro'
  );
