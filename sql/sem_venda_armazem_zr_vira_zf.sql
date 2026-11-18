-- SEM VENDA: o armazém "ZR" passa a se chamar "ZF". Mais nada muda.
--
-- O nome do armazém é gravado como texto nos processos (sv_previsoes.armazem) e nas reservas feitas direto
-- no armazém (sv_reservas.armazem). Sem este UPDATE, o que já está gravado como 'ZR' continuaria aparecendo
-- como um armazém extra "ZR" ao lado do ZF, com o estoque dividido.
--
-- ORDEM: rode junto com a publicação do site novo (semvenda.js v=55). Primeiro os processos, depois as
-- reservas (se a trava de saldo das reservas estiver instalada, ela confere o saldo do armazém na gravação;
-- com os processos já em ZF o saldo do ZF existe quando a reserva muda).
--
-- Antes de rodar, confira o que existe hoje (o resultado deve mostrar ZR e nenhum ZF):
--   select 'processos' as tabela, armazem, count(*) from sv_previsoes where armazem in ('ZR', 'ZF') group by armazem
--   union all
--   select 'reservas', armazem, count(*) from sv_reservas where armazem in ('ZR', 'ZF') group by armazem;

update sv_previsoes set armazem = 'ZF' where armazem = 'ZR';
update sv_reservas  set armazem = 'ZF' where armazem = 'ZR';

-- Confere: não deve sobrar nenhum 'ZR'.
select 'processos' as tabela, armazem, count(*) from sv_previsoes where armazem in ('ZR', 'ZF') group by armazem
union all
select 'reservas', armazem, count(*) from sv_reservas where armazem in ('ZR', 'ZF') group by armazem;
