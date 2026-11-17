-- =====================================================================
-- 0003 · SEGURIDAD: Row Level Security, permisos y almacenamiento
-- Principio: el navegador NO escribe directo en ninguna tabla. Solo puede
-- LEER lo que la política le permite y ejecutar funciones que validan
-- su rol y su empresa en el servidor.
-- =====================================================================

-- ---------- 1. Activar RLS en todas las tablas ----------------------
alter table public.empresas            enable row level security;
alter table public.perfiles            enable row level security;
alter table public.colaboradores       enable row level security;
alter table public.colaborador_pin     enable row level security;
alter table public.solicitudes_envio   enable row level security;
alter table public.bloques             enable row level security;
alter table public.preguntas           enable row level security;
alter table public.pregunta_versiones  enable row level security;
alter table public.consentimientos     enable row level security;
alter table public.evaluaciones        enable row level security;
alter table public.respuestas          enable row level security;
alter table public.historial_acciones  enable row level security;
alter table public.intentos_acceso     enable row level security;

-- ---------- 2. Quitar permisos por defecto --------------------------
revoke all on all tables    in schema public from anon, authenticated, public;
revoke all on all sequences in schema public from anon, authenticated, public;
revoke all on all functions in schema public from anon, authenticated, public;
alter default privileges in schema public revoke all on tables    from anon, authenticated, public;
alter default privileges in schema public revoke all on functions from anon, authenticated, public;

-- Solo lectura, y solo en las tablas que la aplicación necesita consultar.
-- (colaborador_pin, solicitudes_envio e intentos_acceso NO se exponen: sin permiso y sin política.)
grant select on public.empresas, public.perfiles, public.colaboradores, public.bloques, public.preguntas,
                public.pregunta_versiones, public.consentimientos, public.evaluaciones, public.respuestas,
                public.historial_acciones
  to authenticated;

grant all on all tables    in schema public to service_role;
grant all on all sequences in schema public to service_role;
grant execute on all functions in schema public to service_role;

-- ---------- 3. Políticas de lectura ---------------------------------
-- Empresas: el admin general ve todas; los demás solo la suya.
create policy empresas_lectura on public.empresas for select to authenticated
  using (public.es_admin_general() or id = public.auth_empresa_id());

-- Perfiles: cada quien ve el suyo; el admin general ve los de administradores de empresa;
-- el admin de empresa ve los de su empresa.
create policy perfiles_lectura on public.perfiles for select to authenticated
  using (
    id = (select auth.uid())
    or (public.es_admin_general() and rol = 'admin_empresa')
    or (public.es_admin_empresa() and empresa_id = public.auth_empresa_id())
  );

-- Colaboradores: la empresa ve los suyos; el colaborador solo su propia ficha.
create policy colaboradores_lectura on public.colaboradores for select to authenticated
  using (
    (public.es_admin_empresa() and empresa_id = public.auth_empresa_id())
    or id = public.auth_colaborador_id()
  );

-- Cuestionario: solo administradores (el colaborador recibe sus preguntas mediante obtener_mi_evaluacion).
create policy bloques_lectura on public.bloques for select to authenticated
  using (public.es_admin_general() or public.es_admin_empresa());
create policy preguntas_lectura on public.preguntas for select to authenticated
  using (public.es_admin_general() or public.es_admin_empresa());
create policy pregunta_versiones_lectura on public.pregunta_versiones for select to authenticated
  using (public.es_admin_general() or public.es_admin_empresa());

-- Consentimiento: cualquier usuario activo puede leerlo.
create policy consentimientos_lectura on public.consentimientos for select to authenticated
  using (public.auth_rol() is not null);

-- Evaluaciones y respuestas: la empresa ve las suyas; el colaborador solo las propias.
create policy evaluaciones_lectura on public.evaluaciones for select to authenticated
  using (
    (public.es_admin_empresa() and empresa_id = public.auth_empresa_id())
    or colaborador_id = public.auth_colaborador_id()
  );
create policy respuestas_lectura on public.respuestas for select to authenticated
  using (
    (public.es_admin_empresa() and empresa_id = public.auth_empresa_id())
    or colaborador_id = public.auth_colaborador_id()
  );

-- Historial: el admin general ve todo; la empresa, lo suyo.
create policy historial_lectura on public.historial_acciones for select to authenticated
  using (
    public.es_admin_general()
    or (public.es_admin_empresa() and empresa_id = public.auth_empresa_id())
  );

-- No existen políticas de INSERT / UPDATE / DELETE: toda escritura pasa por funciones.

-- ---------- 4. Funciones que puede ejecutar un usuario conectado ----
grant execute on function
  public.auth_rol(), public.auth_empresa_id(), public.es_admin_general(), public.es_admin_empresa(),
  public.auth_colaborador_id(), public.mi_sesion(), public.mi_ficha(),
  public.actualizar_mi_perfil(text, text),
  -- administrador general
  public.actualizar_empresa(uuid, text, text, public.estado_registro, integer),
  public.panel_admin_general(),
  public.guardar_bloque(uuid, text, public.estado_registro),
  public.eliminar_bloque(uuid),
  public.reordenar_bloques(uuid[]),
  public.guardar_pregunta(uuid, uuid, text, public.rubrica, text, text, text, public.estado_registro),
  public.eliminar_pregunta(uuid),
  public.reordenar_preguntas(uuid, uuid[]),
  public.obtener_cuestionario(),
  public.publicar_consentimiento(text),
  -- empresa
  public.actualizar_colaborador(uuid, text, text, text, text, text, text),
  public.cambiar_estado_colaborador(uuid, public.estado_registro),
  public.eliminar_colaborador(uuid),
  public.listar_colaboradores(),
  public.panel_empresa(),
  public.exportar_resultados(),
  -- colaborador
  public.obtener_mi_evaluacion(),
  public.iniciar_evaluacion(uuid),
  public.guardar_respuesta(uuid, integer),
  public.finalizar_evaluacion()
to authenticated;

-- Estas funciones quedan reservadas al servidor (service_role). El navegador NO puede llamarlas:
--   crear_empresa_interno, crear_colaborador_interno, crear_admin_general,
--   colaboradores_elegibles_envio, registrar_solicitud_envio, anular_solicitud_envio,
--   obtener_envios_pendientes, marcar_envio, vincular_informe,
--   acceso_estado, acceso_registrar, _clave_pin, _registrar_accion

-- ---------- 5. Almacenamiento de informes ---------------------------
insert into storage.buckets (id, name, public)
values ('informes', 'informes', false)
on conflict (id) do nothing;

-- Una empresa solo puede descargar archivos vinculados a evaluaciones de SU empresa.
-- Nadie sube ni borra archivos desde el navegador (lo hace el proceso externo con service_role).
create policy informes_descarga on storage.objects for select to authenticated
  using (
    bucket_id = 'informes'
    and public.es_admin_empresa()
    and exists (
      select 1 from public.evaluaciones v
       where v.informe_ruta = storage.objects.name
         and v.empresa_id = public.auth_empresa_id()
         and v.estado_informe = 'disponible')
  );
