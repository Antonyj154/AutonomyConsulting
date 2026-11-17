import { ArrowRight } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Aviso, Cargando, Encabezado, Indicador, Tarjeta } from '@/components/ui'
import { api } from '@/lib/api'
import { useCarga } from '@/lib/useCarga'

function Barra({ valor, total, etiqueta }: { valor: number; total: number; etiqueta: string }) {
  const porcentaje = total > 0 ? Math.min(100, Math.round((valor / total) * 100)) : 0
  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between text-sm">
        <span className="text-suave">{etiqueta}</span>
        <span className="font-medium text-tinta tabular-nums">{valor} de {total} · {porcentaje}%</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-valuenow={porcentaje} aria-valuemin={0} aria-valuemax={100} aria-label={etiqueta}>
        <div className="h-full rounded-full bg-marca-600 transition-[width] duration-500" style={{ width: `${porcentaje}%` }} />
      </div>
    </div>
  )
}

export default function Resumen() {
  const { datos: p, cargando, error } = useCarga(() => api.panelEmpresa())

  return (
    <div className="space-y-8">
      <Encabezado rotulo="Portal de empresa" titulo={p?.empresa_nombre ?? 'Resumen'}
        descripcion="Seguimiento de tus colaboradores, sus evaluaciones y el uso de tu plan de informes." />

      {cargando ? <Cargando /> : error || !p ? <Aviso tono="rojo">{error}</Aviso> : (
        <>
          {p.informes_disponibles === 0 && (
            <Aviso tono="ambar">Tu plan no tiene informes disponibles. Los colaboradores no podrán iniciar nuevas evaluaciones hasta que se amplíe el plan.</Aviso>
          )}

          <section className="space-y-3" aria-label="Colaboradores">
            <h2 className="font-mono text-[11px] tracking-[0.14em] text-suave uppercase">Colaboradores</h2>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
              <Indicador etiqueta="Total" valor={p.total} />
              <Indicador etiqueta="Activos" valor={p.activos} />
              <Indicador etiqueta="Inactivos" valor={p.inactivos} />
              <Indicador etiqueta="Evaluaciones realizadas" valor={p.realizadas} />
              <Indicador etiqueta="Evaluaciones pendientes" valor={p.pendientes} detalle={p.en_progreso ? `${p.en_progreso} en curso` : undefined} />
            </div>
          </section>

          <section className="space-y-3" aria-label="Plan de informes">
            <h2 className="font-mono text-[11px] tracking-[0.14em] text-suave uppercase">Plan de informes</h2>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Indicador etiqueta="Contratados" valor={p.informes_contratados} />
              <Indicador etiqueta="Utilizados" valor={p.informes_utilizados} detalle="Evaluaciones finalizadas" />
              <Indicador etiqueta="Disponibles" valor={p.informes_disponibles} detalle="Contratados − utilizados" destacado />
              <Indicador etiqueta="Listos para descargar" valor={p.informes_descargables} detalle="Informes en PDF" />
            </div>
          </section>

          <Tarjeta className="space-y-5 p-6">
            <Barra etiqueta="Avance de evaluaciones" valor={p.realizadas} total={p.realizadas + p.pendientes} />
            <Barra etiqueta="Uso del plan" valor={p.informes_utilizados} total={p.informes_contratados} />
            <Link to="/empresa/colaboradores" className="inline-flex items-center gap-1.5 text-sm font-medium text-marca-700 hover:text-marca-800">
              Administrar colaboradores <ArrowRight className="h-4 w-4" />
            </Link>
          </Tarjeta>
        </>
      )}
    </div>
  )
}
