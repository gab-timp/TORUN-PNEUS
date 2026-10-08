-- SUBSTITUÍDO: use corrigir_medida_v2_medida_marca.sql em vez deste.
-- (Este formato incluía IC/IV e PR também; o usuário pediu só medida + marca.)
--
-- Correção: o script catalogo_setup_agosto2026.sql sobrescreveu o campo "medida"
-- (descrição completa) dos 14 produtos importados pelo valor curto da planilha.
-- Isso reconstrói uma descrição completa a partir dos campos técnicos já corretos
-- (medida + IC/IV + PR + modelo), no mesmo estilo usado antes no cadastro.
--
-- Rode isso uma vez no SQL Editor do Supabase.
-- Depois, se algum ficar com o texto diferente do que você tinha antes, é só
-- ajustar manualmente pelo campo "Medida / descrição completa" na tela Catálogo
-- (botão ✎ Editar especificações) ou na aba Produtos.

update produtos
set medida = trim(concat_ws(' ', medida, ic_iv, pr, modelo))
where codigo in (
  'ROYALB000001','ROYALB000002','ROYALB000003','ROYALB000004','ROYALB000005',
  'ROYALB000006','ROYALB000007','ROYALB000008','ROYALB000009','ROYALB000010',
  'ROYALB000011','ROYALB000012','ROYALB000013','ROADT000003'
);

-- Confira o resultado:
select codigo, medida from produtos where codigo in (
  'ROYALB000001','ROYALB000002','ROYALB000003','ROYALB000004','ROYALB000005',
  'ROYALB000006','ROYALB000007','ROYALB000008','ROYALB000009','ROYALB000010',
  'ROYALB000011','ROYALB000012','ROYALB000013','ROADT000003'
) order by codigo;
