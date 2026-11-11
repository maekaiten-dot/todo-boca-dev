// src/lib/reposicion.js
// Lista de reposición: qué artículos activos pedir para que alcancen hasta la próxima revisión más lo
// que tarda en llegar el pedido. Mismo ritmo que Rotación: el mayor entre los últimos 30 y 90 días.
// Por ahora la solapa y el aviso son solo para estos perfiles (nombre como está en USUARIOS)
export const REPOSICION_SOLO_PARA = ['Adrián']
const sinTildes = t => String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase()
export const puedeVerReposicion = nombre => REPOSICION_SOLO_PARA.some(n => sinTildes(n) === sinTildes(nombre))
export const REPOSICION_DEFAULT = { cadaDias: 15, demoraDias: 5 }
export const CLAVES_REPOSICION = { cadaDias: 'REPOSICION CADA DIAS', demoraDias: 'REPOSICION DEMORA DIAS', ultima: 'REPOSICION ULTIMA REVISION' }

// "23/9/2026" → número de día
export function diaDe(fecha) {
  const p = String(fecha || '').replace(/^'/, '').split(' ')[0].split('/')
  if (p.length < 3) return null
  const d = Number(p[0]), m = Number(p[1]), a = Number(p[2])
  return d && m && a ? Math.floor(Date.UTC(a, m - 1, d) / 86400000) : null
}
export function hoyDia() {
  const [d, m, a] = new Date().toLocaleDateString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' }).split('/').map(Number)
  return Math.floor(Date.UTC(a, m - 1, d) / 86400000)
}
export const fechaDeDia = dia => { const f = new Date(dia * 86400000); return `${f.getUTCDate()}/${f.getUTCMonth() + 1}/${f.getUTCFullYear()}` }

// ¿Toca revisar? ultima: 'd/m/aaaa' o vacío
export function tocaRevisar(ultima, cadaDias = REPOSICION_DEFAULT.cadaDias, hoy = hoyDia()) {
  const u = diaDe(ultima)
  return u == null || hoy - u >= cadaDias
}

// ventas: getHistoricoVentas · articulos: activos · ingresos: getIngresos · stockMap: id → stock
export function calcularReposicion({ ventas, articulos, ingresos = [], stockMap = {}, hoy = hoyDia(), cadaDias = 15, demoraDias = 5 }) {
  const dias = Math.max(1, Number(cadaDias) || 0) + Math.max(0, Number(demoraDias) || 0)
  const u = {}
  for (const v of ventas) {
    if (v.anulado || !v.articulo) continue
    const d = diaDe(v.fecha); if (d == null) continue
    const antig = hoy - d
    if (antig < 0 || antig >= 90) continue
    const x = (u[v.articulo] ||= { u30: 0, u90: 0, ultima: d })
    x.u90 += v.cantidad; if (antig < 30) x.u30 += v.cantidad
    if (d > x.ultima) x.ultima = d
  }
  const ultIng = {}
  for (const i of ingresos) {
    if (i.anulado || !i.articuloId) continue
    const d = diaDe(i.fecha); if (d == null) continue
    if (!ultIng[i.articuloId] || d >= ultIng[i.articuloId].dia) ultIng[i.articuloId] = { dia: d, proveedor: String(i.proveedor || '').trim(), costo: i.costoUnitario, cantidad: i.cantidad }
  }
  const items = []
  for (const a of articulos) {
    const x = u[a.id]; if (!x) continue
    const ritmo = Math.max(x.u30 / 30, x.u90 / 90)
    if (!(ritmo > 0)) continue
    const tiene = Object.prototype.hasOwnProperty.call(stockMap, a.id)
    const stock = tiene ? Number(stockMap[a.id]) || 0 : null
    const util = Math.max(0, stock ?? 0)
    const alcanza = util / ritmo
    if (alcanza >= dias) continue
    const pedir = Math.max(1, Math.ceil(ritmo * dias - util))
    const ing = ultIng[a.id]
    const urgencia = util <= 0 ? 'sin' : alcanza < demoraDias ? 'antes' : 'revision'
    items.push({
      id: a.id, nombre: a.nombre, foto: a.foto, precio: Number(a.precioUnitario) || 0,
      stock, negativo: stock != null && stock < 0, sinDato: !tiene,
      porSemana: ritmo * 7, alcanza, pedir, urgencia, u30: x.u30, u90: x.u90, ultimaVenta: x.ultima,
      proveedor: ing?.proveedor || '', ultimoIngreso: ing?.dia ?? null, ultimoCosto: ing?.costo || Number(a.costoUnitario) || 0,
    })
  }
  const orden = { sin: 0, antes: 1, revision: 2 }
  items.sort((p, q) => orden[p.urgencia] - orden[q.urgencia] || p.alcanza - q.alcanza || q.porSemana - p.porSemana)
  return { items, dias }
}
