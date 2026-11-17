import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Confirmacion } from '@/components/Dialogo'
import { AreaTexto, Aviso, Boton, Cargando, Encabezado, Insignia, Tarjeta } from '@/components/ui'
import { api } from '@/lib/api'
import { useCarga } from '@/lib/useCarga'
import { mensajeError, textoConsentimiento } from '@/lib/utilidades'

export default function Consentimiento() {
  const { datos, cargando, error, recargar } = useCarga(() => api.obtenerConsentimiento())
  const [texto, setTexto] = useState('')
  const [confirmar, setConfirmar] = useState(false)

  useEffect(() => {
    if (datos) setTexto(datos.texto)
  }, [datos])

  const cambio = texto.trim() !== (datos?.texto ?? '').trim()

  async function publicar() {
    try {
      await api.publicarConsentimiento(texto)
      toast.success('Nueva versión publicada')
      await recargar()
    } catch (err) {
      toast.error(mensajeError(err))
    }
  }

  return (
    <div className="space-y-8">
      <Encabezado rotulo="Datos personales" titulo="Consentimiento"
        descripcion="Texto que cada colaborador debe aceptar antes de iniciar su evaluación. Cada cambio crea una versión nueva y queda registrado cuál aceptó cada persona." />

      {cargando ? <Cargando /> : error ? <Aviso tono="rojo">{error}</Aviso> : (
        <div className="grid gap-4 lg:grid-cols-2">
          <Tarjeta className="space-y-4 p-6">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-medium text-tinta">Texto</h2>
              <Insignia tono="marca">Versión vigente: {datos?.version ?? '—'}</Insignia>
            </div>
            <AreaTexto etiqueta="Contenido del consentimiento" value={texto} onChange={(e) => setTexto(e.target.value)} rows={20} maxLength={20000}
              ayuda="Escribe {{empresa}} donde deba aparecer el nombre de la empresa del colaborador." className="min-h-96 font-sans" />
            <div className="flex flex-wrap justify-end gap-2">
              <Boton variante="secundario" disabled={!cambio} onClick={() => setTexto(datos?.texto ?? '')}>Descartar cambios</Boton>
              <Boton disabled={!cambio || texto.trim().length < 20} onClick={() => setConfirmar(true)}>Publicar nueva versión</Boton>
            </div>
          </Tarjeta>

          <Tarjeta className="p-6">
            <h2 className="text-lg font-medium text-tinta">Vista previa</h2>
            <p className="mt-1 text-[13px] text-suave">Así lo verá un colaborador de “Empresa Ejemplo”.</p>
            <div className="mt-4 max-h-[32rem] overflow-y-auto rounded-xl border border-borde bg-fondo p-5 text-[15px] leading-relaxed whitespace-pre-wrap text-tinta">
              {textoConsentimiento(texto, 'Empresa Ejemplo')}
            </div>
          </Tarjeta>
        </div>
      )}

      <Confirmacion abierto={confirmar} alCerrar={() => setConfirmar(false)} titulo="¿Publicar nueva versión?" textoConfirmar="Publicar"
        descripcion="Los colaboradores que aún no han iniciado verán este texto. Quienes ya aceptaron una versión anterior conservan el registro de la versión que aceptaron."
        alConfirmar={publicar} />
    </div>
  )
}
