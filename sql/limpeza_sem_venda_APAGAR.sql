-- LIMPEZA DO SEM VENDA: apaga os dados de teste, para começar a usar pra valer.
-- APAGA (sem volta): reservas e vendas (sv_reservas), fretes (sv_fretes), processos do Estoque Previsto (sv_previsoes),
--                    produtos (sv_produtos) e a cópia antiga de clientes (sv_clientes).
-- FICA: vendedores internos, transportadoras, condições de pagamento, os representantes do Sem Venda, os logins e papéis,
--       e o cadastro de clientes do CRM (crm_clientes), que é único e tem a limpeza própria, à parte.
--
-- Trava de segurança: o script só apaga se o que existe hoje for exatamente o que você me mostrou na prévia
-- (processos 1, 2 e 3 e os produtos "teste" e "teste2"). Se alguém cadastrou outra coisa depois, ele para sem apagar nada
-- e mostra o que apareceu de novo. Tudo roda numa transação: se algo falhar, nada é apagado.
--
-- ANTES: faça um backup no Supabase (Database, Backups). Rode o script INTEIRO no SQL Editor.
-- DEPOIS: as fotos dos produtos ficam no armazenamento (Storage, bucket "sem-venda-fotos"): apague a pasta lá pelo painel se quiser.

begin;

do $$
declare
  v_outros_produtos text;
  v_outros_processos text;
begin
  select string_agg(codigo, ', ') into v_outros_produtos from sv_produtos where codigo not in ('teste', 'teste2');
  select string_agg(numero_processo, ', ') into v_outros_processos from sv_previsoes where numero_processo not in ('1', '2', '3');
  if v_outros_produtos is not null or v_outros_processos is not null then
    raise exception 'Parei sem apagar nada: apareceram dados que não estavam na prévia. Produtos: %. Processos: %.',
      coalesce(v_outros_produtos, '-'), coalesce(v_outros_processos, '-');
  end if;
end $$;

-- ordem das dependências: reservas antes de processos e produtos
delete from sv_reservas;

do $$
begin
  if to_regclass('public.sv_fretes') is not null then
    execute 'delete from sv_fretes';
  end if;
end $$;

delete from sv_previsoes;
delete from sv_produtos;

do $$
begin
  if to_regclass('public.sv_clientes') is not null then
    execute 'delete from sv_clientes';
  end if;
end $$;

commit;

-- confere: tudo zerado nas tabelas apagadas e intacto nas que ficam
select t.tabela,
       (xpath('/row/c/text()', query_to_xml(format('select count(*) as c from public.%I', t.tabela), false, true, '')))[1]::text::int as linhas,
       t.situacao
from (values
  ('sv_reservas', 'zerada'), ('sv_fretes', 'zerada'), ('sv_previsoes', 'zerada'), ('sv_produtos', 'zerada'), ('sv_clientes', 'zerada'),
  ('sv_vendedores', 'fica'), ('sv_transportadoras', 'fica'), ('sv_condicoes_pagamento', 'fica'), ('sv_representantes', 'fica')
) as t(tabela, situacao)
where to_regclass('public.' || t.tabela) is not null
order by t.situacao desc, t.tabela;
