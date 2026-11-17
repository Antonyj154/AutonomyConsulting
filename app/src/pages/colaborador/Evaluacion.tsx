import { ArrowLeft, Check, CheckCircle2, Loader2 } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { toast } from 'sonner'
import { Confirmacion } from '@/components/Dialogo'
import { Aviso, Boton, Cargando, Rotulo, Tarjeta } from '@/components/ui'
import { api } from '@/lib/api'
import type { MiEvaluacion, Posicion, PreguntaEvaluacion } from '@/lib/tipos'
import { useCarga } from '@/lib/useCarga'
import { cn, fechaHora, mensajeError, textoConsentimiento } from '@/lib/utilidades'

function PantallaConsentimiento({ ev, alIniciar }: { ev: MiEvaluacion; alIniciar: () => Promise<void> }) {
  const [acepto, setAcepto] = useState(false)
  const [iniciando, setIniciando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  if (!ev.consentimiento) return <Aviso tono="ambar">La evaluación aún no está configurada. Contacta a tu administrador.</Aviso>

  async function iniciar() {
    setIniciando(true)
    setError(null)
    try {
      await api.iniciarEvaluacion(ev.consentimiento!.id)
      await alIniciar()
    } catch (e) {
      setError(mensajeError(e))
      setIniciando(false)
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="space-y-3">
        <Rotulo>Antes de comenzar</Rotulo>
        <h1 className="text-3xl font-medium tracking-tight text-tinta sm:text-4xl">Consentimiento para el tratamiento de datos personales</h1>
      </div>
      <Tarjeta className="p-5 sm:p-7">
        <div className="max-h-[50dvh] overflow-y-auto pr-1 text-[15px] leading-relaxed whitespace-pre-wrap text-tinta" tabIndex={0}>
          {textoConsentimiento(ev.consentimiento.texto, ev.empresa_nombre)}
        </div>
      </Tarjeta>
      <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-borde bg-white p-4">
        <input type="checkbox" checked={acepto} onChange={(e) => setAcepto(e.target.checked)} className="mt-0.5 h-5 w-5 shrink-0 accent-[var(--color-marca-600)]" />
        <span className="text-[15px] text-tinta">Acepto. He leído esta información y autorizo el tratamiento de mis datos para los fines indicados.</span>
      </label>
      {error && <Aviso tono="rojo">{error}</Aviso>}
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
        <Link to="/mi" className="inline-flex h-12 items-center justify-center gap-2 rounded-full px-5 text-sm font-medium text-suave hover:bg-slate-100"><ArrowLeft className="h-4 w-4" /> Volver</Link>
        <Boton variante="marca" tamano="lg" disabled={!acepto} cargando={iniciando} onClick={iniciar}>Comenzar evaluación</Boton>
      </div>
    </div>
  )
}

/** Una pregunta = una fila con exactamente tres opciones horizontales de selección única. */
function Pregunta({ p, numero, resaltada, alElegir }: { p: PreguntaEvaluacion; numero: number; resaltada: boolean; alElegir: (posicion: Posicion) => void }) {
  const opciones: [Posicion, string][] = [[1, p.etiqueta_izquierda], [2, p.etiqueta_centro], [3, p.etiqueta_derecha]]
  return (
    <fieldset id={`p-${p.pregunta_id}`} className={cn('scroll-mt-40 px-4 py-5 sm:px-6', resaltada && 'bg-amber-50/70')}>
      <legend className="float-left mb-3 w-full text-[15px] leading-snug text-tinta sm:text-base">
        <span className="mr-2 font-mono text-xs text-tenue">{String(numero).padStart(2, '0')}</span>
        {p.texto}
      </legend>
      <div className="clear-both grid grid-cols-3 gap-2">
        {opciones.map(([posicion, texto]) => {
          const elegida = p.posicion === posicion
          return (
            <label key={posicion} className={cn(
              'relative flex min-h-12 cursor-pointer items-center justify-center rounded-xl border px-2 py-2.5 text-center text-[13px] leading-tight transition-colors select-none sm:text-sm',
              'has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-marca-600',
              elegida ? 'border-marca-600 bg-marca-600 font-medium text-white' : 'border-borde bg-white text-suave hover:border-marca-500 hover:bg-marca-50 hover:text-tinta')}>
              <input type="radio" name={`p-${p.pregunta_id}`} value={posicion} checked={elegida} onChange={() => alElegir(posicion)} className="sr-only" />
              {texto}
            </label>
          )
        })}
      </div>
    </fieldset>
  )
}

function Formulario({ ev, alCambiar, alFinalizar }: { ev: MiEvaluacion; alCambiar: (ev: MiEvaluacion) => void; alFinalizar: () => Promise<void> }) {
  const [pendientes, setPendientes] = useState(0)
  const [resaltar, setResaltar] = useState(false)
  const [confirmar, setConfirmar] = useState(false)
  const actual = useRef(ev)
  useEffect(() => {
    actual.current = ev
  })

  const total = ev.preguntas.length
  const respondidas = ev.preguntas.filter((p) => p.posicion !== null).length
  const porcentaje = total ? Math.round((respondidas / total) * 100) : 0
  const bloques = useMemo(() => {
    const mapa = new Map<number, { nombre: string; preguntas: { p: PreguntaEvaluacion; numero: number }[] }>()
    ev.preguntas.forEach((p, i) => {
      if (!mapa.has(p.bloque_orden)) mapa.set(p.bloque_orden, { nombre: p.bloque, preguntas: [] })
      mapa.get(p.bloque_orden)!.preguntas.push({ p, numero: i + 1 })
    })
    return [...mapa.values()]
  }, [ev.preguntas])

  useEffect(() => {
    window.scrollTo(0, 0)
  }, [])

  // Evita perder respuestas: avisa si se intenta cerrar la pestaña mientras algo se está guardando.
  useEffect(() => {
    if (pendientes === 0) return
    const avisar = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener('beforeunload', avisar)
    return () => window.removeEventListener('beforeunload', avisar)
  }, [pendientes])

  const fijar = (id: string, posicion: Posicion | null) =>
    alCambiar({ ...actual.current, preguntas: actual.current.preguntas.map((p) => (p.pregunta_id === id ? { ...p, posicion } : p)) })

  async function elegir(p: PreguntaEvaluacion, posicion: Posicion) {
    if (p.posicion === posicion) return
    const anterior = p.posicion
    fijar(p.pregunta_id, posicion)          // se muestra de inmediato…
    setPendientes((n) => n + 1)
    try {
      await api.guardarRespuesta(p.pregunta_id, posicion)   // …y se guarda en el servidor
    } catch (e) {
      fijar(p.pregunta_id, anterior)
      toast.error(`No se pudo guardar tu respuesta. ${mensajeError(e)}`)
    } finally {
      setPendientes((n) => n - 1)
    }
  }

  function intentarEnviar() {
    const primera = ev.preguntas.find((p) => p.posicion === null)
    if (primera) {
      setResaltar(true)
      toast.error(`Te faltan ${total - respondidas} ${total - respondidas === 1 ? 'pregunta' : 'preguntas'} por responder.`)
      document.getElementById(`p-${primera.pregunta_id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      return
    }
    if (pendientes > 0) return void toast.info('Espera un momento: se están guardando tus respuestas.')
    setConfirmar(true)
  }

  async function finalizar() {
    try {
      await api.finalizarEvaluacion()
      await alFinalizar()
    } catch (e) {
      toast.error(mensajeError(e))
    }
  }

  return (
    <div className="mx-auto max-w-3xl">
      <div className="sticky top-16 z-20 -mx-4 border-b border-borde bg-fondo/90 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6">
        <div className="flex items-center justify-between gap-3 text-sm">
          <span className="font-medium text-tinta tabular-nums">{respondidas} de {total} respondidas</span>
          <span className="inline-flex items-center gap-1.5 text-[13px] text-suave" role="status">
            {pendientes > 0 ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Guardando…</> : respondidas > 0 ? <><Check className="h-3.5 w-3.5 text-marca-600" /> Avance guardado</> : 'Sin límite de tiempo'}
          </span>
        </div>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-200" role="progressbar" aria-valuenow={porcentaje} aria-valuemin={0} aria-valuemax={100} aria-label="Avance de la evaluación">
          <div className="h-full rounded-full bg-marca-600 transition-[width] duration-300" style={{ width: `${porcentaje}%` }} />
        </div>
      </div>

      <div className="space-y-6 pt-8">
        <div className="space-y-2">
          <Rotulo>{ev.empresa_nombre}</Rotulo>
          <h1 className="text-3xl font-medium tracking-tight text-tinta sm:text-4xl">Evaluación</h1>
          <p className="text-[15px] text-suave">Elige una opción por pregunta. No hay respuestas correctas ni incorrectas.</p>
        </div>

        {bloques.map((b, i) => (
          <Tarjeta key={i} className="overflow-hidden">
            <div className="border-b border-borde bg-slate-50/60 px-4 py-3.5 sm:px-6">
              <p className="font-mono text-[11px] tracking-[0.14em] text-suave uppercase">Bloque {i + 1} de {bloques.length}</p>
              <h2 className="mt-0.5 text-xl font-medium tracking-tight text-tinta">{b.nombre}</h2>
            </div>
            <div className="divide-y divide-borde">
              {b.preguntas.map(({ p, numero }) => (
                <Pregunta key={p.pregunta_id} p={p} numero={numero} resaltada={resaltar && p.posicion === null} alElegir={(pos) => void elegir(p, pos)} />
              ))}
            </div>
          </Tarjeta>
        ))}

        <Tarjeta className="flex flex-col items-start gap-4 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
          <div>
            <p className="text-base font-medium text-tinta">{respondidas === total ? 'Respondiste todas las preguntas' : `Te faltan ${total - respondidas} ${total - respondidas === 1 ? 'pregunta' : 'preguntas'}`}</p>
            <p className="text-sm text-suave">Una vez enviada, la evaluación no se puede modificar.</p>
          </div>
          <Boton variante="marca" tamano="lg" onClick={intentarEnviar} className="w-full sm:w-auto">Enviar evaluación</Boton>
        </Tarjeta>
      </div>

      <Confirmacion abierto={confirmar} alCerrar={() => setConfirmar(false)} titulo="¿Enviar tu evaluación?" textoConfirmar="Sí, enviar"
        descripcion="Respondiste todas las preguntas. Después de enviarla no podrás cambiar tus respuestas."
        alConfirmar={finalizar} />
    </div>
  )
}

export default function Evaluacion() {
  const { datos: ev, cargando, error, recargar, setDatos } = useCarga(() => api.miEvaluacion())

  if (cargando) return <Cargando />
  if (error || !ev) return <Aviso tono="rojo">{error}</Aviso>
  if (ev.estado === 'pendiente' && !ev.cupo_disponible) return <Navigate to="/mi" replace />
  if (ev.estado === 'pendiente') return <PantallaConsentimiento ev={ev} alIniciar={recargar} />
  if (ev.estado === 'en_progreso') return <Formulario ev={ev} alCambiar={setDatos} alFinalizar={recargar} />

  return (
    <div className="mx-auto max-w-xl py-10 text-center">
      <CheckCircle2 className="mx-auto h-12 w-12 text-marca-600" aria-hidden />
      <h1 className="mt-5 text-3xl font-medium tracking-tight text-tinta sm:text-4xl">¡Evaluación enviada!</h1>
      <p className="mt-3 text-[15px] text-suave">Recibimos tus respuestas el {fechaHora(ev.finalizada_en)}. Gracias por tu tiempo; ya puedes cerrar la sesión.</p>
      <Link to="/mi" className="mt-6 inline-flex h-10 items-center justify-center rounded-full border border-borde bg-white px-4 text-sm font-medium text-tinta hover:bg-slate-50">Volver al inicio</Link>
    </div>
  )
}
