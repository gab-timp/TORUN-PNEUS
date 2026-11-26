-- CRM: EXCLUIR UM CONTATO (cartão do kanban / Arquivados: 1º contato, 2º contato...).
--
-- Só a GESTÃO do CRM exclui. Quem grava: só pela função crm_excluir_contato (mesmo padrão de crm_excluir_ligacao).
-- Apaga o cartão (crm_negociacoes), as ligações dele (crm_ligacoes) e as mudanças de etapa dele (crm_etapa_historico).
-- O cliente, a carteira e os outros contatos do cliente continuam como estão. Não tem trava de cotações: a gestão passa.
--
-- ORDEM: rode ANTES de publicar o site novo (o botão chama esta função). Pré-requisito: crm_negociacoes.sql.
-- Pode rodar de novo. Rode o script INTEIRO no SQL Editor do Supabase.

create or replace function crm_excluir_contato(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not crm_pode_escrever() or current_user_crm_papel() is distinct from 'gestao' then
    raise exception 'Só a gestão do CRM exclui um contato.' using errcode = '42501';
  end if;
  if not exists (select 1 from crm_negociacoes where id = p_id) then
    raise exception 'Contato não encontrado.';
  end if;

  -- sem isso as ligações e o histórico ficariam soltos (a chave só zera o vínculo)
  delete from crm_ligacoes where negociacao_id = p_id;
  delete from crm_etapa_historico where negociacao_id = p_id;
  delete from crm_negociacoes where id = p_id;
end;
$$;

revoke all on function crm_excluir_contato(uuid) from public;
grant execute on function crm_excluir_contato(uuid) to authenticated;

-- ---------------------------------------------------------------- confere (ok = true)
select item, ok from (values
  ('função crm_excluir_contato', (select count(*) = 1 from pg_proc where proname = 'crm_excluir_contato'))
) as t(item, ok);
