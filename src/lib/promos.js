// src/lib/promos.js
// Promos configurables desde la solapa Promos (hoja PROMOS). Se usan igual en el carrito
// (NuevaVenta) y al guardar la venta (registrarVenta), así lo cobrado coincide con lo mostrado.
//
// Tipos:
//  · CANTIDAD     llevando N de los artículos A, pagan $PRECIO por cada N (se repite: 6 = dos grupos)
//  · COMBINACION  por cada artículo A, un artículo B con PORCENTAJE % de descuento
//  · KIT          un artículo A + un artículo B a $PRECIO los dos
// Reglas:
//  · Solo vale entre DESDE y HASTA (inclusive, hora de Argentina) y con ESTADO = ACTIVA.
//  · Una unidad usa una sola promo: las promos se aplican en el orden de la hoja y lo que ya
//    entró en una no entra en otra. Los artículos con promo fija (imanes, alfajores, 2x1 XXXL)
//    no entran en las configurables.
//  · Los descuentos van en pesos enteros; dentro de un grupo se reparten por precio.
//  · Nunca hacen subir el precio: si el precio de promo es mayor que el de lista, no aplica.

export const TIPOS_PROMO = { CANTIDAD: 'Por cantidad', COMBINACION: 'Combinación', KIT: 'Kit' }
// Promos programadas en la app (no se editan desde la solapa; se pueden pausar)
export const PROMOS_FIJAS = [
  { id: 'FIJA-IMANES', nombre: 'Imanes: 2 o 3 con descuento', detalle: 'Imanes de $8.000: 2 a $7.000 c/u, 3 o más a $6.000 · imanes de $6.000: 2 a $5.000, 3 o más a $4.000' },
  { id: 'FIJA-ALFAJORES', nombre: 'Alfajores: 6 combinados a $13.000', detalle: 'Alfajores Maradona, Boca GOAT y el tercero de la promo' },
]

const clave = i => String(i.articulo || i.id || '').trim()
const diaAR = (ms = Date.now()) => {
  const [d, m, a] = new Date(ms).toLocaleDateString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' }).split('/').map(Number)
  return a * 10000 + m * 100 + d
}
const diaDeTexto = t => { const p = String(t || '').replace(/^'/, '').trim().split('/').map(Number); return p[2] ? p[2] * 10000 + p[1] * 100 + p[0] : null }

export function promoVigente(p, ms = Date.now()) {
  if (!p || String(p.estado || '').toUpperCase() !== 'ACTIVA' || !TIPOS_PROMO[p.tipo]) return false
  const hoy = diaAR(ms), desde = diaDeTexto(p.desde), hasta = diaDeTexto(p.hasta)
  if (desde && hoy < desde) return false
  if (hasta && hoy > hasta) return false
  return true
}
export const fijaPausada = (promos, id) => (promos || []).some(p => p.id === id && String(p.estado).toUpperCase() === 'PAUSADA')

// Reparte un descuento entero entre unidades según su precio; devuelve un entero por unidad
function repartir(total, unidades) {
  const suma = unidades.reduce((s, u) => s + u.precio, 0) || 1
  const partes = unidades.map(u => Math.floor(total * u.precio / suma))
  let resto = total - partes.reduce((s, x) => s + x, 0)
  for (let k = 0; resto > 0; k = (k + 1) % partes.length, resto--) partes[k]++
  return partes
}

// items: [{ articulo|id, cantidad, precioUnitario }] en el orden del carrito
// excluir: Set de códigos que ya tienen otra promo (no entran)
// Devuelve: porItem (descuento en $ por línea), detalle por línea [{ id, monto }], aplicadas [{ id, nombre, descuento, veces }], total
export function calcularPromosConfig(items, promos, { excluir = new Set(), ms = Date.now() } = {}) {
  const libres = items.map(i => excluir.has(clave(i)) ? 0 : Math.max(0, Math.floor(Number(i.cantidad) || 0)))
  const porItem = items.map(() => 0)
  const detalle = items.map(() => ({}))
  const aplicadas = []
  const unidades = set => {
    const out = []
    items.forEach((it, idx) => { if (set.has(clave(it))) for (let k = 0; k < libres[idx]; k++) out.push({ idx, precio: Number(it.precioUnitario) || 0 }) })
    return out
  }
  const sumar = (p, us, montos) => {
    us.forEach((u, k) => {
      if (!montos[k]) return
      porItem[u.idx] += montos[k]
      detalle[u.idx][p.id] = (detalle[u.idx][p.id] || 0) + montos[k]
    })
  }
  for (const p of (promos || []).filter(x => promoVigente(x, ms))) {
    const A = new Set(p.articulosA || []), B = new Set(p.articulosB || [])
    let total = 0, veces = 0
    if (p.tipo === 'CANTIDAD') {
      const n = Math.floor(Number(p.cantidad) || 0), precio = Number(p.precio) || 0
      if (n < 2 || precio <= 0) continue
      const us = unidades(A)
      for (let g = 0; g + n <= us.length; g += n) {
        const grupo = us.slice(g, g + n)
        const lista = grupo.reduce((s, u) => s + u.precio, 0)
        const dto = Math.round(lista - precio)
        if (dto <= 0) continue
        sumar(p, grupo, repartir(dto, grupo))
        grupo.forEach(u => libres[u.idx]--)
        total += dto; veces++
      }
    } else {
      // Pares A + B en orden de carrito, sin usar la misma unidad dos veces
      const usA = unidades(A)
      const tmp = [...libres]
      const pares = []
      for (const a of usA) {
        if (tmp[a.idx] <= 0) continue
        tmp[a.idx]--
        const bIdx = items.findIndex((it, idx) => B.has(clave(it)) && tmp[idx] > 0)
        if (bIdx < 0) { tmp[a.idx]++; break }
        tmp[bIdx]--
        pares.push({ a, b: { idx: bIdx, precio: Number(items[bIdx].precioUnitario) || 0 } })
      }
      for (const { a, b } of pares) {
        let dto = 0, montos = null, us = null
        if (p.tipo === 'COMBINACION') {
          const pct = Math.min(100, Math.max(0, Number(p.porcentaje) || 0))
          dto = Math.round(b.precio * pct / 100)
          us = [b]; montos = [dto]
        } else if (p.tipo === 'KIT') {
          const precio = Number(p.precio) || 0
          dto = Math.round(a.precio + b.precio - precio)
          us = [a, b]; montos = dto > 0 ? repartir(dto, us) : null
        }
        if (!(dto > 0) || !montos) continue
        sumar(p, us, montos)
        libres[a.idx]--; libres[b.idx]--
        total += dto; veces++
      }
    }
    if (total > 0) aplicadas.push({ id: p.id, nombre: p.nombre, descuento: total, veces })
  }
  return {
    porItem, aplicadas, total: aplicadas.reduce((s, a) => s + a.descuento, 0),
    // Texto para la columna PROMOS de cada renglón: "P003:2500 | P004:1200"
    textoPorItem: detalle.map(d => Object.entries(d).map(([id, m]) => `${id}:${Math.round(m)}`).join(' | ')),
  }
}

// Etiqueta corta para mostrar en el buscador de artículos
export function etiquetaPromo(p) {
  const $ = n => '$' + Math.round(Number(n) || 0).toLocaleString('es-AR')
  if (p.tipo === 'CANTIDAD') return `${p.cantidad}×${$(p.precio)}`
  if (p.tipo === 'COMBINACION') return `combo −${p.porcentaje}%`
  if (p.tipo === 'KIT') return `kit ${$(p.precio)}`
  return 'promo'
}
