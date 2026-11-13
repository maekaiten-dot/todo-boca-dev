// src/lib/equilibrio.js
// Punto de equilibrio: cuánto hay que vender para cubrir los gastos fijos del mes.
//  · Gastos fijos: los gastos de Pagos con etiqueta de gasto fijo (sueldos, cargas, alquiler, servicios,
//    monotributo, contador). De cada etiqueta se toma el último mes cargado (por "corresponde a"), así un
//    sueldo que todavía no se pagó este mes cuenta con el monto del mes anterior.
//  · Margen: de cada $100 vendidos en los últimos 90 días, cuánto queda después de la mercadería y los
//    costos de cobro (lo calcula rentabilidad.js).
//  · Equilibrio del mes = gastos fijos / margen. Equilibrio del día = el del mes / días del mes
//    (el local abre todos los días).
import { sugerirEtiqueta, sugerirMes } from './etiquetasGastos.js'

export const ETIQUETAS_FIJAS = [
  'Sueldo Stefi', 'Sueldo Brenda', 'Sueldo Adrián', 'Sueldo Jorge',
  'Bono presentismo Stefi', 'Bono presentismo Brenda', 'Bono fin de semana Stefi', 'Bono fin de semana Brenda',
  'Impuesto 931 empleadores', 'Obra social y sindicato',
  'Alquiler local', 'Servicios local', 'Servicios depto abuela',
  'Monotributo', 'Contador',
]
const MESES_VIGENCIA = 6   // un gasto fijo cargado hace más de 6 meses ya no cuenta

const mesNum = k => { const [a, m] = String(k).split('-').map(Number); return a * 12 + m - 1 }

// pagos: los de getPagos(). mesActual: 'aaaa-mm'.
export function gastosFijosVigentes(pagos, mesActual) {
  const porEtq = {}   // etiqueta → { mes → monto }
  for (const p of pagos) {
    if (p.anulado || p.tipo !== 'GASTO') continue
    const etiqueta = p.etiqueta || sugerirEtiqueta(p.descripcion)
    if (!ETIQUETAS_FIJAS.includes(etiqueta)) continue
    const mes = p.correspondeA || sugerirMes(p.descripcion, p.fechaPago || p.fechaIngreso, etiqueta)
    if (!mes || mesNum(mes) > mesNum(mesActual) || mesNum(mesActual) - mesNum(mes) > MESES_VIGENCIA) continue
    // Lo que cuesta el gasto (importe), aunque todavía no esté pagado; los gastos viejos solo tienen lo pagado
    const monto = Math.max(Number(p.montoPagado) || 0, Number(p.costoTotal) || 0)
    if (!(monto > 0)) continue
    const e = (porEtq[etiqueta] ||= {})
    e[mes] = (e[mes] || 0) + monto
  }
  const detalle = Object.entries(porEtq).map(([etiqueta, meses]) => {
    const mes = Object.keys(meses).sort().pop()
    return { etiqueta, mes, monto: meses[mes] }
  }).sort((a, b) => b.monto - a.monto)
  return { total: detalle.reduce((s, d) => s + d.monto, 0), detalle, sinAlquiler: !porEtq['Alquiler local'] }
}

// fijos: total del mes; margenPct: 0..1; anio, mes (1-12), dia: hoy; vendidoHoy y vendidoMes en pesos
export function calcularEquilibrio({ fijos, margenPct, anio, mes, dia, vendidoHoy = 0, vendidoMes = 0 }) {
  if (!(fijos > 0) || !(margenPct > 0)) return null
  const diasMes = new Date(Date.UTC(anio, mes, 0)).getUTCDate()
  const mensual = fijos / margenPct
  const diario = mensual / diasMes
  const esperadoHastaHoy = diario * dia
  return {
    mensual, diario, diasMes,
    faltaHoy: Math.max(0, diario - vendidoHoy),
    pctHoy: vendidoHoy / diario,
    pctMes: vendidoMes / mensual,
    // Positivo: vamos adelantados contra lo que haría falta a esta altura del mes
    diferenciaMes: vendidoMes - esperadoHastaHoy,
    // Lo que habría que vender por día de acá a fin de mes (contando hoy) para llegar al equilibrio
    porDiaRestante: Math.max(0, mensual - (vendidoMes - vendidoHoy)) / (diasMes - dia + 1),
  }
}
