-- user_preferences ganha tema (sincroniza o toggle claro/escuro/sistema entre
-- dispositivos, em vez de ficar só no localStorage do navegador) e duas
-- preferências de aviso: notif_nova_proposta (escritório — avisa quando chega
-- proposta nova de representante) e notif_mudanca_etapa (representante — avisa
-- quando uma proposta dele muda de etapa).
--
-- O upsert por user_id já funciona hoje em produção (kanban_colunas_recolhidas),
-- então já existe alguma policy de self-service aqui — como ela não está
-- versionada neste projeto, reafirmamos defensivamente (RLS é por linha, não
-- por coluna, então uma policy "auth.uid() = user_id" já deveria cobrir as
-- colunas novas automaticamente; isto é só reforço).
--
-- Aditivo e independente — pode rodar a qualquer momento. Rode no SQL Editor do Supabase.

alter table user_preferences add column if not exists tema text;
alter table user_preferences drop constraint if exists user_preferences_tema_check;
alter table user_preferences add constraint user_preferences_tema_check
  check (tema is null or tema in ('light', 'dark', 'system'));

alter table user_preferences add column if not exists notif_nova_proposta boolean not null default true;
alter table user_preferences add column if not exists notif_mudanca_etapa boolean not null default true;

alter table user_preferences enable row level security;

drop policy if exists "usuario le propria preferencia" on user_preferences;
create policy "usuario le propria preferencia" on user_preferences for select
  using (user_id = auth.uid());

drop policy if exists "usuario grava propria preferencia" on user_preferences;
create policy "usuario grava propria preferencia" on user_preferences for insert
  with check (user_id = auth.uid());

drop policy if exists "usuario atualiza propria preferencia" on user_preferences;
create policy "usuario atualiza propria preferencia" on user_preferences for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

select * from user_preferences limit 20;
