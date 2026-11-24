-- CRM: ESCOLHER A DATA E A HORA DA LIGAÇÃO ao registrar e ao editar.
--
-- Antes a data da ligação era sempre o momento em que o registro era aberto (crm_ligacoes.created_at = now()).
-- Agora a tela deixa escolher a data e a hora (hoje ou passado, nunca futuro), tanto ao registrar quanto em Editar
-- ligação. Não tem coluna nova: a data escolhida é gravada no próprio created_at, então listas, histórico e relatórios
-- já mostram a ligação no dia certo.
--
-- 1) Trava no banco: uma ligação não pode ter data no futuro (folga de 5 minutos para diferença de relógio).
-- 2) crm_editar_ligacao ganha o parâmetro p_quando (data e hora; vazio = não muda a data). A versão antiga, de 6
--    parâmetros, é removida: duas versões da mesma função dariam erro de "função ambígua" na API.
--
-- ORDEM: rode ANTES de publicar o site novo. Pré-requisitos: crm_nucleo.sql e crm_editar_ligacoes.sql. Pode rodar de novo.
-- Rode o script INTEIRO no SQL Editor do Supabase (ele mostra só o resultado da última consulta).

create or replace function crm_ligacao_sem_futuro()
returns trigger
language plpgsql
as $$
begin
  if new.created_at > now() + interval '5 minutes' then
    raise exception 'A data da ligação não pode ser no futuro.';
  end if;
  return new;
end;
$$;

drop trigger if exists crm_ligacoes_sem_futuro on crm_ligacoes;
create trigger crm_ligacoes_sem_futuro
  before insert on crm_ligacoes
  for each row execute function crm_ligacao_sem_futuro();

drop function if exists crm_editar_ligacao(uuid, text, text, text, date, int);

create or replace function crm_editar_ligacao(
  p_id uuid, p_resultado text, p_contato text, p_observacao text, p_followup date, p_cotacoes int,
  p_quando timestamptz default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  l crm_ligacoes%rowtype;
  v_papel text := current_user_crm_papel();
  v_delta int;
  v_env int;
  v_apr int;
  v_nome text;
begin
  select * into l from crm_ligacoes where id = p_id;
  if not found then
    raise exception 'Ligação não encontrada.';
  end if;
  if not crm_pode_escrever() or not (
       v_papel = 'gestao'
       or (v_papel = 'executivo' and exists (
             select 1 from crm_carteira c
             where c.sistema = l.sistema and c.cliente = l.cliente and c.executivo_user_id = auth.uid()))
     ) then
    raise exception 'Só o executivo dono da carteira ou a gestão corrige uma ligação.' using errcode = '42501';
  end if;
  if p_resultado is null or p_resultado not in ('Não atendeu', 'Pediu retorno', 'Interesse', 'Estimativa enviada', 'Fechou negócio', 'Sem interesse') then
    raise exception 'Resultado inválido.';
  end if;
  if p_resultado in ('Pediu retorno', 'Interesse', 'Estimativa enviada') and p_followup is null then
    raise exception 'A data do próximo follow-up é obrigatória para %.', p_resultado;
  end if;
  if p_cotacoes is null or p_cotacoes < 0 then
    raise exception 'As cotações enviadas não podem ser negativas.';
  end if;
  if p_quando is not null and p_quando > now() + interval '5 minutes' then
    raise exception 'A data da ligação não pode ser no futuro.';
  end if;

  v_delta := p_cotacoes - coalesce(l.cotacoes_enviadas, 0);
  if l.negociacao_id is not null and v_delta <> 0 then
    select cot_enviadas, cot_aprovadas into v_env, v_apr from crm_negociacoes where id = l.negociacao_id;
    if v_env is not null then
      if v_env + v_delta < v_apr then
        raise exception 'Este contato já tem % cotações aprovadas. Reduza as aprovadas antes de diminuir as enviadas.', v_apr;
      end if;
      update crm_negociacoes set cot_enviadas = cot_enviadas + v_delta where id = l.negociacao_id;
    end if;
  end if;

  select coalesce(nullif(u.nome, ''), u.email) into v_nome from user_roles u where u.user_id = auth.uid();

  update crm_ligacoes
     set resultado = p_resultado,
         contato_nome = nullif(btrim(coalesce(p_contato, '')), ''),
         observacao = nullif(btrim(coalesce(p_observacao, '')), ''),
         proximo_followup = p_followup,
         cotacoes_enviadas = p_cotacoes,
         created_at = coalesce(p_quando, created_at),
         editada_em = now(), editada_por = auth.uid(), editada_por_nome = v_nome
   where id = p_id;
end;
$$;

revoke all on function crm_editar_ligacao(uuid, text, text, text, date, int, timestamptz) from public;
grant execute on function crm_editar_ligacao(uuid, text, text, text, date, int, timestamptz) to authenticated;

-- o Supabase só enxerga função nova depois de recarregar o cache da API
notify pgrst, 'reload schema';

-- ---------------------------------------------------------------- confere (ok = true em todas as linhas)
select item, ok from (values
  ('trava de data no futuro', (select count(*) = 1 from pg_trigger where tgname = 'crm_ligacoes_sem_futuro')),
  ('crm_editar_ligacao com p_quando (uma só versão)', (select count(*) = 1 from pg_proc where proname = 'crm_editar_ligacao' and pronargs = 7))
) as t(item, ok);
