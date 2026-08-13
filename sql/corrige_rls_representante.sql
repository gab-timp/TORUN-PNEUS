-- Corrige dois bugs reais de RLS achados numa revisão de segurança (rodando
-- `select * from pg_policies` e conferindo a combinação de regras permissivas
-- x restritivas). Os dois têm a mesma causa: uma regra RESTRITIVA bloqueava
-- geral demais, sem abrir exceção pro próprio caso que uma regra PERMISSIVA
-- ao lado tentava liberar -- e no Postgres, toda restritiva vale pra TODAS as
-- permissivas ao mesmo tempo (não dá pra restringir "só essa entrada").
--
-- Rode este SQL no SQL Editor do Supabase.

-- ============================================================
-- 1) entregas: faltava a regra PERMISSIVA de UPDATE pro representante.
-- ============================================================
-- Só existia "atualizacao apenas editor" (permissiva, role='editor') e
-- "representante finaliza propria reserva" (RESTRITIVA -- só sabe tirar
-- acesso, nunca dar). Sem nenhuma permissiva liberando representante,
-- UPDATE em entregas sempre falhava pra esse papel -- inclusive
-- finalizarReservaRep() e confirmarVendaRep() no portal do representante.
--
-- Além disso, a restritiva antiga só cobria reserva_status='pendente', mas
-- "Confirmar venda" (confirmarVendaRep) aparece pra QUALQUER pedido em
-- Pré-venda, com ou sem reserva ativa (conferido em
-- pedido-representante.js:1153) -- então a condição certa é etapa='PRE_VENDA',
-- que cobre os dois casos (finalizar reserva acontece enquanto ainda está em
-- Pré-venda; confirmar venda é exatamente a transição de saída dela).

drop policy if exists "representante finaliza propria reserva" on entregas;
create policy "representante atualiza propria entrega em pre-venda" on entregas for update
  using (
    coalesce(current_user_role(), '') <> 'representante'
    or (created_by = auth.uid() and etapa = 'PRE_VENDA')
  )
  with check (
    coalesce(current_user_role(), '') <> 'representante'
    or created_by = auth.uid()
  );

-- A permissiva que faltava -- sem ela, a restritiva acima nunca tinha o que
-- restringir (não dá pra restringir um acesso que nunca foi concedido).
drop policy if exists "representante atualiza propria entrega" on entregas;
create policy "representante atualiza propria entrega" on entregas for update
  using (created_by = auth.uid() and current_user_role() = 'representante')
  with check (created_by = auth.uid() and current_user_role() = 'representante');

-- Reforço: created_by tem que ser sempre o próprio usuário na hora de criar
-- o pedido -- hoje isso só era garantido pelo app.js mandar certo, não pela
-- regra em si.
drop policy if exists "representante insere entregas" on entregas;
create policy "representante insere entregas" on entregas for insert
  with check (current_user_role() = 'representante' and created_by = auth.uid());

-- ============================================================
-- 2) clientes_pendentes: a permissiva de auto-edição existia, mas uma
--    restritiva vizinha bloqueava ela sem querer.
-- ============================================================
-- "representante atualiza proprio precadastro" (permissiva, própria linha)
-- já existia certa. Mas "representante nao gerencia pre-cadastros"
-- (restritiva, só "role <> representante", sem exceção) barrava TODO
-- representante em qualquer UPDATE -- inclusive no próprio registro, matando
-- a função de anexar arquivo no pré-cadastro.

drop policy if exists "representante nao gerencia pre-cadastros" on clientes_pendentes;
create policy "representante so gerencia proprio pre-cadastro" on clientes_pendentes for update
  using (
    coalesce(current_user_role(), '') <> 'representante'
    or (created_by = auth.uid() and status = 'pendente')
  );

-- Mesmo reforço de created_by na hora de criar o pré-cadastro.
drop policy if exists "autenticado insere pre-cadastro" on clientes_pendentes;
create policy "autenticado insere pre-cadastro" on clientes_pendentes for insert
  with check (auth.role() = 'authenticated' and created_by = auth.uid());

-- Confira depois de rodar (as duas devem aparecer com a condição nova):
select tablename, policyname, cmd, permissive, qual, with_check
from pg_policies
where tablename in ('entregas', 'clientes_pendentes') and cmd in ('UPDATE', 'INSERT')
order by tablename, cmd;
