-- =====================================================================
-- 0002 · FUNCIONES: toda la lógica de negocio vive en la base de datos.
-- Convención de errores: se lanza un CÓDIGO (p. ej. 'NO_AUTORIZADO') que
-- la aplicación traduce a un mensaje amigable. Ningún error incluye PIN.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Utilidades internas
-- ---------------------------------------------------------------------
create function public._limpiar(t text) returns text
language sql immutable set search_path = '' as $$
  select nullif(btrim(regexp_replace(coalesce(t, ''), '\s+', ' ', 'g')), '')
$$;

-- Quita tildes, ñ, espacios y símbolos; deja solo letras a-z en minúsculas.
create function public.normalizar_texto(t text) returns text
language sql immutable set search_path = '' as $$
  select regexp_replace(
    lower(translate(coalesce(t, ''),
      'áàäâãåéèëêíìïîóòöôõúùüûñçýÁÀÄÂÃÅÉÈËÊÍÌÏÎÓÒÖÔÕÚÙÜÛÑÇÝ',
      'aaaaaaeeeeiiiiooooouuuuncyaaaaaaeeeeiiiiooooouuuuncy')),
    '[^a-z]', '', 'g')
$$;

-- Usuario base = primer nombre + inicial del primer apellido + total de letras de nombres y apellidos.
-- Ejemplo: Juan Carlos Pérez Gómez → juanp20
create function public.base_usuario(p_pn text, p_sn text, p_pa text, p_sa text) returns text
language sql immutable set search_path = '' as $$
  select public.normalizar_texto(p_pn)
      || left(public.normalizar_texto(p_pa), 1)
      || char_length(public.normalizar_texto(p_pn) || public.normalizar_texto(p_sn)
                  || public.normalizar_texto(p_pa) || public.normalizar_texto(p_sa))::text
$$;

create function public._registrar_accion(
  p_actor uuid, p_empresa uuid, p_accion text, p_entidad text, p_entidad_id uuid, p_detalle jsonb default '{}'::jsonb
) returns void
language sql security definer set search_path = '' as $$
  insert into public.historial_acciones (actor_id, empresa_id, accion, entidad, entidad_id, detalle)
  values (p_actor, p_empresa, p_accion, p_entidad, p_entidad_id, coalesce(p_detalle, '{}'::jsonb))
$$;

-- Clave con la que se cifran los PIN en la cola de envíos (guardada en Supabase Vault).
create function public._clave_pin() returns text
language sql stable security definer set search_path = '' as $$
  select decrypted_secret from vault.decrypted_secrets where name = 'clave_pin' limit 1
$$;

-- ---------------------------------------------------------------------
-- 2. Identidad del usuario conectado (se usan en las políticas RLS)
--    El rol y la empresa SIEMPRE salen de la base, nunca del navegador.
-- ---------------------------------------------------------------------
create function public.auth_rol() returns public.rol_usuario
language sql stable security definer set search_path = '' as $$
  select p.rol
  from public.perfiles p
  left join public.empresas e on e.id = p.empresa_id
  where p.id = (select auth.uid())
    and p.estado = 'activo'
    and (p.rol = 'admin_general' or e.estado = 'activo')
$$;

create function public.auth_empresa_id() returns uuid
language sql stable security definer set search_path = '' as $$
  select p.empresa_id
  from public.perfiles p
  join public.empresas e on e.id = p.empresa_id
  where p.id = (select auth.uid()) and p.estado = 'activo' and e.estado = 'activo'
$$;

create function public.es_admin_general() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(public.auth_rol() = 'admin_general', false)
$$;

create function public.es_admin_empresa() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(public.auth_rol() = 'admin_empresa', false)
$$;

create function public.auth_colaborador_id() returns uuid
language sql stable security definer set search_path = '' as $$
  select c.id
  from public.colaboradores c
  where c.perfil_id = (select auth.uid())
    and c.estado = 'activo' and c.eliminado_en is null
    and public.auth_rol() = 'colaborador'
$$;

-- Datos de sesión para la aplicación (define a qué portal se redirige).
create function public.mi_sesion() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', p.id, 'usuario', p.usuario, 'rol', p.rol,
    'empresa_id', p.empresa_id, 'empresa_nombre', e.nombre,
    'nombres', case when p.rol = 'colaborador'
                 then concat_ws(' ', c.primer_nombre, c.segundo_nombre) else p.nombres end,
    'apellidos', case when p.rol = 'colaborador'
                 then concat_ws(' ', c.primer_apellido, c.segundo_apellido) else p.apellidos end)
  from public.perfiles p
  left join public.empresas e on e.id = p.empresa_id
  left join public.colaboradores c on c.perfil_id = p.id
  where p.id = (select auth.uid())
    and public.auth_rol() is not null
    and (p.rol <> 'colaborador' or public.auth_colaborador_id() is not null)
$$;

-- Ficha de solo lectura del colaborador conectado.
create function public.mi_ficha() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'usuario', p.usuario, 'primer_nombre', c.primer_nombre, 'segundo_nombre', c.segundo_nombre,
    'primer_apellido', c.primer_apellido, 'segundo_apellido', c.segundo_apellido,
    'cargo', c.cargo, 'correo', c.correo, 'empresa', e.nombre)
  from public.colaboradores c
  join public.perfiles p on p.id = c.perfil_id
  join public.empresas e on e.id = c.empresa_id
  where c.id = public.auth_colaborador_id()
$$;

-- Los administradores pueden editar sus nombres. Los colaboradores no (lo hace su empresa).
create function public.actualizar_mi_perfil(p_nombres text, p_apellidos text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if public.auth_rol() is null or public.auth_rol() = 'colaborador' then
    raise exception 'NO_AUTORIZADO';
  end if;
  if char_length(coalesce(p_nombres, '')) > 120 or char_length(coalesce(p_apellidos, '')) > 120 then
    raise exception 'DATOS_INVALIDOS';
  end if;
  update public.perfiles
     set nombres = coalesce(public._limpiar(p_nombres), ''), apellidos = coalesce(public._limpiar(p_apellidos), '')
   where id = (select auth.uid());
end $$;

-- ---------------------------------------------------------------------
-- 3. Administrador general: empresas
-- ---------------------------------------------------------------------
-- Solo la llama la función segura "empresas" (service_role) tras crear el usuario en Auth.
create function public.crear_empresa_interno(
  p_auth_id uuid, p_actor uuid, p_nombre text, p_correo text, p_usuario text, p_informes integer
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if not exists (select 1 from public.perfiles where id = p_actor and rol = 'admin_general' and estado = 'activo') then
    raise exception 'NO_AUTORIZADO';
  end if;
  if p_usuario is null or p_usuario !~ '^[a-z0-9]{4,30}$' then raise exception 'USUARIO_INVALIDO'; end if;
  if public._limpiar(p_nombre) is null or coalesce(p_informes, 0) < 0 then raise exception 'DATOS_INVALIDOS'; end if;
  if exists (select 1 from public.perfiles where usuario = p_usuario) then raise exception 'USUARIO_DUPLICADO'; end if;
  if exists (select 1 from public.empresas where lower(btrim(nombre)) = lower(public._limpiar(p_nombre))) then
    raise exception 'EMPRESA_DUPLICADA';
  end if;

  insert into public.empresas (nombre, correo, informes_contratados)
  values (public._limpiar(p_nombre), lower(btrim(p_correo)), coalesce(p_informes, 0))
  returning id into v_id;

  insert into public.perfiles (id, usuario, rol, empresa_id, nombres)
  values (p_auth_id, p_usuario, 'admin_empresa', v_id, public._limpiar(p_nombre));

  perform public._registrar_accion(p_actor, v_id, 'crear_empresa', 'empresa', v_id,
    jsonb_build_object('nombre', public._limpiar(p_nombre), 'usuario', p_usuario));
  return v_id;
end $$;

create function public.actualizar_empresa(
  p_id uuid, p_nombre text, p_correo text, p_estado public.estado_registro, p_informes integer
) returns void
language plpgsql security definer set search_path = '' as $$
declare v_utilizados integer;
begin
  if not public.es_admin_general() then raise exception 'NO_AUTORIZADO'; end if;
  if public._limpiar(p_nombre) is null or coalesce(p_informes, -1) < 0 then raise exception 'DATOS_INVALIDOS'; end if;
  if exists (select 1 from public.empresas
              where lower(btrim(nombre)) = lower(public._limpiar(p_nombre)) and id <> p_id) then
    raise exception 'EMPRESA_DUPLICADA';
  end if;
  select count(*) into v_utilizados from public.evaluaciones where empresa_id = p_id and estado = 'finalizada';
  if p_informes < v_utilizados then raise exception 'PLAN_MENOR_A_UTILIZADOS'; end if;

  update public.empresas
     set nombre = public._limpiar(p_nombre), correo = lower(btrim(p_correo)),
         estado = p_estado, informes_contratados = p_informes
   where id = p_id;
  if not found then raise exception 'NO_ENCONTRADO'; end if;

  perform public._registrar_accion((select auth.uid()), p_id, 'actualizar_empresa', 'empresa', p_id,
    jsonb_build_object('estado', p_estado, 'informes_contratados', p_informes));
end $$;

-- Tabla de empresas con sus contadores (portal del administrador general).
create function public.panel_admin_general() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.es_admin_general() then raise exception 'NO_AUTORIZADO'; end if;
  return coalesce((
    select jsonb_agg(t order by t.created_at desc)
    from (
      select e.id, e.nombre, e.correo, e.estado, e.created_at, e.informes_contratados,
        (select p.id from public.perfiles p
          where p.empresa_id = e.id and p.rol = 'admin_empresa' order by p.created_at limit 1) as admin_id,
        (select p.usuario from public.perfiles p
          where p.empresa_id = e.id and p.rol = 'admin_empresa' order by p.created_at limit 1) as usuario,
        (select count(*) from public.colaboradores c
          where c.empresa_id = e.id and c.eliminado_en is null) as total_colaboradores,
        (select count(*) from public.evaluaciones v
          where v.empresa_id = e.id and v.estado = 'finalizada') as informes_utilizados,
        greatest(e.informes_contratados - (select count(*) from public.evaluaciones v
          where v.empresa_id = e.id and v.estado = 'finalizada'), 0) as informes_disponibles
      from public.empresas e
    ) t), '[]'::jsonb);
end $$;

-- ---------------------------------------------------------------------
-- 4. Administrador general: cuestionario (bloques y preguntas)
-- ---------------------------------------------------------------------
create function public.guardar_bloque(p_id uuid, p_nombre text, p_estado public.estado_registro)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if not public.es_admin_general() then raise exception 'NO_AUTORIZADO'; end if;
  if public._limpiar(p_nombre) is null then raise exception 'DATOS_INVALIDOS'; end if;
  if p_id is null then
    insert into public.bloques (nombre, estado, orden)
    values (public._limpiar(p_nombre), coalesce(p_estado, 'activo'),
            (select coalesce(max(orden), 0) + 1 from public.bloques where eliminado_en is null))
    returning id into v_id;
  else
    update public.bloques set nombre = public._limpiar(p_nombre), estado = coalesce(p_estado, estado)
     where id = p_id and eliminado_en is null
    returning id into v_id;
    if v_id is null then raise exception 'NO_ENCONTRADO'; end if;
  end if;
  perform public._registrar_accion((select auth.uid()), null, 'guardar_bloque', 'bloque', v_id);
  return v_id;
end $$;

create function public.eliminar_bloque(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.es_admin_general() then raise exception 'NO_AUTORIZADO'; end if;
  if exists (select 1 from public.preguntas where bloque_id = p_id and eliminado_en is null) then
    raise exception 'BLOQUE_CON_PREGUNTAS';
  end if;
  if exists (select 1 from public.preguntas where bloque_id = p_id) then
    update public.bloques set eliminado_en = now(), estado = 'inactivo' where id = p_id;   -- conserva historial
  else
    delete from public.bloques where id = p_id;
  end if;
  perform public._registrar_accion((select auth.uid()), null, 'eliminar_bloque', 'bloque', p_id);
end $$;

create function public.reordenar_bloques(p_ids uuid[]) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.es_admin_general() then raise exception 'NO_AUTORIZADO'; end if;
  update public.bloques b set orden = x.pos
    from unnest(p_ids) with ordinality as x(id, pos)
   where b.id = x.id;
end $$;

-- Crea o edita una pregunta. Si la versión vigente ya fue respondida, crea una versión nueva.
create function public.guardar_pregunta(
  p_id uuid, p_bloque_id uuid, p_texto text, p_rubrica public.rubrica,
  p_izquierda text, p_centro text, p_derecha text, p_estado public.estado_registro
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid; v_ver uuid; v_num integer; v_bloque_actual uuid;
  v_texto text := public._limpiar(p_texto);
  v_izq text := coalesce(public._limpiar(p_izquierda), 'En desacuerdo');
  v_cen text := coalesce(public._limpiar(p_centro), 'Neutro');
  v_der text := coalesce(public._limpiar(p_derecha), 'De acuerdo');
begin
  if not public.es_admin_general() then raise exception 'NO_AUTORIZADO'; end if;
  if v_texto is null or p_rubrica is null then raise exception 'DATOS_INVALIDOS'; end if;
  if not exists (select 1 from public.bloques where id = p_bloque_id and eliminado_en is null) then
    raise exception 'BLOQUE_NO_ENCONTRADO';
  end if;

  if p_id is null then
    insert into public.preguntas (bloque_id, estado, orden)
    values (p_bloque_id, coalesce(p_estado, 'activo'),
            (select coalesce(max(orden), 0) + 1 from public.preguntas
              where bloque_id = p_bloque_id and eliminado_en is null))
    returning id into v_id;
    insert into public.pregunta_versiones (pregunta_id, numero, texto, rubrica, etiqueta_izquierda, etiqueta_centro, etiqueta_derecha)
    values (v_id, 1, v_texto, p_rubrica, v_izq, v_cen, v_der)
    returning id into v_ver;
    update public.preguntas set version_actual_id = v_ver where id = v_id;
  else
    select q.id, q.version_actual_id, q.bloque_id into v_id, v_ver, v_bloque_actual
      from public.preguntas q where q.id = p_id and q.eliminado_en is null for update;
    if v_id is null then raise exception 'NO_ENCONTRADO'; end if;

    if v_bloque_actual <> p_bloque_id then   -- cambia de bloque sin perder su identificación
      update public.preguntas
         set bloque_id = p_bloque_id,
             orden = (select coalesce(max(orden), 0) + 1 from public.preguntas
                       where bloque_id = p_bloque_id and eliminado_en is null)
       where id = v_id;
    end if;
    update public.preguntas set estado = coalesce(p_estado, estado) where id = v_id;

    if not exists (
      select 1 from public.pregunta_versiones pv
       where pv.id = v_ver and pv.texto = v_texto and pv.rubrica = p_rubrica
         and pv.etiqueta_izquierda = v_izq and pv.etiqueta_centro = v_cen and pv.etiqueta_derecha = v_der
    ) then
      if v_ver is not null and not exists (select 1 from public.respuestas r where r.pregunta_version_id = v_ver) then
        update public.pregunta_versiones
           set texto = v_texto, rubrica = p_rubrica,
               etiqueta_izquierda = v_izq, etiqueta_centro = v_cen, etiqueta_derecha = v_der
         where id = v_ver;
      else
        select coalesce(max(numero), 0) + 1 into v_num from public.pregunta_versiones where pregunta_id = v_id;
        insert into public.pregunta_versiones (pregunta_id, numero, texto, rubrica, etiqueta_izquierda, etiqueta_centro, etiqueta_derecha)
        values (v_id, v_num, v_texto, p_rubrica, v_izq, v_cen, v_der)
        returning id into v_ver;
        update public.preguntas set version_actual_id = v_ver where id = v_id;
      end if;
    end if;
  end if;

  perform public._registrar_accion((select auth.uid()), null, 'guardar_pregunta', 'pregunta', v_id);
  return v_id;
end $$;

create function public.eliminar_pregunta(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.es_admin_general() then raise exception 'NO_AUTORIZADO'; end if;
  if exists (select 1 from public.respuestas where pregunta_id = p_id) then
    update public.preguntas set eliminado_en = now(), estado = 'inactivo' where id = p_id;  -- conserva historial
  else
    delete from public.preguntas where id = p_id;
  end if;
  perform public._registrar_accion((select auth.uid()), null, 'eliminar_pregunta', 'pregunta', p_id);
end $$;

-- Guarda el orden de las preguntas de un bloque (también sirve para moverlas entre bloques).
create function public.reordenar_preguntas(p_bloque_id uuid, p_ids uuid[]) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.es_admin_general() then raise exception 'NO_AUTORIZADO'; end if;
  if not exists (select 1 from public.bloques where id = p_bloque_id and eliminado_en is null) then
    raise exception 'BLOQUE_NO_ENCONTRADO';
  end if;
  update public.preguntas q set bloque_id = p_bloque_id, orden = x.pos
    from unnest(p_ids) with ordinality as x(id, pos)
   where q.id = x.id and q.eliminado_en is null;
end $$;

-- Cuestionario completo para la pantalla de configuración.
create function public.obtener_cuestionario() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.es_admin_general() then raise exception 'NO_AUTORIZADO'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', b.id, 'nombre', b.nombre, 'orden', b.orden, 'estado', b.estado,
      'preguntas', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', q.id, 'codigo', q.codigo, 'bloque_id', q.bloque_id, 'orden', q.orden, 'estado', q.estado,
          'texto', pv.texto, 'rubrica', pv.rubrica, 'version', pv.numero,
          'etiqueta_izquierda', pv.etiqueta_izquierda, 'etiqueta_centro', pv.etiqueta_centro,
          'etiqueta_derecha', pv.etiqueta_derecha) order by q.orden, q.codigo)
        from public.preguntas q
        join public.pregunta_versiones pv on pv.id = q.version_actual_id
        where q.bloque_id = b.id and q.eliminado_en is null), '[]'::jsonb)
    ) order by b.orden, b.created_at)
    from public.bloques b where b.eliminado_en is null), '[]'::jsonb);
end $$;

-- ---------------------------------------------------------------------
-- 5. Consentimiento
-- ---------------------------------------------------------------------
create function public.publicar_consentimiento(p_texto text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_version integer;
begin
  if not public.es_admin_general() then raise exception 'NO_AUTORIZADO'; end if;
  if char_length(btrim(coalesce(p_texto, ''))) < 20 then raise exception 'DATOS_INVALIDOS'; end if;
  select coalesce(max(version), 0) + 1 into v_version from public.consentimientos;
  update public.consentimientos set vigente = false where vigente;
  insert into public.consentimientos (version, texto, vigente, creado_por)
  values (v_version, btrim(p_texto), true, (select auth.uid()))
  returning id into v_id;
  perform public._registrar_accion((select auth.uid()), null, 'publicar_consentimiento', 'consentimiento', v_id,
    jsonb_build_object('version', v_version));
  return v_id;
end $$;

-- ---------------------------------------------------------------------
-- 6. Empresa: colaboradores
-- ---------------------------------------------------------------------
-- Solo la llama la función segura "colaboradores" (service_role) tras crear el usuario en Auth.
-- La empresa se toma del perfil del administrador que hace la petición, nunca del navegador.
create function public.crear_colaborador_interno(
  p_auth_id uuid, p_actor uuid,
  p_primer_nombre text, p_segundo_nombre text, p_primer_apellido text, p_segundo_apellido text,
  p_cargo text, p_correo text
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_empresa uuid; v_base text; v_usuario text; v_n integer := 0; v_col uuid;
  v_pn text := public._limpiar(p_primer_nombre);  v_sn text := public._limpiar(p_segundo_nombre);
  v_pa text := public._limpiar(p_primer_apellido); v_sa text := public._limpiar(p_segundo_apellido);
  v_correo text := lower(btrim(coalesce(p_correo, '')));
begin
  select p.empresa_id into v_empresa
    from public.perfiles p join public.empresas e on e.id = p.empresa_id
   where p.id = p_actor and p.rol = 'admin_empresa' and p.estado = 'activo' and e.estado = 'activo';
  if v_empresa is null then raise exception 'NO_AUTORIZADO'; end if;

  if v_pn is null or v_pa is null or v_sa is null
     or public.normalizar_texto(v_pn) = '' or public.normalizar_texto(v_pa) = ''
     or v_correo !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'DATOS_INVALIDOS';
  end if;
  if exists (select 1 from public.colaboradores
              where empresa_id = v_empresa and lower(correo) = v_correo and eliminado_en is null) then
    raise exception 'CORREO_DUPLICADO';
  end if;
  if exists (select 1 from public.perfiles where id = p_auth_id) then raise exception 'PERFIL_DUPLICADO'; end if;

  -- Usuario único: si "juanp20" existe se prueba "juanp201", "juanp202", …
  v_base := public.base_usuario(v_pn, v_sn, v_pa, v_sa);
  loop
    v_usuario := v_base || case when v_n = 0 then '' else v_n::text end;
    begin
      insert into public.perfiles (id, usuario, rol, empresa_id)
      values (p_auth_id, v_usuario, 'colaborador', v_empresa);
      exit;
    exception when unique_violation then
      v_n := v_n + 1;
      if v_n > 999 then raise exception 'USUARIO_NO_DISPONIBLE'; end if;
    end;
  end loop;

  insert into public.colaboradores (perfil_id, empresa_id, primer_nombre, segundo_nombre,
                                    primer_apellido, segundo_apellido, cargo, correo)
  values (p_auth_id, v_empresa, v_pn, v_sn, v_pa, v_sa, public._limpiar(p_cargo), v_correo)
  returning id into v_col;

  insert into public.evaluaciones (colaborador_id, empresa_id) values (v_col, v_empresa);

  perform public._registrar_accion(p_actor, v_empresa, 'crear_colaborador', 'colaborador', v_col,
    jsonb_build_object('usuario', v_usuario));
  return jsonb_build_object('colaborador_id', v_col, 'usuario', v_usuario);
end $$;

create function public.actualizar_colaborador(
  p_id uuid, p_primer_nombre text, p_segundo_nombre text, p_primer_apellido text, p_segundo_apellido text,
  p_cargo text, p_correo text
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_empresa uuid := public.auth_empresa_id();
  v_correo text := lower(btrim(coalesce(p_correo, '')));
begin
  if not public.es_admin_empresa() or v_empresa is null then raise exception 'NO_AUTORIZADO'; end if;
  if public._limpiar(p_primer_nombre) is null or public._limpiar(p_primer_apellido) is null
     or public._limpiar(p_segundo_apellido) is null or v_correo !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'DATOS_INVALIDOS';
  end if;
  if exists (select 1 from public.colaboradores
              where empresa_id = v_empresa and lower(correo) = v_correo and eliminado_en is null and id <> p_id) then
    raise exception 'CORREO_DUPLICADO';
  end if;
  -- El usuario NO cambia aunque cambie el nombre.
  update public.colaboradores
     set primer_nombre = public._limpiar(p_primer_nombre), segundo_nombre = public._limpiar(p_segundo_nombre),
         primer_apellido = public._limpiar(p_primer_apellido), segundo_apellido = public._limpiar(p_segundo_apellido),
         cargo = public._limpiar(p_cargo), correo = v_correo
   where id = p_id and empresa_id = v_empresa and eliminado_en is null;
  if not found then raise exception 'NO_ENCONTRADO'; end if;
  perform public._registrar_accion((select auth.uid()), v_empresa, 'actualizar_colaborador', 'colaborador', p_id);
end $$;

create function public.cambiar_estado_colaborador(p_id uuid, p_estado public.estado_registro) returns void
language plpgsql security definer set search_path = '' as $$
declare v_empresa uuid := public.auth_empresa_id(); v_perfil uuid;
begin
  if not public.es_admin_empresa() or v_empresa is null then raise exception 'NO_AUTORIZADO'; end if;
  update public.colaboradores set estado = p_estado
   where id = p_id and empresa_id = v_empresa and eliminado_en is null
  returning perfil_id into v_perfil;
  if v_perfil is null then raise exception 'NO_ENCONTRADO'; end if;
  update public.perfiles set estado = p_estado where id = v_perfil;
  perform public._registrar_accion((select auth.uid()), v_empresa, 'cambiar_estado_colaborador', 'colaborador', p_id,
    jsonb_build_object('estado', p_estado));
end $$;

-- Eliminación lógica: se conserva la evaluación y el usuario queda bloqueado.
create function public.eliminar_colaborador(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_empresa uuid := public.auth_empresa_id(); v_perfil uuid;
begin
  if not public.es_admin_empresa() or v_empresa is null then raise exception 'NO_AUTORIZADO'; end if;
  update public.colaboradores set eliminado_en = now(), estado = 'inactivo'
   where id = p_id and empresa_id = v_empresa and eliminado_en is null
  returning perfil_id into v_perfil;
  if v_perfil is null then raise exception 'NO_ENCONTRADO'; end if;
  update public.perfiles set estado = 'inactivo' where id = v_perfil;
  update public.solicitudes_envio
     set estado = 'error', pin_cifrado = null, procesado_en = now(), error_detalle = 'Colaborador eliminado'
   where colaborador_id = p_id and estado = 'solicitado';
  delete from public.colaborador_pin where colaborador_id = p_id;
  perform public._registrar_accion((select auth.uid()), v_empresa, 'eliminar_colaborador', 'colaborador', p_id);
end $$;

create function public.listar_colaboradores() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_empresa uuid := public.auth_empresa_id();
begin
  if not public.es_admin_empresa() or v_empresa is null then raise exception 'NO_AUTORIZADO'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', c.id, 'usuario', p.usuario,
      'primer_nombre', c.primer_nombre, 'segundo_nombre', c.segundo_nombre,
      'primer_apellido', c.primer_apellido, 'segundo_apellido', c.segundo_apellido,
      'cargo', c.cargo, 'correo', c.correo, 'estado', c.estado,
      'estado_envio', c.estado_envio, 'envio_solicitado_en', c.envio_solicitado_en,
      'envio_procesado_en', c.envio_procesado_en, 'created_at', c.created_at,
      'evaluacion_estado', v.estado, 'evaluacion_finalizada_en', v.finalizada_en,
      'informe_estado', v.estado_informe, 'informe_ruta', v.informe_ruta
    ) order by c.created_at desc)
    from public.colaboradores c
    join public.perfiles p on p.id = c.perfil_id
    join public.evaluaciones v on v.colaborador_id = c.id
    where c.empresa_id = v_empresa and c.eliminado_en is null), '[]'::jsonb);
end $$;

-- Indicadores del dashboard empresarial.
create function public.panel_empresa() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_empresa uuid := public.auth_empresa_id(); v jsonb;
begin
  if not public.es_admin_empresa() or v_empresa is null then raise exception 'NO_AUTORIZADO'; end if;
  select jsonb_build_object(
    'empresa_nombre', e.nombre,
    'total', (select count(*) from public.colaboradores c where c.empresa_id = e.id and c.eliminado_en is null),
    'activos', (select count(*) from public.colaboradores c
                 where c.empresa_id = e.id and c.eliminado_en is null and c.estado = 'activo'),
    'inactivos', (select count(*) from public.colaboradores c
                   where c.empresa_id = e.id and c.eliminado_en is null and c.estado = 'inactivo'),
    'realizadas', (select count(*) from public.evaluaciones x
                    join public.colaboradores c on c.id = x.colaborador_id
                   where x.empresa_id = e.id and x.estado = 'finalizada' and c.eliminado_en is null),
    'pendientes', (select count(*) from public.evaluaciones x
                    join public.colaboradores c on c.id = x.colaborador_id
                   where x.empresa_id = e.id and x.estado <> 'finalizada'
                     and c.eliminado_en is null and c.estado = 'activo'),
    'en_progreso', (select count(*) from public.evaluaciones x
                     where x.empresa_id = e.id and x.estado = 'en_progreso'),
    'informes_contratados', e.informes_contratados,
    'informes_utilizados', (select count(*) from public.evaluaciones x
                             where x.empresa_id = e.id and x.estado = 'finalizada'),
    'informes_disponibles', greatest(e.informes_contratados - (select count(*) from public.evaluaciones x
                             where x.empresa_id = e.id and x.estado = 'finalizada'), 0),
    'informes_descargables', (select count(*) from public.evaluaciones x
                               where x.empresa_id = e.id and x.estado_informe = 'disponible')
  ) into v
  from public.empresas e where e.id = v_empresa;
  return v;
end $$;

-- Datos para la descarga masiva en Excel (solo evaluaciones finalizadas de la empresa).
create function public.exportar_resultados() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_empresa uuid := public.auth_empresa_id(); v jsonb;
begin
  if not public.es_admin_empresa() or v_empresa is null then raise exception 'NO_AUTORIZADO'; end if;
  select jsonb_build_object(
    'preguntas', coalesce((
      select jsonb_agg(t order by t.bloque_orden, t.pregunta_orden, t.codigo, t.version)
      from (
        select distinct q.codigo, pv.numero as version, r.bloque_nombre as bloque, r.bloque_orden, r.pregunta_orden,
               pv.texto, pv.rubrica, pv.etiqueta_izquierda, pv.etiqueta_centro, pv.etiqueta_derecha
        from public.respuestas r
        join public.evaluaciones x on x.id = r.evaluacion_id and x.estado = 'finalizada'
        join public.colaboradores c on c.id = r.colaborador_id and c.eliminado_en is null
        join public.preguntas q on q.id = r.pregunta_id
        join public.pregunta_versiones pv on pv.id = r.pregunta_version_id
        where r.empresa_id = v_empresa
      ) t), '[]'::jsonb),
    'colaboradores', coalesce((
      select jsonb_agg(jsonb_build_object(
        'usuario', p.usuario,
        'nombre', concat_ws(' ', c.primer_nombre, c.segundo_nombre, c.primer_apellido, c.segundo_apellido),
        'cargo', c.cargo, 'correo', c.correo, 'finalizada_en', x.finalizada_en,
        'respuestas', (
          select jsonb_object_agg(q.codigo::text, jsonb_build_object('posicion', r.posicion, 'puntaje', r.puntaje, 'version', pv.numero))
          from public.respuestas r
          join public.preguntas q on q.id = r.pregunta_id
          join public.pregunta_versiones pv on pv.id = r.pregunta_version_id
          where r.evaluacion_id = x.id)
      ) order by c.primer_apellido, c.primer_nombre)
      from public.evaluaciones x
      join public.colaboradores c on c.id = x.colaborador_id and c.eliminado_en is null
      join public.perfiles p on p.id = c.perfil_id
      where x.empresa_id = v_empresa and x.estado = 'finalizada'), '[]'::jsonb)
  ) into v;
  perform public._registrar_accion((select auth.uid()), v_empresa, 'exportar_resultados', 'empresa', v_empresa);
  return v;
end $$;

-- ---------------------------------------------------------------------
-- 7. Colaborador: evaluación
-- ---------------------------------------------------------------------
create function public.obtener_mi_evaluacion() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_col uuid := public.auth_colaborador_id(); ev record; v_cupo boolean; v jsonb;
begin
  if v_col is null then raise exception 'NO_AUTORIZADO'; end if;
  select x.*, e.nombre as empresa_nombre, e.informes_contratados into ev
    from public.evaluaciones x join public.empresas e on e.id = x.empresa_id
   where x.colaborador_id = v_col;
  if not found then raise exception 'NO_ENCONTRADO'; end if;

  -- Cupo: cada evaluación iniciada o finalizada reserva un informe del plan.
  select (select count(*) from public.evaluaciones y
           where y.empresa_id = ev.empresa_id and y.estado in ('en_progreso', 'finalizada')) < ev.informes_contratados
    into v_cupo;

  select jsonb_build_object(
    'estado', ev.estado, 'iniciada_en', ev.iniciada_en, 'finalizada_en', ev.finalizada_en,
    'empresa_nombre', ev.empresa_nombre,
    'cupo_disponible', (ev.estado <> 'pendiente' or v_cupo),
    'consentimiento', (select jsonb_build_object('id', k.id, 'version', k.version, 'texto', k.texto)
                         from public.consentimientos k where k.vigente),
    'preguntas', coalesce((
      select jsonb_agg(jsonb_build_object(
        'pregunta_id', r.pregunta_id, 'bloque', r.bloque_nombre, 'bloque_orden', r.bloque_orden,
        'orden', r.pregunta_orden, 'texto', pv.texto,
        'etiqueta_izquierda', pv.etiqueta_izquierda, 'etiqueta_centro', pv.etiqueta_centro,
        'etiqueta_derecha', pv.etiqueta_derecha, 'posicion', r.posicion
      ) order by r.bloque_orden, r.pregunta_orden)
      from public.respuestas r
      join public.pregunta_versiones pv on pv.id = r.pregunta_version_id
      where r.evaluacion_id = ev.id), '[]'::jsonb)
  ) into v;
  return v;
end $$;

-- Acepta el consentimiento, verifica el cupo y "congela" el cuestionario vigente.
create function public.iniciar_evaluacion(p_consentimiento_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_col uuid := public.auth_colaborador_id(); ev record; v_contratados integer; v_usados integer; v_n integer;
begin
  if v_col is null then raise exception 'NO_AUTORIZADO'; end if;
  select * into ev from public.evaluaciones where colaborador_id = v_col for update;
  if not found then raise exception 'NO_ENCONTRADO'; end if;
  if ev.estado <> 'pendiente' then raise exception 'EVALUACION_YA_INICIADA'; end if;
  if not exists (select 1 from public.consentimientos where id = p_consentimiento_id and vigente) then
    raise exception 'CONSENTIMIENTO_REQUERIDO';
  end if;

  -- Bloquea la fila de la empresa para que dos colaboradores no tomen el último cupo a la vez.
  select informes_contratados into v_contratados from public.empresas where id = ev.empresa_id for update;
  select count(*) into v_usados from public.evaluaciones
   where empresa_id = ev.empresa_id and estado in ('en_progreso', 'finalizada');
  if v_usados >= v_contratados then raise exception 'SIN_CUPO'; end if;

  insert into public.respuestas (evaluacion_id, empresa_id, colaborador_id, pregunta_id, pregunta_version_id,
                                 bloque_nombre, bloque_orden, pregunta_orden)
  select ev.id, ev.empresa_id, v_col, q.id, q.version_actual_id, b.nombre,
         dense_rank() over (order by b.orden, b.created_at, b.id)::integer,
         row_number() over (partition by b.id order by q.orden, q.codigo)::integer
    from public.preguntas q
    join public.bloques b on b.id = q.bloque_id
   where q.estado = 'activo' and q.eliminado_en is null and q.version_actual_id is not null
     and b.estado = 'activo' and b.eliminado_en is null;
  get diagnostics v_n = row_count;
  if v_n = 0 then raise exception 'SIN_PREGUNTAS'; end if;

  update public.evaluaciones
     set estado = 'en_progreso', iniciada_en = now(),
         consentimiento_id = p_consentimiento_id, consentimiento_aceptado_en = now()
   where id = ev.id;
end $$;

-- Guarda una respuesta (progreso). La posición es 1, 2 o 3; el puntaje lo calcula la base.
create function public.guardar_respuesta(p_pregunta_id uuid, p_posicion integer) returns void
language plpgsql security definer set search_path = '' as $$
declare v_col uuid := public.auth_colaborador_id(); v_eval uuid;
begin
  if v_col is null then raise exception 'NO_AUTORIZADO'; end if;
  if p_posicion is null or p_posicion not in (1, 2, 3) then raise exception 'POSICION_INVALIDA'; end if;
  select id into v_eval from public.evaluaciones where colaborador_id = v_col and estado = 'en_progreso';
  if v_eval is null then raise exception 'EVALUACION_NO_DISPONIBLE'; end if;

  update public.respuestas r
     set posicion = p_posicion,
         puntaje = case when pv.rubrica = 'positivo' then p_posicion - 2 else 2 - p_posicion end,
         respondida_en = now()
    from public.pregunta_versiones pv
   where pv.id = r.pregunta_version_id and r.evaluacion_id = v_eval and r.pregunta_id = p_pregunta_id;
  if not found then raise exception 'PREGUNTA_NO_ENCONTRADA'; end if;
end $$;

-- Envío definitivo: exige todas las respuestas e impide un segundo envío.
create function public.finalizar_evaluacion() returns void
language plpgsql security definer set search_path = '' as $$
declare v_col uuid := public.auth_colaborador_id(); ev record;
begin
  if v_col is null then raise exception 'NO_AUTORIZADO'; end if;
  select * into ev from public.evaluaciones where colaborador_id = v_col for update;
  if not found or ev.estado <> 'en_progreso' then raise exception 'EVALUACION_NO_DISPONIBLE'; end if;
  if exists (select 1 from public.respuestas where evaluacion_id = ev.id and posicion is null) then
    raise exception 'RESPUESTAS_INCOMPLETAS';
  end if;
  update public.evaluaciones set estado = 'finalizada', finalizada_en = now() where id = ev.id;
end $$;

-- ---------------------------------------------------------------------
-- 8. Cola de envíos (PIN) — solo service_role
-- ---------------------------------------------------------------------
-- Colaboradores a los que "Enviar a todos" debe generar PIN:
-- activos, sin evaluación finalizada y sin una solicitud en curso.
create function public.colaboradores_elegibles_envio(p_actor uuid) returns setof uuid
language sql stable security definer set search_path = '' as $$
  select c.id
  from public.colaboradores c
  join public.evaluaciones v on v.colaborador_id = c.id
  join public.perfiles a on a.id = p_actor and a.rol = 'admin_empresa' and a.estado = 'activo'
                        and a.empresa_id = c.empresa_id
  join public.empresas e on e.id = c.empresa_id and e.estado = 'activo'
  where c.estado = 'activo' and c.eliminado_en is null
    and v.estado <> 'finalizada' and c.estado_envio <> 'solicitado'
$$;

-- Registra la solicitud: valida permisos, evita duplicados y guarda el PIN cifrado.
-- Devuelve {estado: ok | no_elegible | ya_solicitado | pin_duplicado, auth_id}
create function public.registrar_solicitud_envio(p_colaborador_id uuid, p_actor uuid, p_pin text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_empresa uuid; r record; v_clave text; v_huella text;
begin
  select p.empresa_id into v_empresa
    from public.perfiles p join public.empresas e on e.id = p.empresa_id
   where p.id = p_actor and p.rol = 'admin_empresa' and p.estado = 'activo' and e.estado = 'activo';
  if v_empresa is null then raise exception 'NO_AUTORIZADO'; end if;
  if p_pin is null or p_pin !~ '^[a-z0-9]{6}$' then raise exception 'PIN_INVALIDO'; end if;

  select c.id, c.perfil_id, c.estado, c.estado_envio, c.eliminado_en, v.estado as evaluacion_estado into r
    from public.colaboradores c join public.evaluaciones v on v.colaborador_id = c.id
   where c.id = p_colaborador_id and c.empresa_id = v_empresa
     for update of c;
  if not found then raise exception 'NO_ENCONTRADO'; end if;
  if r.eliminado_en is not null or r.estado <> 'activo' or r.evaluacion_estado = 'finalizada' then
    return jsonb_build_object('estado', 'no_elegible');
  end if;
  if r.estado_envio = 'solicitado' then return jsonb_build_object('estado', 'ya_solicitado'); end if;

  v_clave := public._clave_pin();
  if v_clave is null then raise exception 'CLAVE_PIN_NO_CONFIGURADA'; end if;
  v_huella := encode(extensions.hmac(p_pin, v_clave, 'sha256'), 'hex');
  if exists (select 1 from public.colaborador_pin where huella = v_huella and colaborador_id <> p_colaborador_id) then
    return jsonb_build_object('estado', 'pin_duplicado');
  end if;

  insert into public.colaborador_pin (colaborador_id, huella) values (p_colaborador_id, v_huella)
  on conflict (colaborador_id) do update set huella = excluded.huella, generado_en = now();

  update public.colaboradores
     set estado_envio = 'solicitado', envio_solicitado_en = now(), envio_procesado_en = null
   where id = p_colaborador_id;

  insert into public.solicitudes_envio (colaborador_id, empresa_id, solicitado_por, pin_cifrado)
  values (p_colaborador_id, v_empresa, p_actor, extensions.pgp_sym_encrypt(p_pin, v_clave));

  perform public._registrar_accion(p_actor, v_empresa, 'solicitar_envio', 'colaborador', p_colaborador_id);
  return jsonb_build_object('estado', 'ok', 'auth_id', r.perfil_id);
end $$;

-- Si no se pudo fijar el PIN en Auth, la solicitud se marca con error (sin dejar PIN guardado).
create function public.anular_solicitud_envio(p_colaborador_id uuid, p_detalle text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.solicitudes_envio
     set estado = 'error', pin_cifrado = null, procesado_en = now(), error_detalle = left(p_detalle, 300)
   where colaborador_id = p_colaborador_id and estado = 'solicitado';
  update public.colaboradores set estado_envio = 'error', envio_procesado_en = now() where id = p_colaborador_id;
  delete from public.colaborador_pin where colaborador_id = p_colaborador_id;
end $$;

-- ► PARA EL SERVICIO DE CORREO: lista lo que hay que enviar (usuario + PIN + correo).
create function public.obtener_envios_pendientes()
returns table (solicitud_id uuid, usuario text, pin text, correo text, nombre_completo text,
               empresa text, solicitado_en timestamptz)
language sql security definer set search_path = '' as $$
  select s.id, p.usuario, extensions.pgp_sym_decrypt(s.pin_cifrado, public._clave_pin()), c.correo,
         concat_ws(' ', c.primer_nombre, c.segundo_nombre, c.primer_apellido, c.segundo_apellido),
         e.nombre, s.solicitado_en
  from public.solicitudes_envio s
  join public.colaboradores c on c.id = s.colaborador_id
  join public.perfiles p on p.id = c.perfil_id
  join public.empresas e on e.id = s.empresa_id
  where s.estado = 'solicitado' and s.pin_cifrado is not null
  order by s.solicitado_en
$$;

-- ► PARA EL SERVICIO DE CORREO: informa el resultado ('enviado' o 'error'). Borra el PIN de la cola.
create function public.marcar_envio(p_solicitud_id uuid, p_estado text, p_detalle text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare v_col uuid;
begin
  if p_estado not in ('enviado', 'error') then raise exception 'ESTADO_INVALIDO'; end if;
  update public.solicitudes_envio
     set estado = p_estado::public.estado_envio, pin_cifrado = null, procesado_en = now(),
         error_detalle = case when p_estado = 'error' then left(coalesce(p_detalle, 'Error de envío'), 300) end
   where id = p_solicitud_id and estado = 'solicitado'
  returning colaborador_id into v_col;
  if v_col is null then raise exception 'SOLICITUD_NO_ENCONTRADA'; end if;
  update public.colaboradores
     set estado_envio = p_estado::public.estado_envio, envio_procesado_en = now()
   where id = v_col;
end $$;

-- ► PARA EL GENERADOR DE INFORMES: vincula el archivo subido al bucket "informes" con el colaborador.
create function public.vincular_informe(p_usuario text, p_ruta text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_eval uuid;
begin
  if public._limpiar(p_ruta) is null then raise exception 'DATOS_INVALIDOS'; end if;
  select x.id into v_eval
    from public.evaluaciones x
    join public.colaboradores c on c.id = x.colaborador_id
    join public.perfiles p on p.id = c.perfil_id
   where p.usuario = lower(btrim(p_usuario)) and x.estado = 'finalizada';
  if v_eval is null then raise exception 'EVALUACION_NO_FINALIZADA'; end if;
  update public.evaluaciones
     set informe_ruta = btrim(p_ruta), estado_informe = 'disponible', informe_disponible_en = now()
   where id = v_eval;
end $$;

-- ---------------------------------------------------------------------
-- 9. Acceso (login con bloqueo por intentos) — solo service_role
-- ---------------------------------------------------------------------
create function public.acceso_estado(p_usuario text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'auth_id', p.id, 'rol', p.rol,
    'activo', (p.estado = 'activo'
               and (p.rol = 'admin_general' or e.estado = 'activo')
               and (p.rol <> 'colaborador' or exists (
                     select 1 from public.colaboradores c
                      where c.perfil_id = p.id and c.estado = 'activo' and c.eliminado_en is null))),
    'bloqueado', coalesce((select i.bloqueado_hasta > now() from public.intentos_acceso i
                            where i.usuario = p.usuario), false))
  from public.perfiles p
  left join public.empresas e on e.id = p.empresa_id
  where p.usuario = lower(btrim(coalesce(p_usuario, '')))
$$;

-- 5 intentos fallidos seguidos bloquean el usuario durante 15 minutos.
create function public.acceso_registrar(p_usuario text, p_exito boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare v_usuario text := lower(btrim(coalesce(p_usuario, '')));
begin
  if p_exito then
    delete from public.intentos_acceso where usuario = v_usuario;
    return;
  end if;
  if not exists (select 1 from public.perfiles where usuario = v_usuario) then return; end if;
  insert into public.intentos_acceso as i (usuario, fallidos, ultimo_intento)
  values (v_usuario, 1, now())
  on conflict (usuario) do update
     set fallidos = case when i.ultimo_intento < now() - interval '15 minutes' then 1 else i.fallidos + 1 end,
         ultimo_intento = now();
  update public.intentos_acceso
     set bloqueado_hasta = now() + interval '15 minutes', fallidos = 0
   where usuario = v_usuario and fallidos >= 5;
end $$;

-- ---------------------------------------------------------------------
-- 10. Arranque: registrar al administrador general (se ejecuta una sola vez)
-- ---------------------------------------------------------------------
create function public.crear_admin_general(p_auth_id uuid, p_usuario text, p_nombres text, p_apellidos text)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  if p_usuario is null or p_usuario !~ '^[a-z0-9]{4,30}$' then raise exception 'USUARIO_INVALIDO'; end if;
  insert into public.perfiles (id, usuario, rol, empresa_id, nombres, apellidos)
  values (p_auth_id, p_usuario, 'admin_general', null, coalesce(p_nombres, ''), coalesce(p_apellidos, ''));
end $$;
