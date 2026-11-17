import { ArrowRight, Eye, EyeOff } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { AvisoDemo, Marca } from '@/components/Estructura'
import { Aviso, Boton, Cargando, Entrada, Rotulo, Tarjeta } from '@/components/ui'
import { api } from '@/lib/api'
import { ACCESOS_DEMO } from '@/lib/api/demo'
import { INICIO, useSesion } from '@/lib/sesion'
import { mensajeError } from '@/lib/utilidades'

export default function Ingreso() {
  const { sesion, cargando, ingresar } = useSesion()
  const navegar = useNavigate()
  const [usuario, setUsuario] = useState('')
  const [clave, setClave] = useState('')
  const [verClave, setVerClave] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (cargando) return <Cargando />
  if (sesion) return <Navigate to={INICIO[sesion.rol]} replace />

  async function enviar(e: FormEvent) {
    e.preventDefault()
    if (!usuario.trim() || !clave) {
      setError('Ingresa tu usuario y tu clave.')
      return
    }
    setEnviando(true)
    setError(null)
    try {
      const s = await ingresar(usuario, clave)
      navegar(INICIO[s.rol], { replace: true })
    } catch (err) {
      setError(mensajeError(err))
      setClave('')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <AvisoDemo />
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 py-10">
        <div className="aparecer space-y-8">
          <div className="space-y-5">
            <Marca />
            <div className="space-y-3">
              <Rotulo>Plataforma de evaluaciones</Rotulo>
              <h1 className="text-4xl leading-[1.05] font-medium tracking-tight text-tinta sm:text-5xl">
                Ingresa a tu <span className="text-marca-600">evaluación.</span>
              </h1>
              <p className="text-[15px] text-suave">Usa el usuario y la clave de acceso que recibiste por correo.</p>
            </div>
          </div>

          <Tarjeta className="p-6">
            <form onSubmit={enviar} className="space-y-4" noValidate>
              <Entrada etiqueta="Usuario" value={usuario} onChange={(e) => setUsuario(e.target.value)} autoComplete="username"
                autoCapitalize="none" autoCorrect="off" spellCheck={false} placeholder="Ej.: juanp20" autoFocus />
              <div className="relative">
                <Entrada etiqueta="Clave de acceso" type={verClave ? 'text' : 'password'} value={clave}
                  onChange={(e) => setClave(e.target.value)} autoComplete="current-password" autoCapitalize="none"
                  autoCorrect="off" spellCheck={false} className="pr-11" />
                <button type="button" onClick={() => setVerClave((v) => !v)} aria-label={verClave ? 'Ocultar clave' : 'Mostrar clave'}
                  className="absolute right-2 bottom-1.5 inline-flex h-8 w-8 items-center justify-center rounded-full text-suave hover:bg-slate-100">
                  {verClave ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {error && <Aviso tono="rojo">{error}</Aviso>}
              <Boton type="submit" variante="marca" tamano="lg" className="w-full" cargando={enviando}>
                Ingresar <ArrowRight className="h-4 w-4" />
              </Boton>
            </form>
          </Tarjeta>

          <p className="text-center text-[13px] text-suave">
            ¿No tienes tu clave? Solicítala al administrador de tu empresa.
          </p>

          {api.modo === 'demo' && (
            <Tarjeta className="border-dashed p-5">
              <p className="font-mono text-[11px] tracking-[0.12em] text-suave uppercase">Accesos de demostración</p>
              <div className="mt-3 space-y-2">
                {ACCESOS_DEMO.map((a) => (
                  <button key={a.usuario} type="button" onClick={() => { setUsuario(a.usuario); setClave(a.clave); setError(null) }}
                    className="flex w-full items-center justify-between rounded-xl border border-borde px-3.5 py-2.5 text-left text-sm transition-colors hover:border-marca-500 hover:bg-marca-50">
                    <span className="font-medium text-tinta">{a.rol}</span>
                    <span className="font-mono text-xs text-suave">{a.usuario}</span>
                  </button>
                ))}
              </div>
              <p className="mt-3 text-xs text-suave">Toca un acceso para rellenar el formulario. Estos datos son ficticios.</p>
            </Tarjeta>
          )}
        </div>
      </div>
    </div>
  )
}
