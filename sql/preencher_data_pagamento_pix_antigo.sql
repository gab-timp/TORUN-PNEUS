-- Preenche a data de pagamento das vendas PIX antigas que o SQL de status de pagamento
-- (vendas_status_pagamento.sql) marcou como "pago" SEM data. Sem data, o Fluxo de Caixa não
-- sabe em que mês colocar esse dinheiro (eram 133 vendas, R$ 3.591.292,99, todas PIX, de jan a
-- set/2026). A data usada é a DATA DA VENDA: PIX cai na hora, então é uma boa aproximação; dá
-- pra corrigir uma a uma pelo Editar.
--
-- Critério (o mais estreito possível): status "pago", data de pagamento vazia, forma PIX e venda
-- SEM parcelas detalhadas. Não mexe em mais nada.
--
-- Segurança:
--  1) o primeiro bloco ABORTA o script inteiro se a tabela vendas tiver algum gatilho além do de
--     validação da divisão de pagamento e dos de updated_at (um UPDATE em massa já disparou baixas
--     automáticas em outra tabela antes -- se aparecer gatilho novo, mande a mensagem de erro pra mim);
--  2) o backup guarda o estado anterior e fica com RLS ligado (sem política = ninguém lê pela API);
--  3) a última consulta mostra a conferência.
--
-- Rode o script INTEIRO de uma vez no SQL Editor do Supabase (o editor mostra só o resultado da
-- última consulta). Resultado esperado: no_backup = 133, preenchidas = 133, ainda_sem_data = 0.

do $$
declare extras text;
begin
  select string_agg(tgname, ', ') into extras
  from pg_trigger
  where tgrelid = 'public.vendas'::regclass
    and not tgisinternal
    and tgname <> 'vendas_valida_divisao_pagamento_trigger'
    and tgname !~* 'updated_at|moddatetime';
  if extras is not null then
    raise exception 'A tabela vendas tem gatilhos que podem reagir ao UPDATE (%). Nada foi alterado. Mande essa mensagem antes de continuar.', extras;
  end if;
end $$;

create table if not exists backup_vendas_pix_sem_data_20261023 as
select id, data, data_pagamento, status_pagamento, forma_pagamento, valor_venda, updated_at
from vendas
where status_pagamento = 'pago'
  and data_pagamento is null
  and forma_pagamento = 'PIX'
  and (parcelas_detalhe is null or jsonb_array_length(coalesce(parcelas_detalhe, '[]'::jsonb)) = 0);

alter table backup_vendas_pix_sem_data_20261023 enable row level security;

update vendas v
set data_pagamento = v.data
where v.id in (select id from backup_vendas_pix_sem_data_20261023)
  and v.data_pagamento is null;

-- DESFAZER, se precisar (rode separado):
-- update vendas v set data_pagamento = b.data_pagamento
-- from backup_vendas_pix_sem_data_20261023 b where v.id = b.id;

select
  (select count(*) from backup_vendas_pix_sem_data_20261023) as no_backup,
  (select count(*) from vendas v join backup_vendas_pix_sem_data_20261023 b on b.id = v.id
    where v.data_pagamento = v.data) as preenchidas,
  (select count(*) from vendas where status_pagamento = 'pago' and data_pagamento is null) as ainda_sem_data;
