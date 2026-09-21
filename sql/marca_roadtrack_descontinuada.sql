-- Marca os pneus da marca ROADTRACK como Descontinuado. É assim que eles ficam fora do
-- Catálogo (o Catálogo esconde tudo que está Descontinuado), sem apagar o cadastro, o estoque
-- nem o histórico. Pra voltar, é só trocar a Situação de volta pra Ativo em Produtos > Editar.
--
-- Usa a MARCA e não o prefixo do código: o prefixo ROADT também é usado por ROADCRUZA
-- (ROADT000002 e ROADT000006), que é outra marca e continua no catálogo.
--
-- Rode este SQL ANTES de publicar o código novo do Catálogo. Não cria coluna nova, então
-- rodar antes ou depois não derruba nada -- só evita o Roadtrack aparecer como "sem preço"
-- por alguns minutos.
--
-- O resultado do final lista TODO pneu Descontinuado do sistema (os Roadtrack + qualquer um
-- que já estivesse assim). Todos eles deixam de aparecer no Catálogo.

update produtos
set situacao = 'DESCONTINUADO'
where upper(marca) = 'ROADTRACK';

select codigo, marca, categoria, situacao
from produtos
where situacao = 'DESCONTINUADO'
order by codigo;
