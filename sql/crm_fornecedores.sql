-- CRM Atacado e Encomenda: Fornecedores (Carteira > Fornecedores).
--
-- Consulta rápida para o atendimento: de quem vem cada marca, como o cliente paga, quem contatar, se há
-- restrição (exclusividade) e se a lista de preços do exportador já foi pedida ou recebida.
--
-- Duas tabelas novas, iguais para o Atacado e o Encomenda (não são por sistema):
--   crm_fornecedores        uma linha por OPÇÃO DE COMPRA (marca + exportador + porto), como na planilha
--   crm_fornecedores_lista  uma linha por EXPORTADOR: quando a lista foi pedida e quando chegou
--
-- Quem acessa: todo usuário com papel no CRM (executivo, financeiro, gestão) LÊ; só a gestão (administrador
-- conta como gestão) cadastra, edita, exclui e marca a lista. O login de representante não enxerga nada daqui.
--
-- Tudo aditivo: nada existente é alterado. Pode rodar antes ou depois do deploy: sem ele, a tela
-- Fornecedores só avisa que o SQL ainda não foi rodado.
--
-- Rode o script INTEIRO no SQL Editor do Supabase (ele mostra só o resultado da última consulta).

create table if not exists crm_fornecedores (
  id uuid primary key default gen_random_uuid(),
  ordem int,
  marca text not null,
  exportador text not null,
  fabrica text not null default '',
  produto text not null default 'Pneu' check (produto in ('Pneu', 'Rack', 'Rodas')),
  tipos text[] not null default array[]::text[],
  porto text not null default '',
  pais text not null default '',
  -- [{"p":30,"w":"na prontidão"},{"p":70,"w":"antes da chegada"}], na ordem em que os pagamentos acontecem
  pagamentos jsonb not null default '[]'::jsonb,
  nota_pagamento text not null default '',
  -- 0 = pode trazer, 1 = exclusividade (não podemos trazer), 2 = restrição parcial (pode, com ressalva)
  restricao int not null default 0 check (restricao in (0, 1, 2)),
  observacao text not null default '',
  -- [{"n":"Dani","e":"dani@fornecedor.com"}]
  contatos jsonb not null default '[]'::jsonb,
  criado_em timestamptz not null default now(),
  criado_por uuid default auth.uid(),
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid default auth.uid()
);

create index if not exists crm_fornecedores_exportador_idx on crm_fornecedores (exportador);

create table if not exists crm_fornecedores_lista (
  exportador text primary key,
  pedida_em timestamptz,
  recebida_em timestamptz,
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid default auth.uid()
);

alter table crm_fornecedores enable row level security;
alter table crm_fornecedores_lista enable row level security;

-- leitura: qualquer papel do CRM
drop policy if exists crm_fornecedores_select on crm_fornecedores;
create policy crm_fornecedores_select on crm_fornecedores for select to authenticated
  using (current_user_crm_papel() is not null);

drop policy if exists crm_fornecedores_lista_select on crm_fornecedores_lista;
create policy crm_fornecedores_lista_select on crm_fornecedores_lista for select to authenticated
  using (current_user_crm_papel() is not null);

-- escrita: só a gestão
drop policy if exists crm_fornecedores_insert on crm_fornecedores;
create policy crm_fornecedores_insert on crm_fornecedores for insert to authenticated
  with check (current_user_crm_papel() = 'gestao' and crm_pode_escrever());
drop policy if exists crm_fornecedores_update on crm_fornecedores;
create policy crm_fornecedores_update on crm_fornecedores for update to authenticated
  using (current_user_crm_papel() = 'gestao' and crm_pode_escrever())
  with check (current_user_crm_papel() = 'gestao' and crm_pode_escrever());
drop policy if exists crm_fornecedores_delete on crm_fornecedores;
create policy crm_fornecedores_delete on crm_fornecedores for delete to authenticated
  using (current_user_crm_papel() = 'gestao' and crm_pode_escrever());

drop policy if exists crm_fornecedores_lista_insert on crm_fornecedores_lista;
create policy crm_fornecedores_lista_insert on crm_fornecedores_lista for insert to authenticated
  with check (current_user_crm_papel() = 'gestao' and crm_pode_escrever());
drop policy if exists crm_fornecedores_lista_update on crm_fornecedores_lista;
create policy crm_fornecedores_lista_update on crm_fornecedores_lista for update to authenticated
  using (current_user_crm_papel() = 'gestao' and crm_pode_escrever())
  with check (current_user_crm_papel() = 'gestao' and crm_pode_escrever());
drop policy if exists crm_fornecedores_lista_delete on crm_fornecedores_lista;
create policy crm_fornecedores_lista_delete on crm_fornecedores_lista for delete to authenticated
  using (current_user_crm_papel() = 'gestao' and crm_pode_escrever());

grant select, insert, update, delete on crm_fornecedores to authenticated;
grant select, insert, update, delete on crm_fornecedores_lista to authenticated;

-- ---------------------------------------------------------------- carga inicial (planilha FORNECEDOR, 45 linhas)
-- Só entra se a tabela estiver vazia: rodar o script de novo não duplica nada.
insert into crm_fornecedores (ordem, marca, exportador, fabrica, produto, tipos, porto, pais, pagamentos, nota_pagamento, restricao, observacao, contatos)
select * from (values
  (1, 'HAOHUA', 'LATITUDE SINGAPORE INDUSTRIAL PTE. LTD.', 'HAOHUA', 'Pneu', array['Carga']::text[], 'Ho Chi Minh', 'Vietnã', '[{"p":10,"w":"na prontidão"},{"p":90,"w":"antes da chegada"}]'::jsonb, 'Alguns clientes ainda estão em 20% + 80%; a equipe está tentando mudar.', 0, '', '[{"n":"Dani","e":"daniela@haohuatire"},{"n":"Kevin","e":"kevin@haohuatire.com"}]'::jsonb),
  (2, 'ROYALBLACK', 'LATITUDE SINGAPORE INDUSTRIAL PTE. LTD.', 'HAOHUA', 'Pneu', array['Carga']::text[], 'Ho Chi Minh', 'Vietnã', '[{"p":10,"w":"na prontidão"},{"p":90,"w":"antes da chegada"}]'::jsonb, 'Alguns clientes ainda estão em 20% + 80%; a equipe está tentando mudar.', 0, '', '[{"n":"Dani","e":"daniela@haohuatire"},{"n":"Kevin","e":"kevin@haohuatire.com"}]'::jsonb),
  (3, 'ROADTRACK', 'LATITUDE SINGAPORE INDUSTRIAL PTE. LTD.', 'HAOHUA', 'Pneu', array['Carga']::text[], 'Ho Chi Minh', 'Vietnã', '[{"p":10,"w":"na prontidão"},{"p":90,"w":"antes da chegada"}]'::jsonb, 'Alguns clientes ainda estão em 20% + 80%; a equipe está tentando mudar.', 1, 'Não podemos trazer, tem exclusividade.', '[{"n":"Dani","e":"daniela@haohuatire"},{"n":"Kevin","e":"kevin@haohuatire.com"}]'::jsonb),
  (4, 'COMPASAL', 'SHANDONG HAOHUA TIRE CO., LTD e TYRE EXPORT INC', 'HAOHUA', 'Pneu', array['Passeio','LT']::text[], 'Qingdao', 'China', '[{"p":10,"w":"na prontidão"},{"p":90,"w":"antes da chegada"}]'::jsonb, '', 0, '', '[{"n":"Dani","e":"daniela@haohuatire"},{"n":"Kevin","e":"kevin@haohuatire.com"}]'::jsonb),
  (5, 'LANVIGATOR', 'TYRE EXPORT INC', 'ORIENTE', 'Pneu', array['Passeio','LT','Carga']::text[], 'Ho Chi Minh', 'Vietnã', '[{"p":100,"w":"30 dias após a chegada"}]'::jsonb, '', 0, '', '[{"n":"Fran","e":"Franciele@tyreexport.com"},{"n":"Julia","e":"Julia.Bariviera@tyreexport.com"}]'::jsonb),
  (6, 'CHITUMA', 'TYRE EXPORT INC', 'ORIENTE', 'Pneu', array['Carga']::text[], '', 'Camboja', '[{"p":100,"w":"30 dias após a chegada"}]'::jsonb, '', 0, '', '[{"n":"Fran","e":"Franciele@tyreexport.com"},{"n":"Julia","e":"Julia.Bariviera@tyreexport.com"}]'::jsonb),
  (7, 'ROADCRUZA', 'TYRE EXPORT INC', 'ORIENTE', 'Pneu', array['Passeio','LT']::text[], 'Qingdao', 'China', '[{"p":100,"w":"30 dias após a chegada"}]'::jsonb, '', 0, '', '[{"n":"Fran","e":"Franciele@tyreexport.com"},{"n":"Julia","e":"Julia.Bariviera@tyreexport.com"}]'::jsonb),
  (8, 'TRAZANO', 'TYRE EXPORT INC', 'ORIENTE', 'Pneu', array['Passeio']::text[], '', '', '[{"p":100,"w":"30 dias após a chegada"}]'::jsonb, '', 0, '', '[{"n":"Fran","e":"Franciele@tyreexport.com"},{"n":"Julia","e":"Julia.Bariviera@tyreexport.com"}]'::jsonb),
  (9, 'TERCELO', 'TYRE EXPORT INC', 'ORIENTE', 'Pneu', array[]::text[], '', '', '[{"p":100,"w":"30 dias após a chegada"}]'::jsonb, '', 0, '', '[{"n":"Fran","e":"Franciele@tyreexport.com"},{"n":"Julia","e":"Julia.Bariviera@tyreexport.com"}]'::jsonb),
  (10, 'SUPERGUIDER', 'TYRE EXPORT INC', 'ORIENTE', 'Pneu', array['Agrícola']::text[], '', 'China', '[{"p":100,"w":"30 dias após a chegada"}]'::jsonb, '', 0, '', '[{"n":"Fran","e":"Franciele@tyreexport.com"},{"n":"Julia","e":"Julia.Bariviera@tyreexport.com"}]'::jsonb),
  (11, 'CROOSWIND', 'TYRE EXPORT INC', 'ORIENTE', 'Pneu', array[]::text[], '', '', '[{"p":100,"w":"30 dias após a chegada"}]'::jsonb, '', 0, '', '[{"n":"Fran","e":"Franciele@tyreexport.com"},{"n":"Julia","e":"Julia.Bariviera@tyreexport.com"}]'::jsonb),
  (12, 'TRAZANO', 'ZC RUBBER', 'ORIENTE', 'Pneu', array['Passeio']::text[], '', '', '[{"p":100,"w":"30 dias após a chegada"}]'::jsonb, '', 0, '', '[{"n":"Alessandro","e":"alessandro@zc-rubber.com"}]'::jsonb),
  (13, 'TRIANGLE', 'ORIENTE TRIANGLE LATIN AMERICA INC', 'ORIENTE TRIANGLE', 'Pneu', array['Passeio','LT','Carga']::text[], 'Qingdao', 'China', '[{"p":100,"w":"30 dias após a chegada"}]'::jsonb, '', 0, '', '[{"n":"Fran","e":"Franciele@orientetriangle.com"},{"n":"Julia","e":"Julia.Bariviera@orientetriangle.com"}]'::jsonb),
  (14, 'ORIENTX', 'ORIENTE LATIN AMERICA', 'ORIENTX', 'Pneu', array['Passeio','Carga']::text[], 'Ho Chi Minh / Semarang', 'Vietnã / Indonésia', '[{"p":100,"w":"60 dias após a chegada"}]'::jsonb, '', 2, 'Carga é exclusividade do Pedroni.', '[{"n":"Fran","e":"Franciele@orientetriangle.com"},{"n":"Julia","e":"Julia.Bariviera@orientetriangle.com"}]'::jsonb),
  (15, 'LEAO', 'SUNSET TIRES CORPORATION LIMITED', 'SUNSET', 'Pneu', array['Passeio','LT']::text[], 'Qingdao', 'China', '[{"p":30,"w":"na prontidão"},{"p":70,"w":"7 dias antes da chegada"}]'::jsonb, '', 0, '', '[{"n":"Daniela","e":"daniela.monges@sunset-tires.com"}]'::jsonb),
  (16, 'XBRI', 'SUNSET TIRES CORPORATION LIMITED', 'SUNSET', 'Pneu', array['Passeio','LT']::text[], 'Qingdao', 'China', '[{"p":30,"w":"na prontidão"},{"p":70,"w":"7 dias antes da chegada"}]'::jsonb, '', 0, '', '[{"n":"Daniela","e":"daniela.monges@sunset-tires.com"}]'::jsonb),
  (17, 'LINGLONG', 'SUNSET TIRES CORPORATION LIMITED', 'SUNSET', 'Pneu', array['Passeio','LT']::text[], 'Qingdao', 'China', '[{"p":30,"w":"na prontidão"},{"p":70,"w":"7 dias antes da chegada"}]'::jsonb, '', 0, '', '[{"n":"Daniela","e":"daniela.monges@sunset-tires.com"}]'::jsonb),
  (18, 'SUNSET', 'SUNSET TIRES CORPORATION LIMITED', 'SUNSET', 'Pneu', array['Passeio','LT']::text[], 'Qingdao', 'China', '[{"p":30,"w":"na prontidão"},{"p":70,"w":"7 dias antes da chegada"}]'::jsonb, '', 0, '', '[{"n":"Daniela","e":"daniela.monges@sunset-tires.com"}]'::jsonb),
  (19, 'XBRI', 'SUNSET TIRES CORPORATION LIMITED', 'SUNSET', 'Pneu', array['Passeio','LT']::text[], 'Haiphong / Ho Chi Minh', 'Vietnã', '[{"p":30,"w":"na prontidão"},{"p":70,"w":"7 dias antes da chegada"}]'::jsonb, '', 0, '', '[{"n":"Daniela","e":"daniela.monges@sunset-tires.com"}]'::jsonb),
  (20, 'ASCENSO', 'MAHANSARIA TYRES PVT. LTD.', 'ASCENSO', 'Pneu', array['Agrícola']::text[], 'Hazira', 'Índia', '[{"p":100,"w":"60/90 dias após a data do BL"}]'::jsonb, 'Nos documentos consta 30% antecipado + 70% antes da chegada, mas geralmente pagamos 100% após a chegada.', 0, '', '[{"n":"Alexandre","e":"alex.stucchi@ascensotyres.com"}]'::jsonb),
  (21, 'WESTLAKE', 'ZC RUBBER', 'ZC RUBBER', 'Pneu', array['Passeio']::text[], 'Ningbo', 'China', '[{"p":30,"w":"na prontidão"},{"p":70,"w":"antes da chegada"}]'::jsonb, '', 1, 'Não podemos trazer, tem exclusividade.', '[{"n":"Alessandro","e":"alessandro@zc-rubber.com"}]'::jsonb),
  (22, 'GOLDEN CROWN', 'ZC RUBBER', 'ZC RUBBER', 'Pneu', array['Passeio','LT','Carga']::text[], 'Ningbo', 'China', '[{"p":100,"w":"antes do embarque"}]'::jsonb, '', 0, '', '[{"n":"Alessandro","e":"alessandro@zc-rubber.com"}]'::jsonb),
  (23, 'ROADKING', 'ENJOY TYRE CO., LTD', 'ENJOY TYRE', 'Pneu', array['Passeio','LT','Carga']::text[], 'Qingdao', 'China', '[{"p":20,"w":"na prontidão"},{"p":80,"w":"antes da chegada"}]'::jsonb, '', 0, '', '[{"n":"Anderson","e":"anderson@roadkingpneus.com.br"}]'::jsonb),
  (24, 'SUNFULL', 'SHANDONG CHANGFENG TYRES CO LTD', 'CHANGFENG', 'Pneu', array['Passeio','LT']::text[], 'Qingdao', 'China', '[{"p":20,"w":"na prontidão"},{"p":80,"w":"antes da chegada"}]'::jsonb, '', 0, '', '[{"n":"Mirta","e":"mirta.wang@changfengtires.com"},{"n":"Sophie","e":"sophie.zhang@changfengtires.com"}]'::jsonb),
  (25, 'SAMSOM', 'W AND T INTERNATIONAL LLC', 'W&T - SAMSOM', 'Pneu', array['Carga']::text[], 'Ho Chi Minh', 'Vietnã', '[{"p":20,"w":"para produzir"},{"p":80,"w":"antes da chegada"}]'::jsonb, '', 0, '', '[{"n":"Erick","e":"erick@wtinternational.net"},{"n":"Claudio","e":"claudio@wtinternational.net"}]'::jsonb),
  (26, 'ATF', 'ASIAN TIRE FACTORY LTD', 'ATF', 'Pneu', array['Agrícola']::text[], 'Mundra', 'Índia', '[{"p":20,"w":"para produzir"},{"p":80,"w":"antes da chegada"}]'::jsonb, '', 0, '', '[{"n":"Fernando","e":"fernando.branco@atftyres.com"}]'::jsonb),
  (27, 'IRONHEAD', 'SAILUN GROUP HONGKONG CO LIMITED', 'SAILUN', 'Pneu', array['Carga']::text[], 'Semarang', 'Indonésia', '[{"p":30,"w":"para produzir"},{"p":70,"w":"45 dias após a data do BL"}]'::jsonb, '', 0, '', '[{"n":"Felipe","e":"felipe.miravete@sailuntire.com"},{"n":"Mirian","e":"mirian.silva@sailuntire.com"}]'::jsonb),
  (28, 'SUNFULL', 'VIETNAM COFO TIRES COMPANY LIMITED', 'CHANGFENG', 'Pneu', array['Carga']::text[], 'Ho Chi Minh', 'Vietnã', '[{"p":20,"w":"na prontidão"},{"p":80,"w":"antes da chegada"}]'::jsonb, '', 0, '', '[{"n":"Mirta","e":"mirta.wang@changfengtires.com"},{"n":"Sophie","e":"sophie.zhang@changfengtires.com"}]'::jsonb),
  (29, 'TORNEL', 'COMPANIA HULERA TORNEL SA DE CV', 'JK', 'Pneu', array['Passeio']::text[], 'Veracruz', 'México', '[{"p":30,"w":"na prontidão"},{"p":70,"w":"antes da chegada"}]'::jsonb, '', 0, '', '[{"n":"Contato","e":"sbagga@tornel.com.mx"}]'::jsonb),
  (30, 'APTANY', 'WANLI GROUP TRADE LIMITED', 'APTANY', 'Pneu', array['Passeio','Carga']::text[], 'Shenzhen', 'China', '[{"p":10,"w":"na prontidão"},{"p":90,"w":"antes da chegada"}]'::jsonb, '', 0, '', '[{"n":"Luiza","e":"luiza.zhu@outlook.com"}]'::jsonb),
  (31, 'APTANY', 'WANLI GROUP TRADE LIMITED', 'APTANY', 'Pneu', array['Passeio']::text[], 'Ho Chi Minh', 'Camboja', '[{"p":10,"w":"na prontidão"},{"p":90,"w":"antes da chegada"}]'::jsonb, '', 0, '', '[{"n":"Luiza","e":"luiza.zhu@outlook.com"}]'::jsonb),
  (32, 'BLACKARROW', 'UNINOVA INTERNATIONAL DEVELOPMENT LIMITED', 'UNINOVA', 'Pneu', array['Passeio','LT','Carga']::text[], 'Shenzhen', 'China', '[{"p":30,"w":"na prontidão"},{"p":70,"w":"antes da chegada"}]'::jsonb, '', 0, '', '[{"n":"Vendas","e":"sales13@uninovatyre.com"}]'::jsonb),
  (33, 'PETLAS', 'PETLAS LASTIK SAN. VE TIC. A.S.', 'PETLAS', 'Pneu', array['Agrícola']::text[], 'Mersin', 'Turquia', '[{"p":30,"w":"antecipado"},{"p":70,"w":"dias antes da chegada"}]'::jsonb, 'É o que consta nos documentos.', 0, 'Após a primeira operação, é possível tentar um crédito com a fábrica.', '[{"n":"Olus","e":"olus.dayan@petlas.com.tr"}]'::jsonb),
  (34, 'GOLDEN CROWN', 'PT. MATAHARI', 'PT MATAHARI', 'Pneu', array['Carga']::text[], 'Semarang', 'Indonésia', '[{"p":100,"w":"antes do embarque"}]'::jsonb, '', 0, '', '[{"n":"Alessandro","e":"alessandro@zc-rubber.com"}]'::jsonb),
  (35, 'TORNADO', 'GRIPMASTER RUBBER LTD.', 'SPEEDMAX TIRE', 'Pneu', array['Passeio','Carga']::text[], 'Nipon / Ho Chi Minh', 'China / Vietnã', '[{"p":20,"w":"antecipado"},{"p":80,"w":"30 dias após a data do BL"}]'::jsonb, '', 0, '', '[{"n":"Mario","e":"mario.silva@speedmax.com"},{"n":"Erick","e":"erick.santos@speedmax.com"}]'::jsonb),
  (36, 'TIANFU', 'QINGDAO ARCH INTERNATIONAL TRADING CO., LTD', 'QINGDAO ARCH', 'Pneu', array['Passeio']::text[], 'Qingdao', 'China', '[{"p":30,"w":"antecipado"},{"p":70,"w":"prazo não informado"}]'::jsonb, '', 0, '', '[{"n":"Vicky","e":"vmj@erimiletyre.com"}]'::jsonb),
  (37, 'INVOVIC', 'QINGDAO SUNWIDE TYRE CORP., LIMITED', 'SUNWIDE', 'Pneu', array['Passeio']::text[], 'Qingdao', 'China', '[{"p":30,"w":"antecipado"},{"p":70,"w":"mediante cópia do BL"}]'::jsonb, '', 0, '', '[{"n":"Amy","e":"amy@sunwidetyre.com"}]'::jsonb),
  (38, 'FORCELAND', 'FORCELAND TYRE CO., LTD', 'FORCELAND', 'Pneu', array['Passeio','LT','Carga']::text[], 'Ningbo', 'China', '[{"p":30,"w":"antecipado"},{"p":70,"w":"mediante cópia do BL"}]'::jsonb, '', 2, 'Em 17/11/2026 foi informado que a venda é exclusiva só para a Siqueira Campos.', '[{"n":"Simon","e":"simon@wrtyre.com"}]'::jsonb),
  (39, 'LANDSPIDER', 'QINGDAO LANDSPIDER TIRE CORP., LTD', 'LANDSPIDER', 'Pneu', array['Passeio','LT']::text[], 'Shanghai', 'China', '[{"p":30,"w":"antecipado"},{"p":70,"w":"antes da chegada"}]'::jsonb, '', 0, '', '[{"n":"Shirley","e":"shirley@landspidertire.com"}]'::jsonb),
  (40, 'MILEVER', 'MANAH INTERNATIONAL LIMITED', 'MANAH', 'Pneu', array['Carga leve']::text[], 'Wuhu', 'China', '[{"p":10,"w":"antecipado"},{"p":90,"w":"10 dias antes da chegada"}]'::jsonb, '', 0, '', '[{"n":"Comex","e":"comex@manahtires.com"},{"n":"Regis","e":"regis@manahtires.com"}]'::jsonb),
  (41, 'ALFAMOTORS', 'ROADTIRES CORP Morelan S.A.', 'ROADTIRES', 'Pneu', array['Passeio','LT']::text[], 'Qingdao', 'China', '[{"p":20,"w":"para produzir"},{"p":80,"w":"antes da chegada"}]'::jsonb, '', 0, '', '[{"n":"Compras","e":"compras@roadtirescorp.com"},{"n":"Gerência","e":"gerencia@roadtirescorp.com"}]'::jsonb),
  (42, 'FORERUNNER', 'QINGDAO QIHANG TYRE CO., LTD.', 'FORERUNNER', 'Pneu', array['Agrícola']::text[], 'Qingdao', 'China', '[{"p":20,"w":"antecipado"},{"p":80,"w":"antes do navio chegar ao porto de destino"}]'::jsonb, '', 0, '', '[{"n":"Leo","e":"sale05@qihangtyre.com.cn"}]'::jsonb),
  (43, 'TECHSHIELD', 'QINGDAO TYRELAND', 'TYRELAND', 'Pneu', array['Carga']::text[], '', 'Camboja', '[{"p":25,"w":"antecipado"},{"p":75,"w":"30 dias após o embarque"}]'::jsonb, '', 0, '', '[{"n":"Jerry","e":"jerry@tyreland.com"}]'::jsonb),
  (44, 'MARCOPOLO', 'MARCO POLO TRADE EXPERTS LIMITED', 'MARCOPOLO', 'Rack', array[]::text[], 'Qingdao', 'China', '[{"p":10,"w":"antecipado"},{"p":90,"w":"30 dias após o embarque"}]'::jsonb, '', 0, '', '[{"n":"Andrey","e":"andrey@marcopolotrade.com"}]'::jsonb),
  (45, 'SUMEC', 'SUMEC MACHINERY AND ELECTRIC CO LTD', 'SUMEC', 'Rodas', array[]::text[], 'Yangzhou', 'China', '[{"p":100,"w":"antes da chegada"}]'::jsonb, '', 0, '', '[{"n":"Andrey","e":"andrey@marcopolotrade.com"}]'::jsonb)
) as v(ordem, marca, exportador, fabrica, produto, tipos, porto, pais, pagamentos, nota_pagamento, restricao, observacao, contatos)
where not exists (select 1 from crm_fornecedores);

-- conferência: tem que mostrar 45
select count(*) as fornecedores_cadastrados from crm_fornecedores;
