// Elige la fuente de datos:
// - Si existen las variables VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY → conexión real a Supabase.
// - Si no existen → modo demostración (datos ficticios dentro del navegador).
import type { Api } from '@/lib/tipos'
import { crearApiDemo } from './demo'
import { crearApiSupabase } from './supabase'

const url = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim()
const llave = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim()

export const api: Api = url && llave ? crearApiSupabase(url.replace(/\/+$/, ''), llave) : crearApiDemo()
