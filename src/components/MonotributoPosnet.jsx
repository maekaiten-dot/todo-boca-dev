// src/components/MonotributoPosnet.jsx
// Contador de monotributo por posnet (cada posnet es un titular distinto).
// Para cada mes suma los ingresos de los últimos 12 meses de cada posnet y los compara con los topes de ARCA.
// También proyecta cómo va a llegar a la próxima recategorización (febrero y agosto).
// Exclusión (Ley 24.977 art. 20 a): se queda afuera del régimen apenas los ingresos de los últimos 12 meses
// corridos —incluida cada venta nueva— superan el tope de la K. Eso se controla todo el tiempo, no solo
// en la recategorización: por eso el límite de cada mes es el tope K menos los 11 meses anteriores.
import { useState, useEffect, useMemo } from 'react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts'
import { getMonotributoManual, montoConMetodo } from '../api/sheets.js'

// Topes anuales de ingresos brutos (actualizar cuando ARCA los cambie)
export const TOPES_MONOTRIBUTO = [
  ['A', 12009410.45], ['B', 17595182.74], ['C', 24670494.31], ['D', 30628651.43], ['E', 36028231.33],
  ['F', 45151659.41], ['G', 53995798.87], ['H', 81924660.37], ['I', 91699761.90], ['J', 105012519.20], ['K', 126610838.75],
]
const TOPE_K = TOPES_MONOTRIBUTO[TOPES_MONOTRIBUTO.length - 1][1]
const CORTE_POSNET = 50000 // regla actual: menos de $50.000 → amarillo; desde $50.000 → blanco
const POSNETS = [
  { id: 'amarillo', nombre: 'Posnet amarillo', color: '#f5c800' },
  { id: 'blanco', nombre: 'Posnet blanco', color: '#e8eefc' },
]

const parsePrecio = v => (!v && v !== 0) ? 0 : Number(String(v).replace(/[$\s.]/g, '').replace(',', '.')) || 0
const esTarjetaOQR = m => ['tarjeta', 'tarjeta de credito', 'tarjeta de debito', 'qr'].includes(String(m || '').trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''))
const fmtM = n => `$${(n / 1e6).toLocaleString('es-AR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} M`
const fmt$ = n => '$' + Math.round(n).toLocaleString('es-AR')
const MESES_LARGOS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
const mesKey = (a, m) => `${a}-${String(m).padStart(2, '0')}`
const mesLabel = k => { const [a, m] = k.split('-').map(Number); return `${MESES[m - 1]} ${String(a).slice(2)}` }
const sumarMes = (k, n) => { const [a, m] = k.split('-').map(Number); const t = a * 12 + (m - 1) + n; return mesKey(Math.floor(t / 12), (t % 12) + 1) }

export function categoriaDe(monto) {
  const c = TOPES_MONOTRIBUTO.find(([, tope]) => monto <= tope)
  return c ? c[0] : 'Supera K'
}

// Ingresos mensuales por posnet. Origen de cada mes: "cargado" (hoja MONOTRIBUTO POSNET),
// "registrado" (la app guardó el posnet), "mixto" (parte registrado, parte estimado) o "estimado"
// (ventas sin posnet repartidas con la regla de los $50.000 por ticket).
function calcularMensual(ventas, manual) {
  const meses = {}
  const tickets = {}
  // Con 2 medios de pago solo cuenta la parte cobrada con tarjeta o QR
  ventas.filter(v => !v.anulado && v.fecha && montoConMetodo(v, esTarjetaOQR) > 0).forEach(v => {
    const [d, m, a] = String(v.fecha).split('/').map(Number); if (!d || !m || !a) return
    const k = mesKey(a, m)
    const mm = meses[k] || (meses[k] = { amarillo: 0, blanco: 0, estAmarillo: 0, estBlanco: 0 })
    const monto = montoConMetodo(v, esTarjetaOQR)
    const pos = String(v.posnet || '').trim().toUpperCase()
    if (pos === 'AMARILLO') mm.amarillo += monto
    else if (pos === 'BLANCO') mm.blanco += monto
    else { const t = `${k}|${v.fecha}|${v.idVenta || v.idDetalle}`; (tickets[t] ||= { k, total: 0 }).total += monto }
  })
  Object.values(tickets).forEach(t => { if (t.total >= CORTE_POSNET) meses[t.k].estBlanco += t.total; else meses[t.k].estAmarillo += t.total })
  Object.entries(manual).forEach(([k, v]) => { meses[k] ||= { amarillo: 0, blanco: 0, estAmarillo: 0, estBlanco: 0 } })
  const out = {}
  Object.entries(meses).forEach(([k, mm]) => {
    if (manual[k]) { out[k] = { amarillo: manual[k].amarillo, blanco: manual[k].blanco, origen: 'cargado' }; return }
    const reg = mm.amarillo + mm.blanco, est = mm.estAmarillo + mm.estBlanco
    out[k] = { amarillo: mm.amarillo + mm.estAmarillo, blanco: mm.blanco + mm.estBlanco, origen: reg > 0 && est > 0 ? 'mixto' : reg > 0 ? 'registrado' : 'estimado' }
  })
  return out
}

function hoyAR() { const d = new Date(Date.now() - 3 * 3600000); return { a: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate(), diasMes: new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate() } }

// Próxima recategorización: en febrero se miran los 12 meses cerrados al 31/1; en agosto, al 31/7
function proximaRecategorizacion({ a, m }) {
  if (m <= 1) return { nombre: `febrero ${a}`, corte: mesKey(a, 1) }
  if (m <= 7) return { nombre: `agosto ${a}`, corte: mesKey(a, 7) }
  return { nombre: `febrero ${a + 1}`, corte: mesKey(a + 1, 1) }
}

export default function MonotributoPosnet({ ventas = [] }) {
  const [manual, setManual] = useState({})
  const [errorManual, setErrorManual] = useState(false)
  useEffect(() => { getMonotributoManual().then(setManual).catch(e => { console.error(e); setErrorManual(true) }) }, [])

  const datos = useMemo(() => {
    const mensual = calcularMensual(ventas, manual)
    const h = hoyAR()
    const actual = mesKey(h.a, h.m)
    const fraccionMes = h.d / h.diasMes
    const recat = proximaRecategorizacion(h)
    const val = (k, p) => mensual[k]?.[p] || 0
    const res = {}
    POSNETS.forEach(({ id }) => {
      // Últimos 12 meses hasta hoy (incluye el mes en curso)
      let ult12 = 0; for (let i = 0; i < 12; i++) ult12 += val(sumarMes(actual, -i), id)
      // Ritmo: promedio de los últimos 3 meses cerrados
      let ritmo = 0; for (let i = 1; i <= 3; i++) ritmo += val(sumarMes(actual, -i), id); ritmo /= 3
      // Estacionalidad: cada mes futuro se estima con el mismo mes del año pasado, ajustado por cuánto
      // cambiaron las ventas en los últimos 3 meses contra los mismos 3 meses del año anterior.
      let ant3 = 0; for (let i = 1; i <= 3; i++) ant3 += val(sumarMes(actual, -i - 12), id)
      const factor = ant3 > 0 ? Math.min(2, Math.max(0.5, (ritmo * 3) / ant3)) : null
      const estimarMes = k => { const base = val(sumarMes(k, -12), id); return factor != null && base > 0 ? base * factor : ritmo }
      // Proyección al corte de la próxima recategorización
      let proy = 0
      for (let i = 0; i < 12; i++) {
        const k = sumarMes(recat.corte, -i)
        if (k < actual) proy += val(k, id)
        else if (k === actual) proy += val(k, id) + estimarMes(k) * (1 - fraccionMes) // lo vendido + lo que falta del mes
        else proy += estimarMes(k)
      }
      // Límite del mes en curso: tope K menos lo facturado en los 11 meses anteriores (12 meses corridos)
      let ant11 = 0; for (let i = 1; i <= 11; i++) ant11 += val(sumarMes(actual, -i), id)
      const maxEsteMes = TOPE_K - ant11
      const vendidoEsteMes = val(actual, id)
      const quedaEsteMes = maxEsteMes - vendidoEsteMes
      // 12 meses corridos de acá a un año, al ritmo estimado: el pico y el primer mes que pasaría la K
      const estimado = k => k < actual ? val(k, id) : k === actual ? val(k, id) + estimarMes(k) * (1 - fraccionMes) : estimarMes(k)
      let pico = { monto: 0, k: actual }, primerExceso = null
      for (let j = 0; j < 12; j++) {
        const fin = sumarMes(actual, j)
        let s = 0; for (let i = 0; i < 12; i++) s += estimado(sumarMes(fin, -i))
        if (s > pico.monto) pico = { monto: s, k: fin }
        if (!primerExceso && s > TOPE_K) primerExceso = fin
      }
      res[id] = { ult12, ritmo, proy, catActual: categoriaDe(ult12), catProy: categoriaDe(proy), maxEsteMes, vendidoEsteMes, quedaEsteMes, pico, primerExceso }
    })
    // Serie: suma de 12 meses para cada mes de los últimos 18
    const serie = []
    for (let i = 17; i >= 0; i--) {
      const k = sumarMes(actual, -i)
      const fila = { k, label: mesLabel(k), origen: mensual[k]?.origen || '—' }
      POSNETS.forEach(({ id }) => { let s = 0; for (let j = 0; j < 12; j++) s += val(sumarMes(k, -j), id); fila[id] = s; fila[`mes_${id}`] = val(k, id) })
      serie.push(fila)
    }
    const origenes = new Set(Object.entries(mensual).filter(([k]) => k > sumarMes(actual, -12)).map(([, v]) => v.origen))
    return { res, serie, recat, actual, hayEstimados: origenes.has('estimado') || origenes.has('mixto') }
  }, [ventas, manual])

  return (
    <div style={S.card}>
      <div style={S.titulo}>Monotributo por posnet</div>
      <div style={S.hint}>
        Ingresos de los últimos 12 meses corridos de cada titular, comparados con los topes de ARCA. La exclusión se controla en cada venta con los 12 meses corridos; la recategorización mira los 12 meses cerrados. Próxima recategorización: <strong style={{ color: 'var(--text)' }}>{datos.recat.nombre}</strong> (se miran los 12 meses cerrados hasta fin de {MESES_LARGOS[Number(datos.recat.corte.split('-')[1]) - 1]} {datos.recat.corte.split('-')[0]}).
      </div>

      <div style={S.grid}>
        {POSNETS.map(p => {
          const r = datos.res[p.id]
          const pasaK = r.ult12 > TOPE_K, pasaKProy = !!r.primerExceso
          const alerta = pasaK || pasaKProy
          const cerca = !alerta && r.pico.monto > TOPE_K * 0.9
          const mesActualNombre = MESES_LARGOS[Number(datos.actual.split('-')[1]) - 1]
          return (
            <div key={p.id} style={{ ...S.posCard, ...(alerta ? S.posCardAlerta : {}) }}>
              <div style={S.posHead}><span style={{ ...S.rect, background: p.color }} />{p.nombre}</div>
              <div style={S.fila}><span>Últimos 12 meses</span><strong>{fmtM(r.ult12)}</strong></div>
              <div style={S.fila}><span>Categoría hoy</span><strong style={{ color: pasaK ? '#ef4444' : 'var(--accent)' }}>{r.catActual}</strong></div>
              <div style={S.barra}>
                <div style={{ ...S.barraFill, width: `${Math.min(100, r.ult12 / TOPE_K * 100)}%`, background: pasaK ? '#ef4444' : p.color }} />
                {TOPES_MONOTRIBUTO.slice(6, 10).map(([l, t]) => <div key={l} style={{ ...S.marca, left: `${t / TOPE_K * 100}%` }} title={`Tope ${l}: ${fmtM(t)}`} />)}
              </div>
              <div style={S.barraTxt}>{Math.round(r.ult12 / TOPE_K * 100)}% del tope de la categoría K ({fmtM(TOPE_K)})</div>
              <div style={S.sep} />
              <div style={S.fila}><span>Ritmo (prom. 3 meses)</span><strong>{fmtM(r.ritmo)}/mes</strong></div>
              <div style={S.fila}><span title="Meses que faltan estimados con el mismo mes del año pasado, ajustado por la tendencia de los últimos 3 meses">Proyección a {datos.recat.nombre}</span><strong style={{ color: pasaKProy ? '#ef4444' : 'var(--text)' }}>{fmtM(r.proy)} · {r.catProy}</strong></div>
              <div style={S.sep} />
              <div style={S.fila}><span title="Tope de la K menos lo facturado en los 11 meses anteriores: la exclusión se controla con los 12 meses corridos, en cada venta">Máximo en {mesActualNombre} (12 meses corridos)</span><strong>{r.maxEsteMes <= 0 ? 'ya se pasó' : fmtM(r.maxEsteMes)}</strong></div>
              <div style={S.fila}><span>Vendido en {mesActualNombre} · queda</span><strong style={{ color: r.quedaEsteMes <= 0 ? '#ef4444' : r.quedaEsteMes < r.ritmo ? '#f59e0b' : '#22c55e' }}>{fmtM(r.vendidoEsteMes)} · {r.quedaEsteMes <= 0 ? 'nada' : fmtM(r.quedaEsteMes)}</strong></div>
              <div style={S.fila}><span title="Tope de la K dividido 12: vendiendo esto por mes nunca se pasa">Promedio sostenible</span><strong>{fmtM(TOPE_K / 12)}/mes</strong></div>
              <div style={S.fila}><span title="La suma de 12 meses corridos más alta de acá a un año, si se sigue vendiendo como se estima">Pico de 12 meses (próximo año)</span><strong style={{ color: r.pico.monto > TOPE_K ? '#ef4444' : cerca ? '#f59e0b' : 'var(--text)' }}>{fmtM(r.pico.monto)} · {mesLabel(r.pico.k)}</strong></div>
              {alerta && (
                <div style={S.alerta}>
                  {pasaK ? `Ya supera el tope de la categoría K en los últimos 12 meses.` : `A este ritmo, los 12 meses corridos pasarían la K en ${MESES_LARGOS[Number(r.primerExceso.split('-')[1]) - 1]} ${r.primerExceso.split('-')[0]}.`} Conviene derivar ventas al otro posnet o a efectivo.
                </div>
              )}
              {cerca && (
                <div style={{ ...S.alerta, ...S.aviso }}>Está cerca del límite: a este ritmo los 12 meses corridos llegan al {Math.round(r.pico.monto / TOPE_K * 100)}% del tope K en {mesLabel(r.pico.k)}.</div>
              )}
            </div>
          )
        })}
      </div>

      <div style={{ ...S.hint, marginTop: 14 }}>Suma de los últimos 12 meses, mes a mes. La línea roja es el tope de la categoría K.</div>
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={datos.serie} margin={{ top: 8, right: 12, left: 0, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
          <XAxis dataKey="label" tick={{ fontFamily: 'Barlow Condensed, sans-serif', fontSize: 11, fill: '#6a8ccc' }} tickLine={false} axisLine={false} interval={1} />
          <YAxis tick={{ fontFamily: 'Barlow Condensed, sans-serif', fontSize: 11, fill: '#6a8ccc' }} tickFormatter={v => `${Math.round(v / 1e6)}M`} tickLine={false} axisLine={false} width={44} domain={[0, dataMax => Math.max(dataMax, TOPE_K) * 1.08]} />
          <Tooltip content={<SerieTooltip />} />
          <ReferenceLine y={TOPE_K} stroke="#ef4444" strokeDasharray="6 4" label={{ value: 'Tope K', fill: '#ef4444', fontSize: 11, position: 'insideTopLeft' }} />
          {POSNETS.map(p => <Line key={p.id} type="monotone" dataKey={p.id} stroke={p.color} strokeWidth={2.5} dot={{ r: 3 }} />)}
        </LineChart>
      </ResponsiveContainer>

      {datos.hayEstimados && (
        <div style={S.nota}>
          Algunos meses son <strong>estimados</strong>: la app empezó a registrar el posnet hace poco, y para las ventas anteriores reparte tarjeta + QR con la regla de hoy (menos de {fmt$(CORTE_POSNET)} → amarillo; desde {fmt$(CORTE_POSNET)} → blanco). Para que el contador sea exacto, cargá los totales reales de cada titular en la hoja <strong>MONOTRIBUTO POSNET</strong> de la planilla (columnas MES aaaa-mm, AMARILLO, BLANCO): los meses cargados ahí reemplazan a los estimados.
        </div>
      )}
      {errorManual && <div style={{ ...S.nota, color: '#ef4444' }}>No se pudo leer la hoja MONOTRIBUTO POSNET; se muestran solo datos de la app.</div>}
    </div>
  )
}

const ORIGEN_TXT = { cargado: 'cargado a mano', registrado: 'registrado por la app', mixto: 'parte registrado, parte estimado', estimado: 'estimado', '—': 'sin ventas' }
function SerieTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload
  return (
    <div style={{ background: 'var(--surface)', border: '1.5px solid var(--border)', borderRadius: 8, padding: '10px 14px', fontFamily: 'Barlow, sans-serif', fontSize: 13, color: 'var(--text)' }}>
      <div style={{ fontFamily: 'Barlow Condensed, sans-serif', fontSize: 13, color: 'var(--muted)', marginBottom: 4 }}>12 meses hasta {label}</div>
      {POSNETS.map(p => (
        <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 2 }}>
          <span style={{ width: 14, height: 9, borderRadius: 3, background: p.color }} />
          <span style={{ flex: 1 }}>{p.nombre}</span>
          <strong>{fmtM(d[p.id])} · {categoriaDe(d[p.id])}</strong>
        </div>
      ))}
      <div style={{ color: 'var(--muted)', fontSize: 12, marginTop: 6 }}>
        En {label}: amarillo {fmtM(d.mes_amarillo)} · blanco {fmtM(d.mes_blanco)} ({ORIGEN_TXT[d.origen] || d.origen})
      </div>
    </div>
  )
}

const S = {
  card: { margin: '0 20px 16px', background: 'var(--surface)', borderRadius: 14, border: '1.5px solid var(--border)', padding: 16 },
  titulo: { fontFamily: 'Barlow Condensed, sans-serif', fontWeight: 700, fontSize: 16, color: 'var(--muted)', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 4 },
  hint: { fontFamily: 'Barlow, sans-serif', fontSize: 12, color: 'var(--muted)', lineHeight: 1.5, marginBottom: 10 },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 12 },
  posCard: { background: 'var(--surface2)', border: '1.5px solid var(--border)', borderRadius: 12, padding: 14, display: 'flex', flexDirection: 'column', gap: 6 },
  posCardAlerta: { borderColor: '#ef4444' },
  posHead: { display: 'flex', alignItems: 'center', gap: 8, fontFamily: 'Barlow Condensed, sans-serif', fontWeight: 800, fontSize: 18, color: 'var(--text)', marginBottom: 4 },
  rect: { width: 28, height: 16, borderRadius: 5 },
  fila: { display: 'flex', justifyContent: 'space-between', gap: 10, fontFamily: 'Barlow, sans-serif', fontSize: 14, color: 'var(--muted)' },
  barra: { position: 'relative', height: 10, background: 'rgba(255,255,255,0.08)', borderRadius: 5, overflow: 'visible', marginTop: 4 },
  barraFill: { height: '100%', borderRadius: 5 },
  marca: { position: 'absolute', top: -3, width: 2, height: 16, background: 'rgba(255,255,255,0.35)' },
  barraTxt: { fontFamily: 'Barlow, sans-serif', fontSize: 11, color: 'var(--muted)' },
  sep: { height: 1, background: 'var(--border)', margin: '4px 0' },
  alerta: { marginTop: 4, fontFamily: 'Barlow, sans-serif', fontSize: 13, fontWeight: 600, color: '#fff', background: 'rgba(239,68,68,0.25)', border: '1px solid rgba(239,68,68,0.6)', borderRadius: 8, padding: '8px 10px' },
  aviso: { background: 'rgba(245,158,11,0.18)', border: '1px solid rgba(245,158,11,0.5)', color: 'var(--text)' },
  nota: { fontFamily: 'Barlow, sans-serif', fontSize: 12, color: 'var(--muted)', lineHeight: 1.5, marginTop: 10 },
}
