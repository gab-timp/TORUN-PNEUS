-- Correção da "medida" — versão 4 (final): restaura o texto exato que existia antes.
--
-- Como cheguei nisso: você mandou dois relatórios de Estoque Atual. O de 04/08 (mais completo,
-- com IC/IV e PR) é o formato original — confirmado porque o ROADT000001 (nunca tocado por
-- nenhum script) aparece IDÊNTICO nos dois relatórios, nesse mesmo formato rico. Minha correção
-- anterior (v3) simplificou demais e cortou IC/IV e PR. Esta versão usa o texto EXATO do
-- relatório de 04/08 pros 11 códigos que aparecem nele, e reconstrói pela planilha original
-- (mesma ordem: medida + IC/IV + PR + modelo + marca) só os 3 códigos que não aparecem em
-- nenhum dos dois relatórios por estarem com saldo zerado (ROYALB000006, 009, 010) — não achei
-- o texto real desses em nenhum lugar, então essa parte é reconstrução, não restauração exata.
--
-- Substitui as versões v2 e v3 anteriores.
-- Rode isso no SQL Editor do Supabase.

update produtos as p
set medida = v.medida
from (values
  ('ROADT000003', '275/80R22.5 SL102 18PR149/146M - ROADTRACK'),
  ('ROYALB000001', '295/80R22.5 154/149M 18PR SL101 TL- ROYALBLACK'),
  ('ROYALB000002', '295/80R22.5 18PR 154/149M SL102 - ROYALBLACK'),
  ('ROYALB000003', '295/80R22.5 154/149M 18PR DV211 - ROYALBLACK'),
  ('ROYALB000004', '275/80R22.5 18PR 149/146M SL102 - ROYALBLACK'),
  ('ROYALB000005', '275/80R22.5 18PR 149/146M DV211 - ROYALBLACK'),
  ('ROYALB000007', '295/80R22.5 154/149K DM311 18PR TL-ROYALBLACK'),
  ('ROYALB000008', '295/80R22.5 154/149J DM325 18PR TL -ROYALBLACK'),
  ('ROYALB000011', '295/80R22.5 154/149M AV211 18 PR - ROYALBLACK'),
  ('ROYALB000012', '275/80R22.5 149/146 M SL101 18PR - ROYALBLACK'),
  ('ROYALB000013', '275/80R22.5 149/146M AV210 18PR - ROYALBLACK'),
  -- reconstruídos pela planilha (sem stock atual, não apareciam em nenhum dos dois relatórios):
  ('ROYALB000006', '295/80R22.5 154/149M 18PR DV210 (Narrow) - ROYALBLACK'),
  ('ROYALB000009', '315/80R22.5 157/154L 20PR SL101 (Narrow) - ROYALBLACK'),
  ('ROYALB000010', '295/80R22.5 154/149M 18PR AV210 - ROYALBLACK')
) as v(codigo, medida)
where p.codigo = v.codigo;

-- ROADT000001 não entra aqui porque nunca foi alterado — continua com o valor original dele.

-- Confira o resultado:
select codigo, medida from produtos where codigo in (
  'ROADT000001','ROADT000003',
  'ROYALB000001','ROYALB000002','ROYALB000003','ROYALB000004','ROYALB000005',
  'ROYALB000006','ROYALB000007','ROYALB000008','ROYALB000009','ROYALB000010',
  'ROYALB000011','ROYALB000012','ROYALB000013'
) order by codigo;
