// Operaciones privilegiadas del administrador general sobre empresas:
//   accion "crear"        → crea la empresa y su cuenta administrativa
//   accion "restablecer"  → fija una nueva contraseña para la cuenta de una empresa
import {
  codigoError, correoInterno, cors, esCorreo, identificar, leerJson, responder, servicio, texto, tieneRol,
} from '../_shared/comun.ts'

const claveValida = (c: unknown): c is string => typeof c === 'string' && c.length >= 10 && c.length <= 72

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors(req) })
  if (req.method !== 'POST') return responder(req, { error: 'METODO_NO_PERMITIDO' }, 405)

  const admin = servicio()
  const actorId = await identificar(req, admin)
  if (!actorId) return responder(req, { error: 'NO_AUTORIZADO' }, 401)
  if (!(await tieneRol(admin, actorId, 'admin_general'))) return responder(req, { error: 'NO_AUTORIZADO' }, 403)

  const cuerpo = await leerJson(req)
  if (!cuerpo) return responder(req, { error: 'DATOS_INVALIDOS' }, 400)

  if (cuerpo.accion === 'crear') {
    const nombre = texto(cuerpo.nombre, 120)
    const correo = texto(cuerpo.correo, 200).toLowerCase()
    const usuario = texto(cuerpo.usuario, 30).toLowerCase()
    const informes = Number.isInteger(cuerpo.informes_contratados) ? (cuerpo.informes_contratados as number) : 0
    if (nombre.length < 2 || !esCorreo(correo) || informes < 0) return responder(req, { error: 'DATOS_INVALIDOS' }, 400)
    if (!/^[a-z0-9]{4,30}$/.test(usuario)) return responder(req, { error: 'USUARIO_INVALIDO' }, 400)
    if (!claveValida(cuerpo.contrasena)) return responder(req, { error: 'CONTRASENA_DEBIL' }, 400)

    const { data: creado, error: errorAuth } = await admin.auth.admin.createUser({
      email: correoInterno(), password: cuerpo.contrasena, email_confirm: true,
    })
    if (errorAuth || !creado.user) return responder(req, { error: 'ERROR_INTERNO' }, 500)

    const { data: empresaId, error } = await admin.rpc('crear_empresa_interno', {
      p_auth_id: creado.user.id, p_actor: actorId, p_nombre: nombre, p_correo: correo,
      p_usuario: usuario, p_informes: informes,
    })
    if (error) {
      await admin.auth.admin.deleteUser(creado.user.id)   // no dejar cuentas huérfanas
      return responder(req, { error: codigoError(error) }, 400)
    }
    return responder(req, { empresa_id: empresaId })
  }

  if (cuerpo.accion === 'restablecer') {
    const empresaId = texto(cuerpo.empresa_id, 40)
    if (!claveValida(cuerpo.contrasena)) return responder(req, { error: 'CONTRASENA_DEBIL' }, 400)
    const { data: perfil } = await admin.from('perfiles').select('id, usuario')
      .eq('empresa_id', empresaId).eq('rol', 'admin_empresa').order('created_at').limit(1).maybeSingle()
    if (!perfil) return responder(req, { error: 'NO_ENCONTRADO' }, 404)
    const { error } = await admin.auth.admin.updateUserById(perfil.id, { password: cuerpo.contrasena })
    if (error) return responder(req, { error: 'ERROR_INTERNO' }, 500)
    await admin.rpc('acceso_registrar', { p_usuario: perfil.usuario, p_exito: true })   // levanta bloqueos previos
    await admin.from('historial_acciones').insert({
      actor_id: actorId, empresa_id: empresaId, accion: 'restablecer_contrasena_empresa',
      entidad: 'empresa', entidad_id: empresaId,
    })
    return responder(req, { ok: true })
  }

  return responder(req, { error: 'ACCION_DESCONOCIDA' }, 400)
})
