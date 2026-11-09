-- Segmento do cliente passa a aceitar mais de um (ex.: 'Revenda, Rodas'), guardado na mesma coluna separado por vírgula.
-- Troca a trava antiga (um único valor da lista) por nenhuma; a lista é validada pela tela.
alter table crm_cliente_perfil drop constraint if exists crm_cliente_perfil_segmento_check;
