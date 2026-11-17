import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { api } from '@/lib/api'
import type { Rol, Sesion } from '@/lib/tipos'

interface ContextoSesion {
  sesion: Sesion | null
  cargando: boolean
  ingresar: (usuario: string, clave: string) => Promise<Sesion>
  salir: () => Promise<void>
  refrescar: () => Promise<void>
}

const Contexto = createContext<ContextoSesion | null>(null)

/** Portal de inicio de cada rol. El rol llega validado desde el servidor. */
export const INICIO: Record<Rol, string> = {
  admin_general: '/admin',
  admin_empresa: '/empresa',
  colaborador: '/mi',
}

export function ProveedorSesion({ children }: { children: ReactNode }) {
  const [sesion, setSesion] = useState<Sesion | null>(null)
  const [cargando, setCargando] = useState(true)

  const refrescar = useCallback(async () => {
    try {
      setSesion(await api.sesionActual())
    } catch {
      setSesion(null)
    }
  }, [])

  useEffect(() => {
    void refrescar().finally(() => setCargando(false))
  }, [refrescar])

  const valor = useMemo<ContextoSesion>(
    () => ({
      sesion,
      cargando,
      refrescar,
      async ingresar(usuario, clave) {
        const s = await api.iniciarSesion(usuario, clave)
        setSesion(s)
        return s
      },
      async salir() {
        await api.cerrarSesion()
        setSesion(null)
      },
    }),
    [sesion, cargando, refrescar],
  )

  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>
}

export function useSesion(): ContextoSesion {
  const c = useContext(Contexto)
  if (!c) throw new Error('useSesion debe usarse dentro de ProveedorSesion')
  return c
}
