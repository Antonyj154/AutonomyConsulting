import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical, Pencil, Plus, Trash2 } from 'lucide-react'
import { useState, type FormEvent, type ReactNode } from 'react'
import { toast } from 'sonner'
import { Confirmacion, Modal } from '@/components/Dialogo'
import { AreaTexto, Aviso, Boton, Cargando, Encabezado, Entrada, Insignia, Selector, Tarjeta, Vacio } from '@/components/ui'
import { api } from '@/lib/api'
import type { Bloque, DatosPregunta, Estado, Pregunta, Rubrica } from '@/lib/tipos'
import { useCarga } from '@/lib/useCarga'
import { cn, codigoPregunta, mensajeError } from '@/lib/utilidades'

function useSensores() {
  return useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )
}

function Ordenable({ id, children }: { id: string; children: (asa: ReactNode) => ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id })
  const asa = (
    <button type="button" {...attributes} {...listeners} aria-label="Arrastrar para ordenar" title="Arrastrar para ordenar"
      className="inline-flex h-8 w-6 shrink-0 cursor-grab touch-none items-center justify-center rounded-md text-tenue hover:bg-slate-100 hover:text-tinta active:cursor-grabbing">
      <GripVertical className="h-4 w-4" />
    </button>
  )
  return (
    <div ref={setNodeRef} style={{ transform: CSS.Translate.toString(transform), transition }} className={cn(isDragging && 'relative z-10 opacity-80')}>
      {children(asa)}
    </div>
  )
}

/** Vista previa de la escala de tres opciones tal como la verá el colaborador. */
function Escala({ izquierda, centro, derecha }: { izquierda: string; centro: string; derecha: string }) {
  return (
    <div className="grid grid-cols-3 gap-1.5">
      {[izquierda, centro, derecha].map((t, i) => (
        <span key={i} className="rounded-lg border border-borde bg-slate-50 px-2 py-1.5 text-center text-xs leading-tight text-suave">{t || '—'}</span>
      ))}
    </div>
  )
}

function FormularioPregunta({ bloques, pregunta, bloqueInicial, alTerminar }: { bloques: Bloque[]; pregunta: Pregunta | null; bloqueInicial: string; alTerminar: () => void }) {
  const [f, setF] = useState<DatosPregunta>({
    id: pregunta?.id, bloque_id: pregunta?.bloque_id ?? bloqueInicial, texto: pregunta?.texto ?? '', rubrica: pregunta?.rubrica ?? 'positivo',
    etiqueta_izquierda: pregunta?.etiqueta_izquierda ?? 'En desacuerdo', etiqueta_centro: pregunta?.etiqueta_centro ?? 'Neutro',
    etiqueta_derecha: pregunta?.etiqueta_derecha ?? 'De acuerdo', estado: pregunta?.estado ?? 'activo',
  })
  const [error, setError] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)
  const positivo = f.rubrica === 'positivo'

  async function enviar(e: FormEvent) {
    e.preventDefault()
    if (f.texto.trim().length < 3) return setError('Escribe el texto de la pregunta.')
    if (!f.etiqueta_izquierda.trim() || !f.etiqueta_centro.trim() || !f.etiqueta_derecha.trim()) return setError('Las tres opciones de respuesta deben tener texto.')
    setEnviando(true)
    setError(null)
    try {
      await api.guardarPregunta(f)
      toast.success(pregunta ? 'Pregunta actualizada' : 'Pregunta creada')
      alTerminar()
    } catch (err) {
      setError(mensajeError(err))
    } finally {
      setEnviando(false)
    }
  }

  return (
    <form onSubmit={enviar} className="space-y-4" noValidate>
      <AreaTexto etiqueta="Pregunta" value={f.texto} onChange={(e) => setF({ ...f, texto: e.target.value })} maxLength={1000} autoFocus />
      <div className="grid gap-4 sm:grid-cols-3">
        <Selector etiqueta="Bloque" value={f.bloque_id} onChange={(e) => setF({ ...f, bloque_id: e.target.value })}>
          {bloques.map((b) => <option key={b.id} value={b.id}>{b.nombre}</option>)}
        </Selector>
        <Selector etiqueta="Orden rúbrica" value={f.rubrica} onChange={(e) => setF({ ...f, rubrica: e.target.value as Rubrica })}>
          <option value="positivo">Positivo</option>
          <option value="negativo">Negativo</option>
        </Selector>
        <Selector etiqueta="Estado" value={f.estado} onChange={(e) => setF({ ...f, estado: e.target.value as Estado })}>
          <option value="activo">Activa</option>
          <option value="inactivo">Inactiva</option>
        </Selector>
      </div>
      <div className="space-y-3 rounded-xl border border-borde p-4">
        <p className="text-[13px] font-medium text-tinta">Opciones de respuesta (siempre tres)</p>
        <div className="grid gap-3 sm:grid-cols-3">
          <Entrada etiqueta={`Izquierda · ${positivo ? '−1' : '+1'}`} value={f.etiqueta_izquierda} onChange={(e) => setF({ ...f, etiqueta_izquierda: e.target.value })} maxLength={60} />
          <Entrada etiqueta="Centro · 0" value={f.etiqueta_centro} onChange={(e) => setF({ ...f, etiqueta_centro: e.target.value })} maxLength={60} />
          <Entrada etiqueta={`Derecha · ${positivo ? '+1' : '−1'}`} value={f.etiqueta_derecha} onChange={(e) => setF({ ...f, etiqueta_derecha: e.target.value })} maxLength={60} />
        </div>
        <p className="text-[13px] text-suave">Con rúbrica negativa los puntajes de los extremos se invierten.</p>
      </div>
      {pregunta && (
        <Aviso>Si esta pregunta ya fue respondida, el cambio crea una versión nueva: las evaluaciones enviadas conservan el texto y las opciones originales.</Aviso>
      )}
      {error && <Aviso tono="rojo">{error}</Aviso>}
      <div className="flex justify-end"><Boton type="submit" cargando={enviando}>{pregunta ? 'Guardar cambios' : 'Crear pregunta'}</Boton></div>
    </form>
  )
}

function FormularioBloque({ bloque, alTerminar }: { bloque: Bloque | null; alTerminar: () => void }) {
  const [nombre, setNombre] = useState(bloque?.nombre ?? '')
  const [estado, setEstado] = useState<Estado>(bloque?.estado ?? 'activo')
  const [error, setError] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  async function enviar(e: FormEvent) {
    e.preventDefault()
    if (!nombre.trim()) return setError('Escribe el nombre del bloque.')
    setEnviando(true)
    try {
      await api.guardarBloque(bloque?.id ?? null, nombre, estado)
      toast.success(bloque ? 'Bloque actualizado' : 'Bloque creado')
      alTerminar()
    } catch (err) {
      setError(mensajeError(err))
    } finally {
      setEnviando(false)
    }
  }

  return (
    <form onSubmit={enviar} className="space-y-4" noValidate>
      <Entrada etiqueta="Nombre del bloque" value={nombre} onChange={(e) => setNombre(e.target.value)} maxLength={120} autoFocus />
      <Selector etiqueta="Estado" value={estado} onChange={(e) => setEstado(e.target.value as Estado)} ayuda="Un bloque inactivo no aparece en las evaluaciones nuevas.">
        <option value="activo">Activo</option>
        <option value="inactivo">Inactivo</option>
      </Selector>
      {error && <Aviso tono="rojo">{error}</Aviso>}
      <div className="flex justify-end"><Boton type="submit" cargando={enviando}>{bloque ? 'Guardar cambios' : 'Crear bloque'}</Boton></div>
    </form>
  )
}

export default function Cuestionario() {
  const { datos, cargando, error, recargar, setDatos } = useCarga(() => api.obtenerCuestionario())
  const sensores = useSensores()
  const [formBloque, setFormBloque] = useState<{ bloque: Bloque | null } | null>(null)
  const [formPregunta, setFormPregunta] = useState<{ pregunta: Pregunta | null; bloqueId: string } | null>(null)
  const [borrarBloque, setBorrarBloque] = useState<Bloque | null>(null)
  const [borrarPregunta, setBorrarPregunta] = useState<Pregunta | null>(null)
  const bloques = datos ?? []
  const totalPreguntas = bloques.reduce((s, b) => s + b.preguntas.filter((p) => p.estado === 'activo' && b.estado === 'activo').length, 0)

  async function guardarOrden(accion: () => Promise<void>) {
    try {
      await accion()
    } catch (err) {
      toast.error(mensajeError(err))
      await recargar()
    }
  }

  function soltarBloque(e: DragEndEvent) {
    if (!e.over || e.active.id === e.over.id) return
    const nuevo = arrayMove(bloques, bloques.findIndex((b) => b.id === e.active.id), bloques.findIndex((b) => b.id === e.over!.id))
    setDatos(nuevo)
    void guardarOrden(() => api.reordenarBloques(nuevo.map((b) => b.id)))
  }

  function soltarPregunta(bloque: Bloque, e: DragEndEvent) {
    if (!e.over || e.active.id === e.over.id) return
    const preguntas = arrayMove(bloque.preguntas, bloque.preguntas.findIndex((p) => p.id === e.active.id), bloque.preguntas.findIndex((p) => p.id === e.over!.id))
    setDatos(bloques.map((b) => (b.id === bloque.id ? { ...b, preguntas } : b)))
    void guardarOrden(() => api.reordenarPreguntas(bloque.id, preguntas.map((p) => p.id)))
  }

  async function eliminar(accion: () => Promise<void>, mensaje: string) {
    try {
      await accion()
      toast.success(mensaje)
      await recargar()
    } catch (err) {
      toast.error(mensajeError(err))
    }
  }

  const cerrarYRecargar = (cerrar: () => void) => () => { cerrar(); void recargar() }

  return (
    <div className="space-y-8">
      <Encabezado rotulo="Configuración de la evaluación" titulo="Cuestionario"
        descripcion={`Un único cuestionario para todas las empresas. ${totalPreguntas} preguntas activas. Arrastra para cambiar el orden.`}
        acciones={<Boton onClick={() => setFormBloque({ bloque: null })}><Plus className="h-4 w-4" /> Nuevo bloque</Boton>} />

      {cargando ? <Cargando /> : error ? <Aviso tono="rojo">{error}</Aviso> : bloques.length === 0 ? (
        <Tarjeta><Vacio titulo="Aún no hay bloques" descripcion="Crea el primer bloque y luego agrega sus preguntas."
          accion={<Boton onClick={() => setFormBloque({ bloque: null })}><Plus className="h-4 w-4" /> Nuevo bloque</Boton>} /></Tarjeta>
      ) : (
        <DndContext sensors={sensores} collisionDetection={closestCenter} onDragEnd={soltarBloque}>
          <SortableContext items={bloques.map((b) => b.id)} strategy={verticalListSortingStrategy}>
            <div className="space-y-4">
              {bloques.map((b, i) => (
                <Ordenable key={b.id} id={b.id}>
                  {(asaBloque) => (
                    <Tarjeta className={cn(b.estado === 'inactivo' && 'bg-slate-50/60')}>
                      <div className="flex flex-wrap items-center gap-2 border-b border-borde px-3 py-3 sm:px-4">
                        {asaBloque}
                        <span className="font-mono text-xs text-tenue">{String(i + 1).padStart(2, '0')}</span>
                        <h2 className="mr-auto text-lg font-medium text-tinta">{b.nombre}</h2>
                        {b.estado === 'inactivo' && <Insignia>Inactivo</Insignia>}
                        <span className="text-[13px] text-suave">{b.preguntas.length} {b.preguntas.length === 1 ? 'pregunta' : 'preguntas'}</span>
                        <Boton variante="fantasma" tamano="icono" title="Editar bloque" aria-label={`Editar bloque ${b.nombre}`} onClick={() => setFormBloque({ bloque: b })}><Pencil className="h-4 w-4" /></Boton>
                        <Boton variante="fantasma" tamano="icono" title="Eliminar bloque" aria-label={`Eliminar bloque ${b.nombre}`} onClick={() => setBorrarBloque(b)}><Trash2 className="h-4 w-4" /></Boton>
                        <Boton variante="secundario" tamano="sm" onClick={() => setFormPregunta({ pregunta: null, bloqueId: b.id })}><Plus className="h-3.5 w-3.5" /> Pregunta</Boton>
                      </div>
                      {b.preguntas.length === 0 ? (
                        <p className="px-4 py-6 text-center text-sm text-suave">Este bloque aún no tiene preguntas.</p>
                      ) : (
                        <DndContext sensors={sensores} collisionDetection={closestCenter} onDragEnd={(e) => soltarPregunta(b, e)}>
                          <SortableContext items={b.preguntas.map((p) => p.id)} strategy={verticalListSortingStrategy}>
                            <div className="divide-y divide-borde">
                              {b.preguntas.map((p) => (
                                <Ordenable key={p.id} id={p.id}>
                                  {(asa) => (
                                    <div className={cn('flex items-start gap-2 bg-white px-3 py-3.5 sm:px-4', p.estado === 'inactivo' && 'opacity-60')}>
                                      {asa}
                                      <div className="min-w-0 flex-1 space-y-2.5">
                                        <div className="flex flex-wrap items-center gap-2">
                                          <span className="font-mono text-xs text-tenue">{codigoPregunta(p.codigo)}</span>
                                          <Insignia tono={p.rubrica === 'positivo' ? 'marca' : 'ambar'}>{p.rubrica === 'positivo' ? 'Positivo' : 'Negativo'}</Insignia>
                                          {p.estado === 'inactivo' && <Insignia>Inactiva</Insignia>}
                                          {p.version > 1 && <span className="font-mono text-xs text-tenue">v{p.version}</span>}
                                        </div>
                                        <p className="text-[15px] leading-snug text-tinta">{p.texto}</p>
                                        <div className="max-w-md"><Escala izquierda={p.etiqueta_izquierda} centro={p.etiqueta_centro} derecha={p.etiqueta_derecha} /></div>
                                      </div>
                                      <div className="flex shrink-0 gap-1">
                                        <Boton variante="fantasma" tamano="icono" title="Editar pregunta" aria-label={`Editar ${codigoPregunta(p.codigo)}`} onClick={() => setFormPregunta({ pregunta: p, bloqueId: b.id })}><Pencil className="h-4 w-4" /></Boton>
                                        <Boton variante="fantasma" tamano="icono" title="Eliminar pregunta" aria-label={`Eliminar ${codigoPregunta(p.codigo)}`} onClick={() => setBorrarPregunta(p)}><Trash2 className="h-4 w-4" /></Boton>
                                      </div>
                                    </div>
                                  )}
                                </Ordenable>
                              ))}
                            </div>
                          </SortableContext>
                        </DndContext>
                      )}
                    </Tarjeta>
                  )}
                </Ordenable>
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}

      <Modal abierto={!!formBloque} alCerrar={() => setFormBloque(null)} titulo={formBloque?.bloque ? 'Editar bloque' : 'Nuevo bloque'} ancho="sm">
        {formBloque && <FormularioBloque bloque={formBloque.bloque} alTerminar={cerrarYRecargar(() => setFormBloque(null))} />}
      </Modal>
      <Modal abierto={!!formPregunta} alCerrar={() => setFormPregunta(null)} titulo={formPregunta?.pregunta ? `Editar ${codigoPregunta(formPregunta.pregunta.codigo)}` : 'Nueva pregunta'} ancho="lg">
        {formPregunta && <FormularioPregunta bloques={bloques} pregunta={formPregunta.pregunta} bloqueInicial={formPregunta.bloqueId} alTerminar={cerrarYRecargar(() => setFormPregunta(null))} />}
      </Modal>
      <Confirmacion abierto={!!borrarBloque} alCerrar={() => setBorrarBloque(null)} titulo="¿Eliminar bloque?" peligro textoConfirmar="Eliminar"
        descripcion={<>Se eliminará el bloque <strong>{borrarBloque?.nombre}</strong>. Solo es posible si no tiene preguntas.</>}
        alConfirmar={() => (borrarBloque ? eliminar(() => api.eliminarBloque(borrarBloque.id), 'Bloque eliminado') : undefined)} />
      <Confirmacion abierto={!!borrarPregunta} alCerrar={() => setBorrarPregunta(null)} titulo="¿Eliminar pregunta?" peligro textoConfirmar="Eliminar"
        descripcion="La pregunta dejará de aparecer en evaluaciones nuevas. Las evaluaciones ya enviadas conservan sus respuestas."
        alConfirmar={() => (borrarPregunta ? eliminar(() => api.eliminarPregunta(borrarPregunta.id), 'Pregunta eliminada') : undefined)} />
    </div>
  )
}
