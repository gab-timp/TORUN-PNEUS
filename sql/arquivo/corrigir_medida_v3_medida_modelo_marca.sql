-- SUBSTITUÍDO: use corrigir_medida_v4_final.sql em vez deste.
-- (Cortava IC/IV e PR, que na verdade faziam parte do texto original.)
--
-- Correção da "medida" — versão 3: medida + modelo + marca (substitui as versões anteriores)
--
-- Formato final: "{medida} {modelo} - {marca}", ex: "295/80R22.5 SL101 - ROYALBLACK"
-- Marca vem do prefixo do código (ROYALB = ROYALBLACK, ROADT = ROADTRACK).
-- Modelo já vem limpo (sem repetir a marca, que já estava dentro do texto original
-- do modelo em alguns casos, e sem o "（Narrow）" com parênteses largos da planilha).
--
-- Rode isso no SQL Editor do Supabase.

update produtos as p
set medida = trim(v.medida_tire || ' ' || v.modelo || ' - ' ||
  case
    when p.codigo like 'ROYALB%' then 'ROYALBLACK'
    when p.codigo like 'ROADT%' then 'ROADTRACK'
    else ''
  end)
from (values
  ('ROYALB000001', '295/80R22.5', 'SL101'),
  ('ROYALB000002', '295/80R22.5', 'SL102'),
  ('ROYALB000003', '295/80R22.5', 'DV211'),
  ('ROYALB000004', '275/80R22.5', 'SL102'),
  ('ROYALB000005', '275/80R22.5', 'DV211'),
  ('ROYALB000006', '295/80R22.5', 'DV210 (Narrow)'),
  ('ROYALB000007', '295/80R22.5', 'DM311'),
  ('ROYALB000008', '295/80R22.5', 'DM325'),
  ('ROYALB000009', '315/80R22.5', 'SL101 (Narrow)'),
  ('ROYALB000010', '295/80R22.5', 'AV210'),
  ('ROYALB000011', '295/80R22.5', 'AV211'),
  ('ROYALB000012', '275/80R22.5', 'SL101'),
  ('ROYALB000013', '275/80R22.5', 'AV210'),
  ('ROADT000003',  '275/80R22.5', 'SL102')
) as v(codigo, medida_tire, modelo)
where p.codigo = v.codigo;

-- Confira o resultado:
select codigo, medida from produtos where codigo in (
  'ROYALB000001','ROYALB000002','ROYALB000003','ROYALB000004','ROYALB000005',
  'ROYALB000006','ROYALB000007','ROYALB000008','ROYALB000009','ROYALB000010',
  'ROYALB000011','ROYALB000012','ROYALB000013','ROADT000003'
) order by codigo;
