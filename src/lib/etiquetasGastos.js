// src/lib/etiquetasGastos.js
// Etiquetas para los gastos de la solapa Pagos (columna S de PAGOS) y el mes al que corresponde cada
// gasto (columna T, "aaaa-mm"). Con la etiqueta, el reporte mensual y las estadísticas pueden sumar los
// gastos por concepto (sueldos, alquiler, impuestos…) aunque la descripción esté escrita de otra forma.
// Para agregar una etiqueta: sumala a su grupo acá (y, si querés que se reconozca sola, una palabra en CLAVES).

export const GRUPOS_GASTO = [
  { grupo: 'Sueldos y cargas', etiquetas: [
    'Sueldo Stefi', 'Sueldo Brenda', 'Sueldo Adrián', 'Sueldo Jorge',
    'Bono presentismo Stefi', 'Bono presentismo Brenda', 'Bono fin de semana Stefi', 'Bono fin de semana Brenda',
    'Horas extra y partidos', 'Impuesto 931 empleadores', 'Obra social y sindicato',
  ] },
  { grupo: 'Local', etiquetas: [
    'Alquiler local', 'Servicios local', 'Servicios depto abuela', 'Mantenimiento y arreglos',
    'Muebles y equipamiento', 'Insumos y limpieza', 'Comida y bebida', 'Publicidad y carteles',
  ] },
  { grupo: 'Impuestos y administración', etiquetas: ['Monotributo', 'Contador', 'Comisiones e impuestos', 'Tarjeta (reintegro a Adrián)'] },
  { grupo: 'Socios', etiquetas: ['Regalías hermanos'] },
  { grupo: 'Otros', etiquetas: ['Flete', 'Otro'] },
]
export const ETIQUETAS_GASTO = GRUPOS_GASTO.flatMap(g => g.etiquetas)
export const grupoDeEtiqueta = e => (GRUPOS_GASTO.find(g => g.etiquetas.includes(e)) || { grupo: 'Sin etiqueta' }).grupo

const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
// [palabras que tienen que estar todas, etiqueta] — se prueban en orden
const CLAVES = [
  [['presentismo', 'stef'], 'Bono presentismo Stefi'], [['presentismo', 'bren'], 'Bono presentismo Brenda'],
  [['find', 'stef'], 'Bono fin de semana Stefi'], [['find', 'bren'], 'Bono fin de semana Brenda'],
  [['fin de semana', 'stef'], 'Bono fin de semana Stefi'], [['fin de semana', 'bren'], 'Bono fin de semana Brenda'],
  [['sueldo', 'stef'], 'Sueldo Stefi'], [['sueldo', 'bren'], 'Sueldo Brenda'], [['sueldo', 'adri'], 'Sueldo Adrián'], [['sueldo', 'jorge'], 'Sueldo Jorge'],
  [['feriado'], 'Horas extra y partidos'], [['partido'], 'Horas extra y partidos'], [['hora', 'extra'], 'Horas extra y partidos'],
  [['931'], 'Impuesto 931 empleadores'], [['osecac'], 'Obra social y sindicato'], [['sindicato'], 'Obra social y sindicato'], [['federacion'], 'Obra social y sindicato'], [['obra social'], 'Obra social y sindicato'],
  [['alquiler'], 'Alquiler local'], [['abuela'], 'Servicios depto abuela'],
  [['luz'], 'Servicios local'], [['edesur'], 'Servicios local'], [['internet'], 'Servicios local'], [['agua'], 'Servicios local'], [['aysa'], 'Servicios local'], [['metrogas'], 'Servicios local'], [['abl'], 'Servicios local'],
  [['monotributo'], 'Monotributo'], [['contador'], 'Contador'], [['regalia'], 'Regalías hermanos'],
  [['flete'], 'Flete'], [['envio'], 'Flete'], [['comision'], 'Comisiones e impuestos'], [['ganancias'], 'Comisiones e impuestos'],
  [['panader'], 'Comida y bebida'], [['pizza'], 'Comida y bebida'], [['galletit'], 'Comida y bebida'], [['pastelit'], 'Comida y bebida'], [['azucar'], 'Comida y bebida'], [['cafe'], 'Comida y bebida'],
  [['limpi'], 'Insumos y limpieza'], [['lavandina'], 'Insumos y limpieza'], [['desodorante'], 'Insumos y limpieza'], [['papel'], 'Insumos y limpieza'], [['escoba'], 'Insumos y limpieza'], [['bolsa'], 'Insumos y limpieza'], [['precinto'], 'Insumos y limpieza'], [['supermercado'], 'Insumos y limpieza'],
  [['cartel'], 'Publicidad y carteles'], [['bandera'], 'Publicidad y carteles'],
  [['silla'], 'Muebles y equipamiento'], [['alfombra'], 'Muebles y equipamiento'], [['caloventor'], 'Muebles y equipamiento'], [['portaprecio'], 'Muebles y equipamiento'], [['estante'], 'Muebles y equipamiento'], [['madera'], 'Mantenimiento y arreglos'],
  [['ferreter'], 'Mantenimiento y arreglos'], [['vidrio'], 'Mantenimiento y arreglos'], [['pintur'], 'Mantenimiento y arreglos'], [['arreglo'], 'Mantenimiento y arreglos'],
  [['tarjeta'], 'Tarjeta (reintegro a Adrián)'],
]
// Etiqueta sugerida para una descripción ('' si no reconoce nada)
export function sugerirEtiqueta(descripcion) {
  const d = norm(descripcion)
  if (!d) return ''
  const c = CLAVES.find(([pal]) => pal.every(p => d.includes(p)))
  return c ? c[1] : ''
}

// Gastos que se pagan a mes vencido: por defecto corresponden al mes ANTERIOR al del pago
export const ETIQUETAS_MES_VENCIDO = new Set([
  'Sueldo Stefi', 'Sueldo Brenda', 'Sueldo Adrián', 'Sueldo Jorge',
  'Bono presentismo Stefi', 'Bono presentismo Brenda', 'Bono fin de semana Stefi', 'Bono fin de semana Brenda',
  'Horas extra y partidos', 'Impuesto 931 empleadores', 'Obra social y sindicato',
  'Alquiler local', 'Servicios local', 'Servicios depto abuela', 'Contador',
])

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
// Mes al que corresponde un gasto (criterio de lo devengado):
//  · si la descripción nombra un mes ("sueldo adrian abril"), ese mes (del año del pago, o del anterior
//    si el mes nombrado es posterior al del pago);
//  · si la etiqueta es de las que se pagan a mes vencido (sueldos, alquiler, servicios, contador…), el mes anterior al pago;
//  · si no, el mes del pago.
export function sugerirMes(descripcion, fechaPago, etiqueta = '') {
  const p = String(fechaPago || '').replace(/^'/, '').split('/').map(Number)
  const a = p[2], m = p[1]
  if (!a || !m) return ''
  const d = norm(descripcion)
  const i = MESES.findIndex(n => new RegExp(`\\b${n}\\b`).test(d))
  if (i >= 0) { const mm = i + 1; return `${mm > m ? a - 1 : a}-${String(mm).padStart(2, '0')}` }
  if (ETIQUETAS_MES_VENCIDO.has(etiqueta)) return m === 1 ? `${a - 1}-12` : `${a}-${String(m - 1).padStart(2, '0')}`
  return `${a}-${String(m).padStart(2, '0')}`
}
export const nombreMesGasto = k => { if (!/^\d{4}-\d{2}$/.test(k || '')) return ''; const [a, m] = k.split('-'); return `${MESES[Number(m) - 1]} ${a}` }
// Últimos n meses hasta el siguiente al de hoy, para el selector "Corresponde a"
export function mesesParaElegir(n = 14) {
  const d = new Date(Date.now() - 3 * 3600000)
  const out = []
  for (let i = -1; i < n - 1; i++) { const t = d.getUTCFullYear() * 12 + d.getUTCMonth() - i; out.push(`${Math.floor(t / 12)}-${String(t % 12 + 1).padStart(2, '0')}`) }
  return out
}
