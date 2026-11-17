import { lazy, Suspense } from 'react'
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import { Toaster } from 'sonner'
import { Estructura, Protegida } from '@/components/Estructura'
import { Cargando } from '@/components/ui'
import { INICIO, ProveedorSesion, useSesion } from '@/lib/sesion'
import Ingreso from '@/pages/Ingreso'

const Empresas = lazy(() => import('@/pages/admin/Empresas'))
const Cuestionario = lazy(() => import('@/pages/admin/Cuestionario'))
const Consentimiento = lazy(() => import('@/pages/admin/Consentimiento'))
const Resumen = lazy(() => import('@/pages/empresa/Resumen'))
const Colaboradores = lazy(() => import('@/pages/empresa/Colaboradores'))
const Inicio = lazy(() => import('@/pages/colaborador/Inicio'))
const Evaluacion = lazy(() => import('@/pages/colaborador/Evaluacion'))
const Perfil = lazy(() => import('@/pages/Perfil'))

function Raiz() {
  const { sesion, cargando } = useSesion()
  if (cargando) return <Cargando />
  return <Navigate to={sesion ? INICIO[sesion.rol] : '/ingresar'} replace />
}

export default function App() {
  return (
    <ProveedorSesion>
      <HashRouter>
        <Suspense fallback={<Cargando />}>
          <Routes>
            <Route path="/ingresar" element={<Ingreso />} />
            <Route element={<Protegida roles={['admin_general']} />}>
              <Route element={<Estructura />}>
                <Route path="/admin" element={<Empresas />} />
                <Route path="/admin/cuestionario" element={<Cuestionario />} />
                <Route path="/admin/consentimiento" element={<Consentimiento />} />
              </Route>
            </Route>
            <Route element={<Protegida roles={['admin_empresa']} />}>
              <Route element={<Estructura />}>
                <Route path="/empresa" element={<Resumen />} />
                <Route path="/empresa/colaboradores" element={<Colaboradores />} />
              </Route>
            </Route>
            <Route element={<Protegida roles={['colaborador']} />}>
              <Route element={<Estructura />}>
                <Route path="/mi" element={<Inicio />} />
                <Route path="/mi/evaluacion" element={<Evaluacion />} />
              </Route>
            </Route>
            <Route element={<Protegida roles={['admin_general', 'admin_empresa', 'colaborador']} />}>
              <Route element={<Estructura />}>
                <Route path="/perfil" element={<Perfil />} />
              </Route>
            </Route>
            <Route path="*" element={<Raiz />} />
          </Routes>
        </Suspense>
      </HashRouter>
      <Toaster position="top-center" richColors closeButton toastOptions={{ style: { fontFamily: 'var(--font-sans)' } }} />
    </ProveedorSesion>
  )
}
