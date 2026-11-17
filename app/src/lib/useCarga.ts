import { useCallback, useEffect, useRef, useState } from 'react'
import { mensajeError } from '@/lib/utilidades'

/** Carga datos al entrar a una pantalla y expone estados de carga, error y recarga. */
export function useCarga<T>(cargar: () => Promise<T>) {
  const [datos, setDatos] = useState<T | null>(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const funcion = useRef(cargar)
  useEffect(() => {
    funcion.current = cargar
  })

  const recargar = useCallback(async () => {
    try {
      setDatos(await funcion.current())
      setError(null)
    } catch (e) {
      setError(mensajeError(e))
    } finally {
      setCargando(false)
    }
  }, [])

  useEffect(() => {
    void recargar()
  }, [recargar])

  return { datos, cargando, error, recargar, setDatos }
}
