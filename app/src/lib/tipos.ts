export type Rol = 'admin_general' | 'admin_empresa' | 'colaborador'
export type Estado = 'activo' | 'inactivo'
export type EstadoEnvio = 'pendiente' | 'solicitado' | 'enviado' | 'error'
export type EstadoEvaluacion = 'pendiente' | 'en_progreso' | 'finalizada'
export type EstadoInforme = 'no_generado' | 'en_proceso' | 'disponible'
export type Rubrica = 'positivo' | 'negativo'
export type Posicion = 1 | 2 | 3

export interface Sesion {
  id: string
  usuario: string
  rol: Rol
  empresa_id: string | null
  empresa_nombre: string | null
  nombres: string
  apellidos: string
}

export interface EmpresaResumen {
  id: string
  nombre: string
  correo: string
  usuario: string
  estado: Estado
  created_at: string
  informes_contratados: number
  total_colaboradores: number
  informes_utilizados: number
  informes_disponibles: number
}

export interface DatosEmpresaNueva {
  nombre: string
  correo: string
  usuario: string
  contrasena: string
  informes_contratados: number
}

export interface DatosEmpresa {
  nombre: string
  correo: string
  estado: Estado
  informes_contratados: number
}

export interface Pregunta {
  id: string
  codigo: number
  bloque_id: string
  orden: number
  estado: Estado
  texto: string
  rubrica: Rubrica
  version: number
  etiqueta_izquierda: string
  etiqueta_centro: string
  etiqueta_derecha: string
}

export interface Bloque {
  id: string
  nombre: string
  orden: number
  estado: Estado
  preguntas: Pregunta[]
}

export interface DatosPregunta {
  id?: string
  bloque_id: string
  texto: string
  rubrica: Rubrica
  etiqueta_izquierda: string
  etiqueta_centro: string
  etiqueta_derecha: string
  estado: Estado
}

export interface Consentimiento {
  id: string
  version: number
  texto: string
}

export interface DatosColaborador {
  primer_nombre: string
  segundo_nombre: string
  primer_apellido: string
  segundo_apellido: string
  cargo: string
  correo: string
}

export interface Colaborador {
  id: string
  usuario: string
  primer_nombre: string
  segundo_nombre: string | null
  primer_apellido: string
  segundo_apellido: string
  cargo: string | null
  correo: string
  estado: Estado
  estado_envio: EstadoEnvio
  envio_solicitado_en: string | null
  envio_procesado_en: string | null
  created_at: string
  evaluacion_estado: EstadoEvaluacion
  evaluacion_finalizada_en: string | null
  informe_estado: EstadoInforme
  informe_ruta: string | null
}

export interface PanelEmpresa {
  empresa_nombre: string
  total: number
  activos: number
  inactivos: number
  realizadas: number
  pendientes: number
  en_progreso: number
  informes_contratados: number
  informes_utilizados: number
  informes_disponibles: number
  informes_descargables: number
}

export interface ResultadoImportacion {
  creados: { fila: number; usuario: string }[]
  errores: { fila: number; error: string }[]
}

export interface PreguntaEvaluacion {
  pregunta_id: string
  bloque: string
  bloque_orden: number
  orden: number
  texto: string
  etiqueta_izquierda: string
  etiqueta_centro: string
  etiqueta_derecha: string
  posicion: Posicion | null
}

export interface MiEvaluacion {
  estado: EstadoEvaluacion
  iniciada_en: string | null
  finalizada_en: string | null
  empresa_nombre: string
  cupo_disponible: boolean
  consentimiento: Consentimiento | null
  preguntas: PreguntaEvaluacion[]
}

export interface Ficha {
  usuario: string
  primer_nombre: string
  segundo_nombre: string | null
  primer_apellido: string
  segundo_apellido: string
  cargo: string | null
  correo: string
  empresa: string
}

export interface Exportacion {
  preguntas: {
    codigo: number
    version: number
    bloque: string
    texto: string
    rubrica: Rubrica
    etiqueta_izquierda: string
    etiqueta_centro: string
    etiqueta_derecha: string
  }[]
  colaboradores: {
    usuario: string
    nombre: string
    cargo: string | null
    correo: string
    finalizada_en: string
    respuestas: Record<string, { posicion: number; puntaje: number; version: number }>
  }[]
}

export interface FilaImportacion extends DatosColaborador {
  fila: number
}

/** Contrato único de datos. Lo implementan el modo demostración y la conexión real a Supabase. */
export interface Api {
  modo: 'demo' | 'supabase'

  // Acceso y perfil
  iniciarSesion(usuario: string, clave: string): Promise<Sesion>
  cerrarSesion(): Promise<void>
  sesionActual(): Promise<Sesion | null>
  cambiarContrasena(actual: string, nueva: string): Promise<void>
  actualizarMiPerfil(nombres: string, apellidos: string): Promise<void>
  miFicha(): Promise<Ficha>

  // Administrador general
  listarEmpresas(): Promise<EmpresaResumen[]>
  crearEmpresa(datos: DatosEmpresaNueva): Promise<void>
  actualizarEmpresa(id: string, datos: DatosEmpresa): Promise<void>
  restablecerContrasenaEmpresa(id: string, nueva: string): Promise<void>
  obtenerCuestionario(): Promise<Bloque[]>
  guardarBloque(id: string | null, nombre: string, estado: Estado): Promise<void>
  eliminarBloque(id: string): Promise<void>
  reordenarBloques(ids: string[]): Promise<void>
  guardarPregunta(datos: DatosPregunta): Promise<void>
  eliminarPregunta(id: string): Promise<void>
  reordenarPreguntas(bloqueId: string, ids: string[]): Promise<void>
  obtenerConsentimiento(): Promise<Consentimiento | null>
  publicarConsentimiento(texto: string): Promise<void>

  // Empresa
  panelEmpresa(): Promise<PanelEmpresa>
  listarColaboradores(): Promise<Colaborador[]>
  crearColaborador(datos: DatosColaborador): Promise<{ usuario: string }>
  importarColaboradores(filas: FilaImportacion[], alAvanzar?: (hechas: number) => void): Promise<ResultadoImportacion>
  actualizarColaborador(id: string, datos: DatosColaborador): Promise<void>
  cambiarEstadoColaborador(id: string, estado: Estado): Promise<void>
  eliminarColaborador(id: string): Promise<void>
  solicitarEnvio(id: string): Promise<'ok' | 'no_elegible' | 'ya_solicitado'>
  solicitarEnvioTodos(): Promise<{ solicitados: number; errores: number }>
  exportarResultados(): Promise<Exportacion>
  urlInforme(ruta: string): Promise<string>

  // Colaborador
  miEvaluacion(): Promise<MiEvaluacion>
  iniciarEvaluacion(consentimientoId: string): Promise<void>
  guardarRespuesta(preguntaId: string, posicion: Posicion): Promise<void>
  finalizarEvaluacion(): Promise<void>
}
