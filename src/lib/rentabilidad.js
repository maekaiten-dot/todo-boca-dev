// src/lib/rentabilidad.js
// Margen real y GMROI por artículo y por grupo, en un período.
//  · Venta: precio final de cada renglón (ya con promos y descuentos).
//  · Costo de la mercadería: el costo guardado en la venta; si falta o no es creíble, el costo actual
//    del artículo (marcado como estimado).
//  · Costo de cobro: comisión de cada medio y posnet + IVA + IIBB + impuesto al cheque (costosCobro.js).
//    El servicio fijo de Payway no se reparte por artículo.
//  · GMROI: margen del período, llevado a un año, sobre el inventario promedio a costo. Cuántos pesos
//    de margen deja por año cada peso invertido en stock de ese artículo.
import { repartoPago, posnetDeParte } from '../api/sheets.js'
import { comisionDe } from './costosCobro.js'
import { costoValido } from './recomendaciones.js'
import { diaDe, hoyDia } from './reposicion.js'

const montoFila = v => Number(v.precioTotalFinal) || Number(v.precioTotal) || 0

export function clasificarGmroi(g) {
  if (g == null) return { texto: 'Sin stock', color: 'var(--muted)' }
  if (g >= 3) return { texto: 'Muy rentable', color: '#4ade80' }
  if (g >= 1) return { texto: 'Bien', color: '#fbbf24' }
  return { texto: 'Revisar', color: '#f87171' }
}

export function calcularRentabilidad({ ventas, articulos, ingresos = [], stockMap = {}, dias = 90, hoy = hoyDia() }) {
  const desde = hoy - dias + 1
  const arts = Object.fromEntries(articulos.map(a => [a.id, a]))
  const ultCosto = {}
  for (const i of ingresos) {
    if (i.anulado || !i.articuloId || !(i.costoUnitario > 0)) continue
    const d = diaDe(i.fecha); if (d == null) continue
    if (!ultCosto[i.articuloId] || d >= ultCosto[i.articuloId].d) ultCosto[i.articuloId] = { d, c: i.costoUnitario }
  }
  const costoActual = id => Number(arts[id]?.costoUnitario) || ultCosto[id]?.c || 0

  const fila = id => ({ id, nombre: arts[id]?.nombre || id, grupo: arts[id]?.grupo || '', foto: arts[id]?.foto || '', activo: !!arts[id],
    unidades: 0, venta: 0, costo: 0, cobro: 0, margen: 0, vendidasSinCosto: 0, costoEstimado: 0, ingresadas: 0 })
  const R = {}
  for (const v of ventas) {
    if (v.anulado || !v.articulo || !(v.cantidad > 0)) continue
    const d = diaDe(v.fecha); if (d == null || d < desde || d > hoy) continue
    const x = (R[v.articulo] ||= fila(v.articulo))
    if (!x.activo && v.nombre) x.nombre = v.nombre   // artículo dado de baja: el nombre de la venta
    const venta = montoFila(v)
    let costo = null
    // costo creíble: entre 2% y 150% del precio (hay ventas viejas con costo $1 cargado de relleno)
    if (costoValido(v) && v.costoTotal >= 0.02 * venta) costo = v.costoTotal
    else if (costoActual(v.articulo) * v.cantidad >= 0.02 * venta && costoActual(v.articulo) > 0) { costo = costoActual(v.articulo) * v.cantidad; x.costoEstimado += v.cantidad }
    const cobro = repartoPago(v).reduce((s, p) => s + (p.monto > 0 ? p.monto * comisionDe(p.metodo, posnetDeParte(v, p.metodo), v.fecha) : 0), 0)
    x.unidades += v.cantidad
    if (costo == null) { x.vendidasSinCosto += v.cantidad; continue }   // sin costo no se puede saber el margen
    x.venta += venta; x.costo += costo; x.cobro += cobro; x.margen += venta - costo - cobro
  }
  for (const i of ingresos) {
    if (i.anulado || !i.articuloId) continue
    const d = diaDe(i.fecha); if (d == null || d < desde || d > hoy) continue
    ;(R[i.articuloId] ||= fila(i.articuloId)).ingresadas += i.cantidad
  }
  // Artículos activos con stock y sin ventas: también ocupan inventario
  for (const a of articulos) if (!R[a.id] && (Number(stockMap[a.id]) || 0) > 0) R[a.id] = fila(a.id)

  const anual = 365 / dias
  const items = Object.values(R).map(x => {
    const fin = Math.max(0, Number(stockMap[x.id]) || 0)
    const ini = Math.max(0, fin + x.unidades - x.ingresadas)
    const invPromedio = ((ini + fin) / 2) * costoActual(x.id)
    const gmroi = invPromedio > 0 ? x.margen * anual / invPromedio : null
    const diasInventario = x.costo > 0 ? (fin * costoActual(x.id)) / (x.costo / dias) : null
    return { ...x, stock: fin, invPromedio, invActual: fin * costoActual(x.id), gmroi,
      margenPct: x.venta > 0 ? x.margen / x.venta : null, margenUnit: x.unidades - x.vendidasSinCosto > 0 ? x.margen / (x.unidades - x.vendidasSinCosto) : null,
      rotacion: invPromedio > 0 ? x.costo * anual / invPromedio : null, diasInventario }
  })
  return { items, dias }
}

// Suma un conjunto de filas (para grupos y para el total)
export function sumarRentabilidad(lista, dias) {
  const t = lista.reduce((s, x) => {
    for (const k of ['unidades', 'venta', 'costo', 'cobro', 'margen', 'invPromedio', 'invActual', 'vendidasSinCosto', 'costoEstimado', 'stock']) s[k] += x[k] || 0
    return s
  }, { unidades: 0, venta: 0, costo: 0, cobro: 0, margen: 0, invPromedio: 0, invActual: 0, vendidasSinCosto: 0, costoEstimado: 0, stock: 0 })
  const anual = 365 / dias
  return { ...t, margenPct: t.venta > 0 ? t.margen / t.venta : null, gmroi: t.invPromedio > 0 ? t.margen * anual / t.invPromedio : null,
    rotacion: t.invPromedio > 0 ? t.costo * anual / t.invPromedio : null, diasInventario: t.costo > 0 ? t.invActual / (t.costo / dias) : null }
}

export function agruparRentabilidad(items, dias) {
  const m = {}
  for (const x of items) (m[x.grupo || x.nombre] ||= []).push(x)
  return Object.entries(m).map(([nombre, lista]) => ({ id: 'G:' + nombre, nombre, esGrupo: true, cantidad: lista.length, hijos: lista, ...sumarRentabilidad(lista, dias) }))
}
