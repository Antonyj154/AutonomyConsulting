import { Download, FileDown, FileSpreadsheet, Pencil, Plus, Power, Search, Send, Trash2, Upload } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { toast } from 'sonner'
import { Confirmacion, Modal } from '@/components/Dialogo'
import { Aviso, Boton, Cargando, Encabezado, Entrada, Filtro, Insignia, Tarjeta, Vacio } from '@/components/ui'
import { api } from '@/lib/api'
import { ultimoPinDemo } from '@/lib/api/demo'
import { descargarPlantilla, descargarResultados, leerPlantilla, type LecturaPlantilla } from '@/lib/excel'
import { useSesion } from '@/lib/sesion'
import type { Colaborador, DatosColaborador, Estado, EstadoEnvio, EstadoEvaluacion, ResultadoImportacion } from '@/lib/tipos'
import { useCarga } from '@/lib/useCarga'
import { ErrorApp, esCorreo, fecha, mensajeError, nombreCompleto, usuarioBase } from '@/lib/utilidades'

const ENVIO: Record<EstadoEnvio, { texto: string; tono: 'neutro' | 'ambar' | 'verde' | 'rojo' }> = {
  pendiente: { texto: 'Sin enviar', tono: 'neutro' },
  solicitado: { texto: 'Solicitado', tono: 'ambar' },
  enviado: { texto: 'Enviado', tono: 'verde' },
  error: { texto: 'Error de envío', tono: 'rojo' },
}
const EVALUACION: Record<EstadoEvaluacion, { texto: string; tono: 'neutro' | 'azul' | 'verde' }> = {
  pendiente: { texto: 'Pendiente', tono: 'neutro' },
  en_progreso: { texto: 'En curso', tono: 'azul' },
  finalizada: { texto: 'Realizada', tono: 'verde' },
}

const puedeEnviarse = (c: Colaborador): boolean => c.estado === 'activo' && c.evaluacion_estado !== 'finalizada' && c.estado_envio !== 'solicitado'

function avisarPinDemo(): void {
  // Solo en modo demostración: en producción el PIN se envía por correo y nunca se muestra en pantalla.
  if (api.modo === 'demo' && ultimoPinDemo) {
    toast.info(`Demostración: el correo llevaría el usuario "${ultimoPinDemo.usuario}" y el PIN "${ultimoPinDemo.pin}"`, { duration: 12000 })
  }
}

function FormularioColaborador({ colaborador, alTerminar }: { colaborador: Colaborador | null; alTerminar: () => void }) {
  const [f, setF] = useState<DatosColaborador>({
    primer_nombre: colaborador?.primer_nombre ?? '', segundo_nombre: colaborador?.segundo_nombre ?? '',
    primer_apellido: colaborador?.primer_apellido ?? '', segundo_apellido: colaborador?.segundo_apellido ?? '',
    cargo: colaborador?.cargo ?? '', correo: colaborador?.correo ?? '',
  })
  const [errores, setErrores] = useState<Partial<Record<keyof DatosColaborador, string>>>({})
  const [general, setGeneral] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)
  const campo = (k: keyof DatosColaborador) => ({
    value: f[k], error: errores[k],
    onChange: (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value })),
  })

  async function enviar(e: FormEvent) {
    e.preventDefault()
    const er: typeof errores = {}
    if (!/\p{L}/u.test(f.primer_nombre)) er.primer_nombre = 'Ingresa el primer nombre.'
    if (!/\p{L}/u.test(f.primer_apellido)) er.primer_apellido = 'Ingresa el primer apellido.'
    if (!f.segundo_apellido.trim()) er.segundo_apellido = 'Ingresa el segundo apellido.'
    if (!esCorreo(f.correo)) er.correo = 'Ingresa un correo válido.'
    setErrores(er)
    if (Object.keys(er).length) return
    setEnviando(true)
    setGeneral(null)
    try {
      if (colaborador) {
        await api.actualizarColaborador(colaborador.id, f)
        toast.success('Colaborador actualizado')
      } else {
        const r = await api.crearColaborador(f)
        toast.success(`Colaborador creado · usuario ${r.usuario}`)
      }
      alTerminar()
    } catch (err) {
      setGeneral(mensajeError(err))
    } finally {
      setEnviando(false)
    }
  }

  return (
    <form onSubmit={enviar} className="space-y-4" noValidate>
      <div className="grid gap-4 sm:grid-cols-2">
        <Entrada etiqueta="Primer nombre" maxLength={60} autoFocus {...campo('primer_nombre')} />
        <Entrada etiqueta="Segundo nombre" maxLength={60} opcional {...campo('segundo_nombre')} />
        <Entrada etiqueta="Primer apellido" maxLength={60} {...campo('primer_apellido')} />
        <Entrada etiqueta="Segundo apellido" maxLength={60} {...campo('segundo_apellido')} />
      </div>
      <Entrada etiqueta="Cargo" maxLength={120} opcional {...campo('cargo')} />
      <Entrada etiqueta="Correo electrónico" type="email" maxLength={200} {...campo('correo')} />
      {colaborador ? (
        <Aviso>Usuario: <strong className="font-mono">{colaborador.usuario}</strong>. No cambia aunque edites el nombre.</Aviso>
      ) : usuarioBase(f) ? (
        <Aviso>Usuario que se generará: <strong className="font-mono">{usuarioBase(f)}</strong> (si ya existe, se agrega un número al final).</Aviso>
      ) : null}
      {general && <Aviso tono="rojo">{general}</Aviso>}
      <div className="flex justify-end"><Boton type="submit" cargando={enviando}>{colaborador ? 'Guardar cambios' : 'Crear colaborador'}</Boton></div>
    </form>
  )
}

const ERRORES_IMPORTACION: Record<string, string> = {
  CORREO_DUPLICADO: 'Ya existe un colaborador con ese correo.',
  DATOS_INVALIDOS: 'Datos incompletos o inválidos.',
}

function CargaMasiva({ alTerminar }: { alTerminar: () => void }) {
  const entrada = useRef<HTMLInputElement>(null)
  const [lectura, setLectura] = useState<LecturaPlantilla | null>(null)
  const [archivo, setArchivo] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [avance, setAvance] = useState<number | null>(null)
  const [resultado, setResultado] = useState<ResultadoImportacion | null>(null)

  async function elegir(f: File | undefined) {
    if (!f) return
    setError(null); setLectura(null); setResultado(null); setArchivo(f.name)
    try {
      setLectura(await leerPlantilla(f))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo leer el archivo.')
    }
    if (entrada.current) entrada.current.value = ''
  }

  async function importar() {
    if (!lectura?.filas.length) return
    setAvance(0)
    try {
      const r = await api.importarColaboradores(lectura.filas, setAvance)
      setResultado(r)
      if (r.creados.length) toast.success(`${r.creados.length} colaboradores creados`)
    } catch (e) {
      setError(mensajeError(e))
    } finally {
      setAvance(null)
    }
  }

  const erroresFinales = resultado
    ? [...(lectura?.errores ?? []), ...resultado.errores.map((x) => ({ fila: x.fila, error: ERRORES_IMPORTACION[x.error] ?? 'No se pudo crear.' }))].sort((a, b) => a.fila - b.fila)
    : lectura?.errores ?? []

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-borde p-4">
          <p className="font-mono text-[11px] tracking-[0.12em] text-suave uppercase">Paso 1</p>
          <p className="mt-1 text-sm text-tinta">Descarga la plantilla y llénala con un colaborador por fila.</p>
          <Boton variante="secundario" tamano="sm" className="mt-3" onClick={() => void descargarPlantilla()}><FileDown className="h-4 w-4" /> Descargar plantilla</Boton>
        </div>
        <div className="rounded-xl border border-borde p-4">
          <p className="font-mono text-[11px] tracking-[0.12em] text-suave uppercase">Paso 2</p>
          <p className="mt-1 text-sm text-tinta">Sube el archivo completo (.xlsx, hasta 1000 filas).</p>
          <input ref={entrada} type="file" accept=".xlsx" className="sr-only" aria-label="Archivo Excel" onChange={(e) => void elegir(e.target.files?.[0])} />
          <Boton variante="secundario" tamano="sm" className="mt-3" onClick={() => entrada.current?.click()} disabled={avance !== null}><Upload className="h-4 w-4" /> Elegir archivo</Boton>
        </div>
      </div>

      {error && <Aviso tono="rojo">{error}</Aviso>}

      {lectura && !resultado && (
        <Aviso tono={lectura.filas.length ? 'verde' : 'ambar'}>
          <strong>{archivo}</strong>: {lectura.filas.length} {lectura.filas.length === 1 ? 'colaborador listo' : 'colaboradores listos'} para crear
          {lectura.errores.length > 0 && <> y {lectura.errores.length} {lectura.errores.length === 1 ? 'fila con error' : 'filas con errores'} que se omitirán</>}.
        </Aviso>
      )}
      {resultado && (
        <Aviso tono={resultado.creados.length ? 'verde' : 'ambar'}>
          Se crearon <strong>{resultado.creados.length}</strong> colaboradores{erroresFinales.length > 0 && <> y se omitieron <strong>{erroresFinales.length}</strong> filas</>}.
        </Aviso>
      )}

      {erroresFinales.length > 0 && (
        <div className="max-h-48 overflow-y-auto rounded-xl border border-borde">
          <table className="w-full text-left text-[13px]">
            <thead><tr className="border-b border-borde text-suave"><th className="px-3 py-2 font-medium">Fila</th><th className="px-3 py-2 font-medium">Motivo</th></tr></thead>
            <tbody className="divide-y divide-borde">
              {erroresFinales.map((x, i) => <tr key={i}><td className="px-3 py-1.5 tabular-nums">{x.fila}</td><td className="px-3 py-1.5 text-suave">{x.error}</td></tr>)}
            </tbody>
          </table>
        </div>
      )}

      {avance !== null && lectura && (
        <div className="space-y-2" role="status">
          <p className="text-sm text-suave">Creando colaboradores… {avance} de {lectura.filas.length}</p>
          <div className="h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-marca-600 transition-[width]" style={{ width: `${(avance / lectura.filas.length) * 100}%` }} /></div>
        </div>
      )}

      <div className="flex justify-end gap-2">
        {resultado ? (
          <Boton onClick={alTerminar}>Listo</Boton>
        ) : (
          <Boton onClick={importar} disabled={!lectura?.filas.length} cargando={avance !== null}>
            Crear {lectura?.filas.length ? `${lectura.filas.length} ` : ''}colaboradores
          </Boton>
        )}
      </div>
    </div>
  )
}

export default function Colaboradores() {
  const { sesion } = useSesion()
  const { datos, cargando, error, recargar } = useCarga(() => api.listarColaboradores())
  const [busqueda, setBusqueda] = useState('')
  const [estado, setEstado] = useState<'todos' | Estado>('todos')
  const [evaluacion, setEvaluacion] = useState<'todas' | EstadoEvaluacion>('todas')
  const [formulario, setFormulario] = useState<{ colaborador: Colaborador | null } | null>(null)
  const [carga, setCarga] = useState(false)
  const [enviarTodos, setEnviarTodos] = useState(false)
  const [reenviar, setReenviar] = useState<Colaborador | null>(null)
  const [alternar, setAlternar] = useState<Colaborador | null>(null)
  const [borrar, setBorrar] = useState<Colaborador | null>(null)
  const [ocupado, setOcupado] = useState<string | null>(null)
  const [exportando, setExportando] = useState(false)

  const lista = useMemo(() => datos ?? [], [datos])
  const elegibles = lista.filter(puedeEnviarse)
  const haySolicitados = lista.some((c) => c.estado_envio === 'solicitado')
  const hayResultados = lista.some((c) => c.evaluacion_estado === 'finalizada')

  // Mientras haya envíos "Solicitados", se consulta periódicamente si el servicio de correo ya respondió.
  useEffect(() => {
    if (!haySolicitados) return
    const t = setInterval(() => void recargar(), 8000)
    return () => clearInterval(t)
  }, [haySolicitados, recargar])

  const visibles = useMemo(() => {
    const q = busqueda.trim().toLowerCase()
    return lista.filter((c) =>
      (estado === 'todos' || c.estado === estado) &&
      (evaluacion === 'todas' || c.evaluacion_estado === evaluacion) &&
      (!q || `${nombreCompleto(c)} ${c.usuario} ${c.correo} ${c.cargo ?? ''}`.toLowerCase().includes(q)))
  }, [lista, busqueda, estado, evaluacion])

  async function ejecutar(accion: () => Promise<void>, exito: string) {
    try {
      await accion()
      toast.success(exito)
      await recargar()
    } catch (err) {
      toast.error(mensajeError(err))
    }
  }

  async function enviar(c: Colaborador) {
    setOcupado(c.id)
    try {
      const r = await api.solicitarEnvio(c.id)
      if (r === 'ok') { toast.success(`Envío solicitado para ${c.primer_nombre}`); avisarPinDemo() }
      else if (r === 'ya_solicitado') toast.info('Ya hay un envío en curso para este colaborador.')
      else toast.info('Este colaborador no puede recibir la evaluación (inactivo o ya la completó).')
      await recargar()
    } catch (err) {
      toast.error(mensajeError(err))
    } finally {
      setOcupado(null)
    }
  }

  async function enviarATodos() {
    try {
      const r = await api.solicitarEnvioTodos()
      if (r.solicitados) toast.success(`Envío solicitado para ${r.solicitados} ${r.solicitados === 1 ? 'colaborador' : 'colaboradores'}`)
      else toast.info('No había colaboradores pendientes de envío.')
      if (r.errores) toast.error(`${r.errores} envíos no se pudieron solicitar. Inténtalo de nuevo.`)
      await recargar()
    } catch (err) {
      toast.error(mensajeError(err))
    }
  }

  async function exportar() {
    setExportando(true)
    try {
      const datosExcel = await api.exportarResultados()
      if (datosExcel.colaboradores.length === 0) throw new ErrorApp('SIN_RESULTADOS')
      await descargarResultados(datosExcel, sesion?.empresa_nombre ?? 'empresa')
      toast.success('Resultados descargados')
    } catch (err) {
      toast.error(err instanceof ErrorApp && err.codigo === 'SIN_RESULTADOS' ? 'Aún no hay evaluaciones finalizadas para descargar.' : mensajeError(err))
    } finally {
      setExportando(false)
    }
  }

  async function descargarInforme(c: Colaborador) {
    if (!c.informe_ruta) return
    try {
      const url = await api.urlInforme(c.informe_ruta)
      window.open(url, '_blank', 'noopener,noreferrer')
    } catch (err) {
      toast.error(mensajeError(err))
    }
  }

  const cerrarYRecargar = (cerrar: () => void) => () => { cerrar(); void recargar() }

  return (
    <div className="space-y-8">
      <Encabezado rotulo="Portal de empresa" titulo="Colaboradores"
        descripcion="Crea perfiles, solicita el envío de la evaluación y descarga los resultados de tu empresa."
        acciones={
          <>
            <Boton variante="secundario" onClick={exportar} cargando={exportando} disabled={!hayResultados} title={hayResultados ? undefined : 'Aún no hay evaluaciones finalizadas'}>
              <Download className="h-4 w-4" /> Descargar resultados
            </Boton>
            <Boton variante="secundario" onClick={() => setCarga(true)}><FileSpreadsheet className="h-4 w-4" /> Carga masiva</Boton>
            <Boton onClick={() => setFormulario({ colaborador: null })}><Plus className="h-4 w-4" /> Nuevo colaborador</Boton>
          </>
        } />

      {cargando ? <Cargando /> : error ? <Aviso tono="rojo">{error}</Aviso> : (
        <Tarjeta>
          <div className="flex flex-col gap-3 border-b border-borde p-4 lg:flex-row lg:items-center">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-tenue" aria-hidden />
              <input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar por nombre, usuario, correo o cargo" aria-label="Buscar colaboradores"
                className="h-10 w-full rounded-full border border-borde bg-white pr-4 pl-10 text-sm placeholder:text-tenue focus:border-marca-600 focus:ring-4 focus:ring-marca-100 focus:outline-none" />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Filtro etiqueta="Filtrar por estado" value={estado} onChange={(e) => setEstado(e.target.value as typeof estado)}>
                <option value="todos">Todos los estados</option>
                <option value="activo">Activos</option>
                <option value="inactivo">Inactivos</option>
              </Filtro>
              <Filtro etiqueta="Filtrar por evaluación" value={evaluacion} onChange={(e) => setEvaluacion(e.target.value as typeof evaluacion)}>
                <option value="todas">Todas las evaluaciones</option>
                <option value="pendiente">Pendientes</option>
                <option value="en_progreso">En curso</option>
                <option value="finalizada">Realizadas</option>
              </Filtro>
              <Boton variante="marca" onClick={() => setEnviarTodos(true)} disabled={elegibles.length === 0}>
                <Send className="h-4 w-4" /> Enviar a todos
              </Boton>
            </div>
          </div>

          {visibles.length === 0 ? (
            <Vacio titulo={lista.length ? 'Sin resultados' : 'Aún no hay colaboradores'}
              descripcion={lista.length ? 'Prueba con otra búsqueda o filtro.' : 'Crea el primero o usa la carga masiva desde Excel.'} />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[980px] text-left text-sm [&_td]:px-3 [&_th]:px-3">
                <thead>
                  <tr className="border-b border-borde font-mono text-[11px] tracking-[0.1em] text-suave uppercase">
                    <th className="px-4 py-3 font-normal">Colaborador</th>
                    <th className="px-4 py-3 font-normal">Usuario</th>
                    <th className="px-4 py-3 font-normal">Estado</th>
                    <th className="px-4 py-3 font-normal">Evaluación</th>
                    <th className="px-4 py-3 font-normal">Envío</th>
                    <th className="px-4 py-3 font-normal">Creación</th>
                    <th className="sticky right-0 bg-white px-4 py-3 text-right font-normal">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-borde">
                  {visibles.map((c) => (
                    <tr key={c.id} className="group hover:bg-slate-50/70">
                      <td className="max-w-64 px-4 py-3">
                        <p className="truncate font-medium text-tinta" title={nombreCompleto(c)}>{nombreCompleto(c)}</p>
                        <p className="truncate text-[13px] text-suave" title={c.correo}>{[c.cargo, c.correo].filter(Boolean).join(' · ')}</p>
                      </td>
                      <td className="px-4 py-3 font-mono text-[13px] text-suave">{c.usuario}</td>
                      <td className="px-4 py-3"><Insignia tono={c.estado === 'activo' ? 'verde' : 'neutro'}>{c.estado === 'activo' ? 'Activo' : 'Inactivo'}</Insignia></td>
                      <td className="px-4 py-3">
                        <Insignia tono={EVALUACION[c.evaluacion_estado].tono}>{EVALUACION[c.evaluacion_estado].texto}</Insignia>
                        {c.evaluacion_finalizada_en && <p className="mt-1 text-xs text-suave">{fecha(c.evaluacion_finalizada_en)}</p>}
                      </td>
                      <td className="px-4 py-3">
                        <Insignia tono={ENVIO[c.estado_envio].tono}>{ENVIO[c.estado_envio].texto}</Insignia>
                        {c.envio_solicitado_en && <p className="mt-1 text-xs text-suave">{fecha(c.envio_solicitado_en)}</p>}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-suave">{fecha(c.created_at)}</td>
                      <td className="sticky right-0 bg-white px-4 py-3 shadow-[-8px_0_8px_-8px_rgba(15,23,42,0.08)] group-hover:bg-slate-50">
                        <div className="flex items-center justify-end gap-1">
                          <Boton variante="secundario" tamano="sm" disabled={!puedeEnviarse(c)} cargando={ocupado === c.id}
                            onClick={() => (c.estado_envio === 'pendiente' ? void enviar(c) : setReenviar(c))}>
                            <Send className="h-3.5 w-3.5" /> {c.estado_envio === 'pendiente' ? 'Enviar evaluación' : 'Reenviar'}
                          </Boton>
                          <Boton variante="fantasma" tamano="icono" title={c.informe_estado === 'disponible' ? 'Descargar informe' : 'Informe aún no disponible'}
                            aria-label={`Descargar informe de ${c.primer_nombre}`} disabled={c.informe_estado !== 'disponible'} onClick={() => void descargarInforme(c)}><FileDown className="h-4 w-4" /></Boton>
                          <Boton variante="fantasma" tamano="icono" title="Editar" aria-label={`Editar a ${c.primer_nombre}`} onClick={() => setFormulario({ colaborador: c })}><Pencil className="h-4 w-4" /></Boton>
                          <Boton variante="fantasma" tamano="icono" title={c.estado === 'activo' ? 'Inactivar' : 'Activar'} aria-label={`${c.estado === 'activo' ? 'Inactivar' : 'Activar'} a ${c.primer_nombre}`} onClick={() => setAlternar(c)}><Power className="h-4 w-4" /></Boton>
                          <Boton variante="fantasma" tamano="icono" title="Eliminar" aria-label={`Eliminar a ${c.primer_nombre}`} onClick={() => setBorrar(c)}><Trash2 className="h-4 w-4" /></Boton>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="border-t border-borde px-4 py-3 text-[13px] text-suave">{visibles.length} de {lista.length} colaboradores</p>
        </Tarjeta>
      )}

      <Modal abierto={!!formulario} alCerrar={() => setFormulario(null)} titulo={formulario?.colaborador ? 'Editar colaborador' : 'Nuevo colaborador'}>
        {formulario && <FormularioColaborador colaborador={formulario.colaborador} alTerminar={cerrarYRecargar(() => setFormulario(null))} />}
      </Modal>
      <Modal abierto={carga} alCerrar={cerrarYRecargar(() => setCarga(false))} titulo="Carga masiva desde Excel" descripcion="Crea muchos colaboradores a la vez con la plantilla.">
        {carga && <CargaMasiva alTerminar={cerrarYRecargar(() => setCarga(false))} />}
      </Modal>

      <Confirmacion abierto={enviarTodos} alCerrar={() => setEnviarTodos(false)} titulo="¿Enviar a todos?" textoConfirmar={`Enviar a ${elegibles.length}`}
        descripcion={<>Se solicitará el envío de usuario y clave de acceso a <strong>{elegibles.length}</strong> {elegibles.length === 1 ? 'colaborador activo' : 'colaboradores activos'} que aún no {elegibles.length === 1 ? 'ha' : 'han'} completado la evaluación. Quienes ya tenían una clave recibirán una nueva y la anterior dejará de funcionar.</>}
        alConfirmar={enviarATodos} />
      <Confirmacion abierto={!!reenviar} alCerrar={() => setReenviar(null)} titulo="¿Reenviar evaluación?" textoConfirmar="Reenviar"
        descripcion={<>Se generará una nueva clave de acceso para <strong>{reenviar ? nombreCompleto(reenviar) : ''}</strong>. La clave anterior dejará de funcionar.</>}
        alConfirmar={() => (reenviar ? enviar(reenviar) : undefined)} />
      <Confirmacion abierto={!!alternar} alCerrar={() => setAlternar(null)} peligro={alternar?.estado === 'activo'}
        titulo={alternar?.estado === 'activo' ? '¿Inactivar colaborador?' : '¿Activar colaborador?'} textoConfirmar={alternar?.estado === 'activo' ? 'Inactivar' : 'Activar'}
        descripcion={alternar?.estado === 'activo'
          ? <><strong>{alternar ? nombreCompleto(alternar) : ''}</strong> no podrá ingresar mientras esté inactivo. Su información se conserva.</>
          : <><strong>{alternar ? nombreCompleto(alternar) : ''}</strong> podrá volver a ingresar.</>}
        alConfirmar={() => (alternar ? ejecutar(() => api.cambiarEstadoColaborador(alternar.id, alternar.estado === 'activo' ? 'inactivo' : 'activo'), alternar.estado === 'activo' ? 'Colaborador inactivado' : 'Colaborador activado') : undefined)} />
      <Confirmacion abierto={!!borrar} alCerrar={() => setBorrar(null)} peligro titulo="¿Eliminar colaborador?" textoConfirmar="Eliminar"
        descripcion={<><strong>{borrar ? nombreCompleto(borrar) : ''}</strong> desaparecerá de tu lista y perderá el acceso. Si ya completó la evaluación, sus respuestas se conservan de forma interna y el informe utilizado no se recupera.</>}
        alConfirmar={() => (borrar ? ejecutar(() => api.eliminarColaborador(borrar.id), 'Colaborador eliminado') : undefined)} />
    </div>
  )
}
