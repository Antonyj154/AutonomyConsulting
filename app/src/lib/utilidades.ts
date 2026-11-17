import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...clases: ClassValue[]): string {
  return twMerge(clsx(clases))
}

/** Error de negocio con un código que se traduce a un mensaje comprensible. */
export class ErrorApp extends Error {
  codigo: string
  constructor(codigo: string) {
    super(codigo)
    this.codigo = codigo
  }
}

const MENSAJES: Record<string, string> = {
  CREDENCIALES_INVALIDAS: 'Usuario o clave incorrectos.',
  USUARIO_BLOQUEADO: 'Demasiados intentos fallidos. Espera 15 minutos e inténtalo de nuevo.',
  NO_AUTORIZADO: 'No tienes permiso para realizar esta acción.',
  NO_ENCONTRADO: 'No se encontró el registro.',
  DATOS_INVALIDOS: 'Revisa los datos ingresados.',
  USUARIO_INVALIDO: 'El usuario debe tener entre 4 y 30 caracteres, solo letras minúsculas y números.',
  USUARIO_DUPLICADO: 'Ese usuario ya existe. Elige otro.',
  EMPRESA_DUPLICADA: 'Ya existe una empresa con ese nombre.',
  CORREO_DUPLICADO: 'Ya existe un colaborador con ese correo en tu empresa.',
  CONTRASENA_DEBIL: 'La contraseña debe tener al menos 10 caracteres.',
  CONTRASENA_INCORRECTA: 'La contraseña actual no es correcta.',
  PLAN_MENOR_A_UTILIZADOS: 'El plan no puede ser menor que los informes ya utilizados.',
  BLOQUE_CON_PREGUNTAS: 'Este bloque tiene preguntas. Muévelas o elimínalas antes de borrar el bloque.',
  BLOQUE_NO_ENCONTRADO: 'El bloque seleccionado ya no existe.',
  SIN_CUPO: 'Tu empresa no tiene evaluaciones disponibles. Contacta a tu administrador.',
  SIN_PREGUNTAS: 'La evaluación aún no tiene preguntas configuradas. Contacta a tu administrador.',
  CONSENTIMIENTO_REQUERIDO: 'Debes aceptar el consentimiento para continuar.',
  EVALUACION_YA_INICIADA: 'La evaluación ya fue iniciada.',
  EVALUACION_NO_DISPONIBLE: 'La evaluación ya no está disponible para cambios.',
  RESPUESTAS_INCOMPLETAS: 'Aún hay preguntas sin responder.',
  LOTE_INVALIDO: 'El archivo no contiene filas válidas.',
  SIN_CONEXION: 'No se pudo conectar. Revisa tu conexión a internet e inténtalo de nuevo.',
}

export function mensajeError(e: unknown): string {
  const codigo = e instanceof ErrorApp ? e.codigo : ''
  return MENSAJES[codigo] ?? 'Ocurrió un error inesperado. Inténtalo de nuevo.'
}

export function nombreCompleto(c: {
  primer_nombre: string
  segundo_nombre?: string | null
  primer_apellido: string
  segundo_apellido: string
}): string {
  return [c.primer_nombre, c.segundo_nombre, c.primer_apellido, c.segundo_apellido].filter(Boolean).join(' ')
}

const fmtFecha = new Intl.DateTimeFormat('es', { day: '2-digit', month: 'short', year: 'numeric' })
const fmtFechaHora = new Intl.DateTimeFormat('es', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
})

export const fecha = (iso: string | null | undefined): string => (iso ? fmtFecha.format(new Date(iso)) : '—')
export const fechaHora = (iso: string | null | undefined): string => (iso ? fmtFechaHora.format(new Date(iso)) : '—')

export const esCorreo = (v: string): boolean => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v.trim())

/** Quita tildes, ñ, espacios y símbolos. Misma regla que la base de datos. */
export function normalizar(t: string | null | undefined): string {
  return (t ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z]/g, '')
}

/** Vista previa del usuario: primer nombre + inicial del primer apellido + total de letras. */
export function usuarioBase(d: {
  primer_nombre: string
  segundo_nombre?: string | null
  primer_apellido: string
  segundo_apellido: string
}): string {
  const pn = normalizar(d.primer_nombre)
  const pa = normalizar(d.primer_apellido)
  if (!pn || !pa) return ''
  const total = pn.length + normalizar(d.segundo_nombre).length + pa.length + normalizar(d.segundo_apellido).length
  return `${pn}${pa[0]}${total}`
}

/** Reemplaza {{empresa}} por el nombre de la empresa del colaborador. */
export const textoConsentimiento = (texto: string, empresa: string): string => texto.replaceAll('{{empresa}}', empresa)

export const codigoPregunta =(n: number): string => `P-${String(n).padStart(3, '0')}`
