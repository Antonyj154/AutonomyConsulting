import { useState, type FormEvent } from 'react'
import { toast } from 'sonner'
import { Aviso, Boton, Cargando, Encabezado, Entrada, Tarjeta } from '@/components/ui'
import { api } from '@/lib/api'
import { useSesion } from '@/lib/sesion'
import { useCarga } from '@/lib/useCarga'
import { mensajeError } from '@/lib/utilidades'

function Dato({ etiqueta, valor }: { etiqueta: string; valor: string | null }) {
  return (
    <div className="space-y-1">
      <dt className="font-mono text-[11px] tracking-[0.12em] text-suave uppercase">{etiqueta}</dt>
      <dd className="text-[15px] text-tinta">{valor || '—'}</dd>
    </div>
  )
}

function FichaColaborador() {
  const { datos, cargando, error } = useCarga(() => api.miFicha())
  if (cargando) return <Cargando />
  if (error || !datos) return <Aviso tono="rojo">{error}</Aviso>
  return (
    <div className="space-y-4">
      <Tarjeta className="p-6">
        <dl className="grid gap-6 sm:grid-cols-2">
          <Dato etiqueta="Usuario" valor={datos.usuario} />
          <Dato etiqueta="Empresa" valor={datos.empresa} />
          <Dato etiqueta="Nombres" valor={[datos.primer_nombre, datos.segundo_nombre].filter(Boolean).join(' ')} />
          <Dato etiqueta="Apellidos" valor={`${datos.primer_apellido} ${datos.segundo_apellido}`} />
          <Dato etiqueta="Cargo" valor={datos.cargo} />
          <Dato etiqueta="Correo electrónico" valor={datos.correo} />
        </dl>
      </Tarjeta>
      <Aviso>Si algún dato es incorrecto o necesitas una nueva clave de acceso, contacta al administrador de tu empresa.</Aviso>
    </div>
  )
}

function PerfilAdministrador() {
  const { sesion, refrescar } = useSesion()
  const [nombres, setNombres] = useState(sesion?.nombres ?? '')
  const [apellidos, setApellidos] = useState(sesion?.apellidos ?? '')
  const [guardando, setGuardando] = useState(false)
  const [actual, setActual] = useState('')
  const [nueva, setNueva] = useState('')
  const [repetir, setRepetir] = useState('')
  const [cambiando, setCambiando] = useState(false)
  const [errorClave, setErrorClave] = useState<string | null>(null)

  async function guardarDatos(e: FormEvent) {
    e.preventDefault()
    setGuardando(true)
    try {
      await api.actualizarMiPerfil(nombres, apellidos)
      await refrescar()
      toast.success('Datos actualizados')
    } catch (err) {
      toast.error(mensajeError(err))
    } finally {
      setGuardando(false)
    }
  }

  async function cambiarClave(e: FormEvent) {
    e.preventDefault()
    if (nueva.length < 10) return setErrorClave('La nueva contraseña debe tener al menos 10 caracteres.')
    if (nueva !== repetir) return setErrorClave('Las contraseñas nuevas no coinciden.')
    setErrorClave(null)
    setCambiando(true)
    try {
      await api.cambiarContrasena(actual, nueva)
      setActual(''); setNueva(''); setRepetir('')
      toast.success('Contraseña actualizada')
    } catch (err) {
      setErrorClave(mensajeError(err))
    } finally {
      setCambiando(false)
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Tarjeta className="p-6">
        <h2 className="text-lg font-medium text-tinta">Datos personales</h2>
        <form onSubmit={guardarDatos} className="mt-5 space-y-4">
          <Entrada etiqueta="Usuario" value={sesion?.usuario ?? ''} disabled ayuda="El usuario no se puede modificar." />
          <Entrada etiqueta="Nombres" value={nombres} onChange={(e) => setNombres(e.target.value)} maxLength={120} />
          <Entrada etiqueta="Apellidos" value={apellidos} onChange={(e) => setApellidos(e.target.value)} maxLength={120} opcional />
          <Boton type="submit" cargando={guardando}>Guardar cambios</Boton>
        </form>
      </Tarjeta>
      <Tarjeta className="p-6">
        <h2 className="text-lg font-medium text-tinta">Cambiar contraseña</h2>
        <form onSubmit={cambiarClave} className="mt-5 space-y-4">
          <Entrada etiqueta="Contraseña actual" type="password" value={actual} onChange={(e) => setActual(e.target.value)} autoComplete="current-password" required />
          <Entrada etiqueta="Nueva contraseña" type="password" value={nueva} onChange={(e) => setNueva(e.target.value)} autoComplete="new-password" ayuda="Mínimo 10 caracteres." required />
          <Entrada etiqueta="Repetir nueva contraseña" type="password" value={repetir} onChange={(e) => setRepetir(e.target.value)} autoComplete="new-password" required />
          {errorClave && <Aviso tono="rojo">{errorClave}</Aviso>}
          <Boton type="submit" cargando={cambiando}>Actualizar contraseña</Boton>
        </form>
      </Tarjeta>
    </div>
  )
}

export default function Perfil() {
  const { sesion } = useSesion()
  if (!sesion) return null
  return (
    <div className="space-y-8">
      <Encabezado rotulo="Cuenta" titulo="Mi perfil" />
      {sesion.rol === 'colaborador' ? <FichaColaborador /> : <PerfilAdministrador />}
    </div>
  )
}
