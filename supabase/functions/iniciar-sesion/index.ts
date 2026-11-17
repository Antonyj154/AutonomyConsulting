// Inicio de sesión con usuario + clave (contraseña para administradores, PIN para colaboradores).
// - No revela si el usuario existe: el mensaje de error es siempre el mismo.
// - Bloquea 15 minutos tras 5 intentos fallidos.
// - Nunca registra la clave en logs.
import { cors, leerJson, publico, responder, servicio } from '../_shared/comun.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors(req) })
  if (req.method !== 'POST') return responder(req, { error: 'METODO_NO_PERMITIDO' }, 405)

  const cuerpo = await leerJson(req)
  const usuario = String(cuerpo?.usuario ?? '').trim().toLowerCase()
  const clave = String(cuerpo?.clave ?? '')
  if (!/^[a-z0-9]{3,40}$/.test(usuario) || clave.length < 6 || clave.length > 72) {
    return responder(req, { error: 'CREDENCIALES_INVALIDAS' }, 401)
  }

  const admin = servicio()
  const { data: estado, error: errorEstado } = await admin.rpc('acceso_estado', { p_usuario: usuario })
  if (errorEstado) return responder(req, { error: 'ERROR_INTERNO' }, 500)
  if (!estado) return responder(req, { error: 'CREDENCIALES_INVALIDAS' }, 401)
  if (estado.bloqueado) return responder(req, { error: 'USUARIO_BLOQUEADO' }, 429)
  if (!estado.activo) return responder(req, { error: 'CREDENCIALES_INVALIDAS' }, 401)

  const { data: cuenta } = await admin.auth.admin.getUserById(estado.auth_id)
  const correo = cuenta?.user?.email
  if (!correo) return responder(req, { error: 'CREDENCIALES_INVALIDAS' }, 401)

  const { data, error } = await publico().auth.signInWithPassword({ email: correo, password: clave })
  if (error || !data.session) {
    await admin.rpc('acceso_registrar', { p_usuario: usuario, p_exito: false })
    return responder(req, { error: 'CREDENCIALES_INVALIDAS' }, 401)
  }

  await admin.rpc('acceso_registrar', { p_usuario: usuario, p_exito: true })
  return responder(req, {
    access_token: data.session.access_token,
    refresh_token: data.session.refresh_token,
  })
})
