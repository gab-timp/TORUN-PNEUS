-- Portal do representante enxerga também as vendas em que é SUB-representante.
--
-- Rode DEPOIS de sql/vendas_sub_representantes.sql (precisa da coluna vendas.sub_representantes).
--
-- A política restritiva "representante ve somente suas vendas" liberava a venda só quando o nome da pessoa
-- (user_roles.nome) era igual a vendas.vendedor. Agora também libera quando o nome está na lista
-- vendas.sub_representantes. Quem não é representante (admin, editor, financeiro...) continua vendo tudo,
-- e o representante que não participa da venda continua sem ver.
-- Mesma comparação de antes: sem diferenciar maiúscula/minúscula nem espaços nas pontas.

drop policy if exists "representante ve somente suas vendas" on vendas;
create policy "representante ve somente suas vendas" on vendas
  as restrictive
  for select
  using (
    current_user_role() <> 'representante'
    or exists (
      select 1 from user_roles ur
      where ur.user_id = auth.uid()
        and (
          lower(trim(both from ur.nome)) = lower(trim(both from vendas.vendedor))
          or exists (
            select 1
            from jsonb_array_elements(
              case when jsonb_typeof(vendas.sub_representantes) = 'array'
                   then vendas.sub_representantes else '[]'::jsonb end
            ) as s
            where lower(trim(both from ur.nome)) = lower(trim(both from s->>'nome'))
          )
        )
    )
  );

-- Confira: a política nova está no lugar
select policyname, cmd, permissive, qual
from pg_policies
where tablename = 'vendas' and policyname = 'representante ve somente suas vendas';
