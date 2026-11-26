// src/lib/costosCobro.js
// Costo de cobrar con cada medio de pago y cada posnet, mes por mes (valores reales de los
// resúmenes de Payway y de los cobros de Mercado Pago). Todo en % antes de IVA; el IVA se suma aparte.
// Incluye el impuesto al cheque (Ley 25.413) de lo que deposita Payway (hasta oct 2026) y la retención de Ingresos Brutos (2,5% de lo cobrado, en los dos posnets y en el QR): como
// monotributista no se recupera, así que es un costo más. No lleva IVA.
//
// PAYWAY (posnet BLANCO)
//  · Hasta las ventas del 21/11/2026: crédito con arancel 2% (Amex 2,5%; la app no sabe la marca, se
//    usa 2%) + "Pago Expreso Cupones" del Galicia (cobro anticipado, % del crédito de cada mes sacado de
//    los resúmenes; en nov 2026 además "Sellos PEX Cap. Fed."). Débito sin arancel.
//  · Desde las ventas del 22/11/2026: Pago Expreso dado de baja en el Galicia (confirmado con las
//    liquidaciones del 24 al 26/11). Crédito solo con el arancel de 2%, a 10 días hábiles (tarjeta
//    argentina) o ~18 (extranjera); débito sin cargo, igual que antes.
//  · "Servicio Payway": cargo fijo por mes, bonificado de nov 2026 a oct 2027.
//  · QR de Payway: 0,80% + IVA (más IIBB), se acredita al instante en el banco (venta del 9/11/2026:
//    $22.000 → $21.237,04, sin impuesto al cheque). Antes del posnet amarillo (mayo 2026) todo QR era de Payway.
// MERCADO PAGO (posnet AMARILLO, cuenta de Jorge)
//  · Crédito: 4,19% con tarjeta argentina y 7,19% con tarjeta del exterior (en 10 días). La app no
//    sabe de dónde es la tarjeta: se usa el promedio real de los cobros (≈ 80% del exterior).
//  · Débito 2,75% · QR 0,80% (dinero en cuenta) / 0,85% (débito).

export const IVA = 1.21
export const IIBB = 2.5   // retención de Ingresos Brutos, % de lo cobrado con tarjeta o QR
// Impuesto a los créditos bancarios (Ley 25.413) sobre lo que Payway deposita en el banco (lo cobrado
// menos comisiones e IIBB), en % por mes de venta. El Galicia cobró 1,2% hasta el 11/11/2026 y desde el
// 12/11/2026 ya no lo cobra (visto en las acreditaciones). Se toma por mes: desde nov 2026, 0.
// Si lo vuelve a cobrar, agregar un renglón con el mes y el %.
// Los cobros de Mercado Pago quedan en la cuenta de Mercado Pago y no lo pagan.
export const LEY_25413_POR_MES = [
  { desde: '0000-00', pct: 1.2 },
  { desde: '2026-11', pct: 0 },
]
export function leyChequeDelMes(mes) {
  let p = 0
  for (const x of LEY_25413_POR_MES) if ((mes || '9999-99') >= x.desde) p = x.pct
  return p
}
export const LEY_25413_BLANCO = leyChequeDelMes('9999-99')   // el % de hoy
export const ARANCEL_CREDITO_PAYWAY = 2   // arancel de crédito del posnet blanco (Amex 2,5%)
// Cobro anticipado ("Pago Expreso Cupones" del Galicia): % del crédito de cada mes (resúmenes nov 2025 –
// oct 2026; nov 2026 sale de los comprobantes del 16, 19 y 20/11: ≈ 2,5% en Visa y Mastercard, más sellos)
export const ANTICIPO_PAYWAY = {
  '2025-11': 9.82, '2025-12': 8.01, '2026-01': 9.22, '2026-02': 9.31, '2026-03': 8.95, '2026-04': 8.37,
  '2026-05': 9.03, '2026-06': 9.22, '2026-07': 8.83, '2026-08': 8.89, '2026-09': 4.15, '2026-10': 2.39,
  '2026-11': 2.5,
}
const ANTICIPO_ANTES = 9        // meses anteriores a nov 2025 (sin resumen): el promedio de esos meses
// Sin cobro anticipado (Pago Expreso dado de baja), por fecha de venta
export const PLAN_OTROS_PLAZOS_DESDE = '2026-11-22'
export const OTROS_PLAZOS = { credito: 2, debito: 0 }
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
export const QR_PAYWAY = 0.8
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
// "22/11/2026", "'22/11/2026 15:30", "2026-11-22" o "2026-11" → "2026-11-22" (o "2026-11" si no hay día).
// Las tasas se eligen comparando estos textos: "2026-11" (un mes entero) queda antes de "2026-11-23".
export function diaDeCuando(cuando) {
  const s = String(cuando || '').replace(/^'/, '').split(' ')[0]
  if (/^\d{4}-\d{2}(-\d{2})?$/.test(s)) return s
  const p = s.split('/')
  return p.length >= 3 && p[2] ? `${p[2]}-${String(p[1]).padStart(2, '0')}-${String(p[0]).padStart(2, '0')}` : ''
}
const enOtrosPlazos = cuando => diaDeCuando(cuando) >= PLAN_OTROS_PLAZOS_DESDE
// Arancel de crédito del posnet blanco para una fecha (sin el cobro anticipado)
export const arancelCreditoPayway = cuando => enOtrosPlazos(cuando) ? OTROS_PLAZOS.credito : ARANCEL_CREDITO_PAYWAY
export function tipoDeMetodo(metodo) {
  const m = String(metodo || '').toLowerCase()
  return /\bqr\b/.test(m) ? 'qr' : /d[eé]bito/.test(m) ? 'debito' : /tarjeta|cr[eé]dito/.test(m) ? 'credito' : null
}
export const posnetNormal = posnet => /AMARILLO/i.test(posnet || '') ? 'AMARILLO' : 'BLANCO'

// % antes de IVA para un medio, un posnet y una fecha de venta ("22/11/2026", "2026-11-22" o el mes "2026-11")
export function tasaCobro(tipo, posnet, cuando) {
  if (!tipo) return 0
  if (tipo === 'qr') return posnetNormal(posnet) === 'AMARILLO' ? MP.qr : QR_PAYWAY
  if (posnetNormal(posnet) === 'AMARILLO') return tipo === 'credito' ? MP.creditoLocal * (1 - MP.parteExterior) + MP.creditoExterior * MP.parteExterior : MP.debito
  if (enOtrosPlazos(cuando)) return OTROS_PLAZOS[tipo] ?? 0
  if (tipo === 'debito') return 0
  const mes = diaDeCuando(cuando).slice(0, 7)
  const anticipo = ANTICIPO_PAYWAY[mes] ?? (mes < '2025-11' ? ANTICIPO_ANTES : 0)
  return ARANCEL_CREDITO_PAYWAY + anticipo
}
// Costo total como fracción (comisión con IVA + IIBB; ej. 0.0757) para multiplicar por el monto
export function costoTotalTasa(tipo, posnet, cuando) {
  if (!tipo) return 0
  const mes = diaDeCuando(cuando).slice(0, 7)
  const base = (tasaCobro(tipo, posnet, cuando) * IVA + IIBB) / 100
  return base + (impChequeAplica(tipo, posnet) ? (1 - base) * leyChequeDelMes(mes) / 100 : 0)
}
// El impuesto al cheque se paga sobre lo que deposita Payway por las tarjetas (posnet blanco). El QR de
// Payway entra al instante y el banco no le cobra el impuesto (venta del 9/11/2026).
export const impChequeAplica = (tipo, posnet) => !!tipo && tipo !== 'qr' && posnetNormal(posnet) === 'BLANCO'
export function comisionDe(metodo, posnet, cuando) {
  return costoTotalTasa(tipoDeMetodo(metodo), posnet, diaDeCuando(cuando))
}
export function servicioPaywayDelMes(mes) {
  let m = 0
  for (const s of SERVICIO_PAYWAY) if (mes >= s.desde) m = s.monto
  return m * IVA
}
