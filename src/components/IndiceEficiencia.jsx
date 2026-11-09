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
import { repartoPago, posnetDeParte } from '../api/sheets.js'
import { generarRecomendaciones, costoValido } from '../lib/recomendaciones.js'
import { comisionDe, tipoDeMetodo, posnetNormal, tasaCobro, servicioPaywayDelMes, IVA, IIBB, LEY_25413_BLANCO, impChequeAplica, NOMBRE_POSNET, NOMBRE_TIPO } from '../lib/costosCobro.js'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, Cell } from 'recharts'

export const COMPONENTES = [
  { id: 'margen', nombre: 'Margen bruto', peso: 30, fmt: v => `${(v * 100).toLocaleString('es-AR', { maximumFractionDigits: 1 })}%`,
    ayuda: 'Venta menos costo de lo vendido, sobre la venta. Solo cuenta lo vendido con costo cargado (y que no sea mayor que el precio).' },
  { id: 'porHora', nombre: 'Venta por hora trabajada', peso: 30, fmt: v => fmt$(v),
    ayuda: 'Venta del mes (a precios de hoy) dividida por las horas fichadas de entrada a salida.' },
  { id: 'ticket', nombre: 'Ticket promedio', peso: 15, fmt: v => fmt$(v),
    ayuda: 'Venta por ticket, a precios de hoy. No cuenta los cambios.' },
  { id: 'upt', nombre: 'Unidades por ticket', peso: 15, fmt: v => v.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
    ayuda: 'Cuántas unidades se llevan por ticket.' },
  { id: 'cobro', nombre: 'Costo de cobro', peso: 10, menorEsMejor: true, fmt: v => `${(v * 100).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`,
    ayuda: 'Comisiones de posnet y QR, cobro anticipado y servicio de Payway (con IVA), retención de Ingresos Brutos e impuesto al cheque de lo que deposita Payway, sobre la venta total. Más bajo es mejor.' },
]

// Costos de cobro por medio de pago, posnet y mes: ver src/lib/costosCobro.js
export { comisionDe }
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
    const x = (m[mes] ||= { venta: 0, ventaConCosto: 0, costo: 0, tickets: new Set(), ventaTk: 0, unidadesTk: 0, comision: 0, cobro: {} })
    const $ = monto(v)
    x.venta += $
    for (const p of repartoPago(v)) {
      const tipo = tipoDeMetodo(p.metodo); if (!tipo || !(p.monto > 0)) continue
      const pos = tipo === 'qr' ? 'AMARILLO' : posnetNormal(posnetDeParte(v, p.metodo))
      const k = `${pos}|${tipo}`
      const d = (x.cobro[k] ||= { posnet: pos, tipo, monto: 0, comision: 0, iibb: 0, cheque: 0, costo: 0, tasa: tasaCobro(tipo, pos, mes) })
      const com = p.monto * d.tasa * IVA / 100, ib = p.monto * IIBB / 100
      const ch = impChequeAplica(tipo, pos) ? (p.monto - com - ib) * LEY_25413_BLANCO / 100 : 0
      d.monto += p.monto; d.comision += com; d.iibb += ib; d.cheque += ch; d.costo += com + ib + ch
      x.comision += com + ib + ch
    }
    if (costoValido(v)) { x.ventaConCosto += $; x.costo += v.costoTotal }
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
    let desglose = null
    if (x) {
      const cobertura = x.venta > 0 ? x.ventaConCosto / x.venta : 0
      if (cobertura >= MIN_COBERTURA && x.ventaConCosto > 0) val.margen = (x.ventaConCosto - x.costo) / x.ventaConCosto
      det.margen = `costo cargado en el ${Math.round(cobertura * 100)}% de lo vendido`
      const nt = x.tickets.size
      if (nt >= MIN_TICKETS) { val.ticket = x.ventaTk / nt * f; val.upt = x.unidadesTk / nt }
      det.ticket = det.upt = `${nt.toLocaleString('es-AR')} tickets`
      const h = horas[mes] || 0
      if (h >= MIN_HORAS) val.porHora = x.venta * f / h
      // Servicio Payway (fijo por mes) si ese mes se cobró con el blanco
      const usoBlanco = Object.values(x.cobro).some(d => d.posnet === 'BLANCO')
      const servicio = usoBlanco ? servicioPaywayDelMes(mes) : 0
      x.comision += servicio
      if (x.venta > 0) val.cobro = x.comision / x.venta
      det.cobro = `${fmt$(x.comision)} entre comisiones e impuestos`
      desglose = { filas: Object.values(x.cobro).sort((a, b) => b.costo - a.costo), servicio, total: x.comision, venta: x.venta }
      det.porHora = h ? `${Math.round(h).toLocaleString('es-AR')} h fichadas` : 'sin fichadas'
    }
    return { mes, val, det, venta: x?.venta || 0, desglose }
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
    return { mes: c.mes, label: nombreMes(c.mes), indice, comp, enCurso: c.mes === mesActual, desglose: c.desglose }
  })
  return { meses: resultado }
}

// Detalle del costo de cobro del mes: cuánto se cobró con cada posnet y medio, a qué tasa y cuánto costó
function DesgloseCobro({ d, label }) {
  const [abierto, setAbierto] = useState(false)
  const pctTxt = v => `${(v * 100).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`
  const cobradoPosnet = d.filas.reduce((s, f) => s + f.monto, 0)
  const totalIibb = d.filas.reduce((s, f) => s + f.iibb, 0)
  const totalCheque = d.filas.reduce((s, f) => s + f.cheque, 0)
  return (
    <div style={{ marginTop: 12 }}>
      <button style={S.desgloseBtn} onClick={() => setAbierto(v => !v)} aria-expanded={abierto}>
        {abierto ? '▾' : '▸'} Costo de cobro de {label}: {fmt$(d.total)} ({pctTxt(d.venta ? d.total / d.venta : 0)} de la venta)
      </button>
      {abierto && (<>
        <div style={S.tablaWrap}>
          <table style={{ ...S.tabla, minWidth: 720 }}>
            <thead><tr>
              <th style={{ ...S.th, textAlign: 'left' }}>Posnet · medio</th><th style={S.th}>Cobrado</th><th style={S.th}>Comisión (con IVA)</th><th style={S.th}>IIBB</th><th style={S.th}>Imp. cheque</th><th style={S.th}>Costo total</th><th style={S.th}>%</th>
            </tr></thead>
            <tbody>
              {d.filas.map(f => (
                <tr key={f.posnet + f.tipo}>
                  <td style={{ ...S.td, textAlign: 'left' }}>{NOMBRE_POSNET[f.posnet]} · {NOMBRE_TIPO[f.tipo]}</td>
                  <td style={S.td}>{fmt$(f.monto)}</td><td style={S.td}>{fmt$(f.comision)}<div style={S.chico}>{pctTxt(f.tasa * IVA / 100)}</div></td>
                  <td style={S.td}>{fmt$(f.iibb)}</td><td style={S.td}>{f.cheque ? fmt$(f.cheque) : '–'}</td><td style={S.td}>{fmt$(f.costo)}</td><td style={{ ...S.td, fontWeight: 700 }}>{pctTxt(f.monto ? f.costo / f.monto : 0)}</td>
                </tr>
              ))}
              {d.servicio > 0 && (
                <tr><td style={{ ...S.td, textAlign: 'left' }}>Servicio Payway (fijo del mes)</td><td style={S.td}>–</td><td style={S.td}>{fmt$(d.servicio)}</td><td style={S.td}>–</td><td style={S.td}>–</td><td style={S.td}>{fmt$(d.servicio)}</td><td style={S.td}>–</td></tr>
              )}
              <tr>
                <td style={{ ...S.td, textAlign: 'left', fontWeight: 700 }}>Total</td><td style={{ ...S.td, fontWeight: 700 }}>{fmt$(cobradoPosnet)}</td>
                <td style={{ ...S.td, fontWeight: 700 }}>{fmt$(d.total - totalIibb - totalCheque)}</td><td style={{ ...S.td, fontWeight: 700 }}>{fmt$(totalIibb)}</td><td style={{ ...S.td, fontWeight: 700 }}>{fmt$(totalCheque)}</td>
                <td style={{ ...S.td, fontWeight: 700 }}>{fmt$(d.total)}</td><td style={{ ...S.td, fontWeight: 700 }}>{pctTxt(cobradoPosnet ? d.total / cobradoPosnet : 0)}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div style={S.hint}>
          Payway: crédito 2% + cobro anticipado (activo hasta oct 2026), débito sin arancel, servicio fijo por mes (bonificado nov 2026 – oct 2027).
          Mercado Pago: crédito 4,19% argentina / 7,19% del exterior (se usa el promedio real, ≈80% del exterior), débito 2,75%, QR 0,80%.
          Comisiones con IVA. Se suman la retención de Ingresos Brutos (2,5% de lo cobrado con tarjeta o QR) y el impuesto al cheque (Ley 25.413, {LEY_25413_BLANCO.toLocaleString('es-AR')}% de lo que Payway deposita en el banco), porque no se recuperan.
        </div>
      </>)}
    </div>
  )
}

const COLOR_REC = { alerta: '#ef4444', idea: 'var(--accent)', bien: '#22c55e' }
const ICONO_REC = { alerta: '⚠️', idea: '💡', bien: '✅' }
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
  const recs = useMemo(() => sel ? generarRecomendaciones(ventas, sel.mes, sel.comp, { fichadas: fichadas || [], comisionDe, enCurso: sel.enCurso }) : [], [ventas, sel, fichadas])
  const nAlertas = recs.filter(r => r.tipo === 'alerta').length
  // Plegado por defecto; se recuerda en este dispositivo (como el detalle de Hoy)
  const [abierto, setAbierto] = useState(() => { try { return localStorage.getItem('tb_indice_abierto') === '1' } catch { return false } })
  const alternarAbierto = () => setAbierto(v => { try { localStorage.setItem('tb_indice_abierto', v ? '0' : '1') } catch {} return !v })
  if (!ventas.length) return null

  return (
    <div style={S.card}>
      <button style={S.barra} onClick={alternarAbierto} aria-expanded={abierto}>
        <span style={S.titulo}>Índice de eficiencia</span>
        {sel && <span style={{ ...S.barraNum, color: colorIndice(sel.indice) }}>{Math.round(sel.indice)}</span>}
        {sel && <span style={S.barraSub}>{sel.label}{sel.enCurso ? ' (en curso)' : ''}</span>}
        {!abierto && nAlertas > 0 && <span style={S.barraAlerta}>⚠️ {nAlertas} {nAlertas === 1 ? 'alerta' : 'alertas'}</span>}
        <span style={S.barraToggle}>{abierto ? 'Ocultar ▴' : 'Detalle ▾'}</span>
      </button>
      {abierto && (<>
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

        {sel.desglose && <DesgloseCobro d={sel.desglose} label={sel.label} />}

        {recs.length > 0 && (
          <div style={S.recs} aria-label="Recomendaciones">
            <div style={S.recsTitulo}>Recomendaciones · {sel.label}{sel.enCurso ? ' (mes en curso, puede cambiar)' : ''}</div>
            {recs.map((r, i) => (
              <div key={i} style={{ ...S.rec, borderColor: COLOR_REC[r.tipo] }} data-rec={r.tipo}>
                <div style={{ ...S.recTitulo, color: COLOR_REC[r.tipo] }}>{ICONO_REC[r.tipo]} {r.titulo}</div>
                <div style={S.recTexto}>{r.texto}</div>
                {r.accion && <div style={S.recAccion}>👉 {r.accion}</div>}
              </div>
            ))}
          </div>
        )}
      </>)}
      </>)}
    </div>
  )
}

const S = {
  card: { margin: '0 20px 16px', background: 'var(--surface)', borderRadius: 14, border: '1.5px solid var(--accent)', padding: 16 },
  barra: { display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', gap: '4px 14px', width: '100%', background: 'none', border: 'none', padding: 0, cursor: 'pointer', textAlign: 'left', color: 'inherit' },
  barraNum: { fontFamily: 'Barlow Condensed, sans-serif', fontWeight: 800, fontSize: 30, lineHeight: 1 },
  barraSub: { fontFamily: 'Barlow Condensed, sans-serif', fontWeight: 700, fontSize: 14, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 1 },
  barraAlerta: { fontFamily: 'Barlow, sans-serif', fontSize: 13, color: '#ef4444' },
  barraToggle: { marginLeft: 'auto', fontFamily: 'Barlow, sans-serif', fontSize: 13, color: 'var(--muted)' },
  titulo: { fontFamily: 'Barlow Condensed, sans-serif', fontWeight: 800, fontSize: 18, color:'var(--accent-text)', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 4 },
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
  recs: { display: 'flex', flexDirection: 'column', gap: 10, marginTop: 14 },
  recsTitulo: { fontFamily: 'Barlow Condensed, sans-serif', fontWeight: 800, fontSize: 16, color:'var(--accent-text)', letterSpacing: 1, textTransform: 'uppercase' },
  rec: { background: 'var(--surface2)', border: '1.5px solid', borderLeftWidth: 1.5, borderRadius: 10, padding: '10px 14px' },
  recTitulo: { fontFamily: 'Barlow Condensed, sans-serif', fontWeight: 800, fontSize: 17, lineHeight: 1.2 },
  recTexto: { fontFamily: 'Barlow, sans-serif', fontSize: 14, color: 'var(--text)', lineHeight: 1.45, marginTop: 4 },
  recAccion: { fontFamily: 'Barlow, sans-serif', fontSize: 14, color: 'var(--muted)', lineHeight: 1.45, marginTop: 6 },
  desgloseBtn: { background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: 'Barlow Condensed, sans-serif', fontWeight: 700, fontSize: 15, color: 'var(--accent-text)', textAlign: 'left' },
  chico: { fontSize: 11, color: 'var(--muted)', fontWeight: 400, marginTop: 2 },
}
