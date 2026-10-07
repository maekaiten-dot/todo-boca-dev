// src/pages/Rotacion.jsx
// Rotación de artículos: más vendidos en 30/60/90/365 días, ritmo semanal y
// reposición sugerida según el stock calculado. Solo para Admin (lo controla App.jsx).
import { useState, useEffect, useMemo } from 'react'
import { getHistoricoVentas, getIngresos } from '../api/sheets.js'

const VENTANAS = [30, 60, 90, 365]
const METRICAS = [
  { id: 'u', label: 'Unidades' },
  { id: 't', label: 'Tickets' },
  { id: 'r', label: 'Facturación' },
]
const TOPS = [10, 15, 25]
const DIAS_COBERTURA = 14

const fmtN = n => Math.round(n).toLocaleString('es-AR')
const fmtM = n => '$' + (n >= 1e6 ? (n / 1e6).toLocaleString('es-AR', { maximumFractionDigits: 1 }) + ' M' : fmtN(n / 1e3) + ' mil')
const fmt1 = n => n === 0 ? '–' : n.toLocaleString('es-AR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
const normalizar = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')

// "23/9/2026" → número de día (días desde epoch) para comparar sin problemas de zona horaria
function diaDesdeFecha(fecha) {
  const p = String(fecha || '').replace(/^'/, '').split('/')
  if (p.length < 3) return null
  const d = Number(p[0]), m = Number(p[1]), a = Number(p[2])
  if (!d || !m || !a) return null
  return Math.floor(Date.UTC(a, m - 1, d) / 86400000)
}
function hoyArgentina() {
  const [d, m, a] = new Date().toLocaleDateString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' }).split('/').map(Number)
  return Math.floor(Date.UTC(a, m - 1, d) / 86400000)
}

// Agrupa las ventas por artículo y ventana: [unidades, tickets, facturación]
function calcularRotacion(ventas, articulos) {
  const hoy = hoyArgentina()
  const nombres = {}
  articulos.forEach(a => { nombres[a.id] = a.nombre })
  const porArt = {}
  let totales = Object.fromEntries(VENTANAS.map(w => [w, { u: 0, tickets: new Set() }]))

  for (const v of ventas) {
    if (v.anulado || !v.articulo) continue
    const dia = diaDesdeFecha(v.fecha)
    if (dia == null) continue
    const antig = hoy - dia
    if (antig < 0 || antig >= 365) continue
    const a = porArt[v.articulo] || (porArt[v.articulo] = {
      id: v.articulo, nombre: nombres[v.articulo] || v.nombre || v.articulo, ultimaVenta: dia,
      w: Object.fromEntries(VENTANAS.map(w => [w, { u: 0, t: new Set(), r: 0 }])),
    })
    if (dia > a.ultimaVenta) a.ultimaVenta = dia
    const ticket = v.idVenta || v.idDetalle
    const monto = v.precioTotalFinal || v.precioTotal || 0
    for (const w of VENTANAS) {
      if (antig < w) {
        a.w[w].u += v.cantidad
        a.w[w].t.add(ticket)
        a.w[w].r += monto
        totales[w].u += v.cantidad
        totales[w].tickets.add(ticket)
      }
    }
  }
  const lista = Object.values(porArt).map(a => {
    const w = {}
    for (const k of VENTANAS) w[k] = { u: a.w[k].u, t: a.w[k].t.size, r: a.w[k].r }
    return { ...a, w }
  })
  totales = Object.fromEntries(VENTANAS.map(w => [w, { u: totales[w].u, t: totales[w].tickets.size }]))
  return { lista, totales, hoy }
}

function fechaDeDia(dia) {
  const d = new Date(dia * 86400000)
  return `${d.getUTCDate()}/${d.getUTCMonth() + 1}`
}

export default function Rotacion({ articulos = [], stockMap = {} }) {
  const [ventas, setVentas] = useState([])
  const [ingresos, setIngresos] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [metrica, setMetrica] = useState('u')
  const [top, setTop] = useState(15)
  const [busqueda, setBusqueda] = useState('')
  const [orden, setOrden] = useState({ k: 'w30', dir: -1 })
  const [mostrar, setMostrar] = useState(50)

  useEffect(() => { cargar() }, [])

  async function cargar() {
    setLoading(true)
    setError(null)
    try {
      const [v, ing] = await Promise.all([getHistoricoVentas(), getIngresos().catch(() => [])])
      setVentas(v); setIngresos(ing)
    }
    catch (e) { console.error(e); setError('No se pudo cargar. Intentá de nuevo.') }
    finally { setLoading(false) }
  }

  const { lista, totales, hoy } = useMemo(() => calcularRotacion(ventas, articulos), [ventas, articulos])

  // "Nuevo en el top": está en el top de la ventana pero no en el top del año
  const topAnio = useMemo(() => new Set(
    [...lista].filter(a => a.w[365][metrica] > 0).sort((a, b) => b.w[365][metrica] - a.w[365][metrica]).slice(0, top).map(a => a.id)
  ), [lista, metrica, top])

  // Menos vendidos: artículos activos con stock (o sin stock calculado), incluidos los que no se vendieron nada.
  // Los que no tienen stock ni ventas no entran: no hay nada que liquidar.
  // Artículo "nuevo": su primer ingreso es reciente y nunca se había vendido antes. No se lo compara
  // en las ventanas que empiezan antes de que llegara (no tuvo tiempo de venderse).
  const llegadaNuevos = useMemo(() => {
    const primerIngreso = {}, primeraVenta = {}
    ingresos.forEach(i => { if (i.anulado || !i.articuloId) return; const d = diaDesdeFecha(i.fecha); if (d != null && (primerIngreso[i.articuloId] == null || d < primerIngreso[i.articuloId])) primerIngreso[i.articuloId] = d })
    ventas.forEach(v => { if (v.anulado || !v.articulo) return; const d = diaDesdeFecha(v.fecha); if (d != null && (primeraVenta[v.articulo] == null || d < primeraVenta[v.articulo])) primeraVenta[v.articulo] = d })
    const out = {}
    Object.entries(primerIngreso).forEach(([id, d]) => { if (primeraVenta[id] == null || primeraVenta[id] >= d) out[id] = d })
    return out
  }, [ingresos, ventas])

  const menosVendidos = useMemo(() => {
    const porId = Object.fromEntries(lista.map(a => [a.id, a]))
    const candidatos = articulos.filter(a => {
      if (!a.id || !a.nombre) return false
      const tieneStock = Object.prototype.hasOwnProperty.call(stockMap, a.id)
      return !tieneStock || stockMap[a.id] > 0
    })
    const out = {}
    for (const w of VENTANAS) {
      out[w] = candidatos.filter(a => llegadaNuevos[a.id] == null || llegadaNuevos[a.id] <= hoy - w).map(a => {
        const r = porId[a.id]
        const tieneStock = Object.prototype.hasOwnProperty.call(stockMap, a.id)
        return { id: a.id, nombre: a.nombre, valor: r ? r.w[w][metrica] : 0, stock: tieneStock ? stockMap[a.id] : null, ultimaVenta: r ? r.ultimaVenta : null }
      }).sort((x, y) =>
        x.valor - y.valor ||
        (y.stock ?? 0) - (x.stock ?? 0) ||
        (x.ultimaVenta ?? -1) - (y.ultimaVenta ?? -1)
      ).slice(0, top)
    }
    return out
  }, [lista, articulos, stockMap, metrica, top, llegadaNuevos, hoy])

  const filas = useMemo(() => lista.map(a => {
    const w30 = a.w[30].u / 30 * 7, w90 = a.w[90].u / 90 * 7, w365 = a.w[365].u / 365 * 7
    const ritmoDia = Math.max(w30, w90) / 7
    const tieneStock = Object.prototype.hasOwnProperty.call(stockMap, a.id)
    const stock = tieneStock ? stockMap[a.id] : null
    const stockUtil = Math.max(0, stock ?? 0)
    const cobertura = tieneStock && ritmoDia > 0 ? stockUtil / ritmoDia : null
    const reponer = Math.max(0, Math.ceil(ritmoDia * DIAS_COBERTURA - stockUtil))
    const tendencia = w365 > 0 ? w30 / w365 : (w30 > 0 ? 99 : 0)
    return { id: a.id, nombre: a.nombre, w30, w90, w365, tendencia, t30: a.w[30].t, ultimaVenta: a.ultimaVenta, stock, cobertura, reponer, tieneStock }
  }), [lista, stockMap])

  const filasVisibles = useMemo(() => {
    const q = normalizar(busqueda.trim())
    const f = filas.filter(r => !q || normalizar(r.nombre).includes(q) || normalizar(r.id).includes(q))
    const val = r => { const v = r[orden.k]; return v == null ? (orden.dir > 0 ? Infinity : -Infinity) : v }
    return f.sort((a, b) => {
      const A = val(a), B = val(b)
      return (typeof A === 'string' ? A.localeCompare(B) : A - B) * orden.dir
    })
  }, [filas, busqueda, orden])

  function ordenarPor(k) {
    setOrden(o => o.k === k ? { k, dir: -o.dir } : { k, dir: k === 'nombre' || k === 'cobertura' ? 1 : -1 })
  }

  if (loading) return (
    <div style={S.center}>
      <div style={S.loadingText}>Calculando rotación...</div>
      <div style={S.loadingSub}>Esto puede tardar unos segundos</div>
    </div>
  )
  if (error) return (
    <div style={S.center}>
      <div style={S.errorText}>{error}</div>
      <button style={S.retryBtn} onClick={cargar}>Reintentar</button>
    </div>
  )

  const fmtVal = v => metrica === 'r' ? fmtM(v) : fmtN(v)
  const columnas = [
    { k: 'nombre', label: 'Artículo', left: true },
    { k: 'reponer', label: 'Reponer' },
    { k: 'stock', label: 'Stock' },
    { k: 'cobertura', label: 'Alcanza' },
    { k: 'w30', label: 'u/sem 30d' },
    { k: 'w90', label: 'u/sem 90d' },
    { k: 'w365', label: 'u/sem año' },
    { k: 'tendencia', label: 'Tendencia' },
    { k: 't30', label: 'Tickets 30d' },
  ]

  return (
    <div style={S.page}>
      <div style={S.header}>
        <div>
          <div style={S.headerTitle}>ROTACIÓN</div>
          <div style={S.headerSub}>Hasta hoy {fechaDeDia(hoy)} · sin ventas anuladas</div>
        </div>
        <button style={S.refreshBtn} onClick={cargar} aria-label="Actualizar">↻</button>
      </div>

      <div style={S.controls}>
        <Segmento opciones={METRICAS.map(m => ({ v: m.id, label: m.label }))} valor={metrica} onChange={setMetrica} />
        <Segmento opciones={TOPS.map(n => ({ v: n, label: `Top ${n}` }))} valor={top} onChange={setTop} />
      </div>

      <div style={S.statsRow}>
        {VENTANAS.map(w => (
          <div key={w} style={S.statCard}>
            <div style={S.statValue}>{fmtN(totales[w].u)} u.</div>
            <div style={S.statLabel}>{w === 365 ? 'Último año' : `Últimos ${w} días`} · {fmtN(totales[w].t)} tickets</div>
          </div>
        ))}
      </div>

      <div style={S.legend}>
        <span><i style={{ ...S.legendDot, background: '#2196f3' }} />También está en el top del año</span>
        <span><i style={{ ...S.legendDot, background: 'var(--accent)' }} />No está en el top del año: viene subiendo</span>
      </div>

      <div style={S.grid}>
        {VENTANAS.map(w => {
          const ranking = lista.filter(a => a.w[w][metrica] > 0).sort((a, b) => b.w[w][metrica] - a.w[w][metrica]).slice(0, top)
          const max = ranking[0]?.w[w][metrica] || 1
          return (
            <div key={w} style={{ ...S.chartCard, margin: 0 }}>
              <div style={S.chartTitle}>{w === 365 ? 'Último año' : `Últimos ${w} días`}</div>
              {ranking.length === 0 && <div style={S.vacio}>Sin ventas en este período</div>}
              {ranking.map((a, i) => {
                const sube = w !== 365 && !topAnio.has(a.id)
                return (
                  <div key={a.id} style={S.barRow}>
                    <span style={S.rank}>{i + 1}</span>
                    <div style={{ minWidth: 0 }}>
                      <div style={S.barName} title={`${a.id} · ${a.nombre}`}>{a.nombre}</div>
                      <div style={S.barLine}>
                        <div style={{ ...S.bar, width: `${Math.max(1, a.w[w][metrica] / max * 80)}%`, background: sube ? 'var(--accent)' : '#2196f3' }} />
                        <span style={S.barVal}>{fmtVal(a.w[w][metrica])}</span>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )
        })}
      </div>

      <div style={S.seccion}>MENOS VENDIDOS</div>
      <div style={S.legend}>
        <span><i style={{ ...S.legendDot, background: '#ef4444' }} />Sin ventas en el período</span>
        <span><i style={{ ...S.legendDot, background: '#6a8ccc' }} />Vendió poco</span>
        <span>Solo artículos activos con stock. A igual venta, primero el que tiene más stock parado. Los que llegaron por primera vez dentro del período no se cuentan en ese período.</span>
      </div>

      <div style={S.grid}>
        {VENTANAS.map(w => {
          const ranking = menosVendidos[w] || []
          const max = Math.max(1, ...ranking.map(a => a.valor))
          return (
            <div key={w} style={{ ...S.chartCard, margin: 0 }}>
              <div style={S.chartTitle}>{w === 365 ? 'Último año' : `Últimos ${w} días`}</div>
              {ranking.length === 0 && <div style={S.vacio}>Sin artículos para mostrar</div>}
              {ranking.map((a, i) => (
                <div key={a.id} style={S.barRow}>
                  <span style={S.rank}>{i + 1}</span>
                  <div style={{ minWidth: 0 }}>
                    <div style={S.barName} title={`${a.id} · ${a.nombre}`}>{a.nombre}</div>
                    <div style={S.barLine}>
                      <div style={{ ...S.bar, width: `${a.valor > 0 ? Math.max(1, a.valor / max * 80) : 1}%`, background: a.valor > 0 ? '#6a8ccc' : '#ef4444' }} />
                      <span style={S.barVal}>{a.valor === 0 ? '0' : fmtVal(a.valor)}</span>
                      <span style={S.barExtra}>
                        {a.stock != null ? `stock ${fmtN(a.stock)} · ` : ''}{a.ultimaVenta != null ? `últ. venta ${fechaDeDia(a.ultimaVenta)}` : 'sin ventas en el año'}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )
        })}
      </div>

      <div style={S.chartCard}>
        <div style={S.chartTitle}>Ritmo de venta y reposición</div>
        <div style={S.nota}>
          Unidades por semana en cada ventana. La tendencia compara los últimos 30 días con el promedio del año.
          "Alcanza" son los días que dura el stock al ritmo más alto entre 30 y 90 días.
          "Reponer" es lo que falta para cubrir {DIAS_COBERTURA} días a ese ritmo, ya descontando el stock.
        </div>
        <input
          style={S.search}
          type="search"
          placeholder="Buscar artículo o código…"
          value={busqueda}
          onChange={e => { setBusqueda(e.target.value); setMostrar(50) }}
        />
        <div style={S.tableWrap}>
          <table style={S.table}>
            <thead>
              <tr>
                {columnas.map(c => (
                  <th key={c.k} style={{ ...S.th, textAlign: c.left ? 'left' : 'right' }} onClick={() => ordenarPor(c.k)}>
                    {c.label}{orden.k === c.k ? (orden.dir > 0 ? ' ▲' : ' ▼') : ''}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filasVisibles.slice(0, mostrar).map(r => (
                <tr key={r.id}>
                  <td style={{ ...S.td, ...S.tdNombre }}>
                    {r.nombre}
                    <div style={S.codigo}>{r.id} · última venta {fechaDeDia(r.ultimaVenta)}</div>
                  </td>
                  <td style={{ ...S.td, ...S.tdReponer }}>{r.reponer || '–'}</td>
                  <td style={{ ...S.td, color: r.stock != null && r.stock <= 0 ? '#ef4444' : 'var(--text)' }}>{r.stock == null ? '–' : fmtN(r.stock)}</td>
                  <td style={{ ...S.td, ...coberturaColor(r.cobertura) }}>{r.cobertura == null ? '–' : r.cobertura >= 365 ? '+1 año' : `${fmtN(r.cobertura)} d`}</td>
                  <td style={S.td}>{fmt1(r.w30)}</td>
                  <td style={S.td}>{fmt1(r.w90)}</td>
                  <td style={S.td}>{fmt1(r.w365)}</td>
                  <td style={S.td}><Tendencia r={r} /></td>
                  <td style={S.td}>{r.t30 || '–'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {filasVisibles.length > mostrar && (
          <button style={S.masBtn} onClick={() => setMostrar(m => m + 50)}>Ver 50 más ({filasVisibles.length - mostrar} restantes)</button>
        )}
      </div>
    </div>
  )
}

function Segmento({ opciones, valor, onChange }) {
  return (
    <div style={S.seg}>
      {opciones.map((o, i) => (
        <button
          key={o.v}
          style={{ ...S.segBtn, ...(i > 0 ? S.segBtnSep : {}), ...(valor === o.v ? S.segBtnActivo : {}) }}
          onClick={() => onChange(o.v)}
          aria-pressed={valor === o.v}
        >{o.label}</button>
      ))}
    </div>
  )
}

function Tendencia({ r }) {
  if (r.w365 * 52 < 6 && r.w30 > 0) return <span style={{ ...S.chip, ...S.chipNuevo }}>Nuevo</span>
  if (r.w30 === 0) return <span style={{ ...S.chip, ...S.chipBaja }}>Sin ventas 30d</span>
  if (r.tendencia >= 1.3) return <span style={{ ...S.chip, ...S.chipSube }}>▲ ×{r.tendencia.toFixed(1)}</span>
  if (r.tendencia <= 0.7) return <span style={{ ...S.chip, ...S.chipBaja }}>▼ ×{r.tendencia.toFixed(1)}</span>
  return <span style={{ ...S.chip, ...S.chipEstable }}>Estable</span>
}

function coberturaColor(dias) {
  if (dias == null) return {}
  if (dias < 7) return { color: '#ef4444', fontWeight: 700 }
  if (dias < DIAS_COBERTURA) return { color: 'var(--accent)', fontWeight: 700 }
  return {}
}

const S = {
  page: { display: 'flex', flexDirection: 'column', height: '100%', overflowY: 'auto', paddingBottom: 24 },
  center: { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 12 },
  loadingText: { fontFamily: 'Barlow Condensed, sans-serif', fontSize: 22, color: 'var(--muted)' },
  loadingSub: { fontFamily: 'Barlow, sans-serif', fontSize: 13, color: 'var(--muted)' },
  errorText: { fontFamily: 'Barlow, sans-serif', fontSize: 16, color: '#ef4444', textAlign: 'center' },
  retryBtn: { background: 'var(--surface)', border: '1.5px solid var(--border)', borderRadius: 10, color: 'var(--text)', fontFamily: 'Barlow, sans-serif', fontSize: 15, padding: '10px 24px', cursor: 'pointer' },
  header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px 12px', borderBottom: '2px solid var(--accent)', flexShrink: 0 },
  headerTitle: { fontFamily: 'Barlow Condensed, sans-serif', fontWeight: 800, fontSize: 28, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: 2 },
  headerSub: { fontFamily: 'Barlow, sans-serif', fontSize: 12, color: 'var(--muted)' },
  refreshBtn: { background: 'var(--surface)', border: '1.5px solid var(--border)', borderRadius: 10, color: 'var(--text)', fontSize: 24, width: 44, height: 44, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  controls: { display: 'flex', flexWrap: 'wrap', gap: 10, padding: '14px 20px 0' },
  seg: { display: 'inline-flex', border: '1.5px solid var(--border)', borderRadius: 10, overflow: 'hidden', background: 'var(--surface)' },
  segBtn: { fontFamily: 'Barlow Condensed, sans-serif', fontWeight: 700, fontSize: 15, letterSpacing: 0.5, border: 'none', background: 'transparent', color: 'var(--muted)', padding: '8px 14px', cursor: 'pointer' },
  segBtnSep: { borderLeft: '1.5px solid var(--border)' },
  segBtnActivo: { background: 'var(--accent)', color: '#000' },
  statsRow: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, padding: '14px 20px 10px' },
  statCard: { background: 'var(--surface)', borderRadius: 12, padding: '12px 14px', border: '1.5px solid var(--border)' },
  statValue: { fontFamily: 'Barlow Condensed, sans-serif', fontWeight: 800, fontSize: 24, color: 'var(--accent)' },
  statLabel: { fontFamily: 'Barlow, sans-serif', fontSize: 12, color: 'var(--muted)', marginTop: 2 },
  legend: { display: 'flex', flexWrap: 'wrap', gap: '6px 18px', padding: '0 20px 12px', fontFamily: 'Barlow, sans-serif', fontSize: 12, color: 'var(--muted)' },
  legendDot: { display: 'inline-block', width: 14, height: 8, borderRadius: '0 4px 4px 0', marginRight: 6, verticalAlign: 'middle' },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16, padding: '0 20px 16px' },
  chartCard: { margin: '0 20px 16px', background: 'var(--surface)', borderRadius: 14, border: '1.5px solid var(--border)', padding: 16, display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 },
  chartTitle: { fontFamily: 'Barlow Condensed, sans-serif', fontWeight: 700, fontSize: 16, color: 'var(--muted)', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 8 },
  vacio: { fontFamily: 'Barlow, sans-serif', fontSize: 13, color: 'var(--muted)' },
  barRow: { display: 'grid', gridTemplateColumns: '22px minmax(0, 1fr)', gap: 8, alignItems: 'center', padding: '3px 0' },
  rank: { fontFamily: 'Barlow Condensed, sans-serif', fontWeight: 700, fontSize: 13, color: 'var(--muted)', textAlign: 'right' },
  barName: { fontFamily: 'Barlow, sans-serif', fontSize: 13, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  barLine: { display: 'flex', alignItems: 'center', gap: 8, marginTop: 2 },
  bar: { height: 8, borderRadius: '0 4px 4px 0', minWidth: 2 },
  barVal: { fontFamily: 'Barlow Condensed, sans-serif', fontWeight: 700, fontSize: 14, color: 'var(--text)', whiteSpace: 'nowrap' },
  seccion: { fontFamily: 'Barlow Condensed, sans-serif', fontWeight: 800, fontSize: 20, color: 'var(--accent)', letterSpacing: 1.5, padding: '8px 20px 6px' },
  barExtra: { fontFamily: 'Barlow, sans-serif', fontSize: 11, color: 'var(--muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  nota: { fontFamily: 'Barlow, sans-serif', fontSize: 12, color: 'var(--muted)', lineHeight: 1.5, marginBottom: 8 },
  search: { fontFamily: 'Barlow, sans-serif', fontSize: 15, padding: '10px 14px', background: 'var(--bg)', border: '1.5px solid var(--border)', borderRadius: 10, color: 'var(--text)', marginBottom: 8, width: '100%', maxWidth: 360 },
  tableWrap: { overflowX: 'auto', WebkitOverflowScrolling: 'touch' },
  table: { width: '100%', minWidth: 820, borderCollapse: 'collapse' },
  th: { fontFamily: 'Barlow Condensed, sans-serif', fontWeight: 700, fontSize: 12, color: 'var(--muted)', letterSpacing: 1, textTransform: 'uppercase', padding: '8px', borderBottom: '1.5px solid var(--border)', cursor: 'pointer', whiteSpace: 'nowrap', userSelect: 'none' },
  td: { fontFamily: 'Barlow, sans-serif', fontSize: 14, color: 'var(--text)', padding: '8px', borderBottom: '1px solid var(--border)', textAlign: 'right', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' },
  tdNombre: { textAlign: 'left', whiteSpace: 'normal', minWidth: 200, maxWidth: 300 },
  tdReponer: { fontFamily: 'Barlow Condensed, sans-serif', fontWeight: 800, fontSize: 17, color: 'var(--accent)' },
  codigo: { fontSize: 11, color: 'var(--muted)', marginTop: 2 },
  chip: { display: 'inline-block', fontFamily: 'Barlow Condensed, sans-serif', fontWeight: 700, fontSize: 12, padding: '2px 8px', borderRadius: 999 },
  chipSube: { background: 'rgba(34,197,94,0.15)', color: '#22c55e' },
  chipBaja: { background: 'rgba(106,140,204,0.15)', color: 'var(--muted)' },
  chipEstable: { border: '1px solid var(--border)', color: 'var(--muted)' },
  chipNuevo: { background: 'rgba(245,200,0,0.15)', color: 'var(--accent)' },
  masBtn: { alignSelf: 'flex-start', marginTop: 10, background: 'var(--surface2)', border: '1.5px solid var(--border)', borderRadius: 10, color: 'var(--text)', fontFamily: 'Barlow, sans-serif', fontSize: 14, padding: '8px 16px', cursor: 'pointer' },
}
