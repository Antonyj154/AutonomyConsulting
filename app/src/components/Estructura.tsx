import { LogOut, UserRound } from 'lucide-react'
import { NavLink, Navigate, Outlet, useNavigate } from 'react-router-dom'
import { Boton, Cargando } from '@/components/ui'
import { api } from '@/lib/api'
import { INICIO, useSesion } from '@/lib/sesion'
import type { Rol } from '@/lib/tipos'
import { cn } from '@/lib/utilidades'

const MENUS: Record<Rol, { a: string; texto: string; exacto?: boolean }[]> = {
  admin_general: [
    { a: '/admin', texto: 'Empresas', exacto: true },
    { a: '/admin/cuestionario', texto: 'Cuestionario' },
    { a: '/admin/consentimiento', texto: 'Consentimiento' },
  ],
  admin_empresa: [
    { a: '/empresa', texto: 'Resumen', exacto: true },
    { a: '/empresa/colaboradores', texto: 'Colaboradores' },
  ],
  colaborador: [],
}

const ROLES: Record<Rol, string> = {
  admin_general: 'Administrador general',
  admin_empresa: 'Administrador de empresa',
  colaborador: 'Colaborador',
}

export function Marca({ className }: { className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-2 text-[17px] font-medium tracking-tight text-tinta', className)}>
      <svg viewBox="0 0 32 32" className="h-7 w-7" aria-hidden>
        <rect width="32" height="32" rx="9" fill="#0f172a" />
        <circle cx="16" cy="16" r="6.5" fill="none" stroke="#2dd4bf" strokeWidth="3" />
        <circle cx="16" cy="16" r="1.8" fill="#fff" />
      </svg>
      autonomy
    </span>
  )
}

export function AvisoDemo() {
  if (api.modo !== 'demo') return null
  return (
    <div className="bg-tinta px-4 py-1.5 text-center font-mono text-[11px] tracking-[0.12em] text-white/80 uppercase">
      Modo demostración · datos ficticios guardados solo en este navegador
    </div>
  )
}

/** Protege las rutas: exige sesión y que el rol (validado en el servidor) tenga acceso. */
export function Protegida({ roles }: { roles: Rol[] }) {
  const { sesion, cargando } = useSesion()
  if (cargando) return <Cargando />
  if (!sesion) return <Navigate to="/ingresar" replace />
  if (!roles.includes(sesion.rol)) return <Navigate to={INICIO[sesion.rol]} replace />
  return <Outlet />
}

export function Estructura() {
  const { sesion, salir } = useSesion()
  const navegar = useNavigate()
  if (!sesion) return null
  const menu = MENUS[sesion.rol]
  const nombre = [sesion.nombres, sesion.apellidos].filter(Boolean).join(' ') || sesion.usuario

  async function cerrar() {
    await salir()
    navegar('/ingresar', { replace: true })
  }

  const enlace = ({ isActive }: { isActive: boolean }) =>
    cn('rounded-full px-3.5 py-1.5 text-sm whitespace-nowrap transition-colors', isActive ? 'bg-tinta text-white' : 'text-suave hover:bg-slate-100 hover:text-tinta')

  return (
    <div className="min-h-dvh">
      <AvisoDemo />
      <header className="sticky top-0 z-30 border-b border-borde bg-fondo/85 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-4 px-4 sm:px-6">
          <NavLink to={INICIO[sesion.rol]} aria-label="Inicio"><Marca /></NavLink>
          {menu.length > 0 && (
            <nav className="ml-4 hidden items-center gap-1 md:flex" aria-label="Principal">
              {menu.map((m) => <NavLink key={m.a} to={m.a} end={m.exacto} className={enlace}>{m.texto}</NavLink>)}
            </nav>
          )}
          <div className="ml-auto flex items-center gap-1">
            <div className="mr-2 hidden text-right leading-tight sm:block">
              <p className="max-w-52 truncate text-sm font-medium text-tinta">{nombre}</p>
              <p className="text-xs text-suave">{sesion.rol === 'colaborador' ? sesion.empresa_nombre : ROLES[sesion.rol]}</p>
            </div>
            <NavLink to="/perfil" className={({ isActive }) => cn('inline-flex h-9 w-9 items-center justify-center rounded-full transition-colors', isActive ? 'bg-tinta text-white' : 'text-suave hover:bg-slate-100 hover:text-tinta')} aria-label="Mi perfil" title="Mi perfil">
              <UserRound className="h-[18px] w-[18px]" />
            </NavLink>
            <Boton variante="fantasma" tamano="sm" onClick={cerrar} aria-label="Cerrar sesión">
              <LogOut className="h-4 w-4" />
              <span className="hidden sm:inline">Salir</span>
            </Boton>
          </div>
        </div>
        {menu.length > 0 && (
          <nav className="flex gap-1 overflow-x-auto border-t border-borde px-4 py-2 md:hidden" aria-label="Principal">
            {menu.map((m) => <NavLink key={m.a} to={m.a} end={m.exacto} className={enlace}>{m.texto}</NavLink>)}
          </nav>
        )}
      </header>
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-12">
        <div className="aparecer">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
