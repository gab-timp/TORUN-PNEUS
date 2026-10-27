-- SEM VENDA: unidade de negócio na Reserva (Atacado ou Encomenda).
--
-- sv_reservas ganha unidade_negocio: 'ATACADO' | 'ENCOMENDA'. É só uma informação da reserva (de qual unidade é a
-- venda): não limita quem vê a reserva. A tela exige a unidade ao reservar; reservas antigas ficam com a coluna
-- vazia e aparecem com "—".
--
-- Aditivo: dá pra rodar antes do deploy. Rode ANTES de abrir o preview novo: a tela nova grava unidade_negocio ao
-- reservar e falha sem a coluna.

alter table sv_reservas add column if not exists unidade_negocio text;

-- só os dois valores (vazio vale para as reservas antigas)
alter table sv_reservas drop constraint if exists sv_reservas_unidade_negocio_check;
alter table sv_reservas add constraint sv_reservas_unidade_negocio_check
  check (unidade_negocio is null or unidade_negocio in ('ATACADO', 'ENCOMENDA'));

notify pgrst, 'reload schema';

-- Confere (deve listar 1 coluna nova em sv_reservas e a regra dos dois valores):
select 'coluna nova em sv_reservas' as item, count(*)::text as valor
  from information_schema.columns
  where table_name = 'sv_reservas' and column_name = 'unidade_negocio'
union all
select 'regra dos valores', count(*)::text
  from pg_constraint where conname = 'sv_reservas_unidade_negocio_check';
