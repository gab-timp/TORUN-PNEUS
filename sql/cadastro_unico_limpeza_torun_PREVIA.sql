-- PRÉVIA (só consulta, não altera nada): clientes do CRM que vieram do cadastro do Torun (origem = 'torun').
-- A ideia é tirar esses clientes do CRM e do Sem Venda. Antes de apagar qualquer um, veja aqui o que cada um perderia:
--   * carteira: o cliente sai da carteira do executivo (junto vão a etapa e as ligações dele);
--   * faturamento lançado pela Beth;
--   * reservas do Sem Venda (o banco NÃO deixa apagar cliente com reserva).
-- Rode um bloco por vez: o Supabase mostra só o resultado da última consulta.

-- Bloco 1: resumo
select count(*) as clientes_origem_torun,
       count(*) filter (where exists (select 1 from crm_carteira c where c.cliente = k.nome)) as em_carteira,
       count(*) filter (where exists (select 1 from sv_reservas r where r.cliente = k.nome)) as com_reserva_sem_venda,
       count(*) filter (where not exists (select 1 from crm_carteira c where c.cliente = k.nome)
                          and not exists (select 1 from sv_reservas r where r.cliente = k.nome)) as sem_nada_pode_sair_sem_perda
from crm_clientes k
where k.origem = 'torun';

-- Bloco 2: lista, cliente por cliente
select k.nome, k.tipo, k.documento,
       (select string_agg(c.sistema || ' / ' || coalesce(c.executivo_nome, '?'), '; ') from crm_carteira c where c.cliente = k.nome) as carteira,
       (select count(*) from crm_ligacoes l where l.cliente = k.nome) as ligacoes,
       (select count(*) from sv_reservas r where r.cliente = k.nome) as reservas_sem_venda
from crm_clientes k
where k.origem = 'torun'
order by reservas_sem_venda desc, carteira nulls last, k.nome;
