-- Apaga a data de próximo follow-up dos clientes já cadastrados que NUNCA receberam ligação.
--
-- Mexe só em crm_carteira.primeiro_followup (a data do cadastro) e só de quem não tem nenhuma ligação registrada.
-- NÃO toca nas ligações nem nas datas de próximo follow-up marcadas nelas: quem já tem ligação continua exatamente como está.
-- Depois, o cliente fica "sem data" e só volta a ter follow-up quando uma ligação marcar a próxima data.
--
-- Pré-requisito: crm_primeiro_followup_sem_data.sql já rodado (a coluna aceitar vazio). Rode ANTES a prévia
-- (crm_primeiro_followup_limpar_PREVIA.sql) e confira a lista. Rode o script INTEIRO no SQL Editor do Supabase.

begin;

update crm_carteira c
set primeiro_followup = null
where c.primeiro_followup is not null
  and not exists (select 1 from crm_ligacoes l where l.sistema = c.sistema and l.cliente = c.cliente);

commit;

-- confere: "com_data_e_sem_ligacao" deve ser 0; "com_ligacao" mostra quantos clientes não foram tocados
select
  (select count(*) from crm_carteira c where c.primeiro_followup is not null
     and not exists (select 1 from crm_ligacoes l where l.sistema = c.sistema and l.cliente = c.cliente)) as com_data_e_sem_ligacao,
  (select count(*) from crm_carteira c
     where exists (select 1 from crm_ligacoes l where l.sistema = c.sistema and l.cliente = c.cliente)) as com_ligacao,
  (select count(*) from crm_carteira) as total_na_carteira;
