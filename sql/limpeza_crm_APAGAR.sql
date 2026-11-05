-- LIMPEZA DO CRM (Atacado e Encomenda): apaga os dados de teste, para começar a usar pra valer.
-- APAGA (sem volta): ligações, kanban de contatos e histórico de etapas; faturamento, comissões e links dos representantes;
--                    metas; contatos, perfil, filiais, pneus e histórico de mudanças dos clientes; a carteira; e o
--                    cadastro de clientes (crm_clientes), que é ÚNICO e também esvazia a lista de clientes do Sem Venda.
-- FICA: logins e papéis dos usuários (o vínculo de um login de representante com o cadastro dele é solto, não o login),
--       e tudo o que não é do CRM (Torun, vendedores, transportadoras, representantes do Sem Venda...).
--
-- ORDEM: rode ANTES o limpeza_sem_venda_APAGAR.sql (as reservas do Sem Venda apontam para os clientes e travam a exclusão).
-- ANTES DE RODAR: rode o BLOCO 2 da prévia (limpeza_sem_venda_crm_PREVIA.sql) e confira os 8 clientes: se algum for REAL,
-- NÃO rode este script, me diga qual cliente manter.
--
-- Trava de segurança: o script só apaga se as quantidades de hoje não passaram do que você viu na prévia
-- (8 clientes, 6 na carteira, 6 ligações, 8 contatos abertos no kanban, 22 históricos, 0 faturamentos...). Se alguém
-- cadastrou mais coisa depois, ele para sem apagar nada. Tudo roda numa transação.
--
-- ANTES: faça um backup no Supabase (Database, Backups). Rode o script INTEIRO no SQL Editor.

begin;

do $$
declare
  v_msg text := '';
begin
  if (select count(*) from sv_reservas) > 0 then
    v_msg := v_msg || ' Ainda há reservas no Sem Venda: rode antes o limpeza_sem_venda_APAGAR.sql.';
  end if;
  if (select count(*) from crm_clientes) > 8 then v_msg := v_msg || ' crm_clientes passou de 8.'; end if;
  if (select count(*) from crm_carteira) > 6 then v_msg := v_msg || ' crm_carteira passou de 6.'; end if;
  if (select count(*) from crm_ligacoes) > 6 then v_msg := v_msg || ' crm_ligacoes passou de 6.'; end if;
  if (select count(*) from crm_negociacoes) > 8 then v_msg := v_msg || ' crm_negociacoes passou de 8.'; end if;
  if (select count(*) from crm_etapa_historico) > 22 then v_msg := v_msg || ' crm_etapa_historico passou de 22.'; end if;
  if (select count(*) from crm_contatos) > 6 then v_msg := v_msg || ' crm_contatos passou de 6.'; end if;
  if (select count(*) from crm_faturamento_lancamentos) > 0 then v_msg := v_msg || ' Já existe faturamento lançado.'; end if;
  if (select count(*) from crm_faturamento_itens) > 0 then v_msg := v_msg || ' Já existem itens de faturamento.'; end if;
  if (select count(*) from crm_comissao_percentual) + (select count(*) from crm_representante_percentual) + (select count(*) from crm_representante_comissao) > 0 then
    v_msg := v_msg || ' Já existem percentuais ou comissões lançadas.';
  end if;
  if (select count(*) from crm_meta_equipe) + (select count(*) from crm_meta_executivo) + (select count(*) from crm_meta_mes_equipe) + (select count(*) from crm_meta_mes_executivo) > 0 then
    v_msg := v_msg || ' Já existem metas cadastradas.';
  end if;
  if v_msg <> '' then
    raise exception 'Parei sem apagar nada:%', v_msg;
  end if;
end $$;

-- faturamento, comissões e links
delete from crm_faturamento_itens;
delete from crm_faturamento_lancamentos;
delete from crm_comissao_percentual;
delete from crm_representante_comissao;
delete from crm_representante_percentual;
delete from crm_representante_links;

-- ligações, histórico de etapas e kanban de contatos (nesta ordem: as duas primeiras apontam para o kanban e para a carteira)
delete from crm_ligacoes;
delete from crm_etapa_historico;
delete from crm_negociacoes;

-- metas (do mais específico para o mais geral)
delete from crm_meta_executivo;
delete from crm_meta_equipe;
delete from crm_meta_mes_executivo;
delete from crm_meta_mes_equipe;

-- cadastro dos clientes e o que depende dele
delete from crm_contatos;
delete from crm_cliente_mudancas;
delete from crm_cliente_perfil;
delete from crm_cliente_filiais;
delete from crm_cliente_pneus;
delete from crm_carteira;
delete from crm_clientes;

commit;

-- confere: tudo deve estar zerado
select t.tabela,
       (xpath('/row/c/text()', query_to_xml(format('select count(*) as c from public.%I', t.tabela), false, true, '')))[1]::text::int as linhas
from (values
  ('crm_clientes'), ('crm_carteira'), ('crm_contatos'), ('crm_ligacoes'), ('crm_negociacoes'), ('crm_etapa_historico'),
  ('crm_faturamento_lancamentos'), ('crm_faturamento_itens'), ('crm_comissao_percentual'), ('crm_representante_percentual'),
  ('crm_representante_comissao'), ('crm_representante_links'), ('crm_meta_equipe'), ('crm_meta_executivo'),
  ('crm_meta_mes_equipe'), ('crm_meta_mes_executivo'), ('crm_cliente_mudancas'), ('crm_cliente_perfil'),
  ('crm_cliente_filiais'), ('crm_cliente_pneus')
) as t(tabela)
where to_regclass('public.' || t.tabela) is not null
order by t.tabela;
