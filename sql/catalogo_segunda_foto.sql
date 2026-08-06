-- Catálogo: segunda foto por produto
-- Rode isso uma vez no SQL Editor do Supabase (adicional ao catalogo_setup_agosto2026.sql já rodado).

alter table produtos add column if not exists foto_path_2 text;
