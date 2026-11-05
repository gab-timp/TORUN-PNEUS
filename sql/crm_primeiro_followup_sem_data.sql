-- CRM: cliente novo na carteira entra SEM data de próximo follow-up.
--
-- Antes: ao cadastrar um cliente novo, o próximo follow-up ficava marcado para HOJE (crm_carteira.primeiro_followup, com
-- valor padrão = data do dia e obrigatório). Agora: fica em branco, e a contagem só começa quando for registrada a primeira
-- ligação com a data do próximo follow-up.
--
-- O que muda: a coluna passa a aceitar vazio e perde o valor padrão. Os clientes que já estão na carteira NÃO mudam.
-- Quem entra na carteira daqui para a frente (cadastro novo ou "também compra no outro sistema") nasce sem data e só aparece
-- em Hoje depois que uma ligação marcar o próximo follow-up.
--
-- ORDEM: rode ANTES de publicar o site novo (crm-perfil.js). Se o site novo chegar primeiro, o cadastro de cliente novo
-- falha. Rode o script INTEIRO no SQL Editor do Supabase.

alter table crm_carteira alter column primeiro_followup drop not null;
alter table crm_carteira alter column primeiro_followup drop default;

notify pgrst, 'reload schema';

-- confere: a coluna aceita vazio e não tem valor padrão (nullable = YES e padrao = null)
select is_nullable as aceita_vazio, column_default as padrao
from information_schema.columns
where table_name = 'crm_carteira' and column_name = 'primeiro_followup';
