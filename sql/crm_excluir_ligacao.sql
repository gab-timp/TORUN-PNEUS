-- CRM: EXCLUIR UMA LIGAÇÃO (ficha do cliente > Histórico de ligações > Editar > Excluir ligação).
--
-- Só a GESTÃO do CRM exclui (o executivo dono da carteira não). Quem grava: só pela função crm_excluir_ligacao
-- (a tabela continua sem política de delete), no mesmo padrão de crm_editar_ligacao.
--
-- As cotações enviadas nessa ligação saem do total do contato (crm_negociacoes.cot_enviadas). Se o novo total ficar
-- abaixo das cotações aprovadas do contato, as aprovadas descem junto (a gestão não é barrada). A etapa do
-- cartão no kanban NÃO muda. Não há outra tabela ligada à ligação (só o cartão, pela contagem de cotações).
--
-- ORDEM: rode ANTES de publicar o site novo (o botão chama esta função). Pré-requisitos: crm_nucleo.sql,
-- crm_negociacoes.sql e crm_editar_ligacoes.sql. Pode rodar de novo.
-- Rode o script INTEIRO no SQL Editor do Supabase (ele mostra só o resultado da última consulta).

create or replace function crm_excluir_ligacao(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  l crm_ligacoes%rowtype;
  v_env int;
  v_apr int;
begin
  if not crm_pode_escrever() or current_user_crm_papel() is distinct from 'gestao' then
    raise exception 'Só a gestão do CRM exclui uma ligação.' using errcode = '42501';
  end if;
  select * into l from crm_ligacoes where id = p_id;
  if not found then
    raise exception 'Ligação não encontrada.';
  end if;

  if l.negociacao_id is not null and coalesce(l.cotacoes_enviadas, 0) > 0 then
    select cot_enviadas, cot_aprovadas into v_env, v_apr from crm_negociacoes where id = l.negociacao_id;
    if v_env is not null then
      -- a gestão passa por cima: se as aprovadas ficariam acima das enviadas, elas descem junto
      -- (os dois campos no mesmo update, por causa da regra aprovadas <= enviadas)
      update crm_negociacoes
         set cot_enviadas = cot_enviadas - l.cotacoes_enviadas,
             cot_aprovadas = least(cot_aprovadas, cot_enviadas - l.cotacoes_enviadas)
       where id = l.negociacao_id;
    end if;
  end if;

  delete from crm_ligacoes where id = p_id;
end;
$$;

revoke all on function crm_excluir_ligacao(uuid) from public;
grant execute on function crm_excluir_ligacao(uuid) to authenticated;

-- ---------------------------------------------------------------- confere (ok = true)
select item, ok from (values
  ('função crm_excluir_ligacao', (select count(*) = 1 from pg_proc where proname = 'crm_excluir_ligacao'))
) as t(item, ok);
