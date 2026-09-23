-- Preenche entregas.documento_cliente pros pedidos já existentes, puxando do cadastro em
-- Clientes pelo nome -- só assim o Rastreio (rastreio.html) consegue achar pedidos antigos,
-- já que até agora só o portal do representante preenchia esse campo. Só atualiza quem está
-- vazio hoje; nunca sobrescreve um valor que já exista.
--
-- Rode no SQL Editor do Supabase.

-- Preview -- quantos pedidos ganham documento com isso, e quantos continuam sem
-- (nome do cliente não bate com nenhum cadastro, ou o cadastro não tem CNPJ/CPF):
select
  count(*) filter (where c.documento is not null and c.documento <> '') as vao_ganhar_documento,
  count(*) filter (where c.documento is null or c.documento = '') as continuam_sem_documento
from entregas e
left join clientes c on c.nome = e.cliente
where (e.documento_cliente is null or e.documento_cliente = '')
  and not e.cancelado;

update entregas e
set documento_cliente = c.documento
from clientes c
where e.cliente = c.nome
  and (e.documento_cliente is null or e.documento_cliente = '')
  and c.documento is not null and c.documento <> '';

-- Confira depois:
select count(*) as ainda_sem_documento from entregas where documento_cliente is null or documento_cliente = '';
