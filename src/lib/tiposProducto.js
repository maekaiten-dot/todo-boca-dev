// src/lib/tiposProducto.js
// Tipos de producto: POPULAR / ESTÁNDAR / PREMIUM según el precio de venta (ver cortesDePrecio).
// Dentro de cada tipo, la rotación (unidades por semana) se compara contra los de su mismo tipo:
// ALTA / MEDIA / BAJA. Cada casillero tipo × rotación lleva una acción de precio sugerida.
// El tipo se puede forzar a mano por artículo (columna O de ARTICULOS: TIPO).
import { parseMonto } from './montos.js'

// "23/9/2026" → número de día
const diaDe = f => { const p = String(f || '').replace(/^'/, '').split(' ')[0].split('/').map(Number); return p[2] ? Math.floor(Date.UTC(p[2], p[1] - 1, p[0]) / 86400000) : null }

export const TIPOS = ['POPULAR', 'ESTANDAR', 'PREMIUM']
export const NOMBRE_TIPO = { POPULAR: 'Popular', ESTANDAR: 'Estándar', PREMIUM: 'Premium' }
export const NIVELES = ['ALTA', 'MEDIA', 'BAJA']
export const NOMBRE_NIVEL = { ALTA: 'Rotación alta', MEDIA: 'Rotación media', BAJA: 'Rotación baja', NUEVO: 'Nuevo', CAMBIO: 'Precio recién cambiado' }
export const SEMANAS_VENTANA = 26          // se mira el último medio año
const SEMANAS_MIN = 4                      // con menos historia, el artículo es "nuevo" y no se clasifica por rotación
const DIAS_TRAS_CAMBIO = 28                // después de cambiar el precio, la rotación se mide solo con lo vendido a ese precio
                                           // y no se sugiere otro cambio hasta juntar 4 semanas

export const ACCION = {
  POPULAR: { ALTA: 'Probar subir ~10%', MEDIA: 'Mantener · sumar a combos', BAJA: 'Combo o liquidar' },
  ESTANDAR: { ALTA: 'Probar subir 5–10%', MEDIA: 'Mantener', BAJA: 'Revisar exhibición o bajar' },
  PREMIUM: { ALTA: 'Probar subir ~5%', MEDIA: 'Mantener · cuidar el stock', BAJA: 'Bajar o dejar de reponer' },
}

export const esActivo = a => { const d = String(a.disponibilidad || '').toUpperCase(); return !d || d === 'ACTIVO' || d === 'SI' || d === 'TRUE' || d === '1' }
const precioDe = a => parseMonto(a.precioUnitario || 0)
export const tipoManualDe = a => { const t = String(a.tipoManual || '').toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim(); return TIPOS.includes(t) ? t : '' }

// Cortes (se recalculan una vez por mes, con las ventas de las 26 semanas hasta el fin del mes pasado):
// · Premium: desde el precio donde arranca el tercio más caro de la facturación (pocos artículos,
//   los más caros: buzos, camisetas oficiales, mates, copas).
// · Popular / Estándar: entre lo que queda debajo, el salto natural de precios más marcado (lo chico
//   de impulso: llaveros, imanes, alfajores, bebidas; y la indumentaria y accesorios medianos).
// Sin ventas para calcular, se usan tercios por cantidad de artículos.
export const hoyArgentina = () => {
  const [d, m, a] = new Date().toLocaleDateString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' }).split('/').map(Number)
  return Math.floor(Date.UTC(a, m - 1, d) / 86400000)
}
const finMesPasado = hoy => { const f = new Date(hoy * 86400000); return Math.floor(Date.UTC(f.getUTCFullYear(), f.getUTCMonth(), 1) / 86400000) - 1 }

export function cortesDePrecio(articulos, ventas = [], hoy = hoyArgentina()) {
  const activos = articulos.filter(esActivo).map(a => ({ id: a.id, p: precioDe(a) })).filter(a => a.p > 0)
  const precios = activos.map(a => a.p).sort((a, b) => a - b)
  if (precios.length < 3) return null
  const hasta = finMesPasado(hoy), desde = hasta - SEMANAS_VENTANA * 7
  const fact = {}
  for (const v of ventas) {
    if (v.anulado || !v.articulo) continue
    const d = diaDe(v.fecha); if (d == null || d <= desde || d > hasta) continue
    fact[v.articulo] = (fact[v.articulo] || 0) + (v.precioTotalFinal || v.precioTotal || 0)
  }
  const conFact = activos.filter(a => fact[a.id] > 0).sort((a, b) => a.p - b.p)
  const total = conFact.reduce((s, a) => s + fact[a.id], 0)
  if (!total) return { c1: precios[Math.floor(precios.length / 3)], c2: precios[Math.floor(precios.length * 2 / 3)], n: precios.length, porVentas: false }
  let acc = 0, pCorte = conFact[conFact.length - 1].p
  for (const a of conFact) { acc += fact[a.id]; if (acc >= total * 2 / 3) { pCorte = a.p; break } }
  const c2 = precios.find(p => p > pCorte) ?? pCorte
  // Salto natural (2 grupos) en escala logarítmica entre los precios debajo de Premium
  const x = precios.filter(p => p < c2).map(Math.log)
  let c1 = precios[Math.floor(precios.length / 3)]
  if (x.length >= 2) {
    const s1 = [0], s2 = [0]
    x.forEach(v => { s1.push(s1[s1.length - 1] + v); s2.push(s2[s2.length - 1] + v * v) })
    const ss = (i, j) => s2[j] - s2[i] - (s1[j] - s1[i]) ** 2 / (j - i)
    let mejor = null
    for (let i = 1; i < x.length; i++) {
      if (x[i] === x[i - 1]) continue
      const v = ss(0, i) + ss(i, x.length)
      if (!mejor || v < mejor.v) mejor = { v, i }
    }
    if (mejor) c1 = Math.round(Math.exp(x[mejor.i]))
  }
  return { c1, c2, n: precios.length, porVentas: true, hasta }
}

export function tipoAutomatico(precio, cortes) {
  if (!cortes || !(precio > 0)) return ''
  return precio < cortes.c1 ? 'POPULAR' : precio < cortes.c2 ? 'ESTANDAR' : 'PREMIUM'
}
export const tipoDe = (a, cortes) => tipoManualDe(a) || tipoAutomatico(precioDe(a), cortes)

// Quién paga: dólares, reales, euros o Pix = turista seguro; efectivo en pesos o transferencia =
// local probable; tarjeta y QR los usan los dos (sin dato).
export function claseDePago(metodo) {
  const m = String(metodo || '').toLowerCase()
  if (/d[oó]lar|real|euro|pix/.test(m)) return 'turista'
  if (/transfer|efectivo( pesos| ars)?$|^efectivo$/.test(m.trim())) return 'local'
  return 'mixto'
}


// ventas: con artículos unificados (getHistoricoVentas({ unificar: true })); ingresos: getIngresos
// hoy: número de día. metodosDe: separa "A + B" en los medios de pago de la venta.
// Día desde el que rige el precio actual de cada artículo, si el precio cambió (si no, no figura).
// Primero con el histórico de precios (cambios hechos desde la app); si no hay, con las ventas:
// el primer día de la última racha de ventas al precio actual, si antes se vendió a otro precio.
export function cambiosDePrecio(articulos, ventas, historico = []) {
  const out = {}
  const precioHoy = Object.fromEntries(articulos.map(a => [a.id, Math.round(precioDe(a))]))
  const porArt = {}
  for (const h of historico) if (precioHoy[h.id] != null) (porArt[h.id] ||= []).push(h)
  for (const [id, l] of Object.entries(porArt)) {
    l.sort((a, b) => (diaDe(a.desde) ?? -1) - (diaDe(b.desde) ?? -1))
    let k = l.length - 1
    while (k >= 0 && Math.round(l[k].precio) === precioHoy[id]) k--
    if (k >= 0 && k < l.length - 1) { const d = diaDe(l[k + 1].desde); if (d != null) out[id] = { dia: d, precioAntes: l[k].precio } }
  }
  const vs = {}
  for (const v of ventas) if (!v.anulado && v.articulo && v.cantidad > 0 && precioHoy[v.articulo] != null) (vs[v.articulo] ||= []).push(v)
  // El precio anterior es el último al que se VENDIÓ antes del cambio: si el precio se cambió
  // sin pasar por la app (por ejemplo, directo en la planilla), el histórico no lo tiene.
  for (const [id, c] of Object.entries(out)) {
    const antes = (vs[id] || []).filter(v => { const d = diaDe(v.fecha); return d != null && d < c.dia && Math.round(v.precioUnitario) !== precioHoy[id] })
    if (antes.length) c.precioAntes = antes.reduce((a, b) => (diaDe(b.fecha) >= diaDe(a.fecha) ? b : a)).precioUnitario
  }
  for (const [id, l] of Object.entries(vs)) {
    if (out[id]) continue
    l.sort((a, b) => (diaDe(a.fecha) ?? 0) - (diaDe(b.fecha) ?? 0))
    const ult = l[l.length - 1]
    // Se cambió el precio después de la última venta (todavía no se vendió al precio nuevo)
    if (Math.round(ult.precioUnitario) !== precioHoy[id]) { out[id] = { dia: diaDe(ult.fecha) + 1, precioAntes: ult.precioUnitario, sinVentas: true }; continue }
    let k = l.length - 1
    while (k >= 0 && Math.round(l[k].precioUnitario) === precioHoy[id]) k--
    if (k >= 0) out[id] = { dia: diaDe(l[k + 1].fecha), precioAntes: l[k].precioUnitario }
  }
  return out
}

export function clasificarArticulos({ articulos, ventas, ingresos = [], historico = [], hoy, metodosDe = m => [m] }) {
  const cambios = cambiosDePrecio(articulos, ventas, historico)
  const cortes = cortesDePrecio(articulos, ventas, hoy)
  const desde = hoy - SEMANAS_VENTANA * 7
  const primerDia = {}, porArt = {}
  const marcar = (id, d) => { if (id && d != null && (primerDia[id] == null || d < primerDia[id])) primerDia[id] = d }
  for (const i of ingresos) if (!i.anulado) marcar(i.articuloId, diaDe(i.fechaIngreso || i.fecha))
  for (const v of ventas) {
    if (v.anulado || !v.articulo) continue
    const d = diaDe(v.fecha); marcar(v.articulo, d)
    if (d == null || d <= desde || d > hoy) continue
    const x = (porArt[v.articulo] ||= { u: 0, fact: 0, uDesdeCambio: 0, uAntesCambio: 0, pagos: { turista: 0, local: 0, mixto: 0 } })
    const cant = Number(v.cantidad) || 0
    x.u += cant; x.fact += v.precioTotalFinal || v.precioTotal || 0
    const c = cambios[v.articulo]
    if (c) { if (d >= c.dia) x.uDesdeCambio += cant; else if (d >= c.dia - DIAS_TRAS_CAMBIO) x.uAntesCambio += cant }
    const ms = metodosDe(v.metodoPago)
    for (const m of ms.length ? ms : ['']) x.pagos[claseDePago(m)] += cant / (ms.length || 1)
  }
  const filas = articulos.filter(esActivo).map(a => {
    const precio = precioDe(a), costo = parseMonto(a.costoUnitario || 0)
    const costoOk = costo > 0 && costo <= precio * 1.5
    const x = porArt[a.id] || { u: 0, fact: 0, uDesdeCambio: 0, uAntesCambio: 0, pagos: { turista: 0, local: 0, mixto: 0 } }
    const semanas = primerDia[a.id] == null ? 0 : Math.min(SEMANAS_VENTANA, (hoy - Math.max(primerDia[a.id], desde)) / 7)
    const nuevo = semanas < SEMANAS_MIN
    // Si cambió el precio, la rotación cuenta solo lo vendido al precio actual
    const c = cambios[a.id] && cambios[a.id].dia > desde ? cambios[a.id] : null
    const diasCambio = c ? hoy - c.dia + 1 : null
    const uSem = c ? (diasCambio >= DIAS_TRAS_CAMBIO ? x.uDesdeCambio / (diasCambio / 7) : 0)
      : semanas > 0 ? x.u / Math.max(semanas, 1) : 0
    const cambioPrecio = c ? {
      desde: c.dia, dias: diasCambio, precioAntes: c.precioAntes, reciente: diasCambio < DIAS_TRAS_CAMBIO,
      uSemDesde: diasCambio > 0 ? x.uDesdeCambio / (diasCambio / 7) : 0, uSemAntes: x.uAntesCambio / (DIAS_TRAS_CAMBIO / 7),
    } : null
    const tot = x.pagos.turista + x.pagos.local + x.pagos.mixto
    return {
      id: a.id, nombre: a.nombre, grupo: a.grupo || '', precio, costo: costoOk ? costo : null,
      margen: costoOk && precio > 0 ? (precio - costo) / precio : null,
      tipo: tipoDe(a, cortes), tipoAuto: tipoAutomatico(precio, cortes), manual: !!tipoManualDe(a),
      u: x.u, uSem, fact: x.fact, nuevo, semanas, cambioPrecio,
      ganSem: costoOk ? (precio - costo) * uSem : null,
      pctTurista: tot ? x.pagos.turista / tot : null, pctLocal: tot ? x.pagos.local / tot : null,
    }
  }).filter(f => f.tipo)
  // Rotación dentro de cada tipo: tercios de u/semana entre los que vendieron; sin ventas = baja
  for (const t of TIPOS) {
    const del = filas.filter(f => f.tipo === t && !f.nuevo && !f.cambioPrecio?.reciente)
    const v = del.filter(f => f.uSem > 0).map(f => f.uSem).sort((a, b) => a - b)
    const r1 = v[Math.floor(v.length / 3)] ?? 0, r2 = v[Math.floor(v.length * 2 / 3)] ?? 0
    for (const f of del) f.nivel = f.uSem <= 0 ? 'BAJA' : f.uSem >= r2 ? 'ALTA' : f.uSem >= r1 ? 'MEDIA' : 'BAJA'
    const corte = { r1, r2 }
    filas.filter(f => f.tipo === t).forEach(f => { f.cortesRotacion = corte })
  }
  for (const f of filas) {
    if (f.nuevo) { f.nivel = 'NUEVO'; f.accion = 'Nuevo: esperar 4 semanas de ventas'; continue }
    if (f.cambioPrecio?.reciente) {
      const cp = f.cambioPrecio
      f.nivel = 'CAMBIO'
      f.accion = `Precio cambiado hace ${cp.dias} ${cp.dias === 1 ? 'día' : 'días'}: esperar ${DIAS_TRAS_CAMBIO - cp.dias} más antes de volver a tocarlo`
      continue
    }
    f.accion = ACCION[f.tipo][f.nivel]
    if (f.margen != null && f.margen < 0.4 && f.nivel !== 'BAJA') f.aviso = 'Margen bajo: revisar costo o precio'
    else if (f.costo == null) f.aviso = 'Falta el costo'
    else if (f.nivel === 'ALTA' && f.pctTurista >= 0.3) f.aviso = 'Lo compran mucho turistas: aguanta mejor una suba'
  }
  return { cortes, filas }
}
