-- CRM Fornecedores: liga o tempo real (Supabase Realtime) nas duas tabelas.
--
-- Com isto, o que uma pessoa muda em Fornecedores (cadastro, edição, exclusão, "lista recebida", "lista pedida")
-- aparece sozinho na tela de quem estiver com o Atacado ou o Encomenda aberto, sem recarregar a página.
-- As duas telas leem as mesmas tabelas, então uma é o espelho da outra.
--
-- Rode DEPOIS de sql/crm_fornecedores.sql. Pode rodar mais de uma vez (só adiciona o que ainda não está).
-- Rode o script INTEIRO no SQL Editor do Supabase (ele mostra só o resultado da última consulta).

do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'crm_fornecedores') then
    alter publication supabase_realtime add table public.crm_fornecedores;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'crm_fornecedores_lista') then
    alter publication supabase_realtime add table public.crm_fornecedores_lista;
  end if;
end $$;

-- conferência: tem que mostrar as duas tabelas
select tablename from pg_publication_tables
where pubname = 'supabase_realtime' and schemaname = 'public' and tablename in ('crm_fornecedores', 'crm_fornecedores_lista')
order by tablename;
