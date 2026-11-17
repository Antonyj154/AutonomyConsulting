import * as AlertDialog from '@radix-ui/react-alert-dialog'
import * as Dialog from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import type { ReactNode } from 'react'
import { useState } from 'react'
import { Boton } from '@/components/ui'
import { cn } from '@/lib/utilidades'

const fondo = 'fixed inset-0 z-40 bg-slate-900/40 backdrop-blur-[2px]'
const caja =
  'fixed top-1/2 left-1/2 z-50 max-h-[92dvh] w-[calc(100vw-2rem)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-tarjeta border border-borde bg-white p-6 shadow-xl focus:outline-none aparecer'

interface PropsModal {
  abierto: boolean
  alCerrar: () => void
  titulo: string
  descripcion?: string
  ancho?: 'sm' | 'md' | 'lg'
  children: ReactNode
}

export function Modal({ abierto, alCerrar, titulo, descripcion, ancho = 'md', children }: PropsModal) {
  const anchos = { sm: 'max-w-md', md: 'max-w-xl', lg: 'max-w-3xl' }
  return (
    <Dialog.Root open={abierto} onOpenChange={(o) => !o && alCerrar()}>
      <Dialog.Portal>
        <Dialog.Overlay className={fondo} />
        <Dialog.Content className={cn(caja, anchos[ancho])}>
          <div className="mb-5 flex items-start justify-between gap-4">
            <div className="space-y-1">
              <Dialog.Title className="text-xl font-medium tracking-tight text-tinta">{titulo}</Dialog.Title>
              <Dialog.Description className={cn('text-sm text-suave', !descripcion && 'sr-only')}>
                {descripcion ?? titulo}
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <Boton variante="fantasma" tamano="icono" aria-label="Cerrar">
                <X className="h-4 w-4" />
              </Boton>
            </Dialog.Close>
          </div>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

interface PropsConfirmacion {
  abierto: boolean
  alCerrar: () => void
  titulo: string
  descripcion: ReactNode
  textoConfirmar: string
  peligro?: boolean
  alConfirmar: () => Promise<void> | void
}

/** Confirmación obligatoria antes de operaciones sensibles. */
export function Confirmacion({ abierto, alCerrar, titulo, descripcion, textoConfirmar, peligro, alConfirmar }: PropsConfirmacion) {
  const [ocupado, setOcupado] = useState(false)
  async function confirmar() {
    setOcupado(true)
    try {
      await alConfirmar()
      alCerrar()
    } finally {
      setOcupado(false)
    }
  }
  return (
    <AlertDialog.Root open={abierto} onOpenChange={(o) => !o && !ocupado && alCerrar()}>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className={fondo} />
        <AlertDialog.Content className={cn(caja, 'max-w-md')}>
          <AlertDialog.Title className="text-xl font-medium tracking-tight text-tinta">{titulo}</AlertDialog.Title>
          <AlertDialog.Description asChild>
            <div className="mt-2 text-sm leading-relaxed text-suave">{descripcion}</div>
          </AlertDialog.Description>
          <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Boton variante="secundario" onClick={alCerrar} disabled={ocupado}>Cancelar</Boton>
            <Boton variante={peligro ? 'peligro' : 'primario'} onClick={confirmar} cargando={ocupado}>{textoConfirmar}</Boton>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  )
}
