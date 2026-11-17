// Componentes visuales base (estilo shadcn/ui: Tailwind + Radix, código propio y editable).
import { cva, type VariantProps } from 'class-variance-authority'
import { Loader2 } from 'lucide-react'
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react'
import { useId } from 'react'
import { cn } from '@/lib/utilidades'

const estilosBoton = cva(
  'inline-flex items-center justify-center gap-2 rounded-full font-medium whitespace-nowrap transition-colors disabled:opacity-50 select-none',
  {
    variants: {
      variante: {
        primario: 'bg-tinta text-white hover:bg-slate-700',
        marca: 'bg-marca-600 text-white hover:bg-marca-700',
        secundario: 'border border-borde bg-white text-tinta hover:bg-slate-50',
        fantasma: 'text-suave hover:bg-slate-100 hover:text-tinta',
        peligro: 'bg-red-600 text-white hover:bg-red-700',
      },
      tamano: {
        sm: 'h-8 px-3 text-[13px]',
        md: 'h-10 px-4 text-sm',
        lg: 'h-12 px-6 text-base',
        icono: 'h-8 w-8',
      },
    },
    defaultVariants: { variante: 'primario', tamano: 'md' },
  },
)

interface PropsBoton extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof estilosBoton> {
  cargando?: boolean
}

export function Boton({ className, variante, tamano, cargando, disabled, children, type = 'button', ...resto }: PropsBoton) {
  return (
    <button type={type} className={cn(estilosBoton({ variante, tamano }), className)} disabled={disabled || cargando} {...resto}>
      {cargando && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
      {children}
    </button>
  )
}

const baseCampo =
  'w-full rounded-xl border border-borde bg-white px-3.5 text-sm text-tinta placeholder:text-tenue transition-colors focus:border-marca-600 focus:outline-none focus:ring-4 focus:ring-marca-100 disabled:bg-slate-50 disabled:text-suave'

interface PropsCampo {
  etiqueta: string
  error?: string
  ayuda?: string
  opcional?: boolean
}

function Envoltura({ id, etiqueta, error, ayuda, opcional, children }: PropsCampo & { id: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="flex items-baseline justify-between text-[13px] font-medium text-tinta">
        <span>{etiqueta}</span>
        {opcional && <span className="font-normal text-tenue">Opcional</span>}
      </label>
      {children}
      {error ? (
        <p className="text-[13px] text-red-600" role="alert">{error}</p>
      ) : ayuda ? (
        <p className="text-[13px] text-suave">{ayuda}</p>
      ) : null}
    </div>
  )
}

export function Entrada({ etiqueta, error, ayuda, opcional, className, ...resto }: PropsCampo & InputHTMLAttributes<HTMLInputElement>) {
  const id = useId()
  return (
    <Envoltura id={id} etiqueta={etiqueta} error={error} ayuda={ayuda} opcional={opcional}>
      <input id={id} aria-invalid={!!error} className={cn(baseCampo, 'h-11', error && 'border-red-400', className)} {...resto} />
    </Envoltura>
  )
}

export function AreaTexto({ etiqueta, error, ayuda, opcional, className, ...resto }: PropsCampo & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const id = useId()
  return (
    <Envoltura id={id} etiqueta={etiqueta} error={error} ayuda={ayuda} opcional={opcional}>
      <textarea id={id} aria-invalid={!!error} className={cn(baseCampo, 'min-h-24 py-2.5 leading-relaxed', error && 'border-red-400', className)} {...resto} />
    </Envoltura>
  )
}

export function Selector({ etiqueta, error, ayuda, opcional, className, children, ...resto }: PropsCampo & SelectHTMLAttributes<HTMLSelectElement>) {
  const id = useId()
  return (
    <Envoltura id={id} etiqueta={etiqueta} error={error} ayuda={ayuda} opcional={opcional}>
      <select id={id} className={cn(baseCampo, 'h-11 pr-8', className)} {...resto}>{children}</select>
    </Envoltura>
  )
}

/** Selector compacto sin etiqueta visible, para barras de filtros. */
export function Filtro({ etiqueta, className, children, ...resto }: { etiqueta: string } & SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select aria-label={etiqueta} className={cn(baseCampo, 'h-10 w-auto rounded-full pr-8', className)} {...resto}>{children}</select>
  )
}

export function Tarjeta({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn('rounded-tarjeta border border-borde bg-white', className)}>{children}</div>
}

type Tono = 'neutro' | 'verde' | 'ambar' | 'rojo' | 'azul' | 'marca'
const tonos: Record<Tono, string> = {
  neutro: 'bg-slate-100 text-slate-600',
  verde: 'bg-emerald-50 text-emerald-700',
  ambar: 'bg-amber-50 text-amber-700',
  rojo: 'bg-red-50 text-red-700',
  azul: 'bg-sky-50 text-sky-700',
  marca: 'bg-marca-50 text-marca-800',
}

export function Insignia({ tono = 'neutro', children, className }: { tono?: Tono; children: ReactNode; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap', tonos[tono], className)}>
      <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" aria-hidden />
      {children}
    </span>
  )
}

/** Rótulo pequeño en mayúsculas sobre los títulos. */
export function Rotulo({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p className={cn('flex items-center gap-2 font-mono text-[11px] tracking-[0.14em] text-suave uppercase', className)}>
      <span className="h-1.5 w-1.5 rounded-full bg-marca-500" aria-hidden />
      {children}
    </p>
  )
}

export function Encabezado({ rotulo, titulo, descripcion, acciones }: { rotulo: string; titulo: string; descripcion?: string; acciones?: ReactNode }) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="space-y-2">
        <Rotulo>{rotulo}</Rotulo>
        <h1 className="text-3xl font-medium tracking-tight text-tinta sm:text-4xl">{titulo}</h1>
        {descripcion && <p className="max-w-2xl text-[15px] text-suave">{descripcion}</p>}
      </div>
      {acciones && <div className="flex flex-wrap items-center gap-2">{acciones}</div>}
    </div>
  )
}

export function Indicador({ etiqueta, valor, detalle, destacado }: { etiqueta: string; valor: ReactNode; detalle?: string; destacado?: boolean }) {
  return (
    <Tarjeta className={cn('p-5', destacado && 'border-marca-200 bg-marca-50/60')}>
      <p className="font-mono text-[11px] tracking-[0.12em] text-suave uppercase">{etiqueta}</p>
      <p className="mt-3 text-4xl font-medium tracking-tight text-tinta tabular-nums">{valor}</p>
      {detalle && <p className="mt-1 text-[13px] text-suave">{detalle}</p>}
    </Tarjeta>
  )
}

export function Cargando({ texto = 'Cargando…' }: { texto?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-16 text-sm text-suave" role="status">
      <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
      {texto}
    </div>
  )
}

export function Vacio({ titulo, descripcion, accion }: { titulo: string; descripcion?: string; accion?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 px-6 py-14 text-center">
      <p className="text-base font-medium text-tinta">{titulo}</p>
      {descripcion && <p className="max-w-md text-sm text-suave">{descripcion}</p>}
      {accion && <div className="mt-3">{accion}</div>}
    </div>
  )
}

export function Aviso({ tono = 'azul', children }: { tono?: 'azul' | 'ambar' | 'rojo' | 'verde'; children: ReactNode }) {
  const estilos = {
    azul: 'border-sky-200 bg-sky-50 text-sky-900',
    ambar: 'border-amber-200 bg-amber-50 text-amber-900',
    rojo: 'border-red-200 bg-red-50 text-red-900',
    verde: 'border-emerald-200 bg-emerald-50 text-emerald-900',
  }
  return <div className={cn('rounded-xl border px-4 py-3 text-sm leading-relaxed', estilos[tono])}>{children}</div>
}
