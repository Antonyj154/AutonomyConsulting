-- =====================================================================
-- 0001 · ESQUEMA: tipos, tablas, restricciones, índices y triggers
-- Plataforma de evaluaciones · Autonomy Consulting
-- Ejecutar una sola vez, en orden: 0001 → 0002 → 0003 → 0004
-- =====================================================================

create extension if not exists pgcrypto with schema extensions;

-- ---------- Tipos ----------------------------------------------------
create type public.rol_usuario       as enum ('admin_general', 'admin_empresa', 'colaborador');
create type public.estado_registro   as enum ('activo', 'inactivo');
create type public.estado_envio      as enum ('pendiente', 'solicitado', 'enviado', 'error');
create type public.estado_evaluacion as enum ('pendiente', 'en_progreso', 'finalizada');
create type public.estado_informe    as enum ('no_generado', 'en_proceso', 'disponible');
create type public.rubrica           as enum ('positivo', 'negativo');

-- ---------- Trigger genérico de updated_at ---------------------------
create function public.tocar_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- ---------- Empresas -------------------------------------------------
create table public.empresas (
  id                    uuid primary key default gen_random_uuid(),
  nombre                text not null check (char_length(btrim(nombre)) between 2 and 120),
  correo                text not null check (correo ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  estado                public.estado_registro not null default 'activo',
  informes_contratados  integer not null default 0 check (informes_contratados >= 0),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
create unique index empresas_nombre_unico on public.empresas (lower(btrim(nombre)));
create trigger empresas_updated before update on public.empresas
  for each row execute function public.tocar_updated_at();

-- ---------- Perfiles (1 a 1 con auth.users; aquí vive el ROL) --------
-- Las contraseñas y PIN NO se guardan aquí: los custodia Supabase Auth (cifrados).
create table public.perfiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  usuario     text not null unique check (usuario ~ '^[a-z0-9]{3,40}$'),
  rol         public.rol_usuario not null,
  empresa_id  uuid references public.empresas (id) on delete restrict,
  nombres     text not null default '',
  apellidos   text not null default '',
  estado      public.estado_registro not null default 'activo',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint perfiles_rol_empresa check (
    (rol = 'admin_general' and empresa_id is null) or
    (rol <> 'admin_general' and empresa_id is not null)
  )
);
create index perfiles_empresa_idx on public.perfiles (empresa_id);
create trigger perfiles_updated before update on public.perfiles
  for each row execute function public.tocar_updated_at();

-- ---------- Colaboradores -------------------------------------------
create table public.colaboradores (
  id                   uuid primary key default gen_random_uuid(),
  perfil_id            uuid not null unique references public.perfiles (id) on delete restrict,
  empresa_id           uuid not null references public.empresas (id) on delete restrict,
  primer_nombre        text not null check (char_length(btrim(primer_nombre)) between 1 and 60),
  segundo_nombre       text check (segundo_nombre is null or char_length(segundo_nombre) <= 60),
  primer_apellido      text not null check (char_length(btrim(primer_apellido)) between 1 and 60),
  segundo_apellido     text not null check (char_length(btrim(segundo_apellido)) between 1 and 60),
  cargo                text check (cargo is null or char_length(cargo) <= 120),
  correo               text not null check (correo ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  estado               public.estado_registro not null default 'activo',
  estado_envio         public.estado_envio not null default 'pendiente',
  envio_solicitado_en  timestamptz,           -- fecha de la última solicitud de envío
  envio_procesado_en   timestamptz,           -- fecha en que el servicio de correo respondió
  eliminado_en         timestamptz,           -- eliminación lógica
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
create index colaboradores_empresa_idx on public.colaboradores (empresa_id) where eliminado_en is null;
create unique index colaboradores_correo_unico
  on public.colaboradores (empresa_id, lower(correo)) where eliminado_en is null;
create trigger colaboradores_updated before update on public.colaboradores
  for each row execute function public.tocar_updated_at();

-- ---------- Huella del PIN vigente (solo para garantizar que no haya PIN duplicados) ----
-- Es una huella irreversible (HMAC). El PIN real solo vive cifrado en Supabase Auth.
create table public.colaborador_pin (
  colaborador_id  uuid primary key references public.colaboradores (id) on delete cascade,
  huella          text not null unique,
  generado_en     timestamptz not null default now()
);

-- ---------- Cola de envíos (la lee el servicio de correo externo) ----
create table public.solicitudes_envio (
  id              uuid primary key default gen_random_uuid(),
  colaborador_id  uuid not null references public.colaboradores (id) on delete restrict,
  empresa_id      uuid not null references public.empresas (id) on delete restrict,
  solicitado_por  uuid not null references public.perfiles (id) on delete restrict,
  estado          public.estado_envio not null default 'solicitado' check (estado <> 'pendiente'),
  pin_cifrado     bytea,                      -- se borra en cuanto el envío se marca como "enviado"
  solicitado_en   timestamptz not null default now(),
  procesado_en    timestamptz,
  error_detalle   text
);
-- Evita solicitudes duplicadas: un colaborador solo puede tener UNA solicitud en curso.
create unique index solicitudes_envio_una_en_curso
  on public.solicitudes_envio (colaborador_id) where estado = 'solicitado';
create index solicitudes_envio_estado_idx on public.solicitudes_envio (estado, solicitado_en);

-- ---------- Bloques y preguntas -------------------------------------
create table public.bloques (
  id            uuid primary key default gen_random_uuid(),
  nombre        text not null check (char_length(btrim(nombre)) between 1 and 120),
  orden         integer not null default 0,
  estado        public.estado_registro not null default 'activo',
  eliminado_en  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create trigger bloques_updated before update on public.bloques
  for each row execute function public.tocar_updated_at();

create table public.preguntas (
  id                 uuid primary key default gen_random_uuid(),
  codigo             integer generated always as identity unique,   -- ID visible (P-001, P-002…)
  bloque_id          uuid not null references public.bloques (id) on delete restrict,
  orden              integer not null default 0,
  estado             public.estado_registro not null default 'activo',
  version_actual_id  uuid,
  eliminado_en       timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index preguntas_bloque_idx on public.preguntas (bloque_id, orden);
create trigger preguntas_updated before update on public.preguntas
  for each row execute function public.tocar_updated_at();

-- Cada cambio de texto, rúbrica o etiquetas crea una versión nueva si la anterior ya fue respondida.
-- Así las evaluaciones históricas conservan exactamente lo que vio el colaborador.
create table public.pregunta_versiones (
  id                  uuid primary key default gen_random_uuid(),
  pregunta_id         uuid not null references public.preguntas (id) on delete cascade,
  numero              integer not null,
  texto               text not null check (char_length(btrim(texto)) between 3 and 1000),
  rubrica             public.rubrica not null default 'positivo',
  etiqueta_izquierda  text not null default 'En desacuerdo' check (char_length(btrim(etiqueta_izquierda)) between 1 and 60),
  etiqueta_centro     text not null default 'Neutro'        check (char_length(btrim(etiqueta_centro)) between 1 and 60),
  etiqueta_derecha    text not null default 'De acuerdo'    check (char_length(btrim(etiqueta_derecha)) between 1 and 60),
  created_at          timestamptz not null default now(),
  unique (pregunta_id, numero)
);
alter table public.preguntas
  add constraint preguntas_version_actual_fk
  foreign key (version_actual_id) references public.pregunta_versiones (id) on delete set null;

-- ---------- Consentimiento de datos personales (versionado) ---------
create table public.consentimientos (
  id          uuid primary key default gen_random_uuid(),
  version     integer not null unique,
  texto       text not null check (char_length(btrim(texto)) between 20 and 20000),
  vigente     boolean not null default false,
  creado_por  uuid references public.perfiles (id) on delete set null,
  created_at  timestamptz not null default now()
);
create unique index consentimientos_un_vigente on public.consentimientos (vigente) where vigente;

-- ---------- Evaluaciones (una por colaborador) ----------------------
create table public.evaluaciones (
  id                         uuid primary key default gen_random_uuid(),
  colaborador_id             uuid not null unique references public.colaboradores (id) on delete restrict,
  empresa_id                 uuid not null references public.empresas (id) on delete restrict,
  estado                     public.estado_evaluacion not null default 'pendiente',
  consentimiento_id          uuid references public.consentimientos (id) on delete restrict,
  consentimiento_aceptado_en timestamptz,
  iniciada_en                timestamptz,
  finalizada_en              timestamptz,
  estado_informe             public.estado_informe not null default 'no_generado',
  informe_ruta               text,            -- ruta del archivo dentro del bucket privado "informes"
  informe_disponible_en      timestamptz,
  created_at                 timestamptz not null default now(),
  updated_at                 timestamptz not null default now()
);
create index evaluaciones_empresa_estado_idx on public.evaluaciones (empresa_id, estado);
create trigger evaluaciones_updated before update on public.evaluaciones
  for each row execute function public.tocar_updated_at();

-- ---------- Respuestas ----------------------------------------------
-- Al iniciar la evaluación se crea una fila por pregunta (cuestionario "congelado").
-- posicion: 1 = izquierda, 2 = centro, 3 = derecha.
-- puntaje : -1 / 0 / 1 (se invierte el signo si la rúbrica es negativa). Lo calcula la base.
create table public.respuestas (
  id                   uuid primary key default gen_random_uuid(),
  evaluacion_id        uuid not null references public.evaluaciones (id) on delete cascade,
  empresa_id           uuid not null references public.empresas (id) on delete restrict,
  colaborador_id       uuid not null references public.colaboradores (id) on delete restrict,
  pregunta_id          uuid not null references public.preguntas (id) on delete restrict,
  pregunta_version_id  uuid not null references public.pregunta_versiones (id) on delete restrict,
  bloque_nombre        text not null,
  bloque_orden         integer not null,
  pregunta_orden       integer not null,
  posicion             smallint check (posicion in (1, 2, 3)),
  puntaje              smallint check (puntaje in (-1, 0, 1)),
  respondida_en        timestamptz,
  unique (evaluacion_id, pregunta_id),
  constraint respuestas_posicion_puntaje check ((posicion is null) = (puntaje is null))
);
create index respuestas_empresa_idx on public.respuestas (empresa_id);
create index respuestas_colaborador_idx on public.respuestas (colaborador_id);
create index respuestas_version_idx on public.respuestas (pregunta_version_id);

-- ---------- Historial de acciones administrativas -------------------
create table public.historial_acciones (
  id          bigint generated always as identity primary key,
  actor_id    uuid references public.perfiles (id) on delete set null,
  empresa_id  uuid references public.empresas (id) on delete set null,
  accion      text not null,
  entidad     text not null,
  entidad_id  uuid,
  detalle     jsonb not null default '{}'::jsonb,   -- nunca contiene PIN ni contraseñas
  created_at  timestamptz not null default now()
);
create index historial_empresa_idx on public.historial_acciones (empresa_id, created_at desc);

-- ---------- Control de intentos de acceso (bloqueo temporal) --------
create table public.intentos_acceso (
  usuario          text primary key,
  fallidos         integer not null default 0,
  bloqueado_hasta  timestamptz,
  ultimo_intento   timestamptz not null default now()
);
