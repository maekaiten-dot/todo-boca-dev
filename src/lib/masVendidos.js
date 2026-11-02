// src/lib/masVendidos.js
// Botones rápidos del modo partido: lo que más se vende los días de mucha gente.
// Se toman los DIAS días con más unidades vendidas de los últimos MESES meses (son los de partido)
// y se cuentan las unidades de cada artículo en esos días. Solo artículos activos.
const DIAS = 10
const MESES = 4

const diaDe = f => { const [d, m, a] = String(f || '').replace(/^'/, '').split(' ')[0].split('/').map(Number); return d && m && a ? a * 10000 + m * 100 + d : null }

export function calcularMasVendidos(ventas, articulos, n = 16, hoy = new Date()) {
  const activos = new Set(articulos.map(a => a.id))
  const lim = new Date(hoy); lim.setMonth(lim.getMonth() - MESES)
  const desde = lim.getFullYear() * 10000 + (lim.getMonth() + 1) * 100 + lim.getDate()
  const porDia = {}
  for (const v of ventas) {
    if (v.anulado || !(v.cantidad > 0)) continue
    const d = diaDe(v.fecha); if (!d || d < desde) continue
    const x = (porDia[d] ||= { u: 0, arts: {} })
    x.u += v.cantidad
    x.arts[v.articulo] = (x.arts[v.articulo] || 0) + v.cantidad
  }
  const dias = Object.values(porDia).sort((a, b) => b.u - a.u).slice(0, DIAS)
  const tot = {}
  dias.forEach(d => Object.entries(d.arts).forEach(([id, u]) => { if (activos.has(id)) tot[id] = (tot[id] || 0) + u }))
  return Object.entries(tot).sort((a, b) => b[1] - a[1]).slice(0, n).map(([id]) => id)
}
