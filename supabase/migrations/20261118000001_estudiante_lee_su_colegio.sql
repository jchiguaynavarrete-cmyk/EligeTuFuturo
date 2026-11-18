-- =====================================================================
-- Un estudiante puede leer la fila de SU colegio en `instituciones`.
--
-- La app decide si le abre el simulador mirando el plan del colegio del
-- estudiante (`perfiles.institucion_id` → `instituciones.estado_plan` y
-- `fecha_termino`). Pero `instituciones_leer` solo deja leer la fila a la
-- propia institución o al administrador: para el estudiante la consulta
-- volvía vacía y la app mostraba "Tu colegio aún no tiene EligeTuFuturo"
-- aunque el colegio tuviera el plan pagado.
--
-- Las políticas de lectura se suman (OR): esta no quita acceso a nadie,
-- y cada estudiante ve una sola fila, la de su colegio.
-- =====================================================================
drop policy if exists instituciones_leer_estudiante on public.instituciones;
create policy instituciones_leer_estudiante on public.instituciones
  for select using (
    id = (select p.institucion_id from public.perfiles p where p.id = auth.uid())
  );
