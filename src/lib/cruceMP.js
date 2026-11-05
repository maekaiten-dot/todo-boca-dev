// src/lib/cruceMP.js
// Cruce de los cobros de Mercado Pago (Point y QR de la cuenta de Jorge) contra las ventas de la app.
//  · POINT (tarjeta)  ↔ partes de las ventas pagadas con tarjeta en el posnet AMARILLO
//  · INSTORE (QR)     ↔ partes pagadas con QR en el posnet AMARILLO
// Las ventas viejas sin posnet anotado también cuentan (antes había un solo posnet). El posnet
// BLANCO es de otra cuenta y no entra.
// Cada cobro se empareja con una parte de venta del mismo día, mismo monto (±$1) y la hora más
// cercana (hasta 3 horas de diferencia). Lo que queda sin pareja es lo que hay que revisar.
import { repartoPago } from '../api/sheets.js'

export const METODOS_TARJETA = new Set(['Tarjeta de Crédito', 'Tarjeta de Débito', 'Tarjeta'])
const MAX_MIN = 180

// "2026-11-04 19:09" → { dia: '2026-11-04', min: 1149 }
export function partirFechaMP(f) {
  const [d, h = '00:00'] = String(f || '').trim().split(' ')
  const [hh, mm] = h.split(':').map(Number)
  return { dia: d, min: (hh || 0) * 60 + (mm || 0) }
}
// "4/11/2026" → "2026-11-04"
export function diaISO(fechaApp) {
  const [d, m, a] = String(fechaApp || '').replace(/^'/, '').split(' ')[0].split('/').map(Number)
  return a ? `${a}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}` : ''
}
const minDeHora = h => { const [a, b] = String(h || '').replace(/^'/, '').split(':').map(Number); return (a || 0) * 60 + (b || 0) }

export function nombreMedio(c) {
  const canal = c.canal === 'POINT' ? 'Point' : c.canal === 'INSTORE' ? 'QR' : c.canal
  const tipo = { credit_card: 'Crédito', debit_card: 'Débito', prepaid_card: 'Prepaga', account_money: 'Dinero en cuenta', bank_transfer: 'Transferencia' }[c.tipoMedio] || c.tipoMedio || c.medio
  return `${canal} – ${tipo}`
}

// Partes de venta de la app que deberían aparecer en Mercado Pago, por día y canal
export function partesApp(filasVentas) {
  const porVenta = {}
  for (const v of filasVentas) {
    if (v.anulado || v.posnet === 'BLANCO') continue
    const dia = diaISO(v.fecha); if (!dia) continue
    const id = v.idVenta || v.idDetalle
    for (const p of repartoPago(v)) {
      const canal = METODOS_TARJETA.has(p.metodo) ? 'POINT' : p.metodo === 'QR' ? 'INSTORE' : null
      if (!canal || !(p.monto > 0)) continue
      const k = `${id}|${p.metodo}`
      const x = (porVenta[k] ||= { dia, canal, idVenta: id, metodo: p.metodo, hora: String(v.hora || '').replace(/^'/, '').slice(0, 5), min: minDeHora(v.hora), monto: 0, empleado: v.empleado || '' })
      x.monto += p.monto
    }
  }
  return Object.values(porVenta).map(x => ({ ...x, monto: Math.round(x.monto) }))
}

// dias: Set de 'aaaa-mm-dd' a cruzar. Devuelve por día: { dia, POINT: {...}, INSTORE: {...} }
export function cruzarPorDia(cobros, partes, dias) {
  const out = {}
  const base = dia => ({ dia, POINT: { mp: [], app: [] }, INSTORE: { mp: [], app: [] } })
  for (const c of cobros) {
    const { dia, min } = partirFechaMP(c.fecha)
    if (!dias.has(dia)) continue
    out[dia] ||= base(dia)
    const canal = c.canal === 'POINT' ? 'POINT' : 'INSTORE'
    out[dia][canal].mp.push({ ...c, min, hora: String(c.fecha).slice(11, 16), pareja: null })
  }
  for (const p of partes) {
    if (!dias.has(p.dia)) continue
    ;(out[p.dia] ||= base(p.dia))[p.canal].app.push({ ...p, pareja: null })
  }
  for (const d of Object.values(out)) {
    for (const canal of ['POINT', 'INSTORE']) {
      const { mp, app } = d[canal]
      mp.sort((a, b) => a.min - b.min); app.sort((a, b) => a.min - b.min)
      // Pareja: mismo monto y hora más cercana
      const pares = []
      mp.forEach((c, i) => app.forEach((p, j) => {
        const dt = Math.abs(c.min - p.min)
        if (Math.abs(Math.round(c.bruto) - p.monto) <= 1 && dt <= MAX_MIN) pares.push({ i, j, dt })
      }))
      pares.sort((a, b) => a.dt - b.dt)
      for (const { i, j } of pares) {
        if (mp[i].pareja || app[j].pareja) continue
        mp[i].pareja = app[j]; app[j].pareja = mp[i]
      }
      const totMP = mp.reduce((s, c) => s + c.bruto, 0), totApp = app.reduce((s, p) => s + p.monto, 0)
      d[canal] = { mp, app, totMP, totApp, dif: Math.round(totMP - totApp), sinParejaMP: mp.filter(c => !c.pareja), sinParejaApp: app.filter(p => !p.pareja) }
    }
    d.ok = ['POINT', 'INSTORE'].every(k => !d[k].sinParejaMP.length && !d[k].sinParejaApp.length)
  }
  return Object.values(out).sort((a, b) => b.dia.localeCompare(a.dia))
}
