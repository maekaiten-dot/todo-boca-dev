// src/pages/Rotacion.jsx
// Rotación de artículos: más vendidos en 30/60/90/365 días, ritmo semanal y
// reposición sugerida según el stock calculado. Solo para Admin (lo controla App.jsx).
import { useState, useEffect, useMemo } from 'react'
import { parseMonto as parseArs } from '../lib/montos.js'
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

// Grupos de artículos (columna GRUPO de ARTICULOS): modelos distintos del mismo producto.
// deArt: id del artículo → clave del grupo. grupos: clave → { nombre, modelos: [ids] }
const claveGrupo = g => 'G:' + g.trim().toLowerCase()
function armarGrupos(articulos) {
  const deArt = {}, grupos = {}
  for (const a of articulos) {
    const g = String(a.grupo || '').trim()
    if (!g || !a.id) continue
    const k = claveGrupo(g)
    deArt[a.id] = k
    ;(grupos[k] ||= { clave: k, nombre: g, modelos: [] }).modelos.push(a.id)
  }
  return { deArt, grupos }
}

// Agrupa las ventas por artículo (o por grupo, si se pasa agr) y ventana: [unidades, tickets, facturación]
function calcularRotacion(ventas, articulos, agr = null) {
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
    const clave = agr?.deArt[v.articulo] || v.articulo
    const grupo = agr?.grupos[clave]
    const a = porArt[clave] || (porArt[clave] = {
      id: clave, nombre: grupo ? grupo.nombre : nombres[v.articulo] || v.nombre || v.articulo, ultimaVenta: dia,
      esGrupo: !!grupo, nModelos: grupo ? grupo.modelos.length : 1,
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

// Recupero de la última compra: para cada artículo toma su última compra (los ingresos del mismo día
// se suman como una sola compra) y acumula lo facturado de ese artículo desde ese día. Cuando lo
// facturado alcanza el costo total de la compra, esa es la cantidad de días que tardó en recuperarse.
// Si todavía no llegó, estima cuánto falta al ritmo que viene vendiendo desde la compra.
// Por grupo: la última compra es el último día en que entró cualquier modelo del grupo (se suman
// todos los modelos que entraron ese día) y se cuentan las ventas de todos los modelos.
function calcularRecupero(ventas, ingresos, articulos, hoy, agr = null) {
  const arts = Object.fromEntries(articulos.map(a => [a.id, a]))
  const claveDe = id => agr?.deArt[id] || id
  // Cada compra: los ingresos con el mismo código de COMPRA; los viejos sin código, los del mismo día.
  // La última compra de cada artículo (o grupo) es la que tiene el ingreso más reciente; arranca el
  // día de su primer ingreso (por si se cargó en dos días).
  const porArt = {}
  const horaNum = h => { const [a, b, c] = String(h || '').replace(/^'/, '').split(':').map(Number); return (a || 0) * 3600 + (b || 0) * 60 + (c || 0) }
  for (const i of ingresos) {
    if (i.anulado || !i.articuloId || !(i.cantidad > 0)) continue
    const dia = diaDesdeFecha(i.fecha)
    if (dia == null || dia > hoy) continue
    const k = claveDe(i.articuloId)
    const kc = i.compra || `D${dia}`
    const c = ((porArt[k] ||= {})[kc] ||= { dia, ultimo: -1, cantidad: 0, costo: 0, proveedor: '', compra: i.compra || '' })
    c.dia = Math.min(c.dia, dia)
    c.ultimo = Math.max(c.ultimo, dia * 86400 + horaNum(i.hora))
    c.cantidad += i.cantidad
    c.costo += i.costoTotal || i.cantidad * (i.costoUnitario || parseArs(arts[i.articuloId]?.costoUnitario))
    if (i.proveedor && !c.proveedor.includes(i.proveedor)) c.proveedor = c.proveedor ? `${c.proveedor}, ${i.proveedor}` : i.proveedor
  }
  const compras = Object.fromEntries(Object.entries(porArt).map(([k, cs]) => [k, Object.values(cs).sort((a, b) => b.ultimo - a.ultimo)[0]]))
  const porDia = {}
  for (const v of ventas) {
    const k = claveDe(v.articulo)
    const c = compras[k]
    if (!c || v.anulado) continue
    const dia = diaDesdeFecha(v.fecha)
    if (dia == null || dia < c.dia) continue
    const m = (porDia[k] ||= {})
    const d = (m[dia] ||= { r: 0, u: 0 })
    d.r += v.precioTotalFinal || v.precioTotal || 0
    d.u += v.cantidad || 0
  }
  // El recupero se mide solo con las unidades de esa compra: si entraron 10, cuentan las primeras 10
  // vendidas desde ese día (lo que se venda de más viene de stock anterior o de compras sin cargar).
  return Object.entries(compras).filter(([, c]) => c.costo > 0).map(([id, c]) => {
    let facturado = 0, unidades = 0, factCompra = 0, uCompra = 0, diaRecupero = null, diaAgotada = null
    for (const [dia, d] of Object.entries(porDia[id] || {}).sort((a, b) => a[0] - b[0])) {
      facturado += d.r; unidades += d.u
      const toma = Math.max(0, Math.min(d.u, c.cantidad - uCompra))
      if (toma > 0 && d.u > 0) { factCompra += d.r * toma / d.u; uCompra += toma }
      if (diaRecupero == null && factCompra >= c.costo - 0.5) diaRecupero = Number(dia)
      if (diaAgotada == null && uCompra >= c.cantidad) diaAgotada = Number(dia)
    }
    const transcurridos = hoy - c.dia
    const recuperado = diaRecupero != null
    const agotadaSinCubrir = !recuperado && diaAgotada != null // vendió todas las unidades y no llegó al costo
    const ritmo = factCompra / Math.max(1, transcurridos + 1) // $ por día desde la compra
    const faltan = recuperado || agotadaSinCubrir ? (recuperado ? 0 : null) : (ritmo > 0 ? Math.ceil((c.costo - factCompra) / ritmo) : null)
    return {
      id, compra: c.compra, nombre: agr?.grupos[id]?.nombre || arts[id]?.nombre || id, esGrupo: !!agr?.grupos[id], nModelos: agr?.grupos[id]?.modelos.length || 1, compraDia: c.dia, compraCant: c.cantidad, compraCosto: c.costo, proveedor: c.proveedor,
      facturado, unidades, factCompra, uCompra, pct: Math.min(1, factCompra / c.costo), veces: facturado / c.costo, recuperado, agotadaSinCubrir,
      excedente: unidades > c.cantidad ? unidades - c.cantidad : 0,
      dias: recuperado ? diaRecupero - c.dia : agotadaSinCubrir ? diaAgotada - c.dia : transcurridos, faltan,
      diasTotal: recuperado ? diaRecupero - c.dia : (faltan != null ? transcurridos + faltan : null),
      porRecuperar: recuperado || agotadaSinCubrir ? 0 : c.costo - factCompra,
    }
  })
}

// Ritmo de venta y reposición de cada fila (artículo o grupo)
function armarFilas(lista, stockMap) {
  return lista.map(a => {
    const w30 = a.w[30].u / 30 * 7, w90 = a.w[90].u / 90 * 7, w365 = a.w[365].u / 365 * 7
    const ritmoDia = Math.max(w30, w90) / 7
    const tieneStock = Object.prototype.hasOwnProperty.call(stockMap, a.id)
    const stock = tieneStock ? stockMap[a.id] : null
    const stockUtil = Math.max(0, stock ?? 0)
    const cobertura = tieneStock && ritmoDia > 0 ? stockUtil / ritmoDia : null
    const reponer = Math.max(0, Math.ceil(ritmoDia * DIAS_COBERTURA - stockUtil))
    const tendencia = w365 > 0 ? w30 / w365 : (w30 > 0 ? 99 : 0)
    return { id: a.id, nombre: a.nombre, esGrupo: a.esGrupo, nModelos: a.nModelos, w30, w90, w365, tendencia, t30: a.w[30].t, ultimaVenta: a.ultimaVenta, stock, cobertura, reponer, tieneStock }
  })
}
const filaVacia = (a, stockMap) => armarFilas([{ id: a.id, nombre: a.nombre, ultimaVenta: null, w: Object.fromEntries(VENTANAS.map(w => [w, { u: 0, t: 0, r: 0 }])) }], stockMap)[0]

function fechaDeDia(dia) {
  if (dia == null) return '–'
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
  const [recFiltro, setRecFiltro] = useState('curso')
  const [recOrden, setRecOrden] = useState({ k: 'diasTotal', dir: -1 })
  const [recBusqueda, setRecBusqueda] = useState('')
  const [recMostrar, setRecMostrar] = useState(30)
  const [vista, setVista] = useState('modelo') // modelo | grupo
  const [abiertos, setAbiertos] = useState(() => new Set()) // grupos desplegados (clave de sección + id)
  const alternar = k => setAbiertos(s => { const n = new Set(s); n.has(k) ? n.delete(k) : n.add(k); return n })

  useEffect(() => { cargar() }, [])

  async function cargar() {
    setLoading(true)
    setError(null)
    try {
      const [v, ing] = await Promise.all([getHistoricoVentas({ unificar: true }), getIngresos({ unificar: true }).catch(() => [])])
      setVentas(v); setIngresos(ing)
    }
    catch (e) { console.error(e); setError('No se pudo cargar. Intentá de nuevo.') }
    finally { setLoading(false) }
  }

  const agr = useMemo(() => armarGrupos(articulos), [articulos])
  const nGrupos = Object.keys(agr.grupos).length
  const porGrupo = vista === 'grupo' && nGrupos > 0
  const rotModelo = useMemo(() => calcularRotacion(ventas, articulos), [ventas, articulos])
  const rotGrupo = useMemo(() => calcularRotacion(ventas, articulos, agr), [ventas, articulos, agr])
  const { lista, totales, hoy } = porGrupo ? rotGrupo : rotModelo
  const nombresArt = useMemo(() => Object.fromEntries(articulos.map(a => [a.id, a.nombre])), [articulos])

  // Stock por grupo = suma del stock de sus modelos (solo los que tienen stock calculado)
  const stockVista = useMemo(() => {
    if (!porGrupo) return stockMap
    const out = {}
    for (const [id, st] of Object.entries(stockMap)) {
      const k = agr.deArt[id] || id
      out[k] = (out[k] || 0) + (k === id ? st : Math.max(0, st))
    }
    return out
  }, [porGrupo, stockMap, agr])
  // Texto donde se busca: en un grupo, el nombre del grupo y el de todos sus modelos
  const textoBusqueda = r => r.esGrupo
    ? [r.nombre, ...(agr.grupos[r.id]?.modelos || []).flatMap(id => [id, nombresArt[id] || ''])].join(' ')
    : `${r.nombre} ${r.id}`

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
    const k = id => (porGrupo && agr.deArt[id]) || id
    ingresos.forEach(i => { if (i.anulado || !i.articuloId) return; const d = diaDesdeFecha(i.fecha), c = k(i.articuloId); if (d != null && (primerIngreso[c] == null || d < primerIngreso[c])) primerIngreso[c] = d })
    ventas.forEach(v => { if (v.anulado || !v.articulo) return; const d = diaDesdeFecha(v.fecha), c = k(v.articulo); if (d != null && (primeraVenta[c] == null || d < primeraVenta[c])) primeraVenta[c] = d })
    const out = {}
    Object.entries(primerIngreso).forEach(([id, d]) => { if (primeraVenta[id] == null || primeraVenta[id] >= d) out[id] = d })
    return out
  }, [ingresos, ventas, porGrupo, agr])

  const menosVendidos = useMemo(() => {
    const porId = Object.fromEntries(lista.map(a => [a.id, a]))
    const base = porGrupo
      ? [...articulos.filter(a => !agr.deArt[a.id]), ...Object.values(agr.grupos).map(g => ({ id: g.clave, nombre: g.nombre, nModelos: g.modelos.length }))]
      : articulos
    const candidatos = base.filter(a => {
      if (!a.id || !a.nombre) return false
      const tieneStock = Object.prototype.hasOwnProperty.call(stockVista, a.id)
      return !tieneStock || stockVista[a.id] > 0
    })
    const out = {}
    for (const w of VENTANAS) {
      out[w] = candidatos.filter(a => llegadaNuevos[a.id] == null || llegadaNuevos[a.id] <= hoy - w).map(a => {
        const r = porId[a.id]
        const tieneStock = Object.prototype.hasOwnProperty.call(stockVista, a.id)
        return { id: a.id, nombre: a.nombre, nModelos: a.nModelos || 1, valor: r ? r.w[w][metrica] : 0, stock: tieneStock ? stockVista[a.id] : null, ultimaVenta: r ? r.ultimaVenta : null }
      }).sort((x, y) =>
        x.valor - y.valor ||
        (y.stock ?? 0) - (x.stock ?? 0) ||
        (x.ultimaVenta ?? -1) - (y.ultimaVenta ?? -1)
      ).slice(0, top)
    }
    return out
  }, [lista, articulos, stockVista, metrica, top, llegadaNuevos, hoy, porGrupo, agr])

  const filasModelo = useMemo(() => armarFilas(rotModelo.lista, stockMap), [rotModelo, stockMap])
  const filas = useMemo(() => {
    if (!porGrupo) return filasModelo
    const porId = Object.fromEntries(filasModelo.map(r => [r.id, r]))
    // Grupos sin ventas en el año igual aparecen (con sus modelos), para ver el stock
    const conVentas = new Set(rotGrupo.lista.map(a => a.id))
    const sinVentas = Object.values(agr.grupos).filter(g => !conVentas.has(g.clave)).map(g => ({ ...filaVacia({ id: g.clave, nombre: g.nombre }, stockVista), esGrupo: true, nModelos: g.modelos.length }))
    return [...armarFilas(rotGrupo.lista, stockVista), ...sinVentas].map(r => {
      if (!r.esGrupo) return r
      const modelos = agr.grupos[r.id].modelos.map(id => porId[id] || filaVacia({ id, nombre: nombresArt[id] || id }, stockMap))
        .sort((a, b) => b.w30 - a.w30 || b.w90 - a.w90 || a.nombre.localeCompare(b.nombre))
      return { ...r, modelos, reponerModelos: modelos.reduce((s, m) => s + m.reponer, 0) }
    })
  }, [porGrupo, filasModelo, rotGrupo, stockVista, stockMap, agr, nombresArt])

  const filasVisibles = useMemo(() => {
    const q = normalizar(busqueda.trim())
    const f = filas.filter(r => !q || normalizar(textoBusqueda(r)).includes(q))
    const val = r => { const v = r[orden.k]; return v == null ? (orden.dir > 0 ? Infinity : -Infinity) : v }
    return f.sort((a, b) => {
      const A = val(a), B = val(b)
      return (typeof A === 'string' ? A.localeCompare(B) : A - B) * orden.dir
    })
  }, [filas, busqueda, orden, agr, nombresArt])

  const recModelo = useMemo(() => calcularRecupero(ventas, ingresos, articulos, hoy), [ventas, ingresos, articulos, hoy])
  const recupero = useMemo(() => {
    if (!porGrupo) return recModelo
    const porId = Object.fromEntries(recModelo.map(r => [r.id, r]))
    return calcularRecupero(ventas, ingresos, articulos, hoy, agr).map(r => !r.esGrupo ? r
      : { ...r, modelos: agr.grupos[r.id].modelos.map(id => porId[id]).filter(Boolean).sort((a, b) => b.compraDia - a.compraDia || b.facturado - a.facturado) })
  }, [porGrupo, recModelo, ventas, ingresos, articulos, hoy, agr])
  const recResumen = useMemo(() => {
    const rec = recupero.filter(r => r.recuperado).map(r => r.dias).sort((a, b) => a - b)
    const curso = recupero.filter(r => !r.recuperado)
    return { nRec: rec.length, mediana: rec.length ? rec[Math.floor((rec.length - 1) / 2)] : null, nCurso: curso.length, porRecuperar: curso.reduce((s, r) => s + r.porRecuperar, 0), sinVentas: curso.filter(r => r.facturado <= 0).length, nRevisar: recupero.filter(r => r.excedente > 0 || r.agotadaSinCubrir).length }
  }, [recupero])
  const recVisibles = useMemo(() => {
    const q = normalizar(recBusqueda.trim())
    const pasa = r => recFiltro === 'todos' || (recFiltro === 'revisar' ? r.excedente > 0 || r.agotadaSinCubrir : recFiltro === 'rec' ? r.recuperado : !r.recuperado)
    const f = recupero.filter(r => pasa(r) && (!q || normalizar(textoBusqueda(r)).includes(q)))
    const val = r => { const v = r[recOrden.k]; return v == null ? Infinity : v } // sin ventas = lo peor
    return f.sort((a, b) => { const A = val(a), B = val(b); return (typeof A === 'string' ? A.localeCompare(B) : (A - B || 0)) * recOrden.dir })
  }, [recupero, recFiltro, recOrden, recBusqueda, agr, nombresArt])
  const recOrdenarPor = k => setRecOrden(o => o.k === k ? { k, dir: -o.dir } : { k, dir: k === 'nombre' ? 1 : -1 })

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
        <Segmento opciones={[{ v: 'modelo', label: 'Por modelo' }, { v: 'grupo', label: `Por grupo${nGrupos ? ` (${nGrupos})` : ''}` }]} valor={vista} onChange={setVista} />
      </div>
      {vista === 'grupo' && !nGrupos && <div style={{ ...S.legend, paddingTop: 10, color: 'var(--accent)' }}>Todavía no hay grupos: se arman en Arts., editando cada artículo (campo GRUPO).</div>}
      {porGrupo && <div style={{ ...S.legend, paddingTop: 10 }}>🔗 Los modelos con el mismo GRUPO se suman como un solo producto. Tocá un grupo en las tablas para ver sus modelos.</div>}

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
                      <div style={S.barName} title={a.esGrupo ? `Grupo · ${a.nModelos} modelos` : `${a.id} · ${a.nombre}`}>{a.esGrupo && '🔗 '}{a.nombre}{a.esGrupo && <span style={S.nMod}> · {a.nModelos} mod.</span>}</div>
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
                    <div style={S.barName} title={a.nModelos > 1 ? `Grupo · ${a.nModelos} modelos` : `${a.id} · ${a.nombre}`}>{a.nModelos > 1 && '🔗 '}{a.nombre}{a.nModelos > 1 && <span style={S.nMod}> · {a.nModelos} mod.</span>}</div>
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

      <div style={S.seccion}>RECUPERO DE LA ÚLTIMA COMPRA</div>
      <div style={S.statsRow}>
        <div style={S.statCard}><div style={S.statValue}>{recResumen.mediana == null ? '–' : `${fmtN(recResumen.mediana)} días`}</div><div style={S.statLabel}>Tarda en recuperarse una compra (mediana de {fmtN(recResumen.nRec)} ya recuperadas)</div></div>
        <div style={S.statCard}><div style={S.statValue}>{fmtM(recResumen.porRecuperar)}</div><div style={S.statLabel}>Falta recuperar de {fmtN(recResumen.nCurso)} compras en curso</div></div>
        <div style={S.statCard}><div style={{ ...S.statValue, color: recResumen.sinVentas ? '#ef4444' : 'var(--accent)' }}>{fmtN(recResumen.sinVentas)}</div><div style={S.statLabel}>Compras sin ninguna venta desde que entraron</div></div>
        <div style={S.statCard}><div style={{ ...S.statValue, color: recResumen.nRevisar ? '#f59e0b' : 'var(--accent)' }}>{fmtN(recResumen.nRevisar)}</div><div style={S.statLabel}>Para revisar: vendieron más de lo que entró (falta cargar compras o había stock) o no cubrieron el costo</div></div>
      </div>
      <div style={S.chartCard}>
        <div style={S.nota}>
          Para cada artículo se toma su última compra (lo que entró por Ingresos) y se suman las ventas de esas unidades: si entraron 10, cuentan las primeras 10 vendidas desde ese día.
          "Recuperado en" son los días que tardaron esas ventas en llegar al costo total de la compra; el % llega como máximo a 100. Si todavía no llegó, se estima cuánto falta al ritmo que viene vendiendo.
          En naranja, los que vendieron más unidades de las que entraron: había stock de antes o falta cargar compras más nuevas.
          {porGrupo && ' En un grupo, la última compra es el último día que entró cualquiera de sus modelos (se suman todos los que entraron ese día) y se cuentan las ventas de todos los modelos. Abriendo el grupo se ve cada modelo con su propia última compra.'}
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center', marginBottom: 8 }}>
          <Segmento opciones={[{ v: 'curso', label: `En curso (${recResumen.nCurso})` }, { v: 'rec', label: `Recuperadas (${recResumen.nRec})` }, { v: 'revisar', label: `Para revisar (${recResumen.nRevisar})` }, { v: 'todos', label: 'Todas' }]} valor={recFiltro} onChange={v => { setRecFiltro(v); setRecMostrar(30) }} />
          <input style={{ ...S.search, marginBottom: 0 }} type="search" placeholder="Buscar artículo o código…" value={recBusqueda} onChange={e => { setRecBusqueda(e.target.value); setRecMostrar(30) }} />
        </div>
        <div style={S.tableWrap}>
          <table style={S.table}>
            <thead>
              <tr>
                {[['nombre', 'Artículo', true], ['compraDia', 'Última compra'], ['compraCosto', 'Costo compra'], ['facturado', 'Vendido desde'], ['pct', 'Recuperado'], ['diasTotal', 'Tarda']].map(([k, label, left]) => (
                  <th key={k} style={{ ...S.th, textAlign: left ? 'left' : 'right' }} onClick={() => recOrdenarPor(k)}>{label}{recOrden.k === k ? (recOrden.dir > 0 ? ' ▲' : ' ▼') : ''}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {recVisibles.slice(0, recMostrar).map(r => {
                const abierto = r.esGrupo && abiertos.has('rec' + r.id)
                return [
                  <FilaRecupero key={r.id} r={r} abierto={abierto} onClick={r.esGrupo ? () => alternar('rec' + r.id) : undefined} />,
                  ...(abierto ? r.modelos.map(m => <FilaRecupero key={r.id + m.id} r={m} modelo />) : []),
                  ...(abierto && !r.modelos.length ? [<tr key={r.id + '-'}><td style={{ ...S.td, ...S.tdModelo, textAlign: 'left' }} colSpan={6}>Ningún modelo tiene compras cargadas en Ingresos.</td></tr>] : []),
                ]
              })}
              {!recVisibles.length && <tr><td style={{ ...S.td, textAlign: 'left' }} colSpan={6}>Sin compras para mostrar.</td></tr>}
            </tbody>
          </table>
        </div>
        {recVisibles.length > recMostrar && <button style={S.masBtn} onClick={() => setRecMostrar(m => m + 30)}>Ver 30 más ({recVisibles.length - recMostrar} restantes)</button>}
      </div>

      <div style={S.chartCard}>
        <div style={S.chartTitle}>Ritmo de venta y reposición</div>
        <div style={S.nota}>
          Unidades por semana en cada ventana. La tendencia compara los últimos 30 días con el promedio del año.
          "Alcanza" son los días que dura el stock al ritmo más alto entre 30 y 90 días.
          "Reponer" es lo que falta para cubrir {DIAS_COBERTURA} días a ese ritmo, ya descontando el stock.
          {porGrupo && ' En un grupo, "Reponer" se calcula con la venta y el stock de todos sus modelos juntos; abajo, "suma modelos" es lo que da si se calcula modelo por modelo (siempre es igual o más, porque no compensa un modelo que sobra con otro que falta).'}
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
              {filasVisibles.slice(0, mostrar).map(r => {
                const abierto = r.esGrupo && abiertos.has('rit' + r.id)
                return [
                  <FilaRitmo key={r.id} r={r} abierto={abierto} onClick={r.esGrupo ? () => alternar('rit' + r.id) : undefined} />,
                  ...(abierto ? r.modelos.map(m => <FilaRitmo key={r.id + m.id} r={m} modelo />) : []),
                ]
              })}
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

function NombreFila({ r, abierto, modelo, extra }) {
  return (
    <td style={{ ...S.td, ...S.tdNombre, ...(modelo ? S.tdModelo : {}) }}>
      {r.esGrupo && <span style={S.flecha}>{abierto ? '▾' : '▸'}</span>}
      {modelo && <span style={{ color: 'var(--muted)' }}>└ </span>}
      {r.esGrupo && '🔗 '}{r.nombre}
      <div style={S.codigo}>{r.esGrupo ? `${r.nModelos} ${r.nModelos === 1 ? 'modelo' : 'modelos'}` : r.id}{extra}</div>
    </td>
  )
}

function FilaRitmo({ r, abierto, modelo, onClick }) {
  return (
    <tr onClick={onClick} style={{ ...(onClick ? { cursor: 'pointer' } : {}), ...(r.esGrupo ? S.trGrupo : {}) }} data-grupo={r.esGrupo ? r.nombre : undefined}>
      <NombreFila r={r} abierto={abierto} modelo={modelo} extra={` · última venta ${fechaDeDia(r.ultimaVenta)}`} />
      <td style={{ ...S.td, ...S.tdReponer, ...(modelo ? { fontSize: 15, color: 'var(--text)' } : {}) }}>
        {r.reponer || '–'}
        {r.esGrupo && <div style={{ ...S.codigo, fontFamily: 'Barlow, sans-serif', fontWeight: 400 }}>suma modelos {r.reponerModelos || 0}</div>}
      </td>
      <td style={{ ...S.td, color: r.stock != null && r.stock <= 0 ? '#ef4444' : 'var(--text)' }}>{r.stock == null ? '–' : fmtN(r.stock)}</td>
      <td style={{ ...S.td, ...coberturaColor(r.cobertura) }}>{r.cobertura == null ? '–' : r.cobertura >= 365 ? '+1 año' : `${fmtN(r.cobertura)} d`}</td>
      <td style={S.td}>{fmt1(r.w30)}</td>
      <td style={S.td}>{fmt1(r.w90)}</td>
      <td style={S.td}>{fmt1(r.w365)}</td>
      <td style={S.td}><Tendencia r={r} /></td>
      <td style={S.td}>{r.t30 || '–'}</td>
    </tr>
  )
}

function FilaRecupero({ r, abierto, modelo, onClick }) {
  return (
    <tr onClick={onClick} style={{ ...(onClick ? { cursor: 'pointer' } : {}), ...(r.esGrupo ? S.trGrupo : {}) }} data-grupo={r.esGrupo ? r.nombre : undefined}>
      <NombreFila r={r} abierto={abierto} modelo={modelo} extra={r.proveedor ? ` · ${r.proveedor}` : ''} />
      <td style={S.td}>{fechaDeDia(r.compraDia)}<div style={S.codigo}>{fmtN(r.compraCant)} u.{r.compra ? ` · ${r.compra}` : ""}</div></td>
      <td style={S.td}>${fmtN(r.compraCosto)}</td>
      <td style={S.td}>${fmtN(r.facturado)}
        <div style={S.codigo}>{fmtN(r.unidades)} u. vendidas</div>
        {r.excedente > 0 && <div style={S.revisar} title="Las ventas de más vienen de stock anterior o de compras que no están cargadas en Pagos/Ingresos">⚠ {fmtN(r.unidades)} u. de una compra de {fmtN(r.compraCant)}</div>}
      </td>
      <td style={S.td}>
        <div style={S.recBarra}><div style={{ ...S.recBarraFill, width: `${Math.min(100, r.pct * 100)}%`, background: r.recuperado ? '#22c55e' : r.agotadaSinCubrir ? '#ef4444' : r.pct > 0 ? 'var(--accent)' : '#ef4444' }} /></div>
        <div style={S.codigo}>{Math.round(r.pct * 100)}%{r.veces >= 1.05 ? ` · vendido ${r.veces.toLocaleString('es-AR', { maximumFractionDigits: 1 })}× el costo` : ''}</div>
      </td>
      <td style={{ ...S.td, ...(r.recuperado ? { color: '#22c55e', fontWeight: 700 } : {}) }}>
        {r.recuperado ? (r.dias === 0 ? 'el mismo día' : `en ${fmtN(r.dias)} ${r.dias === 1 ? 'día' : 'días'}`)
          : r.agotadaSinCubrir ? <span style={{ color: '#ef4444' }}>no cubrió el costo</span>
          : r.faltan == null ? <span style={{ color: '#ef4444' }}>sin ventas</span>
          : r.diasTotal > 365 ? 'más de 1 año' : `≈ ${fmtN(r.diasTotal)} días`}
        <div style={S.codigo}>{r.recuperado ? 'recuperado' : r.agotadaSinCubrir ? `vendió las ${fmtN(r.compraCant)} u. y juntó $${fmtN(r.factCompra)} (¿descuentos, o costo o precio mal cargado?)` : `lleva ${fmtN(r.dias)} ${r.dias === 1 ? 'día' : 'días'}${r.faltan != null && r.diasTotal <= 365 ? ` · faltan ≈ ${fmtN(r.faltan)}` : ''}`}</div>
      </td>
    </tr>
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
  revisar: { fontSize: 11, color: '#f59e0b', marginTop: 2, fontWeight: 600 },
  recBarra: { width: 90, height: 8, background: 'var(--surface2)', borderRadius: 4, overflow: 'hidden', marginLeft: 'auto' },
  recBarraFill: { height: '100%', borderRadius: 4 },
  trGrupo: { background: 'rgba(96,165,250,0.06)' },
  tdModelo: { paddingLeft: 26, fontSize: 13, color: 'var(--muted)' },
  flecha: { display: 'inline-block', width: 16, color: '#60a5fa' },
  nMod: { color: 'var(--muted)', fontSize: 11 },
  masBtn: { alignSelf: 'flex-start', marginTop: 10, background: 'var(--surface2)', border: '1.5px solid var(--border)', borderRadius: 10, color: 'var(--text)', fontFamily: 'Barlow, sans-serif', fontSize: 14, padding: '8px 16px', cursor: 'pointer' },
}
