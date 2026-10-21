// src/components/IndiceEficiencia.jsx
// Índice de eficiencia del negocio, mes por mes. Solo Admin (en Estadísticas).
//
// Cada componente se compara con el promedio de ese mismo componente en los 12 meses anteriores
// (los que tengan dato, mínimo 3): 100 = igual que tu promedio, 110 = 10% mejor, 90 = 10% peor.
// El índice es el promedio ponderado de los componentes que tienen dato ese mes. Los montos en pesos
// se pasan a precios de hoy con la inflación del INDEC, así la inflación no se confunde con mejora.
//
// Componentes pendientes (se muestran con lo que falta): gastos fijos sobre ventas, rendimiento del
// stock (GMROI) y stock parado.
import { useState, useEffect, useMemo } from 'react'
import { repartoPago } from '../api/sheets.js'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, Cell } from 'recharts'

export const COMPONENTES = [
  { id: 'margen', nombre: 'Margen bruto', peso: 30, fmt: v => `${(v * 100).toLocaleString('es-AR', { maximumFractionDigits: 1 })}%`,
    ayuda: 'Venta menos costo de lo vendido, sobre la venta. Solo cuenta lo vendido que tiene costo cargado.' },
  { id: 'porHora', nombre: 'Venta por hora trabajada', peso: 30, fmt: v => fmt$(v),
    ayuda: 'Venta del mes (a precios de hoy) dividida por las horas fichadas de entrada a salida.' },
  { id: 'ticket', nombre: 'Ticket promedio', peso: 15, fmt: v => fmt$(v),
    ayuda: 'Venta por ticket, a precios de hoy. No cuenta los cambios.' },
  { id: 'upt', nombre: 'Unidades por ticket', peso: 15, fmt: v => v.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
    ayuda: 'Cuántas unidades se llevan por ticket.' },
  { id: 'cobro', nombre: 'Costo de cobro', peso: 10, menorEsMejor: true, fmt: v => `${(v * 100).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`,
    ayuda: 'Comisiones de posnet y QR (con IVA) sobre la venta total. Más bajo es mejor.' },
]

// Comisiones en % antes de IVA. Crédito siempre en 1 pago. "Tarjeta" sin aclarar se toma como crédito.
// Las ventas con tarjeta o QR sin posnet anotado se toman como BLANCO. Efectivo, transferencia y Pix: sin comisión.
export const COMISIONES = {
  AMARILLO: { credito: 2.99, debito: 2.99, qr: 0.8 }, // Mercado Pago Point
  BLANCO: { credito: 2.0, debito: 1.3, qr: 0.8 },     // Payway (débito: entre Visa/Cabal 1,2% y Mastercard 1,4%)
}
const IVA = 1.21
export function comisionDe(metodo, posnet) {
  const m = String(metodo || '').toLowerCase()
  const tipo = /\bqr\b/.test(m) ? 'qr' : /d[eé]bito/.test(m) ? 'debito' : /tarjeta|cr[eé]dito/.test(m) ? 'credito' : null
  if (!tipo) return 0
  return COMISIONES[/AMARILLO/i.test(posnet || '') ? 'AMARILLO' : 'BLANCO'][tipo] * IVA / 100
}
const PENDIENTES = [
  { nombre: 'Gastos fijos sobre ventas', falta: 'terminar de cargar los gastos fijos (alquiler, sueldos, servicios)' },
  { nombre: 'Rendimiento del stock (GMROI) y stock parado', falta: 'terminar el primer conteo de stock y completar los costos' },
]
// Mínimos para que un mes cuente en cada componente (antes de abril 2026 las ventas están cargadas
// como resumen mensual: un solo "ticket" con cientos de unidades)
const MIN_TICKETS = 100, MIN_COBERTURA = 0.6, MIN_HORAS = 20, MIN_BASE = 3, MESES_BASE = 12

const fmt$ = n => '$' + Math.round(n).toLocaleString('es-AR')
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
const nombreMes = k => { const [a, m] = k.split('-'); return `${MESES[Number(m) - 1]} ${a.slice(2)}` }
const mesDe = fecha => { const p = String(fecha || '').replace(/^'/, '').split('/'); return p.length >= 3 && p[2] ? `${p[2]}-${String(p[1]).padStart(2, '0')}` : null }
const mesSiguiente = k => { const [a, m] = k.split('-').map(Number); return m === 12 ? `${a + 1}-01` : `${a}-${String(m + 1).padStart(2, '0')}` }
const monto = v => Number(v.precioTotalFinal) || Number(v.precioTotal) || 0

// Factor para pasar pesos de cada mes a pesos del último IPC publicado
export function factoresInflacion(indices) {
  const inf = indices?.inflacion || {}
  const meses = Object.keys(inf).sort()
  const f = {}
  let acum = 1
  for (let i = meses.length - 1; i >= 0; i--) { f[meses[i]] = acum; acum *= 1 + inf[meses[i]] / 100 }
  return mes => f[mes] ?? (meses.length && mes > meses[meses.length - 1] ? 1 : (meses.length ? acum : 1))
}

// Horas fichadas por mes: empareja ENTRADA → SALIDA de cada persona en cada día
export function horasPorMes(fichadas = []) {
  const porDia = {}
  for (const f of fichadas) {
    if (f.valido === false || !f.fecha || !f.hora) continue
    ;(porDia[`${f.idUsuario}|${f.fecha}`] ||= []).push(f)
  }
  const out = {}
  const min = h => { const [a, b, c] = String(h).split(':').map(Number); return a * 60 + (b || 0) + (c || 0) / 60 }
  for (const [k, lista] of Object.entries(porDia)) {
    const mes = mesDe(k.split('|')[1]); if (!mes) continue
    lista.sort((a, b) => min(a.hora) - min(b.hora))
    let entrada = null
    for (const f of lista) {
      if (f.tipo === 'ENTRADA') entrada = min(f.hora)
      else if (f.tipo === 'SALIDA' && entrada != null) { const h = (min(f.hora) - entrada) / 60; if (h > 0 && h < 16) out[mes] = (out[mes] || 0) + h; entrada = null }
    }
  }
  return out
}

// Valores crudos de cada componente por mes, y puntajes contra los 12 meses anteriores
export function calcularIndice(ventas, { indices = null, horas = {}, mesActual } = {}) {
  const aHoy = factoresInflacion(indices)
  const m = {}
  const cambio = new Set(ventas.filter(v => /CAMBIO/i.test(v.notas || '')).map(v => v.idVenta))
  for (const v of ventas) {
    if (v.anulado) continue
    const mes = mesDe(v.fecha); if (!mes) continue
    const x = (m[mes] ||= { venta: 0, ventaConCosto: 0, costo: 0, tickets: new Set(), ventaTk: 0, unidadesTk: 0, comision: 0 })
    const $ = monto(v)
    x.venta += $
    x.comision += repartoPago(v).reduce((s, p) => s + p.monto * comisionDe(p.metodo, v.posnet), 0)
    if (v.costoTotal) { x.ventaConCosto += $; x.costo += v.costoTotal }
    // Solo filas con ticket real (las cargas viejas de resumen mensual no tienen ID de venta)
    if (v.idVenta && !cambio.has(v.idVenta)) { x.tickets.add(v.idVenta); x.ventaTk += $; x.unidadesTk += v.cantidad || 0 }
  }
  const meses = Object.keys(m).sort()
  if (!meses.length) return { meses: [] }
  // Completa meses sin ventas hasta el mes actual (para que el gráfico no salte)
  const todos = []
  for (let k = meses[0]; k <= (mesActual || meses[meses.length - 1]); k = mesSiguiente(k)) todos.push(k)

  const crudo = todos.map(mes => {
    const x = m[mes]
    const f = aHoy(mes)
    const val = {}, det = {}
    if (x) {
      const cobertura = x.venta > 0 ? x.ventaConCosto / x.venta : 0
      if (cobertura >= MIN_COBERTURA && x.ventaConCosto > 0) val.margen = (x.ventaConCosto - x.costo) / x.ventaConCosto
      det.margen = `costo cargado en el ${Math.round(cobertura * 100)}% de lo vendido`
      const nt = x.tickets.size
      if (nt >= MIN_TICKETS) { val.ticket = x.ventaTk / nt * f; val.upt = x.unidadesTk / nt }
      det.ticket = det.upt = `${nt.toLocaleString('es-AR')} tickets`
      const h = horas[mes] || 0
      if (h >= MIN_HORAS) val.porHora = x.venta * f / h
      if (x.venta > 0) val.cobro = x.comision / x.venta
      det.cobro = `${fmt$(x.comision)} en comisiones`
      det.porHora = h ? `${Math.round(h).toLocaleString('es-AR')} h fichadas` : 'sin fichadas'
    }
    return { mes, val, det, venta: x?.venta || 0 }
  })

  const resultado = crudo.map((c, i) => {
    const previos = crudo.slice(Math.max(0, i - MESES_BASE), i)
    const comp = COMPONENTES.map(def => {
      const valor = c.val[def.id]
      const base = previos.map(p => p.val[def.id]).filter(v => v != null)
      const promedio = base.length ? base.reduce((s, v) => s + v, 0) / base.length : null
      const relativo = def.menorEsMejor ? (valor > 0 ? promedio / valor : 2) : valor / promedio
      const puntaje = valor != null && base.length >= MIN_BASE && promedio > 0 ? Math.max(0, Math.min(200, relativo * 100)) : null
      return { ...def, valor, promedio, nBase: base.length, puntaje, detalle: c.det[def.id] || '' }
    })
    const activos = comp.filter(x => x.puntaje != null)
    const pesoTotal = activos.reduce((s, x) => s + x.peso, 0)
    const indice = pesoTotal ? activos.reduce((s, x) => s + x.puntaje * x.peso, 0) / pesoTotal : null
    activos.forEach(x => { x.pesoReal = x.peso / pesoTotal })
    return { mes: c.mes, label: nombreMes(c.mes), indice, comp, enCurso: c.mes === mesActual }
  })
  return { meses: resultado }
}

const colorIndice = v => v == null ? 'var(--muted)' : v >= 105 ? '#22c55e' : v <= 95 ? '#ef4444' : 'var(--accent)'

export default function IndiceEficiencia({ ventas = [] }) {
  const [indices, setIndices] = useState(null)
  const [fichadas, setFichadas] = useState(null)
  const [elegido, setElegido] = useState(null)

  useEffect(() => {
    fetch('/api/indices').then(r => r.ok ? r.json() : null).then(setIndices).catch(() => setIndices(null))
    fetch('/api/fichadas/asistencia', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ accion: 'datos' }) })
      .then(r => r.ok ? r.json() : null).then(d => setFichadas(d?.fichadas || [])).catch(() => setFichadas([]))
  }, [])

  const mesActual = useMemo(() => {
    const [d, mm, a] = new Date().toLocaleDateString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' }).split('/')
    return `${a}-${String(mm).padStart(2, '0')}`
  }, [])
  const horas = useMemo(() => horasPorMes(fichadas || []), [fichadas])
  const { meses } = useMemo(() => calcularIndice(ventas, { indices, horas, mesActual }), [ventas, indices, horas, mesActual])
  const conIndice = meses.filter(x => x.indice != null)
  const grafico = conIndice.slice(-12)
  const sel = meses.find(x => x.mes === elegido) || conIndice[conIndice.length - 1]
  if (!ventas.length) return null

  return (
    <div style={S.card}>
      <div style={S.titulo}>Índice de eficiencia</div>
      <div style={S.hint}>
        100 = igual a tu promedio de los 12 meses anteriores; 110 = 10% mejor, 90 = 10% peor. Junta {COMPONENTES.length} indicadores ponderados; los montos van a precios de hoy (inflación INDEC).
        {!indices && ' Sin datos de inflación por ahora: los montos se comparan en pesos corrientes.'}
      </div>

      {!sel ? <div style={S.vacio}>Todavía no hay meses con historia suficiente para calcularlo.</div> : (<>
        <div style={S.fila}>
          <div style={S.grande}>
            <div style={{ ...S.numero, color: colorIndice(sel.indice) }}>{Math.round(sel.indice)}</div>
            <div style={S.sub}>{sel.label}{sel.enCurso ? ' (en curso)' : ''}</div>
          </div>
          <div style={{ flex: 1, minWidth: 260, height: 190 }} className="tb-indice-graf">
            <style>{'.tb-indice-graf svg:focus, .tb-indice-graf .recharts-wrapper:focus, .tb-indice-graf *:focus { outline: none }'}</style>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={grafico} margin={{ top: 8, right: 4, left: 0, bottom: 0 }} onClick={st => { const p = grafico[Number(st?.activeTooltipIndex)]; if (p) setElegido(p.mes) }} style={{ cursor: 'pointer' }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
                <XAxis dataKey="label" tick={{ fontFamily: 'Barlow Condensed, sans-serif', fontSize: 11, fill: '#6a8ccc' }} tickLine={false} axisLine={false} interval={0} angle={-45} textAnchor="end" height={38} />
                <YAxis domain={[d => Math.min(80, Math.floor(d / 10) * 10), d => Math.max(120, Math.ceil(d / 10) * 10)]} tick={{ fontFamily: 'Barlow Condensed, sans-serif', fontSize: 11, fill: '#6a8ccc' }} tickLine={false} axisLine={false} width={34} />
                <ReferenceLine y={100} stroke="#6a8ccc" strokeDasharray="4 3" />
                <Tooltip cursor={{ fill: 'rgba(245,200,0,0.06)' }} content={({ active, payload }) => active && payload?.[0] ? (
                  <div style={S.tooltip}>{payload[0].payload.label}{payload[0].payload.enCurso ? ' (en curso)' : ''}: <b>{Math.round(payload[0].value)}</b></div>) : null} />
                <Bar dataKey="indice" radius={[4, 4, 0, 0]} maxBarSize={36}>
                  {grafico.map(p => <Cell key={p.mes} fill={colorIndice(p.indice)} fillOpacity={p.mes === sel.mes ? 1 : 0.45} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div style={S.hint}>Tocá un mes en el gráfico para ver su detalle.{sel.enCurso ? ' El mes en curso todavía puede cambiar.' : ''}</div>

        <div style={S.tablaWrap}>
          <table style={S.tabla}>
            <thead><tr>
              <th style={{ ...S.th, textAlign: 'left' }}>Componente</th><th style={S.th}>{sel.label}</th><th style={S.th}>Promedio 12 meses</th><th style={S.th}>Puntaje</th><th style={S.th}>Peso</th>
            </tr></thead>
            <tbody>
              {sel.comp.map(c => (
                <tr key={c.id} data-componente={c.id}>
                  <td style={{ ...S.td, textAlign: 'left', whiteSpace: 'normal' }}>
                    <div style={{ fontWeight: 600 }}>{c.nombre}</div>
                    <div style={S.chico}>{c.ayuda}{c.detalle ? ` · ${c.detalle}` : ''}</div>
                  </td>
                  <td style={S.td}>{c.valor == null ? '–' : c.fmt(c.valor)}</td>
                  <td style={S.td}>{c.promedio == null ? '–' : c.fmt(c.promedio)}<div style={S.chico}>{c.nBase} {c.nBase === 1 ? 'mes' : 'meses'}</div></td>
                  <td style={{ ...S.td, fontWeight: 800, color: colorIndice(c.puntaje) }}>
                    {c.puntaje == null ? <span style={{ fontWeight: 400, fontSize: 12 }}>{c.valor == null ? 'sin dato' : `falta historia (${c.nBase}/${MIN_BASE})`}</span> : Math.round(c.puntaje)}
                  </td>
                  <td style={S.td}>{c.puntaje == null ? <span style={S.chico}>({c.peso}%)</span> : `${Math.round(c.pesoReal * 100)}%`}</td>
                </tr>
              ))}
              {PENDIENTES.map(p => (
                <tr key={p.nombre} style={{ opacity: 0.55 }}>
                  <td style={{ ...S.td, textAlign: 'left', whiteSpace: 'normal' }}><div style={{ fontWeight: 600 }}>{p.nombre}</div><div style={S.chico}>Pendiente: falta {p.falta}.</div></td>
                  <td style={S.td}>–</td><td style={S.td}>–</td><td style={S.td}>–</td><td style={S.td}>–</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div style={S.hint}>Los componentes sin dato o sin al menos {MIN_BASE} meses de historia no cuentan ese mes: su peso se reparte entre los demás.</div>
      </>)}
    </div>
  )
}

const S = {
  card: { margin: '0 20px 16px', background: 'var(--surface)', borderRadius: 14, border: '1.5px solid var(--accent)', padding: 16 },
  titulo: { fontFamily: 'Barlow Condensed, sans-serif', fontWeight: 800, fontSize: 18, color: 'var(--accent)', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 4 },
  hint: { fontFamily: 'Barlow, sans-serif', fontSize: 12, color: 'var(--muted)', lineHeight: 1.45, margin: '4px 0 8px' },
  vacio: { fontFamily: 'Barlow, sans-serif', fontSize: 14, color: 'var(--muted)', padding: '20px 0' },
  fila: { display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'center' },
  grande: { minWidth: 120, textAlign: 'center' },
  numero: { fontFamily: 'Barlow Condensed, sans-serif', fontWeight: 800, fontSize: 64, lineHeight: 1 },
  sub: { fontFamily: 'Barlow Condensed, sans-serif', fontWeight: 700, fontSize: 16, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 1 },
  tooltip: { background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, padding: '6px 10px', fontFamily: 'Barlow, sans-serif', fontSize: 13, color: 'var(--text)' },
  tablaWrap: { overflowX: 'auto', WebkitOverflowScrolling: 'touch', marginTop: 4 },
  tabla: { width: '100%', minWidth: 620, borderCollapse: 'collapse' },
  th: { fontFamily: 'Barlow Condensed, sans-serif', fontWeight: 700, fontSize: 12, color: 'var(--muted)', letterSpacing: 1, textTransform: 'uppercase', padding: 8, borderBottom: '1.5px solid var(--border)', textAlign: 'right', whiteSpace: 'nowrap' },
  td: { fontFamily: 'Barlow, sans-serif', fontSize: 14, color: 'var(--text)', padding: 8, borderBottom: '1px solid var(--border)', textAlign: 'right', whiteSpace: 'nowrap', verticalAlign: 'top', fontVariantNumeric: 'tabular-nums' },
  chico: { fontSize: 11, color: 'var(--muted)', fontWeight: 400, marginTop: 2 },
}
