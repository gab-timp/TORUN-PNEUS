-- Corrige: o select de "Representante" no formulário de Estoque Previsto vinha vazio
-- pra qualquer usuário sem is_admin=true. user_roles só libera SELECT de "própria
-- linha" pra quem não é admin ("usuario le propria linha"/"usuario le seu proprio
-- papel", ambas user_id = auth.uid()) -- um editor comum nunca enxerga a linha de um
-- representante, então `select nome from user_roles where role = 'representante'`
-- sempre voltava 0 linhas pra ele (sem erro nenhum, RLS filtra em silêncio).
--
-- RPC security definer, mesmo padrão de sql/rpc_saldo_em_aberto_clientes.sql: expõe só
-- o nome de quem é representante, não a linha inteira (sem email/telefone/permissões).

create or replace function representantes_ativos()
returns table(nome text)
language sql
security definer
set search_path = public
as $$
  select ur.nome
  from user_roles ur
  where ur.role = 'representante'
  order by ur.nome;
$$;

grant execute on function representantes_ativos() to authenticated;

-- confira: deve trazer o nome de cada representante cadastrado
select * from representantes_ativos();
