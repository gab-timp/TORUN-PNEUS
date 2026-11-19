-- CRM: MIGRAR 7 clientes da AMANDA do Atacado para a Encomenda (saem do Atacado; nada é apagado nem duplicado).
--
--   F.M. PNEUS LTDA · JOMED TRANSPORTES E LOGISTICA S/A · MAR PNEUS LTDA · MSP DISTRIBUIDORA E IMPORTADORA DE PNEUS LTDA
--   NSA PNEUTEC COMERCIAL LTDA · STA CAMINHOES RN VEICULOS E SERVICOS LTDA · UNICAP PNEUS LTDA
--
-- Como migra: troca o sistema da carteira de 'atacado' para 'encomenda'. As ligações (com data, hora, resultado, quem
-- registrou, cotações), os contatos, os cartões do kanban (crm_negociacoes) e o histórico de etapas estão ligados à carteira
-- por chave estrangeira "on update cascade", então vão junto automaticamente, com tudo que já foi registrado.
-- O faturamento lançado desses clientes (crm_faturamento_itens) também passa para a Encomenda (decisão: vai junto).
--
-- TRAVAS (o script inteiro é uma transação só: se qualquer uma falhar, NADA é alterado):
--   * tem que achar exatamente os 7 clientes na carteira do Atacado, com a Amanda como executiva;
--   * os 7 já estão na Encomenda (cópia criada por "também compra no outro sistema"): essa cópia só é apagada se estiver
--     VAZIA (0 ligações, 0 histórico, 0 faturamento, nenhum cartão com cotação ou observação); senão o script para;
--   * a Amanda precisa atender a Encomenda (senão os clientes sumiriam da tela dela);
--   * se algum cliente tiver faturamento lançado, o script PARA e pede para me chamar: mover o item de um lançamento do
--     Atacado muda o total do lançamento e a comissão, e isso precisa ser conferido olhando os números.
--
-- RODE a PRÉVIA (crm_migrar_clientes_amanda_PREVIA.sql) ANTES e confira. Depois rode este script INTEIRO no SQL Editor.
-- Não precisa publicar nada no site: é só dado.

do $$
declare
  v_nomes text[] := array[
    'F.M. PNEUS LTDA', 'JOMED TRANSPORTES E LOGISTICA S/A', 'MAR PNEUS LTDA',
    'MSP DISTRIBUIDORA E IMPORTADORA DE PNEUS LTDA', 'NSA PNEUTEC COMERCIAL LTDA',
    'STA CAMINHOES RN VEICULOS E SERVICOS LTDA', 'UNICAP PNEUS LTDA'];
  v_achou int;
  v_ja_enc int;
  v_fat int;
  v_amanda uuid;
  v_ok boolean;
begin
  select count(*) into v_achou from crm_carteira
   where sistema = 'atacado' and cliente = any(v_nomes) and executivo_nome ilike '%amanda%';
  if v_achou <> 7 then
    raise exception 'Esperava os 7 clientes na carteira do Atacado com a Amanda, mas achei %. Nada foi alterado: confira a prévia.', v_achou;
  end if;

  -- Os 7 já têm uma carteira na Encomenda (criada pelo "também compra no outro sistema"). Só serve apagar essa cópia se
  -- ela estiver VAZIA: sem ligação, sem histórico de etapa, sem faturamento e sem cartão com cotação ou observação.
  select count(*) into v_ja_enc from crm_carteira where sistema = 'encomenda' and cliente = any(v_nomes);
  if exists (select 1 from crm_ligacoes where sistema = 'encomenda' and cliente = any(v_nomes))
     or exists (select 1 from crm_etapa_historico where sistema = 'encomenda' and cliente = any(v_nomes))
     or exists (select 1 from crm_faturamento_itens where sistema = 'encomenda' and cliente = any(v_nomes))
     or exists (select 1 from crm_negociacoes where sistema = 'encomenda' and cliente = any(v_nomes)
                and (cot_enviadas > 0 or nullif(btrim(coalesce(obs, '')), '') is not null)) then
    raise exception 'A cópia na Encomenda de algum desses clientes já tem registro (ligação, etapa, faturamento ou cartão preenchido). Nada foi alterado: me avise.';
  end if;

  select count(*) into v_fat from crm_faturamento_itens where sistema = 'atacado' and cliente = any(v_nomes);
  if v_fat > 0 then
    raise exception 'Estes clientes têm % lançamento(s) de faturamento no Atacado. Nada foi alterado: me avise para ajustar o faturamento junto.', v_fat;
  end if;

  select distinct executivo_user_id into v_amanda from crm_carteira
   where sistema = 'atacado' and cliente = any(v_nomes);
  select exists (
    select 1 from user_roles u
    where u.user_id = v_amanda
      and 'encomenda' = any(coalesce(u.crm_sistemas, case when u.crm_sistema is not null then array[u.crm_sistema] else array[]::text[] end))
  ) or exists (
    select 1 from user_roles u where u.user_id = v_amanda and coalesce(u.crm_papel, case when u.is_admin then 'gestao' end) = 'gestao'
  ) into v_ok;
  if not v_ok then
    raise exception 'A Amanda não atende a Encomenda. Libere o acesso dela antes de migrar (senão os clientes somem da tela dela). Nada foi alterado.';
  end if;

  -- 1) apaga a cópia vazia da Encomenda (leva junto os contatos e cartões vazios dela; os do Atacado é que valem)
  delete from crm_carteira where sistema = 'encomenda' and cliente = any(v_nomes);

  -- 2) move a carteira do Atacado para a Encomenda (ligações, contatos, cartões e histórico vão junto, por cascata)
  update crm_carteira
     set sistema = 'encomenda', tambem_outro_sistema = false
   where sistema = 'atacado' and cliente = any(v_nomes) and executivo_nome ilike '%amanda%';
end $$;

-- Confere (rode sozinho depois): os 7 aparecem em 'encomenda' e nenhum em 'atacado'; as ligações vieram junto.
select c.sistema, c.cliente, c.executivo_nome,
       (select count(*) from crm_ligacoes x where x.sistema = c.sistema and x.cliente = c.cliente) as ligacoes,
       (select count(*) from crm_contatos x where x.sistema = c.sistema and x.cliente = c.cliente) as contatos,
       (select count(*) from crm_negociacoes x where x.sistema = c.sistema and x.cliente = c.cliente) as contatos_kanban
from crm_carteira c
where c.cliente in ('F.M. PNEUS LTDA','JOMED TRANSPORTES E LOGISTICA S/A','MAR PNEUS LTDA','MSP DISTRIBUIDORA E IMPORTADORA DE PNEUS LTDA',
                    'NSA PNEUTEC COMERCIAL LTDA','STA CAMINHOES RN VEICULOS E SERVICOS LTDA','UNICAP PNEUS LTDA')
order by c.sistema, c.cliente;
