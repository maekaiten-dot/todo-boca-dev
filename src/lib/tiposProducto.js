// src/lib/tiposProducto.js
// Tipos de producto: POPULAR / ESTÁNDAR / PREMIUM según el precio de venta, con cortes en los
// tercios de precio de los artículos activos (se recalculan solos cada vez que cambian los precios).
// Dentro de cada tipo, la rotación (unidades por semana) se compara contra los de su mismo tipo:
// ALTA / MEDIA / BAJA. Cada casillero tipo × rotación lleva una acción de precio sugerida.
// El tipo se puede forzar a mano por artículo (columna O de ARTICULOS: TIPO).
import { parseMonto } from './montos.js'

export const TIPOS = ['POPULAR', 'ESTANDAR', 'PREMIUM']
export const NOMBRE_TIPO = { POPULAR: 'Popular', ESTANDAR: 'Estándar', PREMIUM: 'Premium' }
export const NIVELES = ['ALTA', 'MEDIA', 'BAJA']
export const NOMBRE_NIVEL = { ALTA: 'Rotación alta', MEDIA: 'Rotación media', BAJA: 'Rotación baja', NUEVO: 'Nuevo' }
export const SEMANAS_VENTANA = 26          // se mira el último medio año
const SEMANAS_MIN = 4                      // con menos historia, el artículo es "nuevo" y no se clasifica por rotación

export const ACCION = {
  POPULAR: { ALTA: 'Probar subir ~10%', MEDIA: 'Mantener · sumar a combos', BAJA: 'Combo o liquidar' },
  ESTANDAR: { ALTA: 'Probar subir 5–10%', MEDIA: 'Mantener', BAJA: 'Revisar exhibición o bajar' },
  PREMIUM: { ALTA: 'Probar subir ~5%', MEDIA: 'Mantener · cuidar el stock', BAJA: 'Bajar o dejar de reponer' },
}

export const esActivo = a => { const d = String(a.disponibilidad || '').toUpperCase(); return !d || d === 'ACTIVO' || d === 'SI' || d === 'TRUE' || d === '1' }
const precioDe = a => parseMonto(a.precioUnitario || 0)
export const tipoManualDe = a => { const t = String(a.tipoManual || '').toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim(); return TIPOS.includes(t) ? t : '' }

// Cortes: el precio en el tercio y en los dos tercios de la lista de activos con precio
export function cortesDePrecio(articulos) {
  const p = articulos.filter(esActivo).map(precioDe).filter(x => x > 0).sort((a, b) => a - b)
  if (p.length < 3) return null
  return { c1: p[Math.floor(p.length / 3)], c2: p[Math.floor(p.length * 2 / 3)], n: p.length }
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

const diaDe = f => { const p = String(f || '').replace(/^'/, '').split(' ')[0].split('/').map(Number); return p[2] ? Math.floor(Date.UTC(p[2], p[1] - 1, p[0]) / 86400000) : null }

// ventas: con artículos unificados (getHistoricoVentas({ unificar: true })); ingresos: getIngresos
// hoy: número de día. metodosDe: separa "A + B" en los medios de pago de la venta.
export function clasificarArticulos({ articulos, ventas, ingresos = [], hoy, metodosDe = m => [m] }) {
  const cortes = cortesDePrecio(articulos)
  const desde = hoy - SEMANAS_VENTANA * 7
  const primerDia = {}, porArt = {}
  const marcar = (id, d) => { if (id && d != null && (primerDia[id] == null || d < primerDia[id])) primerDia[id] = d }
  for (const i of ingresos) if (!i.anulado) marcar(i.articuloId, diaDe(i.fechaIngreso || i.fecha))
  for (const v of ventas) {
    if (v.anulado || !v.articulo) continue
    const d = diaDe(v.fecha); marcar(v.articulo, d)
    if (d == null || d <= desde || d > hoy) continue
    const x = (porArt[v.articulo] ||= { u: 0, fact: 0, pagos: { turista: 0, local: 0, mixto: 0 } })
    const cant = Number(v.cantidad) || 0
    x.u += cant; x.fact += v.precioTotalFinal || v.precioTotal || 0
    const ms = metodosDe(v.metodoPago)
    for (const m of ms.length ? ms : ['']) x.pagos[claseDePago(m)] += cant / (ms.length || 1)
  }
  const filas = articulos.filter(esActivo).map(a => {
    const precio = precioDe(a), costo = parseMonto(a.costoUnitario || 0)
    const costoOk = costo > 0 && costo <= precio * 1.5
    const x = porArt[a.id] || { u: 0, fact: 0, pagos: { turista: 0, local: 0, mixto: 0 } }
    const semanas = primerDia[a.id] == null ? 0 : Math.min(SEMANAS_VENTANA, (hoy - Math.max(primerDia[a.id], desde)) / 7)
    const nuevo = semanas < SEMANAS_MIN
    const uSem = semanas > 0 ? x.u / Math.max(semanas, 1) : 0
    const tot = x.pagos.turista + x.pagos.local + x.pagos.mixto
    return {
      id: a.id, nombre: a.nombre, grupo: a.grupo || '', precio, costo: costoOk ? costo : null,
      margen: costoOk && precio > 0 ? (precio - costo) / precio : null,
      tipo: tipoDe(a, cortes), tipoAuto: tipoAutomatico(precio, cortes), manual: !!tipoManualDe(a),
      u: x.u, uSem, fact: x.fact, nuevo, semanas,
      ganSem: costoOk ? (precio - costo) * uSem : null,
      pctTurista: tot ? x.pagos.turista / tot : null, pctLocal: tot ? x.pagos.local / tot : null,
    }
  }).filter(f => f.tipo)
  // Rotación dentro de cada tipo: tercios de u/semana entre los que vendieron; sin ventas = baja
  for (const t of TIPOS) {
    const del = filas.filter(f => f.tipo === t && !f.nuevo)
    const v = del.filter(f => f.uSem > 0).map(f => f.uSem).sort((a, b) => a - b)
    const r1 = v[Math.floor(v.length / 3)] ?? 0, r2 = v[Math.floor(v.length * 2 / 3)] ?? 0
    for (const f of del) f.nivel = f.uSem <= 0 ? 'BAJA' : f.uSem >= r2 ? 'ALTA' : f.uSem >= r1 ? 'MEDIA' : 'BAJA'
    const corte = { r1, r2 }
    filas.filter(f => f.tipo === t).forEach(f => { f.cortesRotacion = corte })
  }
  for (const f of filas) {
    if (f.nuevo) { f.nivel = 'NUEVO'; f.accion = 'Nuevo: esperar 4 semanas de ventas'; continue }
    f.accion = ACCION[f.tipo][f.nivel]
    if (f.margen != null && f.margen < 0.4 && f.nivel !== 'BAJA') f.aviso = 'Margen bajo: revisar costo o precio'
    else if (f.costo == null) f.aviso = 'Falta el costo'
    else if (f.nivel === 'ALTA' && f.pctTurista >= 0.3) f.aviso = 'Lo compran mucho turistas: aguanta mejor una suba'
  }
  return { cortes, filas }
}
