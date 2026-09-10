-- Diagnóstico + correção: cards de Entregas (Kanban) não atualizam sozinhos,
-- só quando a página é recarregada.
--
-- >>> RESULTADO DA INVESTIGAÇÃO: a causa raiz NÃO era do banco -- era o app
-- registrando 9 postgres_changes no mesmo canal do Realtime (bug do
-- realtime-js, bindings do fim da lista não recebem evento). Corrigido em
-- site/app.js (subscribeRealtime -> um canal por tabela).
--
-- O passo 2 abaixo (replica identity full em entregas) foi aplicado assim
-- mesmo e vale manter: a policy de SELECT de entregas filtra por linha
-- (representante), e o Realtime precisa da linha antiga completa pra avaliar
-- RLS em UPDATE/DELETE. Não resolveu sozinho, mas é o setup correto.
--
-- HIPÓTESE 1 (DESCARTADA): tabela fora da publicação supabase_realtime.
--   `alter publication ... add table public.entregas` retornou "relation
--   already member of publication" -- já está publicada.
--
-- HIPÓTESE 2 (CONFIRMANDO): falta REPLICA IDENTITY FULL em entregas.
--   Diagnóstico mostrou TODAS as tabelas como 'default (só PK)', inclusive as
--   que funcionam. Isso não descarta -- reforça:
--   - Sem REPLICA IDENTITY FULL, a linha ANTIGA nos eventos UPDATE/DELETE só
--     traz a PK.
--   - O Realtime roda a RLS contra essa linha antiga pra liberar o evento.
--   - Tabelas que funcionam (clientes/produtos/vendas): policy permissiva
--     (using (true) pra quem está logado) -- não olha coluna nenhuma, a PK
--     basta, evento passa.
--   - entregas: policy filtra por linha (representante só vê os próprios
--     pedidos -- olha origem/vendedor). Sem essas colunas na linha antiga, a
--     policy não pode ser avaliada -> UPDATE é descartado. INSERT passa
--     porque a linha nova vem completa.

-- 1) Ver as policies de RLS de entregas (confirma que a policy olha coluna).
--    Compare com uma tabela que funciona pra ver a diferença.
select tablename, policyname, cmd, qual as condicao_using
from pg_policies
where schemaname = 'public' and tablename in ('entregas', 'clientes')
order by tablename, policyname;

-- 2) Correção: faz a linha antiga vir completa nos eventos UPDATE/DELETE, pra
--    o Realtime conseguir aplicar a RLS e entregar o evento.
--    Seguro e reversível (volta com: alter table ... replica identity default).
--    Custo: cada UPDATE em entregas grava a linha antiga inteira no WAL em vez
--    de só a PK -- irrelevante pro volume de escrita dessa tabela.
alter table public.entregas replica identity full;

-- 3) Confirmação -- deve retornar 'full':
select case c.relreplident
         when 'd' then 'default (só PK)' when 'n' then 'nothing'
         when 'f' then 'full' when 'i' then 'index'
       end as replica_identity_entregas
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relname = 'entregas';

-- 4) Testa no app: abre Entregas em duas abas, arrasta um card numa e vê se a
--    outra atualiza sozinha, sem F5. Testa também editar um pedido pelo modal.
--
-- Se AINDA não atualizar depois disso, a policy de RLS de entregas pode estar
-- num formato que o Realtime não casa (ex.: FOR ALL em vez de SELECT, ou role
-- errada) -- aí manda o resultado do passo 1 que eu analiso.
