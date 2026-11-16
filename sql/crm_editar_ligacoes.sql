-- CRM: EDITAR UMA LIGAÇÃO JÁ REGISTRADA (ficha do cliente > Histórico de ligações > Editar).
--
-- Antes: a ligação era só de inserir e ler. Agora o executivo dono da carteira do cliente e a gestão corrigem, em qualquer
-- ligação (de contato aberto ou arquivado): resultado, contato com quem falou, observação, próximo follow-up e cotações
-- enviadas. Data, hora, quem registrou e a etapa do cartão NÃO mudam (mudar o resultado não move o cartão no kanban).
--
-- Ao corrigir as cotações enviadas, o total do contato (crm_negociacoes.cot_enviadas) é recalculado pela diferença. Se o
-- novo total ficar abaixo das cotações aprovadas do contato, a função recusa e pede para reduzir as aprovadas antes.
-- A ligação guarda quem corrigiu e quando (editada_em, editada_por, editada_por_nome) para a tela mostrar "editada por".
--
-- Quem grava: só pela função crm_editar_ligacao (a tabela continua sem política de update).
--
-- ORDEM: rode ANTES de publicar o site novo. Pré-requisitos: crm_nucleo.sql e crm_negociacoes.sql. Pode rodar de novo.
-- Rode o script INTEIRO no SQL Editor do Supabase (ele mostra só o resultado da última consulta).

alter table crm_ligacoes add column if not exists editada_em timestamptz;
alter table crm_ligacoes add column if not exists editada_por uuid;
alter table crm_ligacoes add column if not exists editada_por_nome text;

create or replace function crm_editar_ligacao(
  p_id uuid, p_resultado text, p_contato text, p_observacao text, p_followup date, p_cotacoes int
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
         editada_em = now(), editada_por = auth.uid(), editada_por_nome = v_nome
   where id = p_id;
end;
$$;

revoke all on function crm_editar_ligacao(uuid, text, text, text, date, int) from public;
grant execute on function crm_editar_ligacao(uuid, text, text, text, date, int) to authenticated;

-- ---------------------------------------------------------------- confere (ok = true em todas as linhas)
select item, ok from (values
  ('colunas de edição em crm_ligacoes', (select count(*) = 3 from information_schema.columns where table_name = 'crm_ligacoes' and column_name in ('editada_em', 'editada_por', 'editada_por_nome'))),
  ('função crm_editar_ligacao', (select count(*) = 1 from pg_proc where proname = 'crm_editar_ligacao'))
) as t(item, ok);
