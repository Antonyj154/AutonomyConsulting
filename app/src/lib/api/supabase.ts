// CONEXIÓN REAL A SUPABASE
// El navegador solo conoce la URL del proyecto y la llave pública (anon). Con ella no se puede
// leer ni escribir nada sin una sesión válida: la seguridad la imponen las políticas RLS y las
// funciones de la base. La llave service_role NUNCA se usa aquí.
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Api, FilaImportacion, ResultadoImportacion, Sesion } from '@/lib/tipos'
import { ErrorApp } from '@/lib/utilidades'

const TAMANO_LOTE = 25

function codigoDe(mensaje: string | undefined): string {
  const m = (mensaje ?? '').match(/\b[A-Z][A-Z_]{4,}\b/)
  return m ? m[0] : 'ERROR_INTERNO'
}

export function crearApiSupabase(url: string, llavePublica: string): Api {
  const sb: SupabaseClient = createClient(url, llavePublica, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, storage: window.sessionStorage },
  })

  // Llama a una función de la base de datos (RPC).
  async function rpc<T>(nombre: string, parametros?: Record<string, unknown>): Promise<T> {
    const { data, error } = await sb.rpc(nombre, parametros)
    if (error) throw new ErrorApp(codigoDe(error.message))
    return data as T
  }

  // Llama a una función segura de servidor (Edge Function) con el token de la sesión.
  async function funcion<T>(nombre: string, cuerpo: Record<string, unknown>, conSesion = true): Promise<T> {
    const cabeceras: Record<string, string> = { 'Content-Type': 'application/json', apikey: llavePublica }
    if (conSesion) {
      const { data } = await sb.auth.getSession()
      if (!data.session) throw new ErrorApp('NO_AUTORIZADO')
      cabeceras.Authorization = `Bearer ${data.session.access_token}`
    } else {
      cabeceras.Authorization = `Bearer ${llavePublica}`
    }
    let respuesta: Response
    try {
      respuesta = await fetch(`${url}/functions/v1/${nombre}`, { method: 'POST', headers: cabeceras, body: JSON.stringify(cuerpo) })
    } catch {
      throw new ErrorApp('SIN_CONEXION')
    }
    const json = (await respuesta.json().catch(() => ({}))) as { error?: string }
    if (!respuesta.ok) throw new ErrorApp(json.error ?? 'ERROR_INTERNO')
    return json as T
  }

  async function sesionActual(): Promise<Sesion | null> {
    const { data } = await sb.auth.getSession()
    if (!data.session) return null
    const sesion = await rpc<Sesion | null>('mi_sesion')
    if (!sesion) await sb.auth.signOut()   // cuenta o empresa inactivada: se cierra la sesión
    return sesion
  }

  return {
    modo: 'supabase',

    async iniciarSesion(usuario, clave) {
      const tokens = await funcion<{ access_token: string; refresh_token: string }>(
        'iniciar-sesion', { usuario: usuario.trim().toLowerCase(), clave }, false)
      const { error } = await sb.auth.setSession(tokens)
      if (error) throw new ErrorApp('CREDENCIALES_INVALIDAS')
      const sesion = await sesionActual()
      if (!sesion) throw new ErrorApp('CREDENCIALES_INVALIDAS')
      return sesion
    },
    async cerrarSesion() {
      await sb.auth.signOut()
    },
    sesionActual,
    async cambiarContrasena(actual, nueva) {
      if (nueva.length < 10) throw new ErrorApp('CONTRASENA_DEBIL')
      const sesion = await sesionActual()
      if (!sesion || sesion.rol === 'colaborador') throw new ErrorApp('NO_AUTORIZADO')
      // Se comprueba la contraseña actual volviendo a autenticar antes de cambiarla.
      try {
        await funcion('iniciar-sesion', { usuario: sesion.usuario, clave: actual }, false)
      } catch (e) {
        throw new ErrorApp(e instanceof ErrorApp && e.codigo === 'USUARIO_BLOQUEADO' ? 'USUARIO_BLOQUEADO' : 'CONTRASENA_INCORRECTA')
      }
      const { error } = await sb.auth.updateUser({ password: nueva })
      if (error) throw new ErrorApp('CONTRASENA_DEBIL')
    },
    actualizarMiPerfil: (nombres, apellidos) => rpc('actualizar_mi_perfil', { p_nombres: nombres, p_apellidos: apellidos }),
    miFicha: () => rpc('mi_ficha'),

    listarEmpresas: () => rpc('panel_admin_general'),
    async crearEmpresa(datos) {
      await funcion('empresas', { accion: 'crear', ...datos })
    },
    actualizarEmpresa: (id, d) => rpc('actualizar_empresa', {
      p_id: id, p_nombre: d.nombre, p_correo: d.correo, p_estado: d.estado, p_informes: d.informes_contratados,
    }),
    async restablecerContrasenaEmpresa(id, nueva) {
      await funcion('empresas', { accion: 'restablecer', empresa_id: id, contrasena: nueva })
    },
    obtenerCuestionario: () => rpc('obtener_cuestionario'),
    async guardarBloque(id, nombre, estado) {
      await rpc('guardar_bloque', { p_id: id, p_nombre: nombre, p_estado: estado })
    },
    eliminarBloque: (id) => rpc('eliminar_bloque', { p_id: id }),
    reordenarBloques: (ids) => rpc('reordenar_bloques', { p_ids: ids }),
    async guardarPregunta(d) {
      await rpc('guardar_pregunta', {
        p_id: d.id ?? null, p_bloque_id: d.bloque_id, p_texto: d.texto, p_rubrica: d.rubrica,
        p_izquierda: d.etiqueta_izquierda, p_centro: d.etiqueta_centro, p_derecha: d.etiqueta_derecha, p_estado: d.estado,
      })
    },
    eliminarPregunta: (id) => rpc('eliminar_pregunta', { p_id: id }),
    reordenarPreguntas: (bloqueId, ids) => rpc('reordenar_preguntas', { p_bloque_id: bloqueId, p_ids: ids }),
    async obtenerConsentimiento() {
      const { data, error } = await sb.from('consentimientos').select('id, version, texto').eq('vigente', true).maybeSingle()
      if (error) throw new ErrorApp(codigoDe(error.message))
      return data
    },
    async publicarConsentimiento(texto) {
      await rpc('publicar_consentimiento', { p_texto: texto })
    },

    panelEmpresa: () => rpc('panel_empresa'),
    listarColaboradores: () => rpc('listar_colaboradores'),
    crearColaborador: (datos) => funcion('colaboradores', { accion: 'crear', ...datos }),
    async importarColaboradores(filas, alAvanzar) {
      const resultado: ResultadoImportacion = { creados: [], errores: [] }
      for (let i = 0; i < filas.length; i += TAMANO_LOTE) {
        const lote: FilaImportacion[] = filas.slice(i, i + TAMANO_LOTE)
        try {
          const r = await funcion<{ resultados: { indice: number; usuario?: string; error?: string }[] }>(
            'colaboradores', { accion: 'importar', filas: lote })
          for (const x of r.resultados) {
            const fila = lote[x.indice].fila
            if (x.usuario) resultado.creados.push({ fila, usuario: x.usuario })
            else resultado.errores.push({ fila, error: x.error ?? 'ERROR_INTERNO' })
          }
        } catch (e) {
          const codigo = e instanceof ErrorApp ? e.codigo : 'ERROR_INTERNO'
          lote.forEach((f) => resultado.errores.push({ fila: f.fila, error: codigo }))
        }
        alAvanzar?.(Math.min(i + TAMANO_LOTE, filas.length))
      }
      return resultado
    },
    actualizarColaborador: (id, d) => rpc('actualizar_colaborador', {
      p_id: id, p_primer_nombre: d.primer_nombre, p_segundo_nombre: d.segundo_nombre, p_primer_apellido: d.primer_apellido,
      p_segundo_apellido: d.segundo_apellido, p_cargo: d.cargo, p_correo: d.correo,
    }),
    cambiarEstadoColaborador: (id, estado) => rpc('cambiar_estado_colaborador', { p_id: id, p_estado: estado }),
    eliminarColaborador: (id) => rpc('eliminar_colaborador', { p_id: id }),
    async solicitarEnvio(id) {
      const r = await funcion<{ resultado: 'ok' | 'no_elegible' | 'ya_solicitado' }>('envios', { accion: 'solicitar', colaborador_id: id })
      return r.resultado
    },
    async solicitarEnvioTodos() {
      let solicitados = 0
      let errores = 0
      // El servidor procesa por tandas; se repite hasta que no quede nadie pendiente.
      for (let vuelta = 0; vuelta < 50; vuelta++) {
        const r = await funcion<{ solicitados: number; errores: number; restantes: number }>('envios', { accion: 'solicitar_todos' })
        solicitados += r.solicitados
        errores += r.errores
        if (r.restantes === 0 || r.solicitados === 0) break
      }
      return { solicitados, errores }
    },
    exportarResultados: () => rpc('exportar_resultados'),
    async urlInforme(ruta) {
      const { data, error } = await sb.storage.from('informes').createSignedUrl(ruta, 60)   // enlace válido 60 segundos
      if (error || !data) throw new ErrorApp('NO_ENCONTRADO')
      return data.signedUrl
    },

    miEvaluacion: () => rpc('obtener_mi_evaluacion'),
    iniciarEvaluacion: (id) => rpc('iniciar_evaluacion', { p_consentimiento_id: id }),
    guardarRespuesta: (preguntaId, posicion) => rpc('guardar_respuesta', { p_pregunta_id: preguntaId, p_posicion: posicion }),
    finalizarEvaluacion: () => rpc('finalizar_evaluacion'),
  }
}
