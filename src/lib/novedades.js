// src/lib/novedades.js
// Cuentas del aviso de novedades (sin pantalla ni planilla): qué cambió en los artículos contra lo que
// alguien ya vio, cómo se juntan los avisos de varias personas y qué pagos cargó el otro Admin.
import { firmaPago } from '../api/sheets.js'

export const datoVisto = a => ({ p: a.precioUnitario, n: a.nombre })
const numId = id => Number(String(id).replace(/\D/g, '')) || 0

// arts: artículos activos de hoy; v: lo que ya vio ({ activos, inactivos }); alias: códigos unificados
export function calcularCambiosArticulos(arts, v, alias = {}) {
  const idsActivos = new Set(arts.map(a => a.id))
  // Un código que nunca vio: si es más nuevo que el último que conoce (los TB son correlativos) es un
  // producto nuevo; si es más viejo, es uno que estaba inactivo y volvió a activarse
  const maxVisto = Math.max(0, ...Object.keys(v.activos).map(numId), ...Object.keys(v.inactivos).map(numId))
  const esNuevo = a => !v.inactivos[a.id] && numId(a.id) > maxVisto
  return {
    precios: arts.filter(a => v.activos[a.id] && a.precioUnitario > 0 && v.activos[a.id].p !== a.precioUnitario)
      .map(a => ({ id: a.id, nombre: a.nombre, foto: a.foto, antes: v.activos[a.id].p, ahora: a.precioUnitario })),
    nuevos: arts.filter(a => !v.activos[a.id] && esNuevo(a)).map(a => ({ id: a.id, nombre: a.nombre, foto: a.foto, precio: a.precioUnitario })),
    reactivados: arts.filter(a => !v.activos[a.id] && !esNuevo(a)).map(a => ({ id: a.id, nombre: a.nombre, foto: a.foto, precio: a.precioUnitario })),
    // Un artículo unificado en otro no es una baja: se sigue vendiendo con el otro código
    bajas: Object.entries(v.activos).filter(([id]) => !idsActivos.has(id) && !alias[id]).map(([id, d]) => ({ id, nombre: d.n, precio: d.p })),
  }
}

// Lo que queda como "visto" después de tocar Entendido / Leído
export function vistoDespues(arts, v, cambios) {
  const activos = Object.fromEntries(arts.map(a => [a.id, datoVisto(a)]))
  const inactivos = { ...(v?.inactivos || {}) }
  ;(cambios?.bajas || []).forEach(b => { inactivos[b.id] = { p: b.precio, n: b.nombre } })
  Object.keys(activos).forEach(id => { delete inactivos[id] })
  return { activos, inactivos }
}

// Junta los avisos de varias personas en uno solo (sin repetir)
export function unirCambios(lista) {
  const out = { precios: [], nuevos: [], reactivados: [], bajas: [], tutoriales: [] }
  for (const c of lista) {
    if (!c) continue
    for (const k of Object.keys(out)) {
      for (const x of c[k] || []) if (!out[k].some(y => y.id === x.id)) out[k].push(x)
    }
  }
  return out
}

export function detalleLogCambios(c) {
  return [
    ...(c.precios || []).map(x => `${x.id} $${x.antes} → $${x.ahora}`),
    ...(c.nuevos || []).map(x => `${x.id} NUEVO`),
    ...(c.reactivados || []).map(x => `${x.id} ACTIVO`),
    ...(c.bajas || []).map(x => `${x.id} INACTIVO`),
    ...(c.tutoriales || []).map(t => `${t.id} ${t.titulo}`),
    ...(c.pagos || []).map(p => `${p.ids[0]} ${p.titulo} $${Math.round(p.total)}`),
  ].join(' · ').slice(0, 400)
}

// Pagos nuevos o cambiados desde lo que vio este dispositivo, sin contar los que se cargaron acá
// (propios). Los renglones de una misma compra (factura) se juntan en uno.
// Devuelve { items, absorbidos } — absorbidos: ids propios que ya se pueden dar por vistos.
export function calcularCambiosPagos(pagos, vistos, propios = {}) {
  const grupos = new Map(), absorbidos = []
  for (const p of pagos) {
    const f = firmaPago(p), antes = vistos[p.idPago]
    if (antes === f) continue
    if (propios[p.idPago]) { absorbidos.push(p.idPago); continue }
    const clave = p.compra || p.idPago
    const g = grupos.get(clave) || { clave, ids: [], nuevo: true, anulado: true, tipo: p.tipo, titulo: '', detalle: '', etiqueta: p.etiqueta, correspondeA: p.correspondeA, quien: p.empleado, total: 0, pagado: 0, pagadoAntes: 0, saldado: true, fechaPago: p.fechaPago }
    g.ids.push(p.idPago)
    g.nuevo = g.nuevo && !antes
    g.anulado = g.anulado && p.anulado
    g.total += p.costoTotal || 0
    g.pagado += p.montoPagado || 0
    g.pagadoAntes += Number(String(antes || '').split('|')[1]) || 0
    g.saldado = g.saldado && (p.pagado || (p.montoPagado || 0) >= (p.costoTotal || 0) - 0.5)
    if (!g.titulo) g.titulo = (p.proveedor || (p.tipo === 'GASTO' ? p.descripcion : '') || p.etiqueta || p.articuloNombre || 'Pago').trim()
    if (!g.detalle) g.detalle = p.tipo === 'GASTO' ? (p.proveedor ? p.descripcion || '' : '') : (p.articuloNombre || p.descripcion || '')
    grupos.set(clave, g)
  }
  for (const g of grupos.values()) if (g.ids.length > 1 && g.tipo !== 'GASTO') g.detalle = `${g.ids.length} productos${g.detalle ? ` · ${g.detalle}…` : ''}`
  return { items: [...grupos.values()], absorbidos }
}
