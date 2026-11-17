// Creación de colaboradores (individual y carga masiva) por el administrador de empresa.
// La empresa se toma del perfil de quien llama; lo que envíe el navegador como "empresa" se ignora.
// El usuario se genera en la base de datos. El colaborador nace SIN PIN: se genera al "Enviar evaluación".
import {
  claveAleatoria, codigoError, correoInterno, cors, esCorreo, identificar, leerJson, responder, servicio, texto, tieneRol,
} from '../_shared/comun.ts'
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'

const MAXIMO_POR_LOTE = 50

interface Fila {
  primer_nombre: string; segundo_nombre: string; primer_apellido: string; segundo_apellido: string
  cargo: string; correo: string
}

function leerFila(d: Record<string, unknown>): Fila {
  return {
    primer_nombre: texto(d.primer_nombre, 60), segundo_nombre: texto(d.segundo_nombre, 60),
    primer_apellido: texto(d.primer_apellido, 60), segundo_apellido: texto(d.segundo_apellido, 60),
    cargo: texto(d.cargo, 120), correo: texto(d.correo, 200).toLowerCase(),
  }
}

async function crearUno(admin: SupabaseClient, actorId: string, f: Fila): Promise<{ usuario?: string; error?: string }> {
  if (!/\p{L}/u.test(f.primer_nombre) || !/\p{L}/u.test(f.primer_apellido) || !f.segundo_apellido || !esCorreo(f.correo)) {
    return { error: 'DATOS_INVALIDOS' }
  }
  // Contraseña inicial aleatoria e inutilizable: nadie la conoce. El acceso real llega con el PIN.
  const { data: creado, error: errorAuth } = await admin.auth.admin.createUser({
    email: correoInterno(), password: claveAleatoria(), email_confirm: true,
  })
  if (errorAuth || !creado.user) return { error: 'ERROR_INTERNO' }

  const { data, error } = await admin.rpc('crear_colaborador_interno', {
    p_auth_id: creado.user.id, p_actor: actorId,
    p_primer_nombre: f.primer_nombre, p_segundo_nombre: f.segundo_nombre || null,
    p_primer_apellido: f.primer_apellido, p_segundo_apellido: f.segundo_apellido,
    p_cargo: f.cargo || null, p_correo: f.correo,
  })
  if (error) {
    await admin.auth.admin.deleteUser(creado.user.id)
    return { error: codigoError(error) }
  }
  return { usuario: data.usuario }
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

  if (cuerpo.accion === 'crear') {
    const r = await crearUno(admin, actorId, leerFila(cuerpo))
    return r.error ? responder(req, { error: r.error }, 400) : responder(req, { usuario: r.usuario })
  }

  if (cuerpo.accion === 'importar') {
    const filas = Array.isArray(cuerpo.filas) ? cuerpo.filas : []
    if (filas.length === 0 || filas.length > MAXIMO_POR_LOTE) return responder(req, { error: 'LOTE_INVALIDO' }, 400)
    const resultados: { indice: number; usuario?: string; error?: string }[] = []
    for (let i = 0; i < filas.length; i++) {
      const fila = filas[i]
      const r = fila && typeof fila === 'object'
        ? await crearUno(admin, actorId, leerFila(fila as Record<string, unknown>))
        : { error: 'DATOS_INVALIDOS' }
      resultados.push({ indice: i, ...r })
    }
    return responder(req, { resultados })
  }

  return responder(req, { error: 'ACCION_DESCONOCIDA' }, 400)
})
