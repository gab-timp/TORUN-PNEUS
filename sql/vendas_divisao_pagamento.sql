-- Divisão opcional de uma venda em mais de uma forma de pagamento. Não mexe em nada que já
-- existe (vendas.forma_pagamento continua igual, obrigatório, dirigindo a mesma lógica de
-- sempre) -- isso aqui é só um dado A MAIS, preenchido só quando a operação escolher dividir.
--
-- Rode no SQL Editor do Supabase.

alter table vendas add column if not exists pagamentos_divididos jsonb;

-- Trava no banco (não só na tela): se a divisão existir, a soma dela precisa bater com o valor
-- da venda -- "quem decide é o banco", mesmo padrão já usado em outras invariantes do sistema.
create or replace function vendas_valida_divisao_pagamento()
returns trigger
language plpgsql
as $$
declare
  soma numeric;
begin
  if NEW.pagamentos_divididos is not null and jsonb_array_length(NEW.pagamentos_divididos) > 0 then
    select coalesce(sum((elem->>'valor')::numeric), 0) into soma
    from jsonb_array_elements(NEW.pagamentos_divididos) elem;
    if abs(soma - NEW.valor_venda) > 0.01 then
      raise exception 'A soma da divisão de pagamento (%) precisa bater com o valor da venda (%).', soma, NEW.valor_venda;
    end if;
  end if;
  return NEW;
end;
$$;

drop trigger if exists vendas_valida_divisao_pagamento_trigger on vendas;
create trigger vendas_valida_divisao_pagamento_trigger
  before insert or update on vendas
  for each row execute function vendas_valida_divisao_pagamento();

-- Confira (deve aparecer a coluna e o trigger):
select column_name from information_schema.columns where table_name = 'vendas' and column_name = 'pagamentos_divididos';
select tgname from pg_trigger where tgname = 'vendas_valida_divisao_pagamento_trigger';
