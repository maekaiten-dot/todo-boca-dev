// GET /api/indices → { inflacion: { 'aaaa-mm': % mensual }, blue: { 'aaaa-mm': promedio venta }, ultimoIpc: 'aaaa-mm' }
// Datos públicos (INDEC y dólar blue) de api.argentinadatos.com, para ver las ventas
// "en pesos de hoy" (a precios constantes) o "en dólares" en Estadísticas.
// Se cachea un día en Vercel: el IPC sale una vez por mes y el blue alcanza con el promedio mensual.
const DESDE = '2023-01'

async function traer(url) {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), 9000)
  try {
    const r = await fetch(url, { signal: ctrl.signal })
    if (!r.ok) throw new Error(`${url}: ${r.status}`)
    return await r.json()
  } finally { clearTimeout(t) }
}

export default async function handler(req, res) {
  try {
    const [inf, blue] = await Promise.allSettled([
      traer('https://api.argentinadatos.com/v1/finanzas/indices/inflacion'),
      traer('https://api.argentinadatos.com/v1/cotizaciones/dolares/blue'),
    ])
    const inflacion = {}
    if (inf.status === 'fulfilled') for (const x of inf.value || []) {
      const mes = String(x.fecha || '').slice(0, 7)
      if (mes >= DESDE && Number.isFinite(Number(x.valor))) inflacion[mes] = Number(x.valor)
    }
    const suma = {}, cuenta = {}
    if (blue.status === 'fulfilled') for (const x of blue.value || []) {
      const mes = String(x.fecha || '').slice(0, 7)
      const v = Number(x.venta)
      if (mes >= DESDE && v > 0) { suma[mes] = (suma[mes] || 0) + v; cuenta[mes] = (cuenta[mes] || 0) + 1 }
    }
    const blueMes = Object.fromEntries(Object.keys(suma).map(m => [m, Math.round(suma[m] / cuenta[m] * 100) / 100]))
    const ultimoIpc = Object.keys(inflacion).sort().pop() || null
    if (!ultimoIpc && !Object.keys(blueMes).length) {
      res.setHeader('Cache-Control', 'no-store')
      return res.status(502).json({ error: 'No se pudieron obtener la inflación ni el dólar' })
    }
    res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate=172800')
    res.status(200).json({ inflacion, blue: blueMes, ultimoIpc })
  } catch (e) {
    console.error(e)
    res.setHeader('Cache-Control', 'no-store')
    res.status(500).json({ error: e.message })
  }
}
