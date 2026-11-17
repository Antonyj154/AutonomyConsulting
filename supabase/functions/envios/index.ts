// "Enviar evaluación" y "Enviar a todos".
// Esta función NO envía correos. Genera el PIN de acceso, lo fija en Supabase Auth (cifrado),
// lo deja cifrado en la cola de envíos y marca al colaborador como "Solicitado".
// El servicio de correo externo lee la cola con obtener_envios_pendientes().
// El PIN nunca se devuelve al navegador ni se escribe en logs.
import { cors, identificar, leerJson, responder, servicio, texto, tieneRol } from '../_shared/comun.ts'
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'

const ALFABETO = 'abcdefghijklmnopqrstuvwxyz0123456789'
const MAXIMO_POR_LLAMADA = 60

// PIN de 6 caracteres (a-z, 0-9) con azar criptográfico y sin sesgo.
function generarPin(): string {
  let pin = ''
  while (pin.length < 6) {
    const [b] = crypto.getRandomValues(new Uint8Array(1))
    if (b < 252) pin += ALFABETO[b % 36]
  }
  return pin
}

type Resultado = 'ok' | 'no_elegible' | 'ya_solicitado' | 'error'

async function solicitar(admin: SupabaseClient, actorId: string, colaboradorId: string): Promise<Resultado> {
  for (let intento = 0; intento < 6; intento++) {
    const pin = generarPin()
    const { data, error } = await admin.rpc('registrar_solicitud_envio', {
      p_colaborador_id: colaboradorId, p_actor: actorId, p_pin: pin,
    })
    if (error) return 'error'
    if (data.estado === 'pin_duplicado') continue          // se genera otro PIN
    if (data.estado !== 'ok') return data.estado as Resultado
    const { error: errorAuth } = await admin.auth.admin.updateUserById(data.auth_id, { password: pin })
    if (errorAuth) {
      await admin.rpc('anular_solicitud_envio', { p_colaborador_id: colaboradorId, p_detalle: 'No se pudo fijar el PIN' })
      return 'error'
    }
    return 'ok'
  }
  return 'error'
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors(req) })
  if (req.method !== 'POST') return responder(req, { error: 'METODO_NO_PERMITIDO' }, 405)

  const admin = servicio()
  const actorId = await identificar(req, admin)
  if (!actorId) return responder(req, { error: 'NO_AUTORIZADO' }, 401)
  if (!(await tieneRol(admin, actorId, 'admin_empresa'))) return responder(req, { error: 'NO_AUTORIZADO' }, 403)

  const cuerpo = await leerJson(req)
  if (!cuerpo) return responder(req, { error: 'DATOS_INVALIDOS' }, 400)

  if (cuerpo.accion === 'solicitar') {
    const resultado = await solicitar(admin, actorId, texto(cuerpo.colaborador_id, 40))
    if (resultado === 'error') return responder(req, { error: 'ERROR_INTERNO' }, 500)
    return responder(req, { resultado })
  }

  if (cuerpo.accion === 'solicitar_todos') {
    const { data: ids, error } = await admin.rpc('colaboradores_elegibles_envio', { p_actor: actorId })
    if (error) return responder(req, { error: 'ERROR_INTERNO' }, 500)
    const lista = (ids ?? []) as string[]
    let solicitados = 0
    let errores = 0
    for (const id of lista.slice(0, MAXIMO_POR_LLAMADA)) {
      const r = await solicitar(admin, actorId, id)
      if (r === 'ok') solicitados++
      else if (r === 'error') errores++
    }
    // Si quedan más, la aplicación vuelve a llamar hasta terminar (evita tiempos de espera largos).
    return responder(req, { solicitados, errores, restantes: Math.max(lista.length - MAXIMO_POR_LLAMADA, 0) })
  }

  return responder(req, { error: 'ACCION_DESCONOCIDA' }, 400)
})
