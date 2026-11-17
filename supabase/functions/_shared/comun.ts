// Utilidades compartidas por las funciones seguras (Edge Functions).
// La llave service_role solo existe aquí, en el servidor. Nunca llega al navegador.
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2'

const origenes = (Deno.env.get('ORIGENES_PERMITIDOS') ?? '')
  .split(',').map((s) => s.trim()).filter(Boolean)

export function cors(req: Request): Record<string, string> {
  const origen = req.headers.get('origin') ?? ''
  const permitido = origenes.length === 0 ? '*' : origenes.includes(origen) ? origen : origenes[0]
  return {
    'Access-Control-Allow-Origin': permitido,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
  }
}

export function responder(req: Request, cuerpo: unknown, status = 200): Response {
  return new Response(JSON.stringify(cuerpo), {
    status,
    headers: { ...cors(req), 'Content-Type': 'application/json' },
  })
}

// Supabase inyecta SUPABASE_URL, SUPABASE_ANON_KEY y SUPABASE_SERVICE_ROLE_KEY automáticamente.
// Si el proyecto usa el formato nuevo de llaves y esas variables no existen, se pueden definir
// los secretos CLAVE_PUBLICA y CLAVE_SERVICIO (ver INSTRUCCIONES_GROKBOT.md).
const URL_PROYECTO = Deno.env.get('SUPABASE_URL')!
const LLAVE_SERVICIO = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('CLAVE_SERVICIO')!
const LLAVE_PUBLICA = Deno.env.get('SUPABASE_ANON_KEY') ?? Deno.env.get('CLAVE_PUBLICA')!

export function servicio(): SupabaseClient {
  return createClient(URL_PROYECTO, LLAVE_SERVICIO, { auth: { persistSession: false, autoRefreshToken: false } })
}

export function publico(): SupabaseClient {
  return createClient(URL_PROYECTO, LLAVE_PUBLICA, { auth: { persistSession: false, autoRefreshToken: false } })
}

// Identifica a quien llama a partir de su token de sesión (validado por Supabase Auth).
export async function identificar(req: Request, admin: SupabaseClient): Promise<string | null> {
  const token = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '')
  if (!token) return null
  const { data, error } = await admin.auth.getUser(token)
  if (error || !data.user) return null
  return data.user.id
}

// Comprueba en la base (no en el navegador) que quien llama tiene el rol requerido y está activo.
export async function tieneRol(
  admin: SupabaseClient, actorId: string, rol: 'admin_general' | 'admin_empresa',
): Promise<boolean> {
  const { data } = await admin.from('perfiles').select('rol, estado, empresas(estado)').eq('id', actorId).maybeSingle()
  if (!data || data.rol !== rol || data.estado !== 'activo') return false
  if (rol === 'admin_empresa') {
    const empresa = data.empresas as { estado?: string } | { estado?: string }[] | null
    const estado = Array.isArray(empresa) ? empresa[0]?.estado : empresa?.estado
    return estado === 'activo'
  }
  return true
}

// Extrae el código de error de negocio (p. ej. CORREO_DUPLICADO) sin exponer detalles internos.
export function codigoError(e: unknown): string {
  const mensaje = typeof e === 'object' && e !== null && 'message' in e ? String((e as { message: unknown }).message) : ''
  const m = mensaje.match(/\b[A-Z][A-Z_]{4,}\b/)
  return m ? m[0] : 'ERROR_INTERNO'
}

export async function leerJson(req: Request): Promise<Record<string, unknown> | null> {
  try {
    const cuerpo = await req.json()
    return cuerpo && typeof cuerpo === 'object' ? (cuerpo as Record<string, unknown>) : null
  } catch {
    return null
  }
}

export const texto = (v: unknown, max = 200): string => (typeof v === 'string' ? v.trim().slice(0, max) : '')
export const esCorreo = (v: string): boolean => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v) && v.length <= 200

// Correo interno que exige Supabase Auth. No es el correo real del usuario y no se puede adivinar:
// así nadie puede saltarse la función de inicio de sesión (y su bloqueo por intentos).
export const correoInterno = (): string => `${crypto.randomUUID()}@acceso.invalid`

// 32 bytes → 64 caracteres hex (Supabase Auth rechaza contraseñas de más de 72 caracteres).
export function claveAleatoria(largo = 32): string {
  const bytes = crypto.getRandomValues(new Uint8Array(largo))
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}
