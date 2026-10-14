-- Estoque Previsto (Torun): o DTC deixa de ser um STATUS (coluna do kanban) e vira uma ETIQUETA do processo.
--
--   1. Coluna nova previsoes.dtc (true/false, começa false). A etiqueta vale em qualquer coluna.
--   2. Os processos que hoje estão com status 'DTC' passam para 'AGUARDANDO RETIRADA DO PORTO' (decisão do
--      usuário, 14/10/2026) e já ficam com a etiqueta marcada (dtc = true).
--   3. O aviso diário "Previsto chegando em breve" (verificar_previstos_chegando) não notificava processo em
--      DTC (tratado como já resolvido). Sem o status DTC essa exclusão não pega mais ninguém, então passa a
--      excluir quem tem a etiqueta: o comportamento de antes continua igual. O resto da função não muda.
--
-- Os status são texto livre no banco (sem CHECK), então 'ATRACADO' e a saída de 'DTC' não pedem constraint.
-- O Sem Venda tem tabela própria (sv_previsoes): o SQL dele é outro (sql/sem_venda_dtc_etiqueta.sql, na
-- branch sem-venda).
--
-- RODE ESTE SQL ANTES de publicar o site novo: o site passa a gravar a coluna `dtc` em todo processo novo
-- ou editado, e sem a coluna esse salvamento quebra.
--
-- A tabela previsoes só tem o gatilho de updated_at: o UPDATE abaixo não dispara baixa de estoque nem aviso.

alter table previsoes add column if not exists dtc boolean not null default false;

update previsoes
set dtc = true, status = 'AGUARDANDO RETIRADA DO PORTO'
where status = 'DTC';

create or replace function verificar_previstos_chegando()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into notificacoes (tipo, titulo, descricao, link_view, link_id)
  select 'previsto_chegando', 'Previsto chegando em breve — processo ' || coalesce(p.numero_processo, '—'),
         'Chegada prevista: ' || to_char(p.data_chegada, 'DD/MM/YYYY'), 'previsto', p.id
  from previsoes p
  where p.data_chegada is not null
    and p.data_chegada between current_date and current_date + interval '5 days'
    and not coalesce(p.dtc, false)
    and not exists (
      select 1 from notificacoes n where n.tipo = 'previsto_chegando' and n.link_id = p.id
    );
end;
$$;

-- Confere: não deve sobrar nenhum processo com status DTC, e os que estavam nele aparecem com dtc = true.
select status, dtc, count(*) as processos
from previsoes
group by status, dtc
order by status, dtc;
