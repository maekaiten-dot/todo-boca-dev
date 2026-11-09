// src/lib/costosCobro.js
// Costo de cobrar con cada medio de pago y cada posnet, mes por mes (valores reales de los
// resúmenes de Payway y de los cobros de Mercado Pago). Todo en % antes de IVA; el IVA se suma aparte.
// Incluye el impuesto al cheque (Ley 25.413) de lo que deposita Payway y la retención de Ingresos Brutos (2,5% de lo cobrado, en los dos posnets y en el QR): como
// monotributista no se recupera, así que es un costo más. No lleva IVA.
//
// PAYWAY (posnet BLANCO)
//  · Crédito: arancel 2% (Amex 2,5%; la app no sabe la marca, se usa 2%) + cobro anticipado, que
//    estuvo activo hasta oct 2026 (% del crédito de cada mes, sacado de los resúmenes).
//  · Débito: sin arancel.
//  · "Servicio Payway": cargo fijo por mes, bonificado de nov 2026 a oct 2027.
// MERCADO PAGO (posnet AMARILLO, cuenta de Jorge)
//  · Crédito: 4,19% con tarjeta argentina y 7,19% con tarjeta del exterior (en 10 días). La app no
//    sabe de dónde es la tarjeta: se usa el promedio real de los cobros (≈ 80% del exterior).
//  · Débito 2,75% · QR 0,80% (dinero en cuenta) / 0,85% (débito).

export const IVA = 1.21
export const IIBB = 2.5   // retención de Ingresos Brutos, % de lo cobrado con tarjeta o QR
// Impuesto a los créditos bancarios (Ley 25.413) sobre lo que Payway deposita en el banco (lo cobrado
// menos comisiones e IIBB). El banco cobra 1,2% (nov 2026); si lo baja a 0,6%, cambiar acá.
// Los cobros de Mercado Pago quedan en la cuenta de Mercado Pago y no lo pagan.
export const LEY_25413_BLANCO = 1.2
export const ARANCEL_CREDITO_PAYWAY = 2
// Cobro anticipado de Payway: % del crédito de cada mes (resúmenes nov 2025 – oct 2026)
export const ANTICIPO_PAYWAY = {
  '2025-11': 9.82, '2025-12': 8.01, '2026-01': 9.22, '2026-02': 9.31, '2026-03': 8.95, '2026-04': 8.37,
  '2026-05': 9.03, '2026-06': 9.22, '2026-07': 8.83, '2026-08': 8.89, '2026-09': 4.15, '2026-10': 2.39,
}
const ANTICIPO_ANTES = 9        // meses anteriores a nov 2025 (sin resumen): el promedio de esos meses
const ANTICIPO_DESDE = '2026-11' // desde acá, desactivado
// Servicio Payway (cargo fijo mensual, sin IVA)
export const SERVICIO_PAYWAY = [
  { desde: '0000-00', monto: 41999 },
  { desde: '2026-01', monto: 45999 },
  { desde: '2026-04', monto: 49999 },
  { desde: '2026-07', monto: 53999 },
  { desde: '2026-10', monto: 57999 },
  { desde: '2026-11', monto: 0 },      // bonificado hasta el 1/11/2027
  { desde: '2027-11', monto: 57999 },  // revisar el precio cuando termine la bonificación
]
export const MP = { creditoLocal: 4.19, creditoExterior: 7.19, parteExterior: 0.8, debito: 2.75, qr: 0.8 }

export const NOMBRE_POSNET = { AMARILLO: 'Amarillo (Mercado Pago)', BLANCO: 'Blanco (Payway)' }
export const NOMBRE_TIPO = { credito: 'Crédito', debito: 'Débito', qr: 'QR' }

// "4/11/2026" o "2026-11" → "2026-11"
export function mesDeCuando(cuando) {
  const s = String(cuando || '').replace(/^'/, '').split(' ')[0]
  if (/^\d{4}-\d{2}$/.test(s)) return s
  const p = s.split('/')
  return p.length >= 3 && p[2] ? `${p[2]}-${String(p[1]).padStart(2, '0')}` : ''
}
export function tipoDeMetodo(metodo) {
  const m = String(metodo || '').toLowerCase()
  return /\bqr\b/.test(m) ? 'qr' : /d[eé]bito/.test(m) ? 'debito' : /tarjeta|cr[eé]dito/.test(m) ? 'credito' : null
}
export const posnetNormal = posnet => /AMARILLO/i.test(posnet || '') ? 'AMARILLO' : 'BLANCO'

// % antes de IVA para un medio, un posnet y un mes
export function tasaCobro(tipo, posnet, mes) {
  if (!tipo) return 0
  if (tipo === 'qr') return MP.qr                       // el QR siempre es de Mercado Pago
  if (posnetNormal(posnet) === 'AMARILLO') return tipo === 'credito' ? MP.creditoLocal * (1 - MP.parteExterior) + MP.creditoExterior * MP.parteExterior : MP.debito
  if (tipo === 'debito') return 0
  const anticipo = mes >= ANTICIPO_DESDE ? 0 : (ANTICIPO_PAYWAY[mes] ?? (mes < '2025-11' ? ANTICIPO_ANTES : 0))
  return ARANCEL_CREDITO_PAYWAY + anticipo
}
// Costo total como fracción (comisión con IVA + IIBB; ej. 0.0757) para multiplicar por el monto
export function costoTotalTasa(tipo, posnet, mes) {
  if (!tipo) return 0
  const base = (tasaCobro(tipo, posnet, mes) * IVA + IIBB) / 100
  return base + (impChequeAplica(tipo, posnet) ? (1 - base) * LEY_25413_BLANCO / 100 : 0)
}
// El impuesto al cheque se paga sobre lo que deposita Payway (posnet blanco; el QR es de Mercado Pago)
export const impChequeAplica = (tipo, posnet) => tipo !== 'qr' && posnetNormal(posnet) === 'BLANCO'
export function comisionDe(metodo, posnet, cuando) {
  return costoTotalTasa(tipoDeMetodo(metodo), posnet, mesDeCuando(cuando))
}
export function servicioPaywayDelMes(mes) {
  let m = 0
  for (const s of SERVICIO_PAYWAY) if (mes >= s.desde) m = s.monto
  return m * IVA
}
