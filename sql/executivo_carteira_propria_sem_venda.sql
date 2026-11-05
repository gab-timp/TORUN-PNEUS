-- SEM VENDA: o executivo só enxerga os clientes da PRÓPRIA carteira (Atacado/Encomenda).
--
-- O que muda (só para quem tem o papel "executivo" no CRM; gestão, financeiro, administrador e quem usa o Sem Venda sem
-- papel no CRM continuam vendo tudo, como hoje):
--   1) sv_clientes_do_crm(): a lista de clientes do Sem Venda (tela Clientes e escolha do cliente na Reserva) devolve
--      só os clientes que estão na carteira do executivo logado.
--   2) Reservas e vendas (sv_reservas): o executivo só LÊ, GRAVA e ALTERA direto na tabela as reservas dos clientes dele.
--   3) sv_reservas_lista(): a tela carrega as reservas por esta função. Ela devolve TODAS as reservas (o executivo precisa
--      delas para o saldo disponível ficar certo e não reservar mais do que existe), mas nas reservas de clientes que não
--      são dele troca o nome do cliente (e a observação) por "Outro executivo". Quantidades, produto, processo e situação
--      continuam iguais. Isso é feito no servidor, não só na tela.
--   Os processos do Estoque Previsto continuam visíveis por inteiro para todos.
--
-- ORDEM: rode ANTES de publicar o site novo (semvenda.js v43). Se o site novo chegar primeiro, ele cai na leitura antiga
-- das reservas e nada quebra, só que sem a máscara. Pode rodar de novo. Rode o script INTEIRO no SQL Editor do Supabase.

-- ---------------------------------------------------------------- 1) clientes do Sem Venda
create or replace function sv_clientes_do_crm()
returns table (
  id text, nome text, tipo_pessoa text, documento text, razao_social text, contato text, telefone text, email text,
  cep text, endereco text, cidade text, estado text, obs text, unidade_negocio text, sistema_crm text, created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not (current_user_pode_acessar_sem_venda() or current_user_crm_papel() is not null) then
    return;
  end if;
  return query
  select k.id, k.nome, k.tipo_pessoa, k.documento, k.razao_social, k.contato, k.telefone, k.email,
         k.cep, k.endereco, k.cidade, k.estado, k.obs,
         case
           when exists (select 1 from crm_carteira c where c.cliente = k.nome and c.sistema = 'atacado')
            and exists (select 1 from crm_carteira c where c.cliente = k.nome and c.sistema = 'encomenda') then 'AMBOS'
           when exists (select 1 from crm_carteira c where c.cliente = k.nome and c.sistema = 'atacado') then 'ATACADO'
           when exists (select 1 from crm_carteira c where c.cliente = k.nome and c.sistema = 'encomenda') then 'ENCOMENDA'
           else coalesce((select s.unidade_negocio from sv_clientes s where lower(btrim(s.nome)) = lower(btrim(k.nome)) limit 1), 'AMBOS')
         end,
         case
           when exists (select 1 from crm_carteira c where c.cliente = k.nome and c.sistema = 'atacado')
            and exists (select 1 from crm_carteira c where c.cliente = k.nome and c.sistema = 'encomenda') then 'Atacado e Encomenda'
           when exists (select 1 from crm_carteira c where c.cliente = k.nome and c.sistema = 'atacado') then 'Atacado'
           when exists (select 1 from crm_carteira c where c.cliente = k.nome and c.sistema = 'encomenda') then 'Encomenda'
           else null
         end,
         k.created_at
  from crm_clientes k
  where k.tipo = 'cliente'
    -- executivo: só quem está na carteira dele
    and (current_user_crm_papel() is distinct from 'executivo'
         or exists (select 1 from crm_carteira w where w.cliente = k.nome and w.executivo_user_id = auth.uid()))
  order by k.nome;
end $$;
grant execute on function sv_clientes_do_crm() to authenticated;

-- ---------------------------------------------------------------- 2) reservas direto na tabela
drop policy if exists "sem venda le" on sv_reservas;
create policy "sem venda le" on sv_reservas for select
  using (
    current_user_pode_acessar_sem_venda()
    and (current_user_crm_papel() is distinct from 'executivo'
         or exists (select 1 from crm_carteira c where c.cliente = sv_reservas.cliente and c.executivo_user_id = auth.uid()))
  );

drop policy if exists "sem venda insere" on sv_reservas;
create policy "sem venda insere" on sv_reservas for insert
  with check (
    current_user_pode_acessar_sem_venda() and current_user_role() = 'editor'
    and (current_user_crm_papel() is distinct from 'executivo'
         or exists (select 1 from crm_carteira c where c.cliente = sv_reservas.cliente and c.executivo_user_id = auth.uid()))
  );

drop policy if exists "sem venda atualiza" on sv_reservas;
create policy "sem venda atualiza" on sv_reservas for update
  using (
    current_user_pode_acessar_sem_venda() and current_user_role() = 'editor'
    and (current_user_crm_papel() is distinct from 'executivo'
         or exists (select 1 from crm_carteira c where c.cliente = sv_reservas.cliente and c.executivo_user_id = auth.uid()))
  )
  with check (current_user_pode_acessar_sem_venda() and current_user_role() = 'editor');

drop policy if exists "sem venda exclui" on sv_reservas;
create policy "sem venda exclui" on sv_reservas for delete
  using (
    current_user_pode_acessar_sem_venda() and current_user_role() = 'editor'
    and (current_user_crm_papel() is distinct from 'executivo'
         or exists (select 1 from crm_carteira c where c.cliente = sv_reservas.cliente and c.executivo_user_id = auth.uid()))
  );

-- ---------------------------------------------------------------- 3) lista de reservas com o nome escondido
-- Todas as reservas (para o saldo bater); para o executivo, as de clientes que não são dele saem como "Outro executivo".
create or replace function sv_reservas_lista()
returns setof sv_reservas
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_executivo boolean;
begin
  if not current_user_pode_acessar_sem_venda() then
    return;
  end if;
  v_executivo := current_user_crm_papel() = 'executivo';
  return query
  select (jsonb_populate_record(
           null::sv_reservas,
           case when v_executivo
                  and not exists (select 1 from crm_carteira c where c.cliente = r.cliente and c.executivo_user_id = auth.uid())
                then to_jsonb(r) || jsonb_build_object('cliente', 'Outro executivo', 'obs', null)
                else to_jsonb(r)
           end)).*
  from sv_reservas r
  order by r.created_at desc;
end $$;
revoke all on function sv_reservas_lista() from public;
grant execute on function sv_reservas_lista() to authenticated;

notify pgrst, 'reload schema';

-- ---------------------------------------------------------------- confere (rode o script inteiro: mostra só esta última consulta)
select
  (select count(*) = 4 from pg_policies where tablename = 'sv_reservas') as quatro_politicas_reservas,
  (select count(*) = 1 from pg_proc where proname = 'sv_reservas_lista') as funcao_reservas,
  (select count(*) = 1 from pg_proc where proname = 'sv_clientes_do_crm') as funcao_clientes;
