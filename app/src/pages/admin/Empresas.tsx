import { KeyRound, Pencil, Plus, Power, Search } from 'lucide-react'
import { useMemo, useState, type FormEvent } from 'react'
import { toast } from 'sonner'
import { Confirmacion, Modal } from '@/components/Dialogo'
import { Aviso, Boton, Cargando, Encabezado, Entrada, Filtro, Indicador, Insignia, Selector, Tarjeta, Vacio } from '@/components/ui'
import { api } from '@/lib/api'
import type { EmpresaResumen, Estado } from '@/lib/tipos'
import { useCarga } from '@/lib/useCarga'
import { esCorreo, fecha, mensajeError } from '@/lib/utilidades'

function FormularioNueva({ alTerminar }: { alTerminar: () => void }) {
  const [f, setF] = useState({ nombre: '', correo: '', usuario: '', contrasena: '', informes: '0' })
  const [errores, setErrores] = useState<Record<string, string>>({})
  const [general, setGeneral] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)
  const cambiar = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }))

  async function enviar(e: FormEvent) {
    e.preventDefault()
    const er: Record<string, string> = {}
    if (f.nombre.trim().length < 2) er.nombre = 'Ingresa el nombre de la empresa.'
    if (!esCorreo(f.correo)) er.correo = 'Ingresa un correo válido.'
    if (!/^[a-z0-9]{4,30}$/.test(f.usuario.trim().toLowerCase())) er.usuario = 'Entre 4 y 30 caracteres: solo letras minúsculas y números.'
    if (f.contrasena.length < 10) er.contrasena = 'Mínimo 10 caracteres.'
    if (!/^\d+$/.test(f.informes)) er.informes = 'Ingresa un número entero igual o mayor a 0.'
    setErrores(er)
    if (Object.keys(er).length) return
    setEnviando(true)
    setGeneral(null)
    try {
      await api.crearEmpresa({ nombre: f.nombre, correo: f.correo, usuario: f.usuario.trim().toLowerCase(), contrasena: f.contrasena, informes_contratados: Number(f.informes) })
      toast.success('Empresa creada')
      alTerminar()
    } catch (err) {
      setGeneral(mensajeError(err))
    } finally {
      setEnviando(false)
    }
  }

  return (
    <form onSubmit={enviar} className="space-y-4" noValidate>
      <Entrada etiqueta="Nombre de la empresa" value={f.nombre} onChange={cambiar('nombre')} error={errores.nombre} maxLength={120} autoFocus />
      <Entrada etiqueta="Correo electrónico" type="email" value={f.correo} onChange={cambiar('correo')} error={errores.correo} maxLength={200} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Entrada etiqueta="Usuario" value={f.usuario} onChange={cambiar('usuario')} error={errores.usuario} autoCapitalize="none" autoComplete="off" maxLength={30} />
        <Entrada etiqueta="Contraseña inicial" type="password" value={f.contrasena} onChange={cambiar('contrasena')} error={errores.contrasena} autoComplete="new-password" maxLength={72} />
      </div>
      <Entrada etiqueta="Informes contratados" inputMode="numeric" value={f.informes} onChange={cambiar('informes')} error={errores.informes}
        ayuda="Cada evaluación finalizada consume un informe del plan." />
      <Aviso>Entrega el usuario y la contraseña a la empresa por un canal seguro. La contraseña no se podrá consultar después, solo restablecer.</Aviso>
      {general && <Aviso tono="rojo">{general}</Aviso>}
      <div className="flex justify-end gap-2 pt-1">
        <Boton type="submit" cargando={enviando}>Crear empresa</Boton>
      </div>
    </form>
  )
}

function FormularioEdicion({ empresa, alTerminar }: { empresa: EmpresaResumen; alTerminar: () => void }) {
  const [f, setF] = useState({ nombre: empresa.nombre, correo: empresa.correo, estado: empresa.estado, informes: String(empresa.informes_contratados) })
  const [error, setError] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  async function enviar(e: FormEvent) {
    e.preventDefault()
    if (f.nombre.trim().length < 2 || !esCorreo(f.correo) || !/^\d+$/.test(f.informes)) return setError('Revisa los datos ingresados.')
    setEnviando(true)
    setError(null)
    try {
      await api.actualizarEmpresa(empresa.id, { nombre: f.nombre, correo: f.correo, estado: f.estado, informes_contratados: Number(f.informes) })
      toast.success('Empresa actualizada')
      alTerminar()
    } catch (err) {
      setError(mensajeError(err))
    } finally {
      setEnviando(false)
    }
  }

  return (
    <form onSubmit={enviar} className="space-y-4" noValidate>
      <Entrada etiqueta="Nombre de la empresa" value={f.nombre} onChange={(e) => setF({ ...f, nombre: e.target.value })} maxLength={120} />
      <Entrada etiqueta="Correo electrónico" type="email" value={f.correo} onChange={(e) => setF({ ...f, correo: e.target.value })} maxLength={200} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Entrada etiqueta="Informes contratados" inputMode="numeric" value={f.informes} onChange={(e) => setF({ ...f, informes: e.target.value })}
          ayuda={`Utilizados: ${empresa.informes_utilizados}`} />
        <Selector etiqueta="Estado" value={f.estado} onChange={(e) => setF({ ...f, estado: e.target.value as Estado })}>
          <option value="activo">Activa</option>
          <option value="inactivo">Inactiva</option>
        </Selector>
      </div>
      <Entrada etiqueta="Usuario" value={empresa.usuario} disabled ayuda="El usuario no se puede modificar." />
      {error && <Aviso tono="rojo">{error}</Aviso>}
      <div className="flex justify-end pt-1"><Boton type="submit" cargando={enviando}>Guardar cambios</Boton></div>
    </form>
  )
}

function FormularioClave({ empresa, alTerminar }: { empresa: EmpresaResumen; alTerminar: () => void }) {
  const [clave, setClave] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  async function enviar(e: FormEvent) {
    e.preventDefault()
    if (clave.length < 10) return setError('La contraseña debe tener al menos 10 caracteres.')
    setEnviando(true)
    try {
      await api.restablecerContrasenaEmpresa(empresa.id, clave)
      toast.success('Contraseña restablecida')
      alTerminar()
    } catch (err) {
      setError(mensajeError(err))
    } finally {
      setEnviando(false)
    }
  }

  return (
    <form onSubmit={enviar} className="space-y-4" noValidate>
      <Entrada etiqueta={`Nueva contraseña para "${empresa.usuario}"`} type="password" value={clave} onChange={(e) => setClave(e.target.value)}
        autoComplete="new-password" maxLength={72} ayuda="Mínimo 10 caracteres. La contraseña anterior dejará de funcionar." autoFocus />
      {error && <Aviso tono="rojo">{error}</Aviso>}
      <div className="flex justify-end"><Boton type="submit" cargando={enviando}>Restablecer</Boton></div>
    </form>
  )
}

export default function Empresas() {
  const { datos, cargando, error, recargar } = useCarga(() => api.listarEmpresas())
  const [busqueda, setBusqueda] = useState('')
  const [estado, setEstado] = useState<'todas' | Estado>('todas')
  const [creando, setCreando] = useState(false)
  const [editando, setEditando] = useState<EmpresaResumen | null>(null)
  const [clave, setClave] = useState<EmpresaResumen | null>(null)
  const [alternar, setAlternar] = useState<EmpresaResumen | null>(null)

  const empresas = useMemo(() => datos ?? [], [datos])
  const visibles = useMemo(() => {
    const q = busqueda.trim().toLowerCase()
    return empresas.filter((e) => (estado === 'todas' || e.estado === estado) && (!q || `${e.nombre} ${e.usuario} ${e.correo}`.toLowerCase().includes(q)))
  }, [empresas, busqueda, estado])
  const total = (k: 'total_colaboradores' | 'informes_utilizados' | 'informes_contratados') => empresas.reduce((s, e) => s + e[k], 0)

  async function cambiarEstado(e: EmpresaResumen) {
    try {
      await api.actualizarEmpresa(e.id, { nombre: e.nombre, correo: e.correo, informes_contratados: e.informes_contratados, estado: e.estado === 'activo' ? 'inactivo' : 'activo' })
      toast.success(e.estado === 'activo' ? 'Empresa inactivada' : 'Empresa activada')
      await recargar()
    } catch (err) {
      toast.error(mensajeError(err))
    }
  }

  const cerrarYRecargar = (cerrar: () => void) => () => { cerrar(); void recargar() }

  return (
    <div className="space-y-8">
      <Encabezado rotulo="Administración general" titulo="Empresas"
        descripcion="Crea empresas, define su plan de informes y revisa el uso de la plataforma."
        acciones={<Boton onClick={() => setCreando(true)}><Plus className="h-4 w-4" /> Nueva empresa</Boton>} />

      {cargando ? <Cargando /> : error ? <Aviso tono="rojo">{error}</Aviso> : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Indicador etiqueta="Empresas activas" valor={empresas.filter((e) => e.estado === 'activo').length} detalle={`${empresas.length} registradas`} />
            <Indicador etiqueta="Colaboradores" valor={total('total_colaboradores')} />
            <Indicador etiqueta="Evaluaciones realizadas" valor={total('informes_utilizados')} />
            <Indicador etiqueta="Informes contratados" valor={total('informes_contratados')} detalle={`${total('informes_contratados') - total('informes_utilizados')} disponibles`} destacado />
          </div>

          <Tarjeta>
            <div className="flex flex-col gap-3 border-b border-borde p-4 sm:flex-row sm:items-center">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-tenue" aria-hidden />
                <input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar por nombre, usuario o correo" aria-label="Buscar empresas"
                  className="h-10 w-full rounded-full border border-borde bg-white pr-4 pl-10 text-sm placeholder:text-tenue focus:border-marca-600 focus:ring-4 focus:ring-marca-100 focus:outline-none" />
              </div>
              <Filtro etiqueta="Filtrar por estado" value={estado} onChange={(e) => setEstado(e.target.value as typeof estado)}>
                <option value="todas">Todas</option>
                <option value="activo">Activas</option>
                <option value="inactivo">Inactivas</option>
              </Filtro>
            </div>

            {visibles.length === 0 ? (
              <Vacio titulo={empresas.length ? 'Sin resultados' : 'Aún no hay empresas'}
                descripcion={empresas.length ? 'Prueba con otra búsqueda o filtro.' : 'Crea la primera empresa para comenzar.'} />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[920px] text-left text-sm">
                  <thead>
                    <tr className="border-b border-borde font-mono text-[11px] tracking-[0.1em] text-suave uppercase">
                      <th className="px-4 py-3 font-normal">Empresa</th>
                      <th className="px-4 py-3 font-normal">Usuario</th>
                      <th className="px-4 py-3 font-normal">Creación</th>
                      <th className="px-4 py-3 font-normal">Estado</th>
                      <th className="px-4 py-3 text-right font-normal">Colaboradores</th>
                      <th className="px-4 py-3 text-right font-normal">Evaluaciones</th>
                      <th className="px-4 py-3 text-right font-normal">Contratados</th>
                      <th className="px-4 py-3 text-right font-normal">Disponibles</th>
                      <th className="px-4 py-3 text-right font-normal">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-borde">
                    {visibles.map((e) => (
                      <tr key={e.id} className="hover:bg-slate-50/70">
                        <td className="px-4 py-3">
                          <p className="font-medium text-tinta">{e.nombre}</p>
                          <p className="text-[13px] text-suave">{e.correo}</p>
                        </td>
                        <td className="px-4 py-3 font-mono text-[13px] text-suave">{e.usuario}</td>
                        <td className="px-4 py-3 whitespace-nowrap text-suave">{fecha(e.created_at)}</td>
                        <td className="px-4 py-3"><Insignia tono={e.estado === 'activo' ? 'verde' : 'neutro'}>{e.estado === 'activo' ? 'Activa' : 'Inactiva'}</Insignia></td>
                        <td className="px-4 py-3 text-right tabular-nums">{e.total_colaboradores}</td>
                        <td className="px-4 py-3 text-right tabular-nums">{e.informes_utilizados}</td>
                        <td className="px-4 py-3 text-right tabular-nums">{e.informes_contratados}</td>
                        <td className="px-4 py-3 text-right tabular-nums">
                          <span className={e.informes_disponibles === 0 ? 'font-medium text-red-600' : ''}>{e.informes_disponibles}</span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex justify-end gap-1">
                            <Boton variante="fantasma" tamano="icono" title="Editar" aria-label={`Editar ${e.nombre}`} onClick={() => setEditando(e)}><Pencil className="h-4 w-4" /></Boton>
                            <Boton variante="fantasma" tamano="icono" title="Restablecer contraseña" aria-label={`Restablecer contraseña de ${e.nombre}`} onClick={() => setClave(e)}><KeyRound className="h-4 w-4" /></Boton>
                            <Boton variante="fantasma" tamano="icono" title={e.estado === 'activo' ? 'Inactivar' : 'Activar'} aria-label={`${e.estado === 'activo' ? 'Inactivar' : 'Activar'} ${e.nombre}`} onClick={() => setAlternar(e)}><Power className="h-4 w-4" /></Boton>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Tarjeta>
        </>
      )}

      <Modal abierto={creando} alCerrar={() => setCreando(false)} titulo="Nueva empresa" descripcion="Se creará la empresa y su cuenta administrativa.">
        <FormularioNueva alTerminar={cerrarYRecargar(() => setCreando(false))} />
      </Modal>
      <Modal abierto={!!editando} alCerrar={() => setEditando(null)} titulo="Editar empresa">
        {editando && <FormularioEdicion empresa={editando} alTerminar={cerrarYRecargar(() => setEditando(null))} />}
      </Modal>
      <Modal abierto={!!clave} alCerrar={() => setClave(null)} titulo="Restablecer contraseña" ancho="sm">
        {clave && <FormularioClave empresa={clave} alTerminar={() => setClave(null)} />}
      </Modal>
      <Confirmacion abierto={!!alternar} alCerrar={() => setAlternar(null)}
        titulo={alternar?.estado === 'activo' ? '¿Inactivar empresa?' : '¿Activar empresa?'}
        descripcion={alternar?.estado === 'activo'
          ? <>Mientras <strong>{alternar?.nombre}</strong> esté inactiva, ni su administrador ni sus colaboradores podrán ingresar. No se borra información.</>
          : <><strong>{alternar?.nombre}</strong> y sus colaboradores podrán volver a ingresar.</>}
        textoConfirmar={alternar?.estado === 'activo' ? 'Inactivar' : 'Activar'} peligro={alternar?.estado === 'activo'}
        alConfirmar={() => (alternar ? cambiarEstado(alternar) : undefined)} />
    </div>
  )
}
