-- CRM: EDITAR representante, EXCLUIR representante e EXCLUIR cliente.
--
--   crm_editar_representante(p_nome_atual, p_nome, p_documento, p_contato, p_telefone, p_cidade, p_estado, p_observacao) -> nome (novo, se mudou)
--   crm_excluir_cliente(p_cliente)
--   crm_excluir_representante(p_representante)
--
-- Regras (combinadas em 19/11/2026):
--   * Editar representante: gestão em qualquer um; executivo só nos da própria carteira. O nome muda em cascata
--     (clientes dele, link e login do painel, percentuais e comissões), pelas chaves "on update cascade".
--   * Excluir cliente: só gestão. RECUSA se o cliente tem faturamento lançado ou reserva no Sem Venda. Sem isso, apaga
--     ligações, histórico de etapas, contatos, negociações, perfil, filiais, pneus e o registro de mudanças, e tira das carteiras.
--     O cadastro do Torun (Varejo) não é tocado.
--   * Excluir representante: só gestão. Os clientes dele continuam na carteira, apenas sem representante. O link e os
--     percentuais/comissões dele somem; o login do painel perde o vínculo (a conta continua existindo, sem acesso ao painel).
--   * Tudo passa por estas funções (security definer), que conferem permissão e regras no banco.
--
-- ORDEM: rode ANTES de publicar a versão nova do site (crm-editar.js v3). Pré-requisitos: crm_nucleo, crm_clientes,
-- crm_representantes, crm_faturamento, crm_editar_cliente. Pode rodar de novo. Rode o script INTEIRO no SQL Editor do
-- Supabase (ele mostra só o resultado da última consulta).

-- ---------------------------------------------------------------- editar representante
create or replace function crm_editar_representante(
  p_nome_atual text, p_nome text, p_documento text, p_contato text, p_telefone text, p_cidade text, p_estado text, p_observacao text
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_papel text := current_user_crm_papel();
  v_nome text := regexp_replace(btrim(coalesce(p_nome, '')), '\s+', ' ', 'g');
  v_doc text := nullif(btrim(coalesce(p_documento, '')), '');
begin
  if v_papel not in ('executivo', 'gestao') or not crm_pode_escrever() then
    raise exception 'Sem permissão para editar representantes.' using errcode = '42501';
  end if;
  if not exists (select 1 from crm_clientes where nome = p_nome_atual and tipo = 'representante') then
    raise exception 'Representante não encontrado.';
  end if;
  if v_papel = 'executivo' and not exists (select 1 from crm_carteira c where c.cliente = p_nome_atual and c.executivo_user_id = auth.uid()) then
    raise exception 'Só o executivo responsável (ou a gestão) edita este representante.' using errcode = '42501';
  end if;
  if v_nome = '' then
    raise exception 'Informe o nome do representante.';
  end if;
  if exists (select 1 from crm_clientes k where lower(btrim(k.nome)) = lower(v_nome) and k.nome <> p_nome_atual) then
    raise exception 'Já existe um cadastro com o nome "%".', v_nome;
  end if;
  if v_doc is not null and length(regexp_replace(v_doc, '\D', '', 'g')) >= 11
     and exists (select 1 from crm_clientes k where k.nome <> p_nome_atual and regexp_replace(coalesce(k.documento, ''), '\D', '', 'g') = regexp_replace(v_doc, '\D', '', 'g')) then
    raise exception 'Já existe um cadastro com este CNPJ/CPF.';
  end if;

  update crm_clientes set
    nome = v_nome,
    documento = v_doc,
    contato = nullif(btrim(coalesce(p_contato, '')), ''),
    telefone = nullif(btrim(coalesce(p_telefone, '')), ''),
    cidade = nullif(btrim(coalesce(p_cidade, '')), ''),
    estado = nullif(upper(btrim(coalesce(p_estado, ''))), ''),
    observacao = nullif(btrim(coalesce(p_observacao, '')), '')
  where nome = p_nome_atual;
  return v_nome;
end;
$$;

-- ---------------------------------------------------------------- apaga o que prende o cadastro (uso interno)
create or replace function crm_apagar_cadastro(p_nome text) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from crm_ligacoes where cliente = p_nome;
  delete from crm_etapa_historico where cliente = p_nome;
  delete from crm_carteira where cliente = p_nome; -- contatos e negociações vão junto (on delete cascade)
  delete from crm_clientes where nome = p_nome;    -- perfil, filiais, pneus, mudanças, link e comissões vão junto
end;
$$;
revoke all on function crm_apagar_cadastro(text) from public;
revoke all on function crm_apagar_cadastro(text) from authenticated;

-- ---------------------------------------------------------------- excluir cliente
create or replace function crm_excluir_cliente(p_cliente text) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_fat int;
  v_res int := 0;
begin
  if current_user_crm_papel() is distinct from 'gestao' or not crm_pode_escrever() then
    raise exception 'Só a gestão exclui clientes.' using errcode = '42501';
  end if;
  if not exists (select 1 from crm_clientes where nome = p_cliente) then
    raise exception 'Cliente não encontrado.';
  end if;
  if exists (select 1 from crm_clientes where nome = p_cliente and tipo = 'representante') then
    raise exception 'Este cadastro é um representante. Use "Excluir representante".';
  end if;
  select count(*) into v_fat from crm_faturamento_itens where cliente = p_cliente;
  if to_regclass('public.sv_reservas') is not null then
    execute 'select count(*) from sv_reservas where cliente = $1' into v_res using p_cliente;
  end if;
  if v_fat > 0 or v_res > 0 then
    raise exception 'Não dá para excluir: este cliente tem % lançamento(s) de faturamento e % reserva(s) no Sem Venda.', v_fat, v_res;
  end if;
  perform crm_apagar_cadastro(p_cliente);
end;
$$;

-- ---------------------------------------------------------------- excluir representante
create or replace function crm_excluir_representante(p_representante text) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_fat int;
  v_res int := 0;
begin
  if current_user_crm_papel() is distinct from 'gestao' or not crm_pode_escrever() then
    raise exception 'Só a gestão exclui representantes.' using errcode = '42501';
  end if;
  if not exists (select 1 from crm_clientes where nome = p_representante and tipo = 'representante') then
    raise exception 'Representante não encontrado.';
  end if;
  select count(*) into v_fat from crm_faturamento_itens where cliente = p_representante;
  if to_regclass('public.sv_reservas') is not null then
    execute 'select count(*) from sv_reservas where cliente = $1' into v_res using p_representante;
  end if;
  if v_fat > 0 or v_res > 0 then
    raise exception 'Não dá para excluir: este representante tem % lançamento(s) de faturamento e % reserva(s) no Sem Venda em nome dele.', v_fat, v_res;
  end if;
  -- os clientes dele ficam sem representante pela chave (on delete set null)
  perform crm_apagar_cadastro(p_representante);
end;
$$;

revoke all on function crm_editar_representante(text, text, text, text, text, text, text, text) from public;
grant execute on function crm_editar_representante(text, text, text, text, text, text, text, text) to authenticated;
revoke all on function crm_excluir_cliente(text) from public;
grant execute on function crm_excluir_cliente(text) to authenticated;
revoke all on function crm_excluir_representante(text) from public;
grant execute on function crm_excluir_representante(text) to authenticated;

-- ---------------------------------------------------------------- confere
select
  (select count(*) = 4 from pg_proc where proname in ('crm_editar_representante', 'crm_excluir_cliente', 'crm_excluir_representante', 'crm_apagar_cadastro')) as funcoes,
  (select not has_function_privilege('authenticated', 'crm_apagar_cadastro(text)', 'execute')) as apagar_interno_fechado;
