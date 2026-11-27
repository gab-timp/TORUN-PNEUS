-- Tipos de pneu que cada representante pode ver no portal.
--
-- user_roles.tipos_pneu_liberados (text[]): NULL = todos os tipos (padrão, nada muda pra ninguém); lista = só esses
-- tipos; lista vazia = nenhum. As chaves são as categorias do sistema: PASSEIO, CARGAS_TBR, AGRICOLA_FLORESTAL, OUTRO
-- (OUTRO junta moto, OTR, remold e produto sem categoria ou com categoria fora das três primeiras).
--
-- A trava fica no banco: três regras RESTRITIVAS (se combinam com E às que já existem; é o "as restrictive" que
-- importa, ver sql/corrige_restrictive_entregas_precadastro.sql) em produtos, produtos_precos e movimentos. Quem não
-- tem restrição (NULL) passa em tudo, então administrador, editor e os outros logins não sentem diferença.
-- Pedidos já feitos (entregas/vendas) não são mexidos.
--
-- Ordem: rode este SQL ANTES do deploy. Se o site novo chegar primeiro, nada quebra: o cartão só aparece na tela
-- quando a coluna existe.
--
-- Rode no SQL Editor do Supabase. Um bloco só; no fim vem a conferência.

alter table user_roles add column if not exists tipos_pneu_liberados text[];

-- categoria (texto livre ou já padronizado) -> chave do tipo
create or replace function chave_tipo_pneu(cat text)
returns text
language sql
immutable
as $$
  select case regexp_replace(
           upper(translate(coalesce(cat, ''),
             'áàâãäéèêëíìîïóòôõöúùûüçÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ',
             'aaaaaeeeeiiiiooooouuuucAAAAAEEEEIIIIOOOOOUUUUC')),
           '[^A-Z0-9]', '', 'g')
    when 'PASSEIO' then 'PASSEIO'
    when 'CARGASTBR' then 'CARGAS_TBR'
    when 'AGRICOLAFLORESTAL' then 'AGRICOLA_FLORESTAL'
    else 'OUTRO'
  end;
$$;

-- o pneu (pelo código) está liberado pra quem está logado? Sem restrição = sim.
create or replace function pneu_liberado(cod text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select ur.tipos_pneu_liberados is null
            or chave_tipo_pneu((select p.categoria from produtos p where p.codigo = cod)) = any (ur.tipos_pneu_liberados)
     from user_roles ur
     where ur.user_id = auth.uid()),
    true);
$$;

grant execute on function chave_tipo_pneu(text) to authenticated;
grant execute on function pneu_liberado(text) to authenticated;

drop policy if exists "representante so ve tipos liberados" on produtos;
create policy "representante so ve tipos liberados" on produtos as restrictive for select
  using (pneu_liberado(codigo));

drop policy if exists "representante so ve precos dos tipos liberados" on produtos_precos;
create policy "representante so ve precos dos tipos liberados" on produtos_precos as restrictive for select
  using (pneu_liberado(codigo));

drop policy if exists "representante so ve estoque dos tipos liberados" on movimentos;
create policy "representante so ve estoque dos tipos liberados" on movimentos as restrictive for select
  using (pneu_liberado(codigo::text));

-- Conferência 1: as três regras devem aparecer, todas com permissive = RESTRICTIVE.
select tablename, policyname, permissive, cmd
from pg_policies
where policyname in ('representante so ve tipos liberados', 'representante so ve precos dos tipos liberados', 'representante so ve estoque dos tipos liberados')
order by tablename;

-- Conferência 2: quantos produtos caem em cada tipo (o "Outro" deve ser o que sobra, sem surpresa).
select chave_tipo_pneu(categoria) as tipo, count(*) as produtos from produtos group by 1 order by 1;
