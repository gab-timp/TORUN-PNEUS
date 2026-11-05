-- PRÉVIA: quais clientes já cadastrados perderiam a data de próximo follow-up. SÓ CONSULTA: não altera nada.
--
-- A data apagada é a "primeira" (primeiro_followup), que o sistema gravou no cadastro do cliente. Ela só vale enquanto o cliente
-- NUNCA recebeu uma ligação. Quem já tem ligação registrada usa a data marcada na última ligação, e essa NÃO é tocada.
--
-- Leia a coluna "vai_limpar": "sim" = nunca ligado, a data do cadastro será apagada; "nao" = já tem ligação, nada muda.
-- Rode e me mande o resultado antes de rodar o crm_primeiro_followup_limpar_APAGAR.sql.

select c.sistema, c.cliente, c.primeiro_followup as data_do_cadastro,
       (select count(*) from crm_ligacoes l where l.sistema = c.sistema and l.cliente = c.cliente) as ligacoes,
       case when exists (select 1 from crm_ligacoes l where l.sistema = c.sistema and l.cliente = c.cliente) then 'nao' else 'sim' end as vai_limpar
from crm_carteira c
where c.primeiro_followup is not null
order by vai_limpar desc, c.sistema, c.cliente;
