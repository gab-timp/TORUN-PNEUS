-- CRM: "Empresa desde" com data exata (dia/mês/ano), no lugar de "Tempo de mercado (anos)".
-- A idade e o próximo aniversário da empresa são calculados na tela, todo dia.
-- A coluna antiga (tempo_mercado_anos) fica guardada, sem aparecer; clientes antigos começam sem data.
-- RODAR ANTES do deploy do site (a tela carrega o perfil com select *, e a gravação usa a coluna nova).

alter table public.crm_cliente_perfil
  add column if not exists data_fundacao date;
