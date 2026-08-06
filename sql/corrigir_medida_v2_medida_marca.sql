-- SUBSTITUÍDO: use corrigir_medida_v3_medida_modelo_marca.sql em vez deste.
-- (Faltava o modelo — SL101, DV211, DM325 etc. — que o usuário pediu pra incluir também.)
--
-- Correção da "medida" — versão 2: medida + marca (substitui o corrigir_medida_sobrescrita.sql anterior)
--
-- Não existe backup do texto original exato (o script de carga sobrescreveu sem eu salvar
-- antes), então isto reconstrói o valor a partir dos dados confirmados da planilha:
-- tamanho do pneu + marca (identificada pelo prefixo do código: ROYALB = ROYALBLACK, ROADT = ROADTRACK).
--
-- Rode isso no SQL Editor do Supabase (não precisa ter rodado o script anterior antes;
-- este substitui o valor de "medida" direto, independente do estado atual).

update produtos as p
set medida = trim(v.medida_tire || ' - ' ||
  case
    when p.codigo like 'ROYALB%' then 'ROYALBLACK'
    when p.codigo like 'ROADT%' then 'ROADTRACK'
    else ''
  end)
from (values
  ('ROYALB000001', '295/80R22.5'),
  ('ROYALB000002', '295/80R22.5'),
  ('ROYALB000003', '295/80R22.5'),
  ('ROYALB000004', '275/80R22.5'),
  ('ROYALB000005', '275/80R22.5'),
  ('ROYALB000006', '295/80R22.5'),
  ('ROYALB000007', '295/80R22.5'),
  ('ROYALB000008', '295/80R22.5'),
  ('ROYALB000009', '315/80R22.5'),
  ('ROYALB000010', '295/80R22.5'),
  ('ROYALB000011', '295/80R22.5'),
  ('ROYALB000012', '275/80R22.5'),
  ('ROYALB000013', '275/80R22.5'),
  ('ROADT000003', '275/80R22.5')
) as v(codigo, medida_tire)
where p.codigo = v.codigo;

-- Confira o resultado:
select codigo, medida from produtos where codigo in (
  'ROYALB000001','ROYALB000002','ROYALB000003','ROYALB000004','ROYALB000005',
  'ROYALB000006','ROYALB000007','ROYALB000008','ROYALB000009','ROYALB000010',
  'ROYALB000011','ROYALB000012','ROYALB000013','ROADT000003'
) order by codigo;
