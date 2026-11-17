// Lectura y generación de archivos Excel. La librería se carga solo cuando se necesita.
import type { Exportacion, FilaImportacion } from '@/lib/tipos'
import { codigoPregunta, esCorreo, fechaHora } from '@/lib/utilidades'

const COLUMNAS = ['Primer nombre *', 'Segundo nombre', 'Primer apellido *', 'Segundo apellido *', 'Cargo', 'Correo electrónico *']
const MAXIMO_FILAS = 1000
const MAXIMO_BYTES = 2 * 1024 * 1024
const TIPO_XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

async function nuevoLibro() {
  const { default: ExcelJS } = await import('exceljs')
  return new ExcelJS.Workbook()
}

function descargar(contenido: ArrayBuffer, nombre: string): void {
  const enlace = document.createElement('a')
  enlace.href = URL.createObjectURL(new Blob([contenido], { type: TIPO_XLSX }))
  enlace.download = nombre
  document.body.appendChild(enlace)
  enlace.click()
  enlace.remove()
  setTimeout(() => URL.revokeObjectURL(enlace.href), 2000)
}

/** Evita que Excel interprete como fórmula un texto que empiece con = + - @ */
const seguro = (v: string | null | undefined): string => {
  const t = v ?? ''
  return /^[=+\-@\t\r]/.test(t) ? `'${t}` : t
}

export async function descargarPlantilla(): Promise<void> {
  const libro = await nuevoLibro()
  const hoja = libro.addWorksheet('Colaboradores')
  hoja.addRow(COLUMNAS)
  hoja.getRow(1).font = { bold: true }
  hoja.columns = COLUMNAS.map(() => ({ width: 26 }))
  hoja.views = [{ state: 'frozen', ySplit: 1 }]

  const ayuda = libro.addWorksheet('Instrucciones')
  ayuda.columns = [{ width: 110 }]
  ;[
    'Cómo llenar la plantilla',
    '',
    '1. Escribe un colaborador por fila en la hoja "Colaboradores", a partir de la fila 2.',
    '2. Las columnas marcadas con * son obligatorias: primer nombre, primer apellido, segundo apellido y correo electrónico.',
    '3. Segundo nombre y cargo son opcionales.',
    '4. No cambies el orden ni el nombre de las columnas.',
    '5. El usuario de cada colaborador se genera automáticamente al cargar el archivo.',
    `6. Máximo ${MAXIMO_FILAS} colaboradores por archivo.`,
  ].forEach((linea) => ayuda.addRow([linea]))
  ayuda.getRow(1).font = { bold: true, size: 13 }

  descargar(await libro.xlsx.writeBuffer(), 'plantilla-colaboradores.xlsx')
}

export interface LecturaPlantilla {
  filas: FilaImportacion[]
  errores: { fila: number; error: string }[]
}

function celda(valor: unknown): string {
  if (valor === null || valor === undefined) return ''
  if (typeof valor === 'object') {
    const v = valor as { text?: unknown; result?: unknown; richText?: { text: string }[] }
    if (typeof v.text === 'string') return v.text.trim()                       // hipervínculos (correos)
    if (Array.isArray(v.richText)) return v.richText.map((r) => r.text).join('').trim()
    if (v.result !== undefined) return String(v.result).trim()
    return ''
  }
  return String(valor).trim()
}

export async function leerPlantilla(archivo: File): Promise<LecturaPlantilla> {
  if (!archivo.name.toLowerCase().endsWith('.xlsx')) throw new Error('El archivo debe ser un Excel (.xlsx). Descarga la plantilla y vuelve a intentarlo.')
  if (archivo.size > MAXIMO_BYTES) throw new Error('El archivo supera los 2 MB permitidos.')
  const libro = await nuevoLibro()
  try {
    await libro.xlsx.load(await archivo.arrayBuffer())
  } catch {
    throw new Error('No se pudo leer el archivo. Verifica que sea la plantilla en formato .xlsx.')
  }
  const hoja = libro.getWorksheet('Colaboradores') ?? libro.worksheets[0]
  if (!hoja) throw new Error('El archivo no contiene hojas.')
  const encabezado = COLUMNAS.map((_, i) => celda(hoja.getRow(1).getCell(i + 1).value).toLowerCase())
  if (!encabezado[0].startsWith('primer nombre') || !encabezado[5].startsWith('correo')) {
    throw new Error('Las columnas no coinciden con la plantilla. Descárgala de nuevo y copia tus datos en ella.')
  }

  const resultado: LecturaPlantilla = { filas: [], errores: [] }
  const correos = new Set<string>()
  for (let n = 2; n <= hoja.rowCount; n++) {
    const v = COLUMNAS.map((_, i) => celda(hoja.getRow(n).getCell(i + 1).value))
    if (v.every((x) => !x)) continue
    if (resultado.filas.length >= MAXIMO_FILAS) throw new Error(`El archivo supera el máximo de ${MAXIMO_FILAS} colaboradores.`)
    const [primer_nombre, segundo_nombre, primer_apellido, segundo_apellido, cargo, correoCrudo] = v
    const correo = correoCrudo.toLowerCase()
    if (!primer_nombre || !primer_apellido || !segundo_apellido) resultado.errores.push({ fila: n, error: 'Faltan nombres o apellidos obligatorios.' })
    else if (!esCorreo(correo)) resultado.errores.push({ fila: n, error: 'El correo no es válido.' })
    else if (correos.has(correo)) resultado.errores.push({ fila: n, error: 'El correo está repetido en el archivo.' })
    else {
      correos.add(correo)
      resultado.filas.push({ fila: n, primer_nombre, segundo_nombre, primer_apellido, segundo_apellido, cargo, correo })
    }
  }
  return resultado
}

/** Excel de resultados: una fila por colaborador y una columna por pregunta (puntaje −1, 0 o 1). */
export async function descargarResultados(datos: Exportacion, empresa: string): Promise<void> {
  const libro = await nuevoLibro()
  const codigos = [...new Set(datos.preguntas.map((p) => p.codigo))]

  const hoja = libro.addWorksheet('Resultados')
  hoja.addRow(['Usuario', 'Nombre completo', 'Cargo', 'Correo electrónico', 'Fecha de evaluación', ...codigos.map(codigoPregunta)])
  hoja.getRow(1).font = { bold: true }
  hoja.views = [{ state: 'frozen', ySplit: 1, xSplit: 2 }]
  hoja.columns = [{ width: 16 }, { width: 34 }, { width: 26 }, { width: 32 }, { width: 22 }, ...codigos.map(() => ({ width: 8 }))]
  for (const c of datos.colaboradores) {
    hoja.addRow([seguro(c.usuario), seguro(c.nombre), seguro(c.cargo), seguro(c.correo), fechaHora(c.finalizada_en),
      ...codigos.map((codigo) => c.respuestas[String(codigo)]?.puntaje ?? '')])
  }

  const detalle = libro.addWorksheet('Detalle')
  detalle.addRow(['Usuario', 'Nombre completo', 'Código', 'Versión', 'Posición elegida (1-3)', 'Respuesta elegida', 'Puntaje'])
  detalle.getRow(1).font = { bold: true }
  detalle.columns = [{ width: 16 }, { width: 34 }, { width: 10 }, { width: 10 }, { width: 22 }, { width: 30 }, { width: 10 }]
  const versiones = new Map(datos.preguntas.map((p) => [`${p.codigo}-${p.version}`, p]))
  for (const c of datos.colaboradores) {
    for (const codigo of codigos) {
      const r = c.respuestas[String(codigo)]
      if (!r) continue
      const p = versiones.get(`${codigo}-${r.version}`)
      const etiqueta = p ? [p.etiqueta_izquierda, p.etiqueta_centro, p.etiqueta_derecha][r.posicion - 1] : ''
      detalle.addRow([seguro(c.usuario), seguro(c.nombre), codigoPregunta(codigo), r.version, r.posicion, seguro(etiqueta), r.puntaje])
    }
  }

  const catalogo = libro.addWorksheet('Preguntas')
  catalogo.addRow(['Código', 'Versión', 'Bloque', 'Pregunta', 'Rúbrica', 'Izquierda (1)', 'Centro (2)', 'Derecha (3)'])
  catalogo.getRow(1).font = { bold: true }
  catalogo.columns = [{ width: 10 }, { width: 10 }, { width: 24 }, { width: 70 }, { width: 12 }, { width: 24 }, { width: 24 }, { width: 24 }]
  for (const p of datos.preguntas) {
    catalogo.addRow([codigoPregunta(p.codigo), p.version, seguro(p.bloque), seguro(p.texto), p.rubrica === 'positivo' ? 'Positivo' : 'Negativo',
      seguro(p.etiqueta_izquierda), seguro(p.etiqueta_centro), seguro(p.etiqueta_derecha)])
  }

  const hoy = new Date().toISOString().slice(0, 10)
  const nombre = empresa.toLowerCase().normalize('NFD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'empresa'
  descargar(await libro.xlsx.writeBuffer(), `resultados-${nombre}-${hoy}.xlsx`)
}
