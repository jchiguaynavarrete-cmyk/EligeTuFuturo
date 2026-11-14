-- =====================================================================
-- EligeTuFuturo · Políticas de seguridad (RLS)
--
-- Ejecutar DESPUÉS de 01-esquema.sql, en el SQL Editor de Supabase.
--
-- Equivalen a las reglas de Firestore. La diferencia importante: en
-- PostgreSQL, si una tabla tiene RLS activo y ninguna política la
-- permite, el acceso se deniega. Igual que el bloqueo final que
-- teníamos en Firestore, pero por omisión.
-- =====================================================================

alter table public.perfiles      enable row level security;
alter table public.carreras      enable row level security;
alter table public.favoritos     enable row level security;
alter table public.planes        enable row level security;
alter table public.instituciones enable row level security;
alter table public.solicitudes   enable row level security;
alter table public.pagos         enable row level security;
alter table public.contactos     enable row level security;


-- =====================================================================
-- PERFILES
-- Cada quien el suyo; el administrador los ve todos.
-- Nadie puede cambiarse el rol a sí mismo.
-- =====================================================================
drop policy if exists perfiles_leer on public.perfiles;
create policy perfiles_leer on public.perfiles
  for select using (id = auth.uid() or public.es_admin());

drop policy if exists perfiles_crear on public.perfiles;
create policy perfiles_crear on public.perfiles
  for insert with check (id = auth.uid());

drop policy if exists perfiles_actualizar on public.perfiles;
create policy perfiles_actualizar on public.perfiles
  for update
  using (id = auth.uid() or public.es_admin())
  with check (
    public.es_admin()
    -- Quien no es admin puede editar su perfil, pero no ascenderse.
    -- mi_rol() es security definer: no vuelve a disparar esta política.
    or (id = auth.uid() and rol = public.mi_rol())
  );


-- =====================================================================
-- CARRERAS
-- Catálogo público: se puede ver sin iniciar sesión.
-- Solo el administrador modifica, y nadie crea ni borra desde la app.
-- =====================================================================
drop policy if exists carreras_leer on public.carreras;
create policy carreras_leer on public.carreras
  for select using (true);

drop policy if exists carreras_actualizar on public.carreras;
create policy carreras_actualizar on public.carreras
  for update using (public.es_admin()) with check (public.es_admin());


-- =====================================================================
-- FAVORITOS
-- Estrictamente propios. Este era el hueco que tenía Firestore:
-- cualquiera con sesión podía leer los de todos.
-- =====================================================================
drop policy if exists favoritos_leer on public.favoritos;
create policy favoritos_leer on public.favoritos
  for select using (usuario_id = auth.uid());

drop policy if exists favoritos_crear on public.favoritos;
create policy favoritos_crear on public.favoritos
  for insert with check (usuario_id = auth.uid());

drop policy if exists favoritos_borrar on public.favoritos;
create policy favoritos_borrar on public.favoritos
  for delete using (usuario_id = auth.uid());


-- =====================================================================
-- PLANES
-- Lectura pública: la landing institucional los muestra sin sesión.
-- =====================================================================
drop policy if exists planes_leer on public.planes;
create policy planes_leer on public.planes
  for select using (true);

drop policy if exists planes_escribir on public.planes;
create policy planes_escribir on public.planes
  for all using (public.es_admin()) with check (public.es_admin());


-- =====================================================================
-- INSTITUCIONES
-- La institución ve la suya; el administrador todas.
-- El plan y sus fechas los escribe el backend, no el navegador.
-- =====================================================================
drop policy if exists instituciones_leer on public.instituciones;
create policy instituciones_leer on public.instituciones
  for select using (id = auth.uid() or public.es_admin());


-- =====================================================================
-- SOLICITUDES
-- La institución ve y crea las suyas; el administrador todas.
--
-- Al crear se exigen valores neutros: nadie puede llegar con su
-- solicitud ya aprobada ni ponerse un monto. El estado, el monto y el
-- estado de pago solo los cambia el administrador o el backend.
-- =====================================================================
drop policy if exists solicitudes_leer on public.solicitudes;
create policy solicitudes_leer on public.solicitudes
  for select using (solicitante_id = auth.uid() or public.es_admin());

drop policy if exists solicitudes_crear on public.solicitudes;
create policy solicitudes_crear on public.solicitudes
  for insert with check (
    solicitante_id = auth.uid()
    and estado = 'pendiente'
    and monto is null
    and pago_id is null
    and admin_id is null
    and origen = 'app'
    and cantidad_estudiantes > 0
    and cantidad_estudiantes <= 100000
    and length(nombre_institucion) between 3 and 80
  );

drop policy if exists solicitudes_actualizar on public.solicitudes;
create policy solicitudes_actualizar on public.solicitudes
  for update using (public.es_admin()) with check (public.es_admin());


-- =====================================================================
-- PAGOS
-- Solo lectura desde la app, y únicamente los propios.
-- Las escrituras llegan por el backend con la clave de servicio, que
-- no pasa por RLS.
-- =====================================================================
drop policy if exists pagos_leer on public.pagos;
create policy pagos_leer on public.pagos
  for select using (solicitante_id = auth.uid() or public.es_admin());


-- =====================================================================
-- CONTACTOS
-- Los escribe el backend. Desde la app solo los lee el administrador.
-- Dejar escritura anónima aquí permitiría llenar la base de basura.
-- =====================================================================
drop policy if exists contactos_leer on public.contactos;
create policy contactos_leer on public.contactos
  for select using (public.es_admin());
