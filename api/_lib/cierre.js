// api/_lib/cierre.js
// Cálculos del cierre de mes (funciones puras, sin acceso a planillas).
//
// Reglas (acordadas con Adrián):
//  · Sueldo = horas × tarifa común vigente × factor. PARTIDO y FERIADO valen doble.
//    HOME OFFICE: 12 h por mes a tarifa común para Adrián; si ese mes hay una fila HOME OFFICE
//    cargada, se usa esa en lugar de las 12 automáticas.
//  · Jorge pasa sus horas por quincena, ya contadas dobles las de partido y feriado → se cargan como COMUN.
//  · Regalías del mes X = (ventas de X − alquiler − sueldo Adrián − sueldo Jorge) × 4% para CADA hermano.
//    Ventas = PRECIO TOTAL FINAL (lo cobrado) de DETALLE DE VENTAS, sin anuladas.
//  · Alquiler del mes X: se paga a mes vencido entre el 1 y el 10 de X+1. Pesos = USD × el blue (venta)
//    más alto entre el día 1 y el día de pago de X+1.

export const TIPOS_HORA = { COMUN: 1, PARTIDO: 2, FERIADO: 2, 'HOME OFFICE': 1 }

export const parsePrecio = v => {
  if (typeof v === 'number') return v
  const s = String(v ?? '').replace(/[^\d,.-]/g, '')
  if (!s) return 0
  // formato argentino: 1.234.567,89
  const n = Number(s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : s.replace(/\.(?=\d{3}(\D|$))/g, ''))
  return Number.isFinite(n) ? n : 0
}

// 'dd/mm/aaaa' (o 'aaaa-mm-dd') → { d, m, a, clave: 'aaaa-mm-dd', mes: 'aaaa-mm' }
export function parseFecha(f) {
  const s = String(f || '').trim().replace(/^'/, '')
  let d, m, a
  if (/^\d{4}-\d{1,2}-\d{1,2}/.test(s)) [a, m, d] = s.slice(0, 10).split('-').map(Number)
  else [d, m, a] = s.split(' ')[0].split('/').map(Number)
  if (!d || !m || !a) return null
  const p = n => String(n).padStart(2, '0')
  return { d, m, a, clave: `${a}-${p(m)}-${p(d)}`, mes: `${a}-${p(m)}` }
}
export const fechaAR = clave => { const [a, m, d] = clave.split('-'); return `${Number(d)}/${Number(m)}/${a}` }

export function mesSiguiente(mes) {
  const [a, m] = mes.split('-').map(Number)
  return m === 12 ? `${a + 1}-01` : `${a}-${String(m + 1).padStart(2, '0')}`
}
export const ultimoDiaMes = mes => { const [a, m] = mes.split('-').map(Number); return new Date(Date.UTC(a, m, 0)).getUTCDate() }
const NOMBRES_MES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
export const nombreMes = mes => { const [a, m] = mes.split('-').map(Number); return `${NOMBRES_MES[m - 1]} ${a}` }

// Tarifa común vigente para una persona en una fecha (clave aaaa-mm-dd)
export function tarifaVigente(tarifas, persona, clave) {
  const vig = tarifas
    .filter(t => t.persona === persona && (t.tipo || 'COMUN') === 'COMUN' && t.desde && t.desde <= clave)
    .sort((x, y) => y.desde.localeCompare(x.desde))
  return vig[0]?.valor ?? null
}

// horas: [{ persona, desde (clave), horas, tipo, anulado }]
export function calcularSueldo({ horas, tarifas, persona, mes, homeOffice }) {
  const delMes = horas.filter(h => !h.anulado && h.persona === persona && h.desde?.startsWith(mes))
  const lineas = {}
  let faltaTarifa = false
  const sumar = (tipo, cant, clave, auto = false) => {
    const tarifa = tarifaVigente(tarifas, persona, clave)
    if (tarifa == null) faltaTarifa = true
    const factor = TIPOS_HORA[tipo] ?? 1
    const l = lineas[tipo] || (lineas[tipo] = { tipo, horas: 0, factor, monto: 0, tarifas: new Set(), auto: false })
    l.horas += cant
    l.monto += cant * factor * (tarifa || 0)
    if (tarifa != null) l.tarifas.add(tarifa)
    if (auto) l.auto = true
  }
  delMes.forEach(h => sumar(h.tipo || 'COMUN', Number(h.horas) || 0, h.desde))
  if (homeOffice?.persona === persona && homeOffice.horas > 0 && !delMes.some(h => h.tipo === 'HOME OFFICE')) {
    sumar('HOME OFFICE', homeOffice.horas, `${mes}-${String(ultimoDiaMes(mes)).padStart(2, '0')}`, true)
  }
  const orden = ['COMUN', 'PARTIDO', 'FERIADO', 'HOME OFFICE']
  const lista = Object.values(lineas).sort((x, y) => orden.indexOf(x.tipo) - orden.indexOf(y.tipo))
    .map(l => ({ ...l, tarifas: [...l.tarifas], monto: Math.round(l.monto) }))
  return { persona, lineas: lista, total: lista.reduce((s, l) => s + l.monto, 0), registros: delMes.length, faltaTarifa }
}

// filas de DETALLE DE VENTAS (A:U): C fecha, L precio total, S precio total final, U anulado
export function ventasDelMes(filas, mes) {
  let total = 0, items = 0
  for (const r of filas) {
    if (!r[0] || String(r[20]).toUpperCase() === 'TRUE') continue
    const f = parseFecha(r[2])
    if (!f || f.mes !== mes) continue
    total += parsePrecio(r[18]) || parsePrecio(r[11])
    items++
  }
  return { total: Math.round(total), items }
}

// cotizaciones: [{ fecha: 'aaaa-mm-dd', venta }] → la más alta (si empata, la primera)
export function blueMaximo(cotizaciones) {
  return cotizaciones.filter(c => c.venta > 0).reduce((max, c) => (!max || c.venta > max.venta ? c : max), null)
}

export function calcularRegalias({ ventas, alquilerPesos, sueldos, porcentaje }) {
  const base = ventas - alquilerPesos - sueldos.reduce((s, x) => s + x, 0)
  const porHermano = Math.round(base * porcentaje / 100)
  return { base: Math.round(base), porcentaje, porHermano }
}
