-- =====================================================================
-- Columnas numéricas para ordenar carreras
--
-- `valor_arancel` y `duracion_formal` se guardan como texto, tal como
-- vienen del scraping ("$1.234.567", "10 semestres"). Ordenar por texto
-- da resultados absurdos: "$9.000" quedaría después de "$10.000.000"
-- porque compara carácter a carácter.
--
-- Estas columnas se calculan solas a partir del texto y permiten ordenar
-- en la base, que es lo que necesita la pantalla paginada.
-- =====================================================================

alter table public.carreras
  add column if not exists arancel_num bigint
    generated always as (
      nullif(regexp_replace(coalesce(valor_arancel, ''), '[^0-9]', '', 'g'), '')::bigint
    ) stored;

alter table public.carreras
  add column if not exists duracion_num int
    generated always as (
      nullif(regexp_replace(coalesce(duracion_formal, ''), '[^0-9]', '', 'g'), '')::int
    ) stored;

create index if not exists carreras_arancel_idx  on public.carreras (arancel_num);
create index if not exists carreras_duracion_idx on public.carreras (duracion_num);
