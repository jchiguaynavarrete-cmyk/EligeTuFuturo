-- =====================================================================
-- Fechas del proceso PAES
--
-- Estaban escritas a mano dentro del código de la pantalla, así que
-- actualizarlas cada año exigía tocar el programa y volver a publicarlo.
-- Pasan a la base para que un administrador las edite desde la app.
--
-- La semilla son exactamente las que estaban en el código, para no
-- inventar fechas oficiales: quien corresponda las actualizará.
-- =====================================================================

create table if not exists public.fechas_paes (
  id          bigint generated always as identity primary key,

  titulo      text not null,
  descripcion text,
  fecha       date not null,

  -- El orden lo decide quien administra, no la fecha: así se puede
  -- mostrar un hito sin fecha definida al final sin descolocar la lista.
  orden       int not null default 0,

  activa      boolean not null default true,

  actualizado_en timestamptz not null default now(),
  actualizado_por uuid references auth.users(id)
);

create index if not exists fechas_paes_orden_idx on public.fechas_paes (orden, fecha);

-- --------------------------------------------------------------------
-- Semilla: las cuatro que estaban en el código
-- --------------------------------------------------------------------
insert into public.fechas_paes (titulo, descripcion, fecha, orden)
select * from (values
  ('Inicio inscripción PAES',
   'Se abre el plazo para inscribirse en el proceso.',
   date '2025-06-01', 1),
  ('Cierre inscripción PAES',
   'Último día para inscribirse. Después no se aceptan nuevas inscripciones.',
   date '2025-07-10', 2),
  ('Rendición PAES',
   'Días de aplicación de las pruebas.',
   date '2025-11-25', 3),
  ('Resultados PAES',
   'Publicación de los puntajes obtenidos.',
   date '2026-01-05', 4)
) as semilla(titulo, descripcion, fecha, orden)
where not exists (select 1 from public.fechas_paes);

-- --------------------------------------------------------------------
-- Reglas de acceso
--
-- Las fechas son información pública del proceso: las lee cualquiera,
-- incluso sin cuenta. Editarlas es solo del administrador.
-- --------------------------------------------------------------------
alter table public.fechas_paes enable row level security;

drop policy if exists fechas_paes_leer on public.fechas_paes;
create policy fechas_paes_leer on public.fechas_paes
  for select using (true);

drop policy if exists fechas_paes_crear on public.fechas_paes;
create policy fechas_paes_crear on public.fechas_paes
  for insert with check (public.es_admin());

drop policy if exists fechas_paes_actualizar on public.fechas_paes;
create policy fechas_paes_actualizar on public.fechas_paes
  for update using (public.es_admin()) with check (public.es_admin());

drop policy if exists fechas_paes_borrar on public.fechas_paes;
create policy fechas_paes_borrar on public.fechas_paes
  for delete using (public.es_admin());
