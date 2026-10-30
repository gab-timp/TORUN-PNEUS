-- CRM: EDITAR o cliente (nome, tipo, representante) e TROCAR o executivo responsável, com registro das mudanças.
--
--   crm_editar_cliente(p_cliente, p_nome, p_tipo, p_representante)  -> devolve o nome (novo, se mudou)
--   crm_trocar_executivo(p_sistema, p_cliente, p_executivo)
--   crm_cliente_mudancas                                           -> quem mudou o quê e quando (só leitura na tela)
--
-- Quem usa: "Editar cliente" = gestão (e administrador) em qualquer cliente; executivo só nos clientes da própria carteira.
-- "Trocar executivo" = só gestão e administrador. Tudo passa por estas funções (security definer), que conferem no banco.
--
-- Regras:
--   * Nome: muda em todo o CRM (Atacado e Encomenda: carteira, contatos, ligações, histórico de etapas, faturamento, perfil),
--     porque as tabelas apontam para crm_clientes(nome) com "on update cascade". O cadastro do Torun (Varejo) não muda.
--     Não aceita nome vazio nem repetido (sem diferenciar maiúscula de minúscula).
--   * Tipo: aqui só cliente efetivo -> prospect. Prospect vira cliente pelo fluxo que já existe (Tornar cliente efetivo).
--     Cliente só volta a prospect se NUNCA teve faturamento lançado. Para isso a guarda de tipo (crm_clientes_tipo_guarda) passa
--     a aceitar a volta quando a função liga um sinal interno; qualquer outra atualização direta continua barrada.
--   * Representante: trocar ou tirar só muda o vínculo; o executivo do cliente continua o mesmo.
--   * Trocar executivo: só do sistema indicado; o novo responsável precisa ser executivo do sistema ou gestão com carteira
--     própria (a mesma regra de crm_executivos). Ligações antigas continuam com quem ligou; lançamentos de faturamento já
--     salvos não mudam; os próximos usam o executivo novo (a Beth lança com o executivo da carteira na hora de salvar).
--   * Representantes não se editam aqui.
--
-- ORDEM: rode ANTES de publicar a versão nova do site (crm-editar.js). Pré-requisitos: crm_nucleo, crm_clientes, crm_prospects,
-- crm_representantes, crm_faturamento. Pode rodar de novo. Rode o script INTEIRO no SQL Editor do Supabase (ele mostra só o
-- resultado da última consulta).

-- ---------------------------------------------------------------- registro das mudanças
create table if not exists crm_cliente_mudancas (
  id uuid primary key default gen_random_uuid(),
  cliente text not null references crm_clientes(nome) on update cascade on delete cascade,
  campo text not null check (campo in ('nome', 'tipo', 'representante', 'executivo')),
  sistema text check (sistema is null or sistema in ('atacado', 'encomenda')),
  de text,
  para text,
  por_user_id uuid default auth.uid(),
  por_nome text,
  quando timestamptz not null default now()
);
create index if not exists crm_cliente_mudancas_idx on crm_cliente_mudancas (cliente, quando desc);

alter table crm_cliente_mudancas enable row level security;

-- lê quem enxerga o cliente na carteira (a carteira já filtra por papel)
drop policy if exists crm_cliente_mudancas_select on crm_cliente_mudancas;
create policy crm_cliente_mudancas_select on crm_cliente_mudancas for select to authenticated
  using (exists (select 1 from crm_carteira c where c.cliente = crm_cliente_mudancas.cliente));
-- sem política de insert/update/delete: a escrita só passa pelas funções abaixo

-- ---------------------------------------------------------------- guarda do tipo (volta a prospect só pela função)
create or replace function crm_clientes_tipo_guarda() returns trigger
language plpgsql as $$
begin
  if tg_op = 'UPDATE' then
    if old.tipo = 'cliente' and new.tipo = 'prospect' and coalesce(current_setting('crm.voltar_prospect', true), '') <> 'on' then
      raise exception 'Cliente efetivo não volta a ser prospect.';
    end if;
    if (old.tipo = 'representante') <> (new.tipo = 'representante') then
      raise exception 'Representante não muda de tipo.';
    end if;
    if old.tipo = 'prospect' and new.tipo = 'cliente' then
      new.convertido_em := now();
      new.convertido_por := auth.uid();
    end if;
  end if;
  return new;
end $$;

-- ---------------------------------------------------------------- editar o cliente
create or replace function crm_editar_cliente(p_cliente text, p_nome text, p_tipo text, p_representante text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_papel text := current_user_crm_papel();
  v_cli crm_clientes%rowtype;
  v_nome text := regexp_replace(btrim(coalesce(p_nome, '')), '\s+', ' ', 'g');
  v_rep text := nullif(btrim(coalesce(p_representante, '')), '');
  v_por text;
begin
  if v_papel not in ('executivo', 'gestao') or not crm_pode_escrever() then
    raise exception 'Sem permissão para editar clientes.' using errcode = '42501';
  end if;
  select * into v_cli from crm_clientes where nome = p_cliente;
  if not found then
    raise exception 'Cliente não encontrado.';
  end if;
  if v_cli.tipo = 'representante' then
    raise exception 'Representantes não se editam por aqui.';
  end if;
  if v_papel = 'executivo' and not exists (select 1 from crm_carteira c where c.cliente = p_cliente and c.executivo_user_id = auth.uid()) then
    raise exception 'Só o executivo responsável (ou a gestão) edita este cliente.' using errcode = '42501';
  end if;
  if v_nome = '' then
    raise exception 'Informe o nome do cliente.';
  end if;
  if p_tipo is null or p_tipo not in ('cliente', 'prospect') then
    raise exception 'Tipo inválido.';
  end if;
  if exists (select 1 from crm_clientes k where lower(k.nome) = lower(v_nome) and k.nome <> p_cliente) then
    raise exception 'Já existe um cadastro com o nome "%".', v_nome;
  end if;
  if p_tipo = 'cliente' and v_cli.tipo = 'prospect' then
    raise exception 'Para tornar um prospect cliente efetivo use o botão "Tornar cliente efetivo".';
  end if;
  if p_tipo = 'prospect' and v_cli.tipo = 'cliente' and exists (select 1 from crm_faturamento_itens i where i.cliente = p_cliente) then
    raise exception 'Este cliente já teve faturamento lançado, então não pode voltar a ser prospect.';
  end if;

  select coalesce(nullif(u.nome, ''), u.email) into v_por from user_roles u where u.user_id = auth.uid();

  if v_nome <> v_cli.nome then
    update crm_clientes set nome = v_nome where nome = p_cliente;
    insert into crm_cliente_mudancas (cliente, campo, de, para, por_nome) values (v_nome, 'nome', p_cliente, v_nome, v_por);
  end if;
  if p_tipo <> v_cli.tipo then
    perform set_config('crm.voltar_prospect', 'on', true);
    update crm_clientes set tipo = p_tipo where nome = v_nome;
    perform set_config('crm.voltar_prospect', 'off', true);
    insert into crm_cliente_mudancas (cliente, campo, de, para, por_nome)
    values (v_nome, 'tipo', case v_cli.tipo when 'cliente' then 'Cliente efetivo' else 'Prospect' end, case p_tipo when 'cliente' then 'Cliente efetivo' else 'Prospect' end, v_por);
  end if;
  if v_rep is distinct from v_cli.representante then
    update crm_clientes set representante = v_rep where nome = v_nome;
    insert into crm_cliente_mudancas (cliente, campo, de, para, por_nome) values (v_nome, 'representante', v_cli.representante, v_rep, v_por);
  end if;
  return v_nome;
end;
$$;

-- ---------------------------------------------------------------- trocar o executivo
create or replace function crm_trocar_executivo(p_sistema text, p_cliente text, p_executivo uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_orig crm_carteira%rowtype;
  v_novo text;
  v_por text;
begin
  if current_user_crm_papel() is distinct from 'gestao' or not crm_pode_escrever() then
    raise exception 'Só a gestão troca o executivo de um cliente.' using errcode = '42501';
  end if;
  if p_sistema not in ('atacado', 'encomenda') then
    raise exception 'Sistema inválido.';
  end if;
  select * into v_orig from crm_carteira where sistema = p_sistema and cliente = p_cliente;
  if not found then
    raise exception 'O cliente "%" não está na carteira de %.', p_cliente, p_sistema;
  end if;
  if exists (select 1 from crm_clientes k where k.nome = p_cliente and k.tipo = 'representante') then
    raise exception 'Representantes não trocam de executivo por aqui.';
  end if;
  if v_orig.executivo_user_id = p_executivo then
    raise exception 'Este já é o executivo responsável.';
  end if;
  select coalesce(nullif(u.nome, ''), u.email) into v_novo
  from user_roles u
  where u.user_id = p_executivo and (
      (
        u.crm_papel = 'executivo'
        and p_sistema = any(coalesce(u.crm_sistemas, case when u.crm_sistema is not null then array[u.crm_sistema] else array[]::text[] end))
      )
      or (
        u.crm_tem_carteira
        and coalesce(u.crm_papel, case when u.is_admin then 'gestao' end) = 'gestao'
      )
    );
  if v_novo is null then
    raise exception 'Escolha um executivo do sistema %.', p_sistema;
  end if;

  select coalesce(nullif(u.nome, ''), u.email) into v_por from user_roles u where u.user_id = auth.uid();

  update crm_carteira set executivo_user_id = p_executivo, executivo_nome = v_novo where id = v_orig.id;
  insert into crm_cliente_mudancas (cliente, campo, sistema, de, para, por_nome)
  values (p_cliente, 'executivo', p_sistema, v_orig.executivo_nome, v_novo, v_por);
end;
$$;

revoke all on function crm_editar_cliente(text, text, text, text) from public;
grant execute on function crm_editar_cliente(text, text, text, text) to authenticated;
revoke all on function crm_trocar_executivo(text, text, uuid) from public;
grant execute on function crm_trocar_executivo(text, text, uuid) to authenticated;

-- ---------------------------------------------------------------- confere
select
  (select count(*) = 1 from information_schema.tables where table_name = 'crm_cliente_mudancas') as tabela,
  (select count(*) = 2 from pg_proc where proname in ('crm_editar_cliente', 'crm_trocar_executivo')) as funcoes,
  (select count(*) = 1 from pg_policies where tablename = 'crm_cliente_mudancas') as politica,
  (select count(*) = 0 from pg_policies where tablename = 'crm_cliente_mudancas' and cmd <> 'SELECT') as sem_escrita_direta,
  (select prosrc ilike '%crm.voltar_prospect%' from pg_proc where proname = 'crm_clientes_tipo_guarda') as guarda_atualizada;
