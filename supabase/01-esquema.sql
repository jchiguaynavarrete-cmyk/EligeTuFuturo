-- =====================================================================
-- EligeTuFuturo · Esquema de base de datos en Supabase (PostgreSQL)
--
-- Ejecutar en: Supabase → SQL Editor → New query → pegar → Run
--
-- Reemplaza a Firestore. Las colecciones pasan a tablas y las reglas de
-- seguridad a políticas RLS, que PostgreSQL evalúa en cada consulta.
--
-- Los campos de las carreras se mantienen como texto, tal como vienen del
-- scraping original: la migración es fiel y no puede fallar por una
-- conversión de tipo. La app ya los interpreta.
-- =====================================================================


-- =====================================================================
-- FUNCIÓN AUXILIAR: ¿quien consulta es administrador?
-- Equivale a isAdmin() de las reglas de Firestore.
-- =====================================================================
create or replace function public.es_admin()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.perfiles
    where id = auth.uid() and rol = 'admin'
  );
$$;


-- =====================================================================
-- PERFILES · datos de cada persona
-- Supabase Auth guarda correo y contraseña en auth.users; aquí va el resto.
-- =====================================================================
create table if not exists public.perfiles (
  id                 uuid primary key references auth.users(id) on delete cascade,
  email              text not null,

  nombre             text not null,
  nombres            text,
  apellido_paterno   text,
  apellido_materno   text,

  rut                text not null,
  rut_limpio         text not null unique,   -- la unicidad la garantiza la base

  fecha_nacimiento   date,
  edad               int,

  rol                text not null default 'user'
                       check (rol in ('user', 'admin', 'institucion')),

  institucion_id     uuid,                   -- colegio al que pertenece el estudiante

  creado_en          timestamptz not null default now()
);

create index if not exists perfiles_rol_idx on public.perfiles (rol);
create index if not exists perfiles_institucion_idx on public.perfiles (institucion_id);


-- =====================================================================
-- CARRERAS · el catálogo
-- =====================================================================
create table if not exists public.carreras (
  id                           bigserial primary key,

  codigo_carrera               text,
  carrera                      text not null,
  nombre_institucion           text,
  region_sede                  text,
  sede                         text,
  area_cineunesco              text,
  horario                      text,

  es_tecnico                   text,
  duracion_formal              text,
  vacantes_primer_semestre     text,
  valor_arancel                text,

  -- Ponderaciones
  notas_em                     text,
  psu_lenguaje                 text,
  psu_matematicas              text,
  psu_historia                 text,
  psu_ciencias                 text,
  ranking                      text,

  activa                       boolean not null default true,

  -- Datos complementarios del scraping
  costo_titulacion                    text,
  total_femenino_matriculados         text,
  total_masculino_matriculados        text,
  total_matriculados                  text,
  matriculados_femeninos_primer_anyo  text,
  matriculados_masculinos_primer_anyo text,
  total_matriculados_primer_anyo      text,
  municipal                           text,
  particular_subvencionado            text,
  particular_pagado                   text,
  total_femenino                      text,
  total_masculino                     text,
  total_titulados                     text,
  otros                               text,
  promedio_nem                        text,
  promedio_psu_1er_anyo               text,
  cobertura_psu_1er_anyo              text,
  matematicas2                        text
);

-- Índices para los filtros de la pantalla Carreras.
create index if not exists carreras_activa_idx      on public.carreras (activa);
create index if not exists carreras_area_idx        on public.carreras (area_cineunesco);
create index if not exists carreras_region_idx      on public.carreras (region_sede);
create index if not exists carreras_institucion_idx on public.carreras (nombre_institucion);
create index if not exists carreras_orden_idx       on public.carreras (carrera);

-- Búsqueda por texto en nombre, institución y región, sin distinguir tildes.
create extension if not exists unaccent;

create index if not exists carreras_busqueda_idx on public.carreras
  using gin (
    to_tsvector(
      'simple',
      unaccent(coalesce(carrera, '') || ' ' ||
               coalesce(nombre_institucion, '') || ' ' ||
               coalesce(region_sede, ''))
    )
  );


-- =====================================================================
-- FAVORITOS
-- La clave compuesta impide guardar dos veces la misma carrera.
-- =====================================================================
create table if not exists public.favoritos (
  usuario_id  uuid not null references auth.users(id) on delete cascade,
  carrera_id  bigint not null references public.carreras(id) on delete cascade,
  creado_en   timestamptz not null default now(),

  primary key (usuario_id, carrera_id)
);

create index if not exists favoritos_usuario_idx on public.favoritos (usuario_id);


-- =====================================================================
-- PLANES · catálogo comercial
-- =====================================================================
create table if not exists public.planes (
  id                  text primary key,       -- 'escolar', 'comunal', ...
  nombre              text not null,
  descripcion         text,
  caracteristicas     text[] not null default '{}',
  texto_boton         text not null default 'Solicitar plan',

  precio              bigint,                 -- CLP; null = sin precio fijo
  requiere_pago       boolean not null default true,
  requiere_cotizacion boolean not null default false,
  duracion_meses      int not null default 12,

  establecimientos    int,
  cobertura           text,
  ideal_para          text,
  categoria           text check (categoria in ('pagado', 'complementario')),

  destacado           boolean not null default false,
  activo              boolean not null default true,
  orden               int not null default 0
);


-- =====================================================================
-- INSTITUCIONES · plan vigente de cada establecimiento
-- =====================================================================
create table if not exists public.instituciones (
  id                  uuid primary key references auth.users(id) on delete cascade,
  nombre_institucion  text not null,
  rbd                 text,
  correo              text,

  plan_id             text references public.planes(id),
  plan_nombre         text,
  estado_plan         text not null default 'inactivo'
                        check (estado_plan in ('inactivo', 'activo', 'vencido')),

  solicitud_id        uuid,
  fecha_inicio        timestamptz,
  fecha_termino       timestamptz
);


-- =====================================================================
-- SOLICITUDES de plan
-- Las que llegan por el formulario público nacen sin dueño.
-- =====================================================================
create table if not exists public.solicitudes (
  id                   uuid primary key default gen_random_uuid(),

  nombre_institucion   text not null,
  rbd                  text,
  encargado            text not null,
  cargo                text,
  correo               text not null,
  telefono             text,
  cantidad_estudiantes int not null check (cantidad_estudiantes > 0),

  plan_id              text references public.planes(id),
  plan_nombre          text,

  solicitante_id       uuid references auth.users(id) on delete set null,
  origen               text not null default 'app' check (origen in ('app', 'publico')),

  estado               text not null default 'pendiente'
                         check (estado in ('pendiente', 'aprobada', 'rechazada')),

  monto                bigint,
  estado_pago          text not null default 'pendiente'
                         check (estado_pago in ('no_aplica', 'pendiente', 'pagado', 'fallido')),
  pago_id              uuid,

  admin_id             uuid references auth.users(id) on delete set null,
  motivo_rechazo       text,

  fecha_solicitud      timestamptz not null default now(),
  fecha_resolucion     timestamptz,

  contacto_id          uuid
);

create index if not exists solicitudes_solicitante_idx on public.solicitudes (solicitante_id, fecha_solicitud desc);
create index if not exists solicitudes_correo_idx      on public.solicitudes (correo);
create index if not exists solicitudes_estado_idx      on public.solicitudes (estado);


-- =====================================================================
-- PAGOS · transacciones de Webpay
-- Solo las escribe el backend; desde la app son de solo lectura.
-- =====================================================================
create table if not exists public.pagos (
  id                  uuid primary key default gen_random_uuid(),
  solicitud_id        uuid not null references public.solicitudes(id) on delete cascade,
  solicitante_id      uuid references auth.users(id) on delete set null,

  buy_order           text not null unique,
  session_id          text,
  amount              bigint not null,
  token               text,

  estado              text not null default 'iniciado'
                        check (estado in ('iniciado','autorizado','rechazado','cancelado','error')),

  authorization_code  text,
  payment_type_code   text,
  response_code       int,
  transaction_date    timestamptz,

  creado_en           timestamptz not null default now(),
  actualizado_en      timestamptz not null default now()
);

create index if not exists pagos_solicitud_idx on public.pagos (solicitud_id);
create index if not exists pagos_token_idx     on public.pagos (token);


-- =====================================================================
-- CONTACTOS · formulario público de la landing
-- =====================================================================
create table if not exists public.contactos (
  id                uuid primary key default gen_random_uuid(),
  nombre            text not null,
  cargo             text,
  institucion       text not null,
  correo            text not null,
  telefono          text,
  cantidad_alumnos  int,

  plan_id           text,
  plan_nombre       text,

  estado            text not null default 'nuevo',
  creado_en         timestamptz not null default now()
);

create index if not exists contactos_correo_idx on public.contactos (correo, creado_en desc);


-- =====================================================================
-- Perfil automático al registrarse
-- Supabase crea la cuenta en auth.users; este disparador crea su perfil
-- con los datos que vengan del formulario de registro.
-- =====================================================================
create or replace function public.crear_perfil_nuevo_usuario()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.perfiles (
    id, email, nombre, nombres, apellido_paterno, apellido_materno,
    rut, rut_limpio, fecha_nacimiento, edad, rol
  )
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'nombre', new.email),
    new.raw_user_meta_data->>'nombres',
    new.raw_user_meta_data->>'apellido_paterno',
    new.raw_user_meta_data->>'apellido_materno',
    coalesce(new.raw_user_meta_data->>'rut', ''),
    coalesce(new.raw_user_meta_data->>'rut_limpio', new.id::text),
    (new.raw_user_meta_data->>'fecha_nacimiento')::date,
    (new.raw_user_meta_data->>'edad')::int,
    'user'
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists al_crear_usuario on auth.users;
create trigger al_crear_usuario
  after insert on auth.users
  for each row execute function public.crear_perfil_nuevo_usuario();
