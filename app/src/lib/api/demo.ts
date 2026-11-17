// MODO DEMOSTRACIÓN
// Simula la base de datos dentro del navegador con datos ficticios, para revisar las pantallas
// antes de conectar Supabase. Aplica las mismas reglas de negocio que los scripts SQL.
// Nada de lo que ocurre aquí sale del navegador. No usar con datos reales.
import type {
  Api, Bloque, Colaborador, DatosColaborador, Estado, EstadoEnvio, EstadoEvaluacion, EstadoInforme,
  Exportacion, Posicion, Rol, Rubrica, Sesion,
} from '@/lib/tipos'
import { ErrorApp, esCorreo, nombreCompleto, usuarioBase } from '@/lib/utilidades'

const CLAVE_DATOS = 'autonomy-demo-v2'
const CLAVE_SESION = 'autonomy-demo-sesion'

interface Cuenta { id: string; usuario: string; clave: string; rol: Rol; empresa_id: string | null; nombres: string; apellidos: string; estado: Estado; fallidos: number }
interface EmpresaD { id: string; nombre: string; correo: string; estado: Estado; informes_contratados: number; created_at: string }
interface ColaboradorD extends DatosColaborador { id: string; cuenta_id: string; empresa_id: string; estado: Estado; estado_envio: EstadoEnvio; envio_solicitado_en: string | null; envio_procesado_en: string | null; created_at: string; eliminado: boolean }
interface VersionD { id: string; pregunta_id: string; numero: number; texto: string; rubrica: Rubrica; izq: string; cen: string; der: string }
interface PreguntaD { id: string; codigo: number; bloque_id: string; orden: number; estado: Estado; version_id: string; eliminada: boolean }
interface BloqueD { id: string; nombre: string; orden: number; estado: Estado }
interface RespuestaD { pregunta_id: string; version_id: string; bloque: string; bloque_orden: number; orden: number; posicion: Posicion | null; puntaje: number | null }
interface EvaluacionD { colaborador_id: string; empresa_id: string; estado: EstadoEvaluacion; iniciada_en: string | null; finalizada_en: string | null; informe_estado: EstadoInforme; informe_ruta: string | null; respuestas: RespuestaD[] }
interface ConsentimientoD { id: string; version: number; texto: string; vigente: boolean }
interface Datos {
  cuentas: Cuenta[]; empresas: EmpresaD[]; colaboradores: ColaboradorD[]; bloques: BloqueD[]
  preguntas: PreguntaD[]; versiones: VersionD[]; evaluaciones: EvaluacionD[]; consentimientos: ConsentimientoD[]
  secuencia: number
}

export const CONSENTIMIENTO_INICIAL = `Antes de iniciar, te pedimos leer y aceptar lo siguiente:

1. Quién trata tus datos. {{empresa}}, por encargo de Autonomy Consulting, recoge tus nombres, apellidos, cargo, correo electrónico y las respuestas que registres en esta evaluación.

2. Para qué se usan. Únicamente para elaborar informes de evaluación destinados a tu empresa. No se usarán para fines distintos ni se venderán o cederán a terceros ajenos a este proceso.

3. Quién puede verlos. El personal autorizado de tu empresa y de Autonomy Consulting. Ningún otro colaborador tendrá acceso a tus respuestas.

4. Cómo es la evaluación. No tiene límite de tiempo ni respuestas correctas o incorrectas. Una vez enviada, no podrás modificarla.

5. Tus derechos. Puedes solicitar el acceso o la rectificación de tus datos, y para solicitar su eliminación debes contactar al administrador de tu empresa.

Al marcar "Acepto" declaras que has leído esta información y autorizas de forma libre y voluntaria el tratamiento de tus datos para los fines indicados.`

/** Credenciales ficticias que se muestran en la pantalla de ingreso del modo demostración. */
export const ACCESOS_DEMO = [
  { rol: 'Administrador general', usuario: 'admin', clave: 'Admin-Demo-2026' },
  { rol: 'Empresa', usuario: 'acme', clave: 'Empresa-Demo-2026' },
  { rol: 'Colaborador', usuario: 'luciam24', clave: 'demo01' },
]

const uid = (): string => crypto.randomUUID()
const ahora = (): string => new Date().toISOString()
const dias = (n: number): string => new Date(Date.now() - n * 86_400_000).toISOString()
const pausa = (): Promise<void> => new Promise((r) => setTimeout(r, 220))
const limpiar = (t: string | null | undefined): string => (t ?? '').trim().replace(/\s+/g, ' ')

function pinAleatorio(): string {
  const alfabeto = 'abcdefghijklmnopqrstuvwxyz0123456789'
  let pin = ''
  while (pin.length < 6) {
    const [b] = crypto.getRandomValues(new Uint8Array(1))
    if (b < 252) pin += alfabeto[b % 36]
  }
  return pin
}

function sembrar(): Datos {
  const d: Datos = { cuentas: [], empresas: [], colaboradores: [], bloques: [], preguntas: [], versiones: [], evaluaciones: [], consentimientos: [], secuencia: 0 }
  d.consentimientos.push({ id: uid(), version: 1, texto: CONSENTIMIENTO_INICIAL, vigente: true })
  d.cuentas.push({ id: uid(), usuario: 'admin', clave: 'Admin-Demo-2026', rol: 'admin_general', empresa_id: null, nombres: 'Equipo', apellidos: 'Autonomy', estado: 'activo', fallidos: 0 })

  const acme: EmpresaD = { id: uid(), nombre: 'Acme Andina', correo: 'talento@acmeandina.example', estado: 'activo', informes_contratados: 10, created_at: dias(40) }
  const nova: EmpresaD = { id: uid(), nombre: 'Nova Retail', correo: 'rrhh@novaretail.example', estado: 'activo', informes_contratados: 3, created_at: dias(12) }
  d.empresas.push(acme, nova)
  d.cuentas.push({ id: uid(), usuario: 'acme', clave: 'Empresa-Demo-2026', rol: 'admin_empresa', empresa_id: acme.id, nombres: 'Acme Andina', apellidos: '', estado: 'activo', fallidos: 0 })
  d.cuentas.push({ id: uid(), usuario: 'nova', clave: 'Empresa-Demo-2026', rol: 'admin_empresa', empresa_id: nova.id, nombres: 'Nova Retail', apellidos: '', estado: 'activo', fallidos: 0 })

  const cuestionario: [string, [string, Rubrica, [string, string, string]?][]][] = [
    ['Comunicación', [
      ['Me comunico de manera clara con mi equipo.', 'positivo'],
      ['Escucho las opiniones de otras personas antes de decidir.', 'positivo'],
      ['Interrumpo a los demás cuando están hablando.', 'negativo', ['Nunca', 'A veces', 'Siempre']],
      ['Doy retroalimentación de forma oportuna y respetuosa.', 'positivo'],
    ]],
    ['Trabajo en equipo', [
      ['Colaboro con otras áreas para alcanzar objetivos comunes.', 'positivo'],
      ['Prefiero resolver los problemas por mi cuenta, sin pedir ayuda.', 'negativo'],
      ['Reconozco los aportes de mis compañeros.', 'positivo', ['No me representa', 'Me representa parcialmente', 'Me representa completamente']],
    ]],
    ['Autonomía', [
      ['Organizo mi trabajo sin necesidad de supervisión constante.', 'positivo'],
      ['Tomo decisiones dentro de mi ámbito de responsabilidad.', 'positivo'],
      ['Postergo las tareas que me resultan difíciles.', 'negativo', ['Nunca', 'A veces', 'Siempre']],
    ]],
  ]
  cuestionario.forEach(([nombre, preguntas], i) => {
    const bloque: BloqueD = { id: uid(), nombre, orden: i + 1, estado: 'activo' }
    d.bloques.push(bloque)
    preguntas.forEach(([texto, rubrica, etiquetas], j) => {
      const p: PreguntaD = { id: uid(), codigo: ++d.secuencia, bloque_id: bloque.id, orden: j + 1, estado: 'activo', version_id: '', eliminada: false }
      const v: VersionD = { id: uid(), pregunta_id: p.id, numero: 1, texto, rubrica, izq: etiquetas?.[0] ?? 'En desacuerdo', cen: etiquetas?.[1] ?? 'Neutro', der: etiquetas?.[2] ?? 'De acuerdo' }
      p.version_id = v.id
      d.preguntas.push(p)
      d.versiones.push(v)
    })
  })

  const gente: [EmpresaD, string, string, string, string, string, EstadoEnvio, EstadoEvaluacion, Estado, string?][] = [
    [acme, 'Lucía', 'Fernanda', 'Mora', 'Salazar', 'Analista de Talento', 'enviado', 'pendiente', 'activo', 'demo01'],
    [acme, 'Andrés', '', 'Cevallos', 'Ruiz', 'Jefe de Operaciones', 'enviado', 'finalizada', 'activo'],
    [acme, 'María José', '', 'Ñáñez', 'Paredes', 'Coordinadora Comercial', 'enviado', 'finalizada', 'activo'],
    [acme, 'Diego', 'Alejandro', 'Vera', 'Intriago', 'Asistente Contable', 'error', 'pendiente', 'activo'],
    [acme, 'Paula', '', 'Guzmán', 'Loor', '', 'pendiente', 'pendiente', 'activo'],
    [acme, 'Ricardo', 'Xavier', 'Pino', 'Zambrano', 'Bodeguero', 'pendiente', 'pendiente', 'inactivo'],
    [nova, 'Camila', '', 'Rojas', 'Andrade', 'Vendedora', 'pendiente', 'pendiente', 'activo'],
  ]
  gente.forEach(([empresa, pn, sn, pa, sa, cargo, envio, evaluacion, estado, clave], i) => {
    const datos: DatosColaborador = { primer_nombre: pn, segundo_nombre: sn, primer_apellido: pa, segundo_apellido: sa, cargo, correo: `${usuarioBase({ primer_nombre: pn, segundo_nombre: sn, primer_apellido: pa, segundo_apellido: sa })}@${empresa === acme ? 'acmeandina' : 'novaretail'}.example` }
    const cuenta: Cuenta = { id: uid(), usuario: usuarioUnico(d, datos), clave: clave ?? pinAleatorio(), rol: 'colaborador', empresa_id: empresa.id, nombres: '', apellidos: '', estado, fallidos: 0 }
    d.cuentas.push(cuenta)
    const col: ColaboradorD = { ...datos, id: uid(), cuenta_id: cuenta.id, empresa_id: empresa.id, estado, estado_envio: envio, envio_solicitado_en: envio === 'pendiente' ? null : dias(6), envio_procesado_en: envio === 'enviado' ? dias(6) : null, created_at: dias(30 - i), eliminado: false }
    d.colaboradores.push(col)
    const ev: EvaluacionD = { colaborador_id: col.id, empresa_id: empresa.id, estado: 'pendiente', iniciada_en: null, finalizada_en: null, informe_estado: 'no_generado', informe_ruta: null, respuestas: [] }
    if (evaluacion === 'finalizada') {
      ev.respuestas = congelar(d)
      ev.respuestas.forEach((r, k) => responder(d, r, (((k + i) % 3) + 1) as Posicion))
      ev.estado = 'finalizada'
      ev.iniciada_en = dias(4)
      ev.finalizada_en = dias(4 - i * 0.5)
      if (i === 1) { ev.informe_estado = 'disponible'; ev.informe_ruta = `demo/${cuenta.usuario}.pdf` }
    }
    d.evaluaciones.push(ev)
  })
  return d
}

function usuarioUnico(d: Datos, datos: DatosColaborador): string {
  const base = usuarioBase(datos)
  let usuario = base
  for (let n = 1; d.cuentas.some((c) => c.usuario === usuario); n++) usuario = `${base}${n}`
  return usuario
}

function congelar(d: Datos): RespuestaD[] {
  const salida: RespuestaD[] = []
  const bloques = d.bloques.filter((b) => b.estado === 'activo').sort((a, b) => a.orden - b.orden)
  bloques.forEach((b, i) => {
    d.preguntas
      .filter((p) => p.bloque_id === b.id && p.estado === 'activo' && !p.eliminada)
      .sort((x, y) => x.orden - y.orden)
      .forEach((p, j) => salida.push({ pregunta_id: p.id, version_id: p.version_id, bloque: b.nombre, bloque_orden: i + 1, orden: j + 1, posicion: null, puntaje: null }))
  })
  return salida
}

function responder(d: Datos, r: RespuestaD, posicion: Posicion): void {
  const v = d.versiones.find((x) => x.id === r.version_id)!
  r.posicion = posicion
  r.puntaje = v.rubrica === 'positivo' ? posicion - 2 : 2 - posicion
}

function cargar(): Datos {
  try {
    const crudo = localStorage.getItem(CLAVE_DATOS)
    if (crudo) return JSON.parse(crudo) as Datos
  } catch { /* se vuelve a sembrar */ }
  const d = sembrar()
  guardar(d)
  return d
}

function guardar(d: Datos): void {
  try { localStorage.setItem(CLAVE_DATOS, JSON.stringify(d)) } catch { /* sin almacenamiento: solo en memoria */ }
}

export function reiniciarDemo(): void {
  try { localStorage.removeItem(CLAVE_DATOS); sessionStorage.removeItem(CLAVE_SESION) } catch { /* nada */ }
}

/** Solo demostración: en producción el PIN viaja por correo y nunca se muestra en pantalla. */
export let ultimoPinDemo: { usuario: string; pin: string } | null = null

export function crearApiDemo(): Api {
  let d = cargar()
  let sesionId: string | null = null
  try { sesionId = sessionStorage.getItem(CLAVE_SESION) } catch { /* nada */ }

  const persistir = (): void => guardar(d)
  const empresaDe = (id: string | null): EmpresaD | undefined => d.empresas.find((e) => e.id === id)

  // Equivale a auth_rol(): la cuenta y su empresa deben estar activas.
  function cuentaActiva(): Cuenta {
    const c = d.cuentas.find((x) => x.id === sesionId)
    if (!c || c.estado !== 'activo') throw new ErrorApp('NO_AUTORIZADO')
    if (c.rol !== 'admin_general' && empresaDe(c.empresa_id)?.estado !== 'activo') throw new ErrorApp('NO_AUTORIZADO')
    return c
  }
  function exigir(rol: Rol): Cuenta {
    const c = cuentaActiva()
    if (c.rol !== rol) throw new ErrorApp('NO_AUTORIZADO')
    return c
  }
  function miColaborador(): ColaboradorD {
    const c = exigir('colaborador')
    const col = d.colaboradores.find((x) => x.cuenta_id === c.id && !x.eliminado && x.estado === 'activo')
    if (!col) throw new ErrorApp('NO_AUTORIZADO')
    return col
  }
  const evaluacionDe = (colId: string): EvaluacionD => d.evaluaciones.find((e) => e.colaborador_id === colId)!
  const utilizados = (empresaId: string): number => d.evaluaciones.filter((e) => e.empresa_id === empresaId && e.estado === 'finalizada').length
  const reservados = (empresaId: string): number => d.evaluaciones.filter((e) => e.empresa_id === empresaId && e.estado !== 'pendiente').length

  function aSesion(c: Cuenta): Sesion {
    const col = d.colaboradores.find((x) => x.cuenta_id === c.id)
    return {
      id: c.id, usuario: c.usuario, rol: c.rol, empresa_id: c.empresa_id,
      empresa_nombre: empresaDe(c.empresa_id)?.nombre ?? null,
      nombres: col ? [col.primer_nombre, col.segundo_nombre].filter(Boolean).join(' ') : c.nombres,
      apellidos: col ? [col.primer_apellido, col.segundo_apellido].filter(Boolean).join(' ') : c.apellidos,
    }
  }

  function validarColaborador(datos: DatosColaborador, empresaId: string, exceptoId?: string): DatosColaborador {
    const v: DatosColaborador = {
      primer_nombre: limpiar(datos.primer_nombre), segundo_nombre: limpiar(datos.segundo_nombre),
      primer_apellido: limpiar(datos.primer_apellido), segundo_apellido: limpiar(datos.segundo_apellido),
      cargo: limpiar(datos.cargo), correo: limpiar(datos.correo).toLowerCase(),
    }
    if (!usuarioBase(v) || !v.segundo_apellido || !esCorreo(v.correo)) throw new ErrorApp('DATOS_INVALIDOS')
    if (d.colaboradores.some((c) => c.empresa_id === empresaId && !c.eliminado && c.correo === v.correo && c.id !== exceptoId)) {
      throw new ErrorApp('CORREO_DUPLICADO')
    }
    return v
  }

  function crearCol(datos: DatosColaborador, empresaId: string): string {
    const v = validarColaborador(datos, empresaId)
    const cuenta: Cuenta = { id: uid(), usuario: usuarioUnico(d, v), clave: uid(), rol: 'colaborador', empresa_id: empresaId, nombres: '', apellidos: '', estado: 'activo', fallidos: 0 }
    d.cuentas.push(cuenta)
    const col: ColaboradorD = { ...v, id: uid(), cuenta_id: cuenta.id, empresa_id: empresaId, estado: 'activo', estado_envio: 'pendiente', envio_solicitado_en: null, envio_procesado_en: null, created_at: ahora(), eliminado: false }
    d.colaboradores.push(col)
    d.evaluaciones.push({ colaborador_id: col.id, empresa_id: empresaId, estado: 'pendiente', iniciada_en: null, finalizada_en: null, informe_estado: 'no_generado', informe_ruta: null, respuestas: [] })
    return cuenta.usuario
  }

  function solicitar(col: ColaboradorD): 'ok' | 'no_elegible' | 'ya_solicitado' {
    if (col.eliminado || col.estado !== 'activo' || evaluacionDe(col.id).estado === 'finalizada') return 'no_elegible'
    if (col.estado_envio === 'solicitado') return 'ya_solicitado'
    const cuenta = d.cuentas.find((c) => c.id === col.cuenta_id)!
    cuenta.clave = pinAleatorio()
    ultimoPinDemo = { usuario: cuenta.usuario, pin: cuenta.clave }
    col.estado_envio = 'solicitado'
    col.envio_solicitado_en = ahora()
    col.envio_procesado_en = null
    // Simula al servicio de correo externo: unos segundos después marca el envío como "enviado".
    setTimeout(() => {
      const actual = d.colaboradores.find((c) => c.id === col.id)
      if (actual && actual.estado_envio === 'solicitado') {
        actual.estado_envio = 'enviado'
        actual.envio_procesado_en = ahora()
        persistir()
      }
    }, 6000)
    return 'ok'
  }

  const api: Api = {
    modo: 'demo',

    async iniciarSesion(usuario, clave) {
      await pausa()
      const c = d.cuentas.find((x) => x.usuario === usuario.trim().toLowerCase())
      if (!c) throw new ErrorApp('CREDENCIALES_INVALIDAS')
      if (c.fallidos >= 5) throw new ErrorApp('USUARIO_BLOQUEADO')
      const col = d.colaboradores.find((x) => x.cuenta_id === c.id)
      const activo = c.estado === 'activo' && (c.rol === 'admin_general' || empresaDe(c.empresa_id)?.estado === 'activo') && (!col || (!col.eliminado && col.estado === 'activo'))
      if (!activo || c.clave !== clave) {
        if (c.clave !== clave) c.fallidos++
        persistir()
        throw new ErrorApp('CREDENCIALES_INVALIDAS')
      }
      c.fallidos = 0
      sesionId = c.id
      try { sessionStorage.setItem(CLAVE_SESION, c.id) } catch { /* nada */ }
      persistir()
      return aSesion(c)
    },
    async cerrarSesion() {
      sesionId = null
      try { sessionStorage.removeItem(CLAVE_SESION) } catch { /* nada */ }
    },
    async sesionActual() {
      d = cargar()
      try { return aSesion(cuentaActiva()) } catch { return null }
    },
    async cambiarContrasena(actual, nueva) {
      await pausa()
      const c = cuentaActiva()
      if (c.rol === 'colaborador') throw new ErrorApp('NO_AUTORIZADO')
      if (c.clave !== actual) throw new ErrorApp('CONTRASENA_INCORRECTA')
      if (nueva.length < 10) throw new ErrorApp('CONTRASENA_DEBIL')
      c.clave = nueva
      persistir()
    },
    async actualizarMiPerfil(nombres, apellidos) {
      await pausa()
      const c = cuentaActiva()
      if (c.rol === 'colaborador') throw new ErrorApp('NO_AUTORIZADO')
      c.nombres = limpiar(nombres)
      c.apellidos = limpiar(apellidos)
      persistir()
    },
    async miFicha() {
      await pausa()
      const col = miColaborador()
      return {
        usuario: d.cuentas.find((c) => c.id === col.cuenta_id)!.usuario,
        primer_nombre: col.primer_nombre, segundo_nombre: col.segundo_nombre || null,
        primer_apellido: col.primer_apellido, segundo_apellido: col.segundo_apellido,
        cargo: col.cargo || null, correo: col.correo, empresa: empresaDe(col.empresa_id)!.nombre,
      }
    },

    async listarEmpresas() {
      await pausa()
      exigir('admin_general')
      return d.empresas
        .map((e) => ({
          id: e.id, nombre: e.nombre, correo: e.correo, estado: e.estado, created_at: e.created_at,
          usuario: d.cuentas.find((c) => c.empresa_id === e.id && c.rol === 'admin_empresa')?.usuario ?? '',
          informes_contratados: e.informes_contratados,
          total_colaboradores: d.colaboradores.filter((c) => c.empresa_id === e.id && !c.eliminado).length,
          informes_utilizados: utilizados(e.id),
          informes_disponibles: Math.max(e.informes_contratados - utilizados(e.id), 0),
        }))
        .sort((a, b) => b.created_at.localeCompare(a.created_at))
    },
    async crearEmpresa(datos) {
      await pausa()
      exigir('admin_general')
      const nombre = limpiar(datos.nombre)
      const usuario = datos.usuario.trim().toLowerCase()
      if (nombre.length < 2 || !esCorreo(datos.correo) || datos.informes_contratados < 0) throw new ErrorApp('DATOS_INVALIDOS')
      if (!/^[a-z0-9]{4,30}$/.test(usuario)) throw new ErrorApp('USUARIO_INVALIDO')
      if (datos.contrasena.length < 10) throw new ErrorApp('CONTRASENA_DEBIL')
      if (d.cuentas.some((c) => c.usuario === usuario)) throw new ErrorApp('USUARIO_DUPLICADO')
      if (d.empresas.some((e) => e.nombre.toLowerCase() === nombre.toLowerCase())) throw new ErrorApp('EMPRESA_DUPLICADA')
      const e: EmpresaD = { id: uid(), nombre, correo: datos.correo.trim().toLowerCase(), estado: 'activo', informes_contratados: datos.informes_contratados, created_at: ahora() }
      d.empresas.push(e)
      d.cuentas.push({ id: uid(), usuario, clave: datos.contrasena, rol: 'admin_empresa', empresa_id: e.id, nombres: nombre, apellidos: '', estado: 'activo', fallidos: 0 })
      persistir()
    },
    async actualizarEmpresa(id, datos) {
      await pausa()
      exigir('admin_general')
      const e = empresaDe(id)
      if (!e) throw new ErrorApp('NO_ENCONTRADO')
      const nombre = limpiar(datos.nombre)
      if (nombre.length < 2 || !esCorreo(datos.correo) || datos.informes_contratados < 0) throw new ErrorApp('DATOS_INVALIDOS')
      if (d.empresas.some((x) => x.id !== id && x.nombre.toLowerCase() === nombre.toLowerCase())) throw new ErrorApp('EMPRESA_DUPLICADA')
      if (datos.informes_contratados < utilizados(id)) throw new ErrorApp('PLAN_MENOR_A_UTILIZADOS')
      Object.assign(e, { nombre, correo: datos.correo.trim().toLowerCase(), estado: datos.estado, informes_contratados: datos.informes_contratados })
      persistir()
    },
    async restablecerContrasenaEmpresa(id, nueva) {
      await pausa()
      exigir('admin_general')
      if (nueva.length < 10) throw new ErrorApp('CONTRASENA_DEBIL')
      const c = d.cuentas.find((x) => x.empresa_id === id && x.rol === 'admin_empresa')
      if (!c) throw new ErrorApp('NO_ENCONTRADO')
      c.clave = nueva
      c.fallidos = 0
      persistir()
    },

    async obtenerCuestionario() {
      await pausa()
      exigir('admin_general')
      return d.bloques
        .slice()
        .sort((a, b) => a.orden - b.orden)
        .map<Bloque>((b) => ({
          ...b,
          preguntas: d.preguntas
            .filter((p) => p.bloque_id === b.id && !p.eliminada)
            .sort((x, y) => x.orden - y.orden)
            .map((p) => {
              const v = d.versiones.find((x) => x.id === p.version_id)!
              return { id: p.id, codigo: p.codigo, bloque_id: p.bloque_id, orden: p.orden, estado: p.estado, texto: v.texto, rubrica: v.rubrica, version: v.numero, etiqueta_izquierda: v.izq, etiqueta_centro: v.cen, etiqueta_derecha: v.der }
            }),
        }))
    },
    async guardarBloque(id, nombre, estado) {
      await pausa()
      exigir('admin_general')
      const n = limpiar(nombre)
      if (!n) throw new ErrorApp('DATOS_INVALIDOS')
      if (id) {
        const b = d.bloques.find((x) => x.id === id)
        if (!b) throw new ErrorApp('NO_ENCONTRADO')
        b.nombre = n
        b.estado = estado
      } else {
        d.bloques.push({ id: uid(), nombre: n, estado, orden: Math.max(0, ...d.bloques.map((b) => b.orden)) + 1 })
      }
      persistir()
    },
    async eliminarBloque(id) {
      await pausa()
      exigir('admin_general')
      if (d.preguntas.some((p) => p.bloque_id === id && !p.eliminada)) throw new ErrorApp('BLOQUE_CON_PREGUNTAS')
      d.bloques = d.bloques.filter((b) => b.id !== id)
      persistir()
    },
    async reordenarBloques(ids) {
      exigir('admin_general')
      ids.forEach((id, i) => { const b = d.bloques.find((x) => x.id === id); if (b) b.orden = i + 1 })
      persistir()
    },
    async guardarPregunta(datos) {
      await pausa()
      exigir('admin_general')
      const texto = limpiar(datos.texto)
      if (texto.length < 3) throw new ErrorApp('DATOS_INVALIDOS')
      if (!d.bloques.some((b) => b.id === datos.bloque_id)) throw new ErrorApp('BLOQUE_NO_ENCONTRADO')
      const contenido = { texto, rubrica: datos.rubrica, izq: limpiar(datos.etiqueta_izquierda) || 'En desacuerdo', cen: limpiar(datos.etiqueta_centro) || 'Neutro', der: limpiar(datos.etiqueta_derecha) || 'De acuerdo' }
      const siguienteOrden = (bloqueId: string): number => Math.max(0, ...d.preguntas.filter((p) => p.bloque_id === bloqueId && !p.eliminada).map((p) => p.orden)) + 1
      if (!datos.id) {
        const p: PreguntaD = { id: uid(), codigo: ++d.secuencia, bloque_id: datos.bloque_id, orden: siguienteOrden(datos.bloque_id), estado: datos.estado, version_id: '', eliminada: false }
        const v: VersionD = { id: uid(), pregunta_id: p.id, numero: 1, ...contenido }
        p.version_id = v.id
        d.preguntas.push(p)
        d.versiones.push(v)
      } else {
        const p = d.preguntas.find((x) => x.id === datos.id && !x.eliminada)
        if (!p) throw new ErrorApp('NO_ENCONTRADO')
        if (p.bloque_id !== datos.bloque_id) { p.orden = siguienteOrden(datos.bloque_id); p.bloque_id = datos.bloque_id }
        p.estado = datos.estado
        const v = d.versiones.find((x) => x.id === p.version_id)!
        const cambio = v.texto !== contenido.texto || v.rubrica !== contenido.rubrica || v.izq !== contenido.izq || v.cen !== contenido.cen || v.der !== contenido.der
        if (cambio) {
          const respondida = d.evaluaciones.some((e) => e.respuestas.some((r) => r.version_id === v.id))
          if (respondida) {
            // Ya fue usada en una evaluación: se crea una versión nueva y la anterior queda intacta.
            const nueva: VersionD = { id: uid(), pregunta_id: p.id, numero: v.numero + 1, ...contenido }
            d.versiones.push(nueva)
            p.version_id = nueva.id
          } else {
            Object.assign(v, contenido)
          }
        }
      }
      persistir()
    },
    async eliminarPregunta(id) {
      await pausa()
      exigir('admin_general')
      const p = d.preguntas.find((x) => x.id === id)
      if (!p) return
      if (d.evaluaciones.some((e) => e.respuestas.some((r) => r.pregunta_id === id))) { p.eliminada = true; p.estado = 'inactivo' }
      else d.preguntas = d.preguntas.filter((x) => x.id !== id)
      persistir()
    },
    async reordenarPreguntas(bloqueId, ids) {
      exigir('admin_general')
      ids.forEach((id, i) => { const p = d.preguntas.find((x) => x.id === id); if (p) { p.bloque_id = bloqueId; p.orden = i + 1 } })
      persistir()
    },
    async obtenerConsentimiento() {
      await pausa()
      cuentaActiva()
      const k = d.consentimientos.find((x) => x.vigente)
      return k ? { id: k.id, version: k.version, texto: k.texto } : null
    },
    async publicarConsentimiento(texto) {
      await pausa()
      exigir('admin_general')
      if (texto.trim().length < 20) throw new ErrorApp('DATOS_INVALIDOS')
      d.consentimientos.forEach((k) => { k.vigente = false })
      d.consentimientos.push({ id: uid(), version: Math.max(0, ...d.consentimientos.map((k) => k.version)) + 1, texto: texto.trim(), vigente: true })
      persistir()
    },

    async panelEmpresa() {
      await pausa()
      const c = exigir('admin_empresa')
      const e = empresaDe(c.empresa_id)!
      const cols = d.colaboradores.filter((x) => x.empresa_id === e.id && !x.eliminado)
      const evs = cols.map((x) => ({ col: x, ev: evaluacionDe(x.id) }))
      return {
        empresa_nombre: e.nombre,
        total: cols.length,
        activos: cols.filter((x) => x.estado === 'activo').length,
        inactivos: cols.filter((x) => x.estado === 'inactivo').length,
        realizadas: evs.filter((x) => x.ev.estado === 'finalizada').length,
        pendientes: evs.filter((x) => x.ev.estado !== 'finalizada' && x.col.estado === 'activo').length,
        en_progreso: evs.filter((x) => x.ev.estado === 'en_progreso').length,
        informes_contratados: e.informes_contratados,
        informes_utilizados: utilizados(e.id),
        informes_disponibles: Math.max(e.informes_contratados - utilizados(e.id), 0),
        informes_descargables: d.evaluaciones.filter((x) => x.empresa_id === e.id && x.informe_estado === 'disponible').length,
      }
    },
    async listarColaboradores() {
      await pausa()
      const c = exigir('admin_empresa')
      return d.colaboradores
        .filter((x) => x.empresa_id === c.empresa_id && !x.eliminado)
        .map<Colaborador>((x) => {
          const ev = evaluacionDe(x.id)
          return {
            id: x.id, usuario: d.cuentas.find((k) => k.id === x.cuenta_id)!.usuario,
            primer_nombre: x.primer_nombre, segundo_nombre: x.segundo_nombre || null, primer_apellido: x.primer_apellido,
            segundo_apellido: x.segundo_apellido, cargo: x.cargo || null, correo: x.correo, estado: x.estado,
            estado_envio: x.estado_envio, envio_solicitado_en: x.envio_solicitado_en, envio_procesado_en: x.envio_procesado_en,
            created_at: x.created_at, evaluacion_estado: ev.estado, evaluacion_finalizada_en: ev.finalizada_en,
            informe_estado: ev.informe_estado, informe_ruta: ev.informe_ruta,
          }
        })
        .sort((a, b) => b.created_at.localeCompare(a.created_at))
    },
    async crearColaborador(datos) {
      await pausa()
      const c = exigir('admin_empresa')
      const usuario = crearCol(datos, c.empresa_id!)
      persistir()
      return { usuario }
    },
    async importarColaboradores(filas, alAvanzar) {
      const c = exigir('admin_empresa')
      const resultado = { creados: [] as { fila: number; usuario: string }[], errores: [] as { fila: number; error: string }[] }
      for (let i = 0; i < filas.length; i++) {
        try {
          resultado.creados.push({ fila: filas[i].fila, usuario: crearCol(filas[i], c.empresa_id!) })
        } catch (e) {
          resultado.errores.push({ fila: filas[i].fila, error: e instanceof ErrorApp ? e.codigo : 'ERROR_INTERNO' })
        }
        if (i % 10 === 9) { await pausa(); alAvanzar?.(i + 1) }
      }
      alAvanzar?.(filas.length)
      persistir()
      return resultado
    },
    async actualizarColaborador(id, datos) {
      await pausa()
      const c = exigir('admin_empresa')
      const col = d.colaboradores.find((x) => x.id === id && x.empresa_id === c.empresa_id && !x.eliminado)
      if (!col) throw new ErrorApp('NO_ENCONTRADO')
      Object.assign(col, validarColaborador(datos, c.empresa_id!, id))   // el usuario no cambia
      persistir()
    },
    async cambiarEstadoColaborador(id, estado) {
      await pausa()
      const c = exigir('admin_empresa')
      const col = d.colaboradores.find((x) => x.id === id && x.empresa_id === c.empresa_id && !x.eliminado)
      if (!col) throw new ErrorApp('NO_ENCONTRADO')
      col.estado = estado
      d.cuentas.find((k) => k.id === col.cuenta_id)!.estado = estado
      persistir()
    },
    async eliminarColaborador(id) {
      await pausa()
      const c = exigir('admin_empresa')
      const col = d.colaboradores.find((x) => x.id === id && x.empresa_id === c.empresa_id && !x.eliminado)
      if (!col) throw new ErrorApp('NO_ENCONTRADO')
      col.eliminado = true
      col.estado = 'inactivo'
      d.cuentas.find((k) => k.id === col.cuenta_id)!.estado = 'inactivo'
      persistir()
    },
    async solicitarEnvio(id) {
      await pausa()
      const c = exigir('admin_empresa')
      const col = d.colaboradores.find((x) => x.id === id && x.empresa_id === c.empresa_id)
      if (!col) throw new ErrorApp('NO_ENCONTRADO')
      const r = solicitar(col)
      persistir()
      return r
    },
    async solicitarEnvioTodos() {
      await pausa()
      const c = exigir('admin_empresa')
      let solicitados = 0
      d.colaboradores.filter((x) => x.empresa_id === c.empresa_id).forEach((col) => { if (solicitar(col) === 'ok') solicitados++ })
      persistir()
      return { solicitados, errores: 0 }
    },
    async exportarResultados() {
      await pausa()
      const c = exigir('admin_empresa')
      const finalizadas = d.evaluaciones.filter((e) => e.empresa_id === c.empresa_id && e.estado === 'finalizada')
        .filter((e) => !d.colaboradores.find((x) => x.id === e.colaborador_id)!.eliminado)
      const preguntas = new Map<string, Exportacion['preguntas'][number] & { o: number }>()
      const colaboradores = finalizadas.map((e) => {
        const col = d.colaboradores.find((x) => x.id === e.colaborador_id)!
        const respuestas: Exportacion['colaboradores'][number]['respuestas'] = {}
        e.respuestas.forEach((r) => {
          const p = d.preguntas.find((x) => x.id === r.pregunta_id)!
          const v = d.versiones.find((x) => x.id === r.version_id)!
          respuestas[String(p.codigo)] = { posicion: r.posicion!, puntaje: r.puntaje!, version: v.numero }
          preguntas.set(`${p.codigo}-${v.numero}`, { o: r.bloque_orden * 1000 + r.orden, codigo: p.codigo, version: v.numero, bloque: r.bloque, texto: v.texto, rubrica: v.rubrica, etiqueta_izquierda: v.izq, etiqueta_centro: v.cen, etiqueta_derecha: v.der })
        })
        return { usuario: d.cuentas.find((k) => k.id === col.cuenta_id)!.usuario, nombre: nombreCompleto(col), cargo: col.cargo || null, correo: col.correo, finalizada_en: e.finalizada_en!, respuestas }
      })
      return { preguntas: [...preguntas.values()].sort((a, b) => a.o - b.o || a.version - b.version).map(({ o: _o, ...p }) => p), colaboradores }
    },
    async urlInforme() {
      await pausa()
      exigir('admin_empresa')
      // En producción devuelve un enlace temporal al PDF guardado en Supabase Storage.
      const contenido = 'Informe de demostración.\n\nEn la versión real, aquí se descarga el informe en PDF generado por el proceso externo.'
      return URL.createObjectURL(new Blob([contenido], { type: 'text/plain' }))
    },

    async miEvaluacion() {
      await pausa()
      const col = miColaborador()
      const ev = evaluacionDe(col.id)
      const e = empresaDe(col.empresa_id)!
      const k = d.consentimientos.find((x) => x.vigente)
      return {
        estado: ev.estado, iniciada_en: ev.iniciada_en, finalizada_en: ev.finalizada_en, empresa_nombre: e.nombre,
        cupo_disponible: ev.estado !== 'pendiente' || reservados(e.id) < e.informes_contratados,
        consentimiento: k ? { id: k.id, version: k.version, texto: k.texto } : null,
        preguntas: ev.respuestas.map((r) => {
          const v = d.versiones.find((x) => x.id === r.version_id)!
          return { pregunta_id: r.pregunta_id, bloque: r.bloque, bloque_orden: r.bloque_orden, orden: r.orden, texto: v.texto, etiqueta_izquierda: v.izq, etiqueta_centro: v.cen, etiqueta_derecha: v.der, posicion: r.posicion }
        }),
      }
    },
    async iniciarEvaluacion(consentimientoId) {
      await pausa()
      const col = miColaborador()
      const ev = evaluacionDe(col.id)
      const e = empresaDe(col.empresa_id)!
      if (ev.estado !== 'pendiente') throw new ErrorApp('EVALUACION_YA_INICIADA')
      if (!d.consentimientos.some((k) => k.id === consentimientoId && k.vigente)) throw new ErrorApp('CONSENTIMIENTO_REQUERIDO')
      if (reservados(e.id) >= e.informes_contratados) throw new ErrorApp('SIN_CUPO')
      const respuestas = congelar(d)
      if (respuestas.length === 0) throw new ErrorApp('SIN_PREGUNTAS')
      ev.respuestas = respuestas
      ev.estado = 'en_progreso'
      ev.iniciada_en = ahora()
      persistir()
    },
    async guardarRespuesta(preguntaId, posicion) {
      const col = miColaborador()
      const ev = evaluacionDe(col.id)
      if (ev.estado !== 'en_progreso') throw new ErrorApp('EVALUACION_NO_DISPONIBLE')
      const r = ev.respuestas.find((x) => x.pregunta_id === preguntaId)
      if (!r || ![1, 2, 3].includes(posicion)) throw new ErrorApp('DATOS_INVALIDOS')
      responder(d, r, posicion)
      persistir()
    },
    async finalizarEvaluacion() {
      await pausa()
      const col = miColaborador()
      const ev = evaluacionDe(col.id)
      if (ev.estado !== 'en_progreso') throw new ErrorApp('EVALUACION_NO_DISPONIBLE')
      if (ev.respuestas.some((r) => r.posicion === null)) throw new ErrorApp('RESPUESTAS_INCOMPLETAS')
      ev.estado = 'finalizada'
      ev.finalizada_en = ahora()
      persistir()
    },
  }
  return api
}
