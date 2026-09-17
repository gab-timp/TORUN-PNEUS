-- entregas.tabela_preco_tipo_cliente (sql/tipo_cliente_entregas.sql) nunca ganhou
-- constraint, diferente das 3 tabelas irmãs (clientes/clientes_pendentes/
-- produtos_precos) que a limpeza do CONSUMO_DIFAL apertou (sql/remove_consumo_difal.sql).
-- Achado na revisão de código depois dessa limpeza.
--
-- PASSO 1 -- rode isto sozinho primeiro. Mostra todo valor distinto que já existe
-- nessa coluna hoje, com quantas linhas cada um. Se aparecer só NULL/REVENDA/
-- FROTA/CONSUMO, pode rodar o PASSO 2 direto. Se aparecer qualquer outra coisa,
-- me mostra o resultado antes de continuar.

select tabela_preco_tipo_cliente, count(*) as qtd
from entregas
group by tabela_preco_tipo_cliente
order by qtd desc;

-- PASSO 2 -- só rode depois de conferir o PASSO 1. Se algum valor fora do
-- esperado ainda existir, o ALTER TABLE abaixo falha sozinho, sem estragar nada.

alter table entregas drop constraint if exists entregas_tabela_preco_tipo_cliente_check;
alter table entregas add constraint entregas_tabela_preco_tipo_cliente_check check (
  tabela_preco_tipo_cliente is null or tabela_preco_tipo_cliente in ('REVENDA', 'FROTA', 'CONSUMO')
);
