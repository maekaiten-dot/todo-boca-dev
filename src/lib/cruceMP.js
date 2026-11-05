// src/lib/cruceMP.js
// Cruce de los cobros de Mercado Pago (Point y QR de la cuenta de Jorge) contra las ventas de la app.
//  · POINT (tarjeta)  ↔ partes de las ventas pagadas con tarjeta en el posnet AMARILLO
//  · INSTORE (QR)     ↔ partes pagadas con QR en el posnet AMARILLO
// Las ventas viejas sin posnet anotado también cuentan (antes había un solo posnet). El posnet
// BLANCO es de otra cuenta y no entra.
// Cada cobro se empareja con una parte de venta del mismo día, mismo monto (±$1) y la hora más
// cercana (hasta 3 horas de diferencia). Lo que queda sin pareja es lo que hay que revisar.
import { repartoPago, posnetDeParte } from '../api/sheets.js'

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

// Partes de venta de la app, por día. canal: POINT / INSTORE (las que deberían estar en Mercado
// Pago) u OTRO (efectivo, transferencia, Pix, o tarjeta/QR del posnet blanco): esas solo se usan
// para encontrar errores de medio de pago.
export function partesApp(filasVentas) {
  const porVenta = {}
  for (const v of filasVentas) {
    if (v.anulado) continue
    const dia = diaISO(v.fecha); if (!dia) continue
    const id = v.idVenta || v.idDetalle
    for (const p of repartoPago(v)) {
      if (!(p.monto > 0)) continue
      const posParte = posnetDeParte(v, p.metodo)
      const blanco = posParte === 'BLANCO'
      const canalMP = METODOS_TARJETA.has(p.metodo) ? 'POINT' : p.metodo === 'QR' ? 'INSTORE' : null
      const canal = canalMP && !blanco ? canalMP : 'OTRO'
      const k = `${id}|${p.metodo}`
      const x = (porVenta[k] ||= { dia, canal, idVenta: id, metodo: p.metodo, posnet: posParte || '', hora: String(v.hora || '').replace(/^'/, '').slice(0, 5), min: minDeHora(v.hora), monto: 0, empleado: v.empleado || '' })
      x.monto += p.monto
    }
  }
  return Object.values(porVenta).map(x => ({ ...x, monto: Math.round(x.monto) }))
}

const MAX_MIN_OTRO_MEDIO = 45
const mismoMonto = (c, p) => Math.abs(Math.round(c.bruto) - p.monto) <= 1
// Con qué medio de la app corresponde cargar un cobro de Mercado Pago
export function medioCorrecto(c) {
  if (c.canal === 'INSTORE') return 'QR'
  return c.tipoMedio === 'credit_card' ? 'Tarjeta de Crédito' : 'Tarjeta de Débito'
}
const comoCargada = p => p.posnet === 'BLANCO' && (METODOS_TARJETA.has(p.metodo) || p.metodo === 'QR') ? `${p.metodo} en el posnet blanco` : p.metodo

// Combinaciones de 2 o 3 elementos sueltos que sumen el monto (±$1), todos cerca de la hora dada.
// Devuelve la combinación con la menor diferencia de hora máxima, o null.
const MAX_MIN_COMBO = 60
function mejorCombinacion(objetivo, min, lista, montoDe) {
  const c = lista.filter(x => !x.pareja && Math.abs(x.min - min) <= MAX_MIN_COMBO)
  let mejor = null
  const probar = combo => {
    if (Math.abs(combo.reduce((s, x) => s + montoDe(x), 0) - objetivo) > 1) return
    const dt = Math.max(...combo.map(x => Math.abs(x.min - min)))
    if (!mejor || dt < mejor.dt) mejor = { combo, dt }
  }
  for (let i = 0; i < c.length; i++) for (let j = i + 1; j < c.length; j++) {
    probar([c[i], c[j]])
    for (let k = j + 1; k < c.length && c.length <= 40; k++) probar([c[i], c[j], c[k]])
  }
  return mejor?.combo || null
}
// Una venta pagada con varios cobros (ej. $35.000 en dos QR de $22.000 y $13.000), o un cobro que
// cubre varias ventas. Quedan como emparejados (no es un error), y se anotan para mostrarlos.
function emparejarCombinados(mp, app) {
  const hechos = []
  for (const p of app.filter(x => !x.pareja).sort((a, b) => b.monto - a.monto)) {
    if (p.pareja) continue
    const combo = mejorCombinacion(p.monto, p.min, mp, c => Math.round(c.bruto))
    if (!combo) continue
    combo.forEach(c => { c.pareja = p }); p.pareja = combo[0]
    hechos.push({ ventas: [p], cobros: combo })
  }
  for (const c of mp.filter(x => !x.pareja).sort((a, b) => b.bruto - a.bruto)) {
    if (c.pareja) continue
    const combo = mejorCombinacion(Math.round(c.bruto), c.min, app, p => p.monto)
    if (!combo) continue
    combo.forEach(p => { p.pareja = c }); c.pareja = combo[0]
    hechos.push({ ventas: combo, cobros: [c] })
  }
  return hechos
}

function emparejar(mp, app, maxMin) {
  const pares = []
  mp.forEach((c, i) => { if (c.pareja) return; app.forEach((p, j) => {
    if (p.pareja) return
    const dt = Math.abs(c.min - p.min)
    if (mismoMonto(c, p) && dt <= maxMin) pares.push({ i, j, dt })
  }) })
  pares.sort((a, b) => a.dt - b.dt)
  const hechos = []
  for (const { i, j } of pares) {
    if (mp[i].pareja || app[j].pareja) continue
    mp[i].pareja = app[j]; app[j].pareja = mp[i]; hechos.push([mp[i], app[j]])
  }
  return hechos
}

// dias: Set de 'aaaa-mm-dd' a cruzar. Devuelve por día: { dia, POINT, INSTORE, errores, ok }
// errores: ventas que SÍ se cobraron, pero cargadas con otro medio de pago (hay que corregirlas en
// Historial → Editar). Cada una: { cobro, venta, cargada, correcto }
export function cruzarPorDia(cobros, partes, dias) {
  const out = {}
  const base = dia => ({ dia, POINT: { mp: [], app: [] }, INSTORE: { mp: [], app: [] }, OTRO: [] })
  for (const c of cobros) {
    const { dia, min } = partirFechaMP(c.fecha)
    if (!dias.has(dia)) continue
    out[dia] ||= base(dia)
    const canal = c.canal === 'POINT' ? 'POINT' : 'INSTORE'
    out[dia][canal].mp.push({ ...c, min, hora: String(c.fecha).slice(11, 16), pareja: null })
  }
  for (const p of partes) {
    if (!dias.has(p.dia)) continue
    if (p.canal === 'OTRO') { if (out[p.dia]) out[p.dia].OTRO.push({ ...p, pareja: null }); continue }
    ;(out[p.dia] ||= base(p.dia))[p.canal].app.push({ ...p, pareja: null })
  }
  for (const d of Object.values(out)) {
    const errores = []
    // 1) Mismo canal: cobro del Point con venta con tarjeta, cobro por QR con venta por QR
    for (const canal of ['POINT', 'INSTORE']) emparejar(d[canal].mp, d[canal].app, MAX_MIN)
    // 1b) Una venta en varios cobros, o un cobro para varias ventas (mismo canal)
    const combinados = []
    for (const canal of ['POINT', 'INSTORE']) combinados.push(...emparejarCombinados(d[canal].mp, d[canal].app))
    // 2) Lo que sobró: mismo monto y hora cercana pero cargado con otro medio (QR en vez de tarjeta,
    //    transferencia, efectivo, posnet blanco…) → error de registro del medio de pago
    const mpSueltos = [...d.POINT.mp, ...d.INSTORE.mp]
    const appOtros = [...d.POINT.app, ...d.INSTORE.app, ...d.OTRO]
    for (const [c, p] of emparejar(mpSueltos, appOtros, MAX_MIN_OTRO_MEDIO)) errores.push({ cobro: c, venta: p, cargada: comoCargada(p), correcto: medioCorrecto(c) })
    // 3) Bien emparejados, pero débito cargado como crédito (o al revés)
    for (const c of d.POINT.mp) {
      const p = c.pareja
      if (!p || errores.some(e => e.cobro === c) || p.metodo === 'Tarjeta') continue
      const ok = medioCorrecto(c)
      if (p.metodo !== ok) errores.push({ cobro: c, venta: p, cargada: p.metodo, correcto: ok, soloTarjeta: true })
    }
    for (const canal of ['POINT', 'INSTORE']) {
      const { mp, app } = d[canal]
      mp.sort((a, b) => a.min - b.min); app.sort((a, b) => a.min - b.min)
      const totMP = mp.reduce((s, c) => s + c.bruto, 0), totApp = app.reduce((s, p) => s + p.monto, 0)
      d[canal] = { mp, app, totMP, totApp, dif: Math.round(totMP - totApp), sinParejaMP: mp.filter(c => !c.pareja), sinParejaApp: app.filter(p => !p.pareja) }
    }
    d.errores = errores.sort((a, b) => a.cobro.min - b.cobro.min)
    d.combinados = combinados
    d.sinPareja = ['POINT', 'INSTORE'].reduce((s, k) => s + d[k].sinParejaMP.length + d[k].sinParejaApp.length, 0)
    d.ok = !d.sinPareja && !d.errores.length
    delete d.OTRO
  }
  return Object.values(out).sort((a, b) => b.dia.localeCompare(a.dia))
}
