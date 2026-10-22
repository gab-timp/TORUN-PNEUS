-- Tipo de pessoa do cliente: PF (pessoa física) ou PJ (pessoa jurídica).
--
-- 1) Coluna nova clientes.tipo_pessoa ('PF', 'PJ' ou vazio = não informado).
-- 2) Preenche os clientes que já existem pelo tamanho do documento, ignorando pontos, traço e barra:
--    11 dígitos (CPF) = PF, 14 dígitos (CNPJ) = PJ. Sem documento, ou com outro tamanho, fica vazio.
--    Só preenche onde ainda está vazio: rodar de novo, ou depois de alguém marcar à mão, não sobrescreve nada.
--
-- Ordem: rode este SQL ANTES do deploy do site que grava o tipo (o site só grava a coluna quando a pessoa
-- marca PF ou PJ, então nada quebra se chegar antes, mas salvar com a caixa marcada daria erro).
--
-- Rode no SQL Editor do Supabase.

alter table clientes add column if not exists tipo_pessoa text;
alter table clientes drop constraint if exists clientes_tipo_pessoa_check;
alter table clientes add constraint clientes_tipo_pessoa_check check (tipo_pessoa is null or tipo_pessoa in ('PF', 'PJ'));

update clientes
set tipo_pessoa = case length(regexp_replace(documento, '\D', '', 'g')) when 11 then 'PF' else 'PJ' end
where tipo_pessoa is null
  and length(regexp_replace(coalesce(documento, ''), '\D', '', 'g')) in (11, 14);

-- Confira (1 linha): quantos clientes ficaram PF, PJ e sem tipo, e se há algum gatilho (trigger) na tabela
-- (esperado: 0; se vier mais que 0, me avise antes de rodar de novo):
select
  count(*) filter (where tipo_pessoa = 'PF') as pf,
  count(*) filter (where tipo_pessoa = 'PJ') as pj,
  count(*) filter (where tipo_pessoa is null) as sem_tipo,
  (select count(*) from pg_trigger where tgrelid = 'clientes'::regclass and not tgisinternal) as gatilhos_na_tabela
from clientes;
