-- CRM Atacado e Encomenda: FATURAMENTO por período (Financeiro > Faturamento) e % de comissão por executivo.
--
-- A Beth (papel "financeiro") lança o faturamento por período: escolhe De/Até (dentro de um mês), digita quanto cada
-- cliente da carteira faturou naquele intervalo e salva. O faturamento do mês é a SOMA dos lançamentos. O % de comissão é
-- um por executivo e por mês (o mês fechado guarda o % que valia; mês novo começa com o último % usado).
--
--   crm_faturamento_lancamentos  -> um lançamento: sistema, período, total, quem salvou e quando
--   crm_faturamento_itens        -> o valor de cada cliente no lançamento (o executivo é o da carteira NA HORA de salvar)
--   crm_comissao_percentual      -> % do executivo no mês (primeiro dia do mês)
--
-- Quem lê: financeiro e gestão. Quem grava: SÓ o financeiro, e só pela função crm_salvar_lancamento (as tabelas não
-- aceitam escrita direta), que confere tudo no banco: cliente efetivo da carteira do sistema, valor maior que zero,
-- período dentro de um mês. Prospect e representante não faturam; o cliente que vem por representante entra normalmente
-- (o representante só soma na tela).
--
-- ORDEM: rode ANTES de publicar a versão nova do site (crm-faturamento.js). Sem este SQL a tela Faturamento só avisa que
-- o SQL ainda não foi rodado. Pré-requisito: crm_nucleo.sql e crm_clientes.sql já rodados. Pode rodar de novo.
--
-- Rode o script INTEIRO no SQL Editor do Supabase (ele mostra só o resultado da última consulta).

-- ---------------------------------------------------------------- tabelas
create table if not exists crm_faturamento_lancamentos (
  id uuid primary key default gen_random_uuid(),
  sistema text not null check (sistema in ('atacado', 'encomenda')),
  periodo_de date not null,
  periodo_ate date not null,
  total numeric(14,2) not null check (total >= 0),
  created_by uuid default auth.uid(),
  created_by_nome text,
  created_at timestamptz not null default now(),
  check (periodo_ate >= periodo_de),
  check (extract(year from periodo_de) = extract(year from periodo_ate) and extract(month from periodo_de) = extract(month from periodo_ate))
);
create index if not exists crm_fat_lanc_idx on crm_faturamento_lancamentos (sistema, periodo_de);

create table if not exists crm_faturamento_itens (
  id uuid primary key default gen_random_uuid(),
  lancamento_id uuid not null references crm_faturamento_lancamentos(id) on delete cascade,
  sistema text not null check (sistema in ('atacado', 'encomenda')),
  cliente text not null references crm_clientes(nome) on update cascade,
  executivo_user_id uuid not null,
  executivo_nome text,
  valor numeric(14,2) not null check (valor > 0)
);
create index if not exists crm_fat_itens_lanc_idx on crm_faturamento_itens (lancamento_id);
create index if not exists crm_fat_itens_cli_idx on crm_faturamento_itens (cliente);

create table if not exists crm_comissao_percentual (
  executivo_user_id uuid not null,
  mes date not null check (extract(day from mes) = 1),
  percentual numeric(5,2) not null check (percentual >= 0 and percentual <= 100),
  atualizado_por uuid default auth.uid(),
  atualizado_em timestamptz not null default now(),
  primary key (executivo_user_id, mes)
);

alter table crm_faturamento_lancamentos enable row level security;
alter table crm_faturamento_itens enable row level security;
alter table crm_comissao_percentual enable row level security;

drop policy if exists crm_fat_lanc_select on crm_faturamento_lancamentos;
create policy crm_fat_lanc_select on crm_faturamento_lancamentos for select to authenticated
  using (current_user_crm_papel() in ('financeiro', 'gestao'));
drop policy if exists crm_fat_itens_select on crm_faturamento_itens;
create policy crm_fat_itens_select on crm_faturamento_itens for select to authenticated
  using (current_user_crm_papel() in ('financeiro', 'gestao'));
drop policy if exists crm_comissao_select on crm_comissao_percentual;
create policy crm_comissao_select on crm_comissao_percentual for select to authenticated
  using (current_user_crm_papel() in ('financeiro', 'gestao'));
-- sem política de insert/update/delete: a escrita só passa pela função abaixo

-- ---------------------------------------------------------------- salvar um lançamento
-- p_itens:       [{ "cliente": "Nome", "valor": 13500.00 }, ...]   (só clientes com valor > 0)
-- p_percentuais: [{ "executivo_user_id": "uuid", "percentual": 1.5 }, ...]   (vale para o mês do lançamento)
create or replace function crm_salvar_lancamento(p_sistema text, p_de date, p_ate date, p_itens jsonb, p_percentuais jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_total numeric := 0;
  v_nome text;
  x jsonb;
  v_cli text;
  v_valor numeric;
  v_exec uuid;
  v_exec_nome text;
  v_mes date;
begin
  if current_user_crm_papel() is distinct from 'financeiro' or not crm_pode_escrever() then
    raise exception 'Só o financeiro lança o faturamento.' using errcode = '42501';
  end if;
  if p_sistema is null or p_sistema not in ('atacado', 'encomenda') then
    raise exception 'Sistema inválido.';
  end if;
  if p_de is null or p_ate is null or p_ate < p_de then
    raise exception 'Período inválido: o "Até" não pode vir antes do "De".';
  end if;
  if extract(year from p_de) <> extract(year from p_ate) or extract(month from p_de) <> extract(month from p_ate) then
    raise exception 'O período tem que ficar dentro de um mês.';
  end if;
  if p_itens is null or jsonb_typeof(p_itens) <> 'array' or jsonb_array_length(p_itens) = 0 then
    raise exception 'Informe o faturamento de pelo menos um cliente.';
  end if;

  select coalesce(nullif(u.nome, ''), u.email) into v_nome from user_roles u where u.user_id = auth.uid();
  v_mes := date_trunc('month', p_de)::date;

  insert into crm_faturamento_lancamentos (sistema, periodo_de, periodo_ate, total, created_by_nome)
  values (p_sistema, p_de, p_ate, 0, v_nome)
  returning id into v_id;

  for x in select value from jsonb_array_elements(p_itens) loop
    v_cli := x->>'cliente';
    v_valor := (x->>'valor')::numeric;
    if v_cli is null or v_valor is null or v_valor <= 0 then
      raise exception 'Cada cliente precisa de um valor maior que zero.';
    end if;
    select c.executivo_user_id, c.executivo_nome into v_exec, v_exec_nome
    from crm_carteira c
    join crm_clientes k on k.nome = c.cliente
    where c.sistema = p_sistema and c.cliente = v_cli and k.tipo = 'cliente';
    if v_exec is null then
      raise exception 'O cliente "%" não é um cliente efetivo da carteira de %.', v_cli, p_sistema;
    end if;
    if exists (select 1 from crm_faturamento_itens i where i.lancamento_id = v_id and i.cliente = v_cli) then
      raise exception 'O cliente "%" aparece duas vezes no lançamento.', v_cli;
    end if;
    insert into crm_faturamento_itens (lancamento_id, sistema, cliente, executivo_user_id, executivo_nome, valor)
    values (v_id, p_sistema, v_cli, v_exec, v_exec_nome, round(v_valor, 2));
    v_total := v_total + round(v_valor, 2);
  end loop;

  update crm_faturamento_lancamentos set total = v_total where id = v_id;

  if p_percentuais is not null and jsonb_typeof(p_percentuais) = 'array' then
    for x in select value from jsonb_array_elements(p_percentuais) loop
      if (x->>'executivo_user_id') is null or (x->>'percentual') is null then continue; end if;
      if (x->>'percentual')::numeric < 0 or (x->>'percentual')::numeric > 100 then
        raise exception 'O percentual de comissão tem que ficar entre 0 e 100.';
      end if;
      insert into crm_comissao_percentual (executivo_user_id, mes, percentual, atualizado_por, atualizado_em)
      values ((x->>'executivo_user_id')::uuid, v_mes, round((x->>'percentual')::numeric, 2), auth.uid(), now())
      on conflict (executivo_user_id, mes) do update
        set percentual = excluded.percentual, atualizado_por = auth.uid(), atualizado_em = now();
    end loop;
  end if;

  return v_id;
end;
$$;

revoke all on function crm_salvar_lancamento(text, date, date, jsonb, jsonb) from public;
grant execute on function crm_salvar_lancamento(text, date, date, jsonb, jsonb) to authenticated;

-- ---------------------------------------------------------------- confere
select
  (select count(*) = 3 from information_schema.tables where table_name in ('crm_faturamento_lancamentos', 'crm_faturamento_itens', 'crm_comissao_percentual')) as tabelas,
  (select count(*) = 1 from pg_proc where proname = 'crm_salvar_lancamento') as funcao,
  (select count(*) = 3 from pg_policies where tablename in ('crm_faturamento_lancamentos', 'crm_faturamento_itens', 'crm_comissao_percentual')) as politicas,
  (select count(*) = 0 from pg_policies where tablename in ('crm_faturamento_lancamentos', 'crm_faturamento_itens', 'crm_comissao_percentual') and cmd <> 'SELECT') as sem_escrita_direta;
