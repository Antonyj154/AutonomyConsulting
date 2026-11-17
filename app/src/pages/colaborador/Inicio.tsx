import { ArrowRight, CheckCircle2 } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Aviso, Cargando, Rotulo, Tarjeta } from '@/components/ui'
import { api } from '@/lib/api'
import { useSesion } from '@/lib/sesion'
import { useCarga } from '@/lib/useCarga'
import { fechaHora } from '@/lib/utilidades'

const enlaceBoton = 'inline-flex h-12 items-center justify-center gap-2 rounded-full bg-marca-600 px-6 text-base font-medium text-white transition-colors hover:bg-marca-700'

export default function Inicio() {
  const { sesion } = useSesion()
  const { datos: ev, cargando, error } = useCarga(() => api.miEvaluacion())
  const nombre = sesion?.nombres.split(' ')[0] ?? ''
  const respondidas = ev?.preguntas.filter((p) => p.posicion !== null).length ?? 0

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <div className="space-y-3">
        <Rotulo>{sesion?.empresa_nombre ?? 'Evaluación'}</Rotulo>
        <h1 className="text-4xl leading-[1.05] font-medium tracking-tight text-tinta sm:text-5xl">
          Hola, <span className="text-marca-600">{nombre}.</span>
        </h1>
      </div>

      {cargando ? <Cargando /> : error || !ev ? <Aviso tono="rojo">{error}</Aviso> : ev.estado === 'finalizada' ? (
        <Tarjeta className="space-y-3 p-6 sm:p-8">
          <CheckCircle2 className="h-9 w-9 text-marca-600" aria-hidden />
          <h2 className="text-2xl font-medium tracking-tight text-tinta">Tu evaluación fue enviada</h2>
          <p className="text-[15px] text-suave">La recibimos el {fechaHora(ev.finalizada_en)}. No necesitas hacer nada más. ¡Gracias por tu tiempo!</p>
        </Tarjeta>
      ) : !ev.cupo_disponible ? (
        <Tarjeta className="space-y-3 p-6 sm:p-8">
          <h2 className="text-2xl font-medium tracking-tight text-tinta">La evaluación no está disponible por ahora</h2>
          <p className="text-[15px] text-suave">Tu empresa no tiene evaluaciones disponibles en este momento. Contacta a tu administrador para que la habilite.</p>
        </Tarjeta>
      ) : ev.estado === 'en_progreso' ? (
        <Tarjeta className="space-y-5 p-6 sm:p-8">
          <div className="space-y-2">
            <h2 className="text-2xl font-medium tracking-tight text-tinta">Tienes una evaluación en curso</h2>
            <p className="text-[15px] text-suave">Llevas {respondidas} de {ev.preguntas.length} preguntas. Tu avance está guardado.</p>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-slate-100">
            <div className="h-full rounded-full bg-marca-600" style={{ width: `${ev.preguntas.length ? (respondidas / ev.preguntas.length) * 100 : 0}%` }} />
          </div>
          <Link to="/mi/evaluacion" className={enlaceBoton}>Continuar evaluación <ArrowRight className="h-4 w-4" /></Link>
        </Tarjeta>
      ) : (
        <Tarjeta className="space-y-5 p-6 sm:p-8">
          <div className="space-y-2">
            <h2 className="text-2xl font-medium tracking-tight text-tinta">Tu evaluación está lista</h2>
            <p className="text-[15px] text-suave">Responde con sinceridad: no hay respuestas correctas ni incorrectas.</p>
          </div>
          <ul className="space-y-2 text-[15px] text-suave">
            <li className="flex gap-2.5"><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-marca-500" />Sin límite de tiempo.</li>
            <li className="flex gap-2.5"><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-marca-500" />Tu avance se guarda automáticamente: puedes salir y continuar después.</li>
            <li className="flex gap-2.5"><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-marca-500" />Cada pregunta tiene tres opciones; elige una.</li>
          </ul>
          <Link to="/mi/evaluacion" className={enlaceBoton}>Iniciar evaluación <ArrowRight className="h-4 w-4" /></Link>
        </Tarjeta>
      )}
    </div>
  )
}
