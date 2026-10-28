-- CRM Atacado: nova etapa do kanban "Primeiro contato", ANTES de "Estimativa enviada".
--
-- A lista de etapas valida em duas colunas (crm_carteira.etapa e crm_ligacoes.etapa_para). Este script troca essas
-- duas validações para incluir "Primeiro contato". O histórico de etapas (crm_etapa_historico) não valida os nomes.
--
-- ORDEM: rode ANTES de publicar a versão nova do site (crm.js v12). Com o site novo e sem este SQL, escolher
-- "Primeiro contato" falha ao salvar. Pode rodar de novo sem estragar.
--
-- Rode o script INTEIRO no SQL Editor do Supabase (ele mostra só o resultado da última consulta).

do $$
declare
  r record;
begin
  -- derruba as validações antigas de etapa, seja qual for o nome que o banco deu a elas
  for r in
    select conrelid::regclass as tabela, conname
    from pg_constraint
    where contype = 'c'
      and conrelid in ('crm_carteira'::regclass, 'crm_ligacoes'::regclass)
      and pg_get_constraintdef(oid) like '%Estimativa enviada%'
      and pg_get_constraintdef(oid) like '%Declinou%'
  loop
    execute format('alter table %s drop constraint %I', r.tabela, r.conname);
  end loop;
end $$;

alter table crm_carteira add constraint crm_carteira_etapa_check
  check (etapa is null or etapa in ('Primeiro contato', 'Estimativa enviada', 'Em negociação', 'Fechamento', 'Fechado', 'Declinou'));

alter table crm_ligacoes add constraint crm_ligacoes_etapa_para_check
  check (etapa_para is null or etapa_para in ('Primeiro contato', 'Estimativa enviada', 'Em negociação', 'Fechamento', 'Fechado', 'Declinou'));

-- conferência (esperado: as duas linhas com "Primeiro contato" na definição)
select conrelid::regclass as tabela, conname, pg_get_constraintdef(oid) like '%Primeiro contato%' as tem_primeiro_contato
from pg_constraint
where conname in ('crm_carteira_etapa_check', 'crm_ligacoes_etapa_para_check');
