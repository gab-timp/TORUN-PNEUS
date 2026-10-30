-- CRM: levar um cliente que já está na carteira de um sistema (Atacado ou Encomenda) também para a carteira do outro.
--
-- Usado pela caixa "Este cliente também compra no outro sistema" do assistente de adicionar cliente e pelo botão
-- "Levar também para o ..." da ficha. O perfil do cliente (crm_clientes, filiais, pneus) já é um só para os dois sistemas; o que
-- se cria é a linha da carteira do outro sistema (com o executivo escolhido) e, se pedido, uma cópia dos contatos. Ligações,
-- follow-ups e etapa começam do zero lá. Depois de criado, os dois são independentes.
--
-- Por que funções: o executivo de um sistema não enxerga nem grava na carteira do outro (RLS), e a lista de executivos do outro
-- sistema também não aparece para ele. As duas funções abaixo (security definer) conferem tudo no banco:
--   crm_executivos_outro_sistema(p_origem)  -> executivos do outro sistema (para escolher o responsável)
--   crm_levar_cliente(p_origem, p_cliente, p_exec, p_contatos)  -> cria a carteira de lá
-- Quem pode: gestão (qualquer cliente) e o executivo dono do cliente no sistema de origem. Só cliente efetivo (prospect e
-- representante não vão). Se o cliente já está na carteira do outro sistema, a função avisa com quem ele está e não grava nada.
--
-- ORDEM: rode ANTES de publicar a versão nova do site (crm-perfil.js v7). Pré-requisito: crm_nucleo.sql e crm_clientes.sql.
-- Os responsáveis possíveis seguem a mesma regra de crm_executivos(): executivos que atendem o sistema (inclusive pela lista
-- crm_sistemas) e a gestão com carteira própria.
-- Pode rodar de novo. Rode o script INTEIRO no SQL Editor do Supabase (ele mostra só o resultado da última consulta).

create or replace function crm_executivos_outro_sistema(p_origem text)
returns table(user_id uuid, nome text)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_destino text;
begin
  if p_origem not in ('atacado', 'encomenda') then return; end if;
  if current_user_crm_papel() not in ('executivo', 'gestao') or not crm_pode_sistema(p_origem) then return; end if;
  v_destino := case when p_origem = 'atacado' then 'encomenda' else 'atacado' end;
  return query
    select u.user_id, coalesce(nullif(u.nome, ''), u.email)
    from user_roles u
    where (
        u.crm_papel = 'executivo'
        and v_destino = any(coalesce(u.crm_sistemas, case when u.crm_sistema is not null then array[u.crm_sistema] else array[]::text[] end))
      )
      or (
        u.crm_tem_carteira
        and coalesce(u.crm_papel, case when u.is_admin then 'gestao' end) = 'gestao'
      )
    order by 2;
end;
$$;

create or replace function crm_levar_cliente(p_origem text, p_cliente text, p_exec uuid, p_contatos boolean default true)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_destino text;
  v_orig crm_carteira%rowtype;
  v_exec_nome text;
  v_ocupado text;
  v_id uuid;
begin
  if p_origem not in ('atacado', 'encomenda') then
    raise exception 'Sistema inválido.';
  end if;
  if current_user_crm_papel() not in ('executivo', 'gestao') or not crm_pode_escrever() or not crm_pode_sistema(p_origem) then
    raise exception 'Sem permissão para levar este cliente para o outro sistema.' using errcode = '42501';
  end if;
  v_destino := case when p_origem = 'atacado' then 'encomenda' else 'atacado' end;

  select * into v_orig from crm_carteira where sistema = p_origem and cliente = p_cliente;
  if not found then
    raise exception 'O cliente "%" não está na carteira de %.', p_cliente, p_origem;
  end if;
  if current_user_crm_papel() = 'executivo' and v_orig.executivo_user_id is distinct from auth.uid() then
    raise exception 'Só o executivo responsável (ou a gestão) leva o cliente para o outro sistema.' using errcode = '42501';
  end if;
  if exists (select 1 from crm_clientes k where k.nome = p_cliente and k.tipo <> 'cliente') then
    raise exception 'Só cliente efetivo pode ser levado para o outro sistema (prospect e representante não).';
  end if;

  select c.executivo_nome into v_ocupado from crm_carteira c where c.sistema = v_destino and c.cliente = p_cliente;
  if found then
    raise exception '"%" já está na carteira de %, com %.', p_cliente, v_destino, coalesce(v_ocupado, 'outro executivo');
  end if;

  select coalesce(nullif(u.nome, ''), u.email) into v_exec_nome
  from user_roles u
  where u.user_id = p_exec and ((
        u.crm_papel = 'executivo'
        and v_destino = any(coalesce(u.crm_sistemas, case when u.crm_sistema is not null then array[u.crm_sistema] else array[]::text[] end))
      )
      or (
        u.crm_tem_carteira
        and coalesce(u.crm_papel, case when u.is_admin then 'gestao' end) = 'gestao'
      ));
  if v_exec_nome is null then
    raise exception 'Escolha um executivo do sistema %.', v_destino;
  end if;

  insert into crm_carteira (sistema, cliente, executivo_user_id, executivo_nome, tambem_outro_sistema)
  values (v_destino, p_cliente, p_exec, v_exec_nome, true)
  returning id into v_id;

  update crm_carteira set tambem_outro_sistema = true where id = v_orig.id and not tambem_outro_sistema;

  if p_contatos then
    insert into crm_contatos (sistema, cliente, nome, cargo, telefone, whatsapp, email, principal)
    select v_destino, c.cliente, c.nome, c.cargo, c.telefone, c.whatsapp, c.email, c.principal
    from crm_contatos c where c.sistema = p_origem and c.cliente = p_cliente;
  end if;

  return v_id;
end;
$$;

revoke all on function crm_executivos_outro_sistema(text) from public;
grant execute on function crm_executivos_outro_sistema(text) to authenticated;
revoke all on function crm_levar_cliente(text, text, uuid, boolean) from public;
grant execute on function crm_levar_cliente(text, text, uuid, boolean) to authenticated;

-- ---------------------------------------------------------------- confere
select
  (select count(*) = 1 from pg_proc where proname = 'crm_executivos_outro_sistema') as lista_executivos,
  (select count(*) = 1 from pg_proc where proname = 'crm_levar_cliente') as levar_cliente;
