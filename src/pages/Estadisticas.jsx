// src/pages/Estadisticas.jsx
import { useState, useEffect } from 'react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { getHistoricoVentas } from '../api/sheets.js'

function esTarjetaOQR(metodo) {
  if (!metodo) return false
  const m = metodo.trim().toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  return m === 'tarjeta' ||
    m === 'tarjeta de credito' ||
    m === 'tarjeta de debito' ||
    m === 'qr'
}

function getUltimos35Dias() {
  const dias = []
  const hoy = new Date()
  const offset = -3 * 60
  const local = new Date(hoy.getTime() + (offset - hoy.getTimezoneOffset()) * 60000)
  for (let i = 34; i >= 0; i--) {
    const d = new Date(local)
    d.setDate(d.getDate() - i)
    const dia = d.getDate()
    const mes = d.getMonth() + 1
    const anio = d.getFullYear()
    const fechaKey = `${dia}/${mes}/${anio}`
    const label = `${String(dia).padStart(2,'0')}/${String(mes).padStart(2,'0')}`
    dias.push({ fechaKey, label, total: 0 })
  }
  return dias
}

function parsePrecio(v) {
  if (!v && v !== 0) return 0
  return Number(String(v).replace(/[$\s.]/g, '').replace(',', '.')) || 0
}

function agruparPorMes(ventas, filtro) {
  const mesMap = {}
  ventas
    .filter(v => !v.anulado && (filtro ? filtro(v) : true))
    .forEach(v => {
      if (!v.fecha) return
      const partes = v.fecha.split('/')
      if (partes.length < 3) return
      const key = `${partes[2]}-${String(partes[1]).padStart(2,'0')}`
      const label = `${String(partes[1]).padStart(2,'0')}/${partes[2]}`
      if (!mesMap[key]) mesMap[key] = { key, label, total: 0 }
      mesMap[key].total += parsePrecio(v.precioTotalFinal) || parsePrecio(v.precioTotal)
    })
  return Object.values(mesMap).sort((a, b) => a.key.localeCompare(b.key))
}

const esPosnetBlanco = v => String(v.posnet || '').trim().toUpperCase() === 'BLANCO'
const tienePosnet = v => ['AMARILLO', 'BLANCO'].includes(String(v.posnet || '').trim().toUpperCase())

// Posnet blanco por mes: total cobrado y % sobre el total del mes.
// El posnet se registra desde que se agregó a la app: los meses anteriores no tienen el dato
// y no se muestran (arranca en el primer mes con algún posnet registrado).
function calcularPosnetBlancoPorMes(ventas, mesTotales, mesTarjeta) {
  const conPosnet = agruparPorMes(ventas, tienePosnet)
  if (conPosnet.length === 0) return []
  const primerMes = conPosnet[0].key
  const blanco = agruparPorMes(ventas, esPosnetBlanco)
  return mesTotales
    .filter(mt => mt.key >= primerMes)
    .map(mt => {
      const total = blanco.find(m => m.key === mt.key)?.total || 0
      const tq = mesTarjeta.find(m => m.key === mt.key)?.total || 0
      return {
        key: mt.key, label: mt.label, total,
        pct: mt.total > 0 ? parseFloat((total / mt.total * 100).toFixed(2)) : 0,
        pctTarjeta: tq > 0 ? parseFloat((total / tq * 100).toFixed(2)) : 0,
      }
    })
}

function calcularPctPorMes(mesTotales, mesTarjeta) {
  // Para cada mes en mesTotales, calcular % tarjeta+QR
  return mesTotales.map(mt => {
    const tq = mesTarjeta.find(m => m.key === mt.key)
    const pct = mt.total > 0 ? parseFloat(((tq?.total || 0) / mt.total * 100).toFixed(2)) : 0
    return { key: mt.key, label: mt.label, pct }
  })
}

const CustomTooltip = ({ active, payload, label }) => {
  if (active && payload && payload.length) {
    return (
      <div style={{ background:'var(--surface)', border:'1.5px solid var(--border)', borderRadius:8, padding:'10px 14px' }}>
        <div style={{ fontFamily:'Barlow Condensed, sans-serif', fontSize:13, color:'var(--muted)', marginBottom:4 }}>{label}</div>
        <div style={{ fontFamily:'Barlow Condensed, sans-serif', fontWeight:800, fontSize:20, color:'var(--accent)' }}>
          ${Math.round(payload[0].value).toLocaleString('es-AR')}
        </div>
      </div>
    )
  }
  return null
}

const PctTooltip = ({ active, payload, label }) => {
  if (active && payload && payload.length) {
    return (
      <div style={{ background:'var(--surface)', border:'1.5px solid var(--border)', borderRadius:8, padding:'10px 14px' }}>
        <div style={{ fontFamily:'Barlow Condensed, sans-serif', fontSize:13, color:'var(--muted)', marginBottom:4 }}>{label}</div>
        <div style={{ fontFamily:'Barlow Condensed, sans-serif', fontWeight:800, fontSize:20, color:'#ff4dd2' }}>
          {payload[0].value.toFixed(2)}%
        </div>
      </div>
    )
  }
  return null
}

const BlancoPctTooltip = ({ active, payload, label }) => {
  if (active && payload && payload.length) {
    const d = payload[0].payload
    return (
      <div style={{ background:'var(--surface)', border:'1.5px solid var(--border)', borderRadius:8, padding:'10px 14px' }}>
        <div style={{ fontFamily:'Barlow Condensed, sans-serif', fontSize:13, color:'var(--muted)', marginBottom:4 }}>{label}</div>
        <div style={{ fontFamily:'Barlow Condensed, sans-serif', fontWeight:800, fontSize:20, color:'#e8eefc' }}>
          {d.pct.toFixed(2)}% del total
        </div>
        <div style={{ fontFamily:'Barlow, sans-serif', fontSize:12, color:'var(--muted)', marginTop:2 }}>
          {d.pctTarjeta.toFixed(2)}% de lo cobrado con tarjeta + QR
        </div>
      </div>
    )
  }
  return null
}

const BlancoTotalTooltip = ({ active, payload, label }) => {
  if (active && payload && payload.length) {
    return (
      <div style={{ background:'var(--surface)', border:'1.5px solid var(--border)', borderRadius:8, padding:'10px 14px' }}>
        <div style={{ fontFamily:'Barlow Condensed, sans-serif', fontSize:13, color:'var(--muted)', marginBottom:4 }}>{label}</div>
        <div style={{ fontFamily:'Barlow Condensed, sans-serif', fontWeight:800, fontSize:20, color:'#e8eefc' }}>
          ${Math.round(payload[0].value).toLocaleString('es-AR')}
        </div>
      </div>
    )
  }
  return null
}

const fmt$ = n => '$' + Math.round(n).toLocaleString('es-AR')
const DIAS_SEMANA = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']

// Agrupa las filas de un día por ticket (ID_VENTA), de la más nueva a la más vieja
function armarTicketsDelDia(ventas, fechaKey) {
  const map = {}
  ventas.filter(v => v.fecha === fechaKey).forEach(v => {
    const id = v.idVenta || v.idDetalle
    if (!map[id]) map[id] = { id, hora: v.hora || '', empleado: v.empleado || '', metodoPago: v.metodoPago || '', posnet: v.posnet || '', notas: v.notas || '', anulado: v.anulado, items: [], total: 0 }
    const t = map[id]
    const precio = parsePrecio(v.precioTotalFinal) || parsePrecio(v.precioTotal)
    t.items.push({ nombre: v.nombre || v.articulo || '', cantidad: v.cantidad || 0, precio })
    t.total += precio
    if (!v.anulado) t.anulado = false
  })
  return Object.values(map).sort((a, b) => b.hora.localeCompare(a.hora))
}

function DetalleDia({ dia, ventas, onCerrar }) {
  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape') onCerrar() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCerrar])

  const tickets = armarTicketsDelDia(ventas, dia.fechaKey)
  const validos = tickets.filter(t => !t.anulado)
  const total = validos.reduce((s, t) => s + t.total, 0)
  const porMetodo = {}
  validos.forEach(t => { porMetodo[t.metodoPago || 'Sin método'] = (porMetodo[t.metodoPago || 'Sin método'] || 0) + t.total })
  const [d, m, a] = dia.fechaKey.split('/').map(Number)
  const nombreDia = DIAS_SEMANA[new Date(a, m - 1, d).getDay()]

  return (
    <div style={D.overlay} onClick={onCerrar}>
      <div style={D.sheet} onClick={e => e.stopPropagation()} role="dialog" aria-label={`Ventas del ${dia.label}`}>
        <div style={D.head}>
          <div>
            <div style={D.titulo}>{nombreDia} {String(d).padStart(2, '0')}/{String(m).padStart(2, '0')}/{a}</div>
            <div style={D.sub}>{validos.length} {validos.length === 1 ? 'venta' : 'ventas'}{tickets.length > validos.length ? ` · ${tickets.length - validos.length} anulada(s)` : ''}</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={D.total}>{fmt$(total)}</div>
            <button style={D.cerrar} onClick={onCerrar} aria-label="Cerrar">✕</button>
          </div>
        </div>

        {Object.keys(porMetodo).length > 0 && (
          <div style={D.metodos}>
            {Object.entries(porMetodo).sort((x, y) => y[1] - x[1]).map(([met, monto]) => (
              <span key={met} style={D.metodoChip}>{met} · <strong style={{ color: 'var(--text)' }}>{fmt$(monto)}</strong></span>
            ))}
          </div>
        )}

        <div style={D.lista}>
          {tickets.length === 0 ? <div style={D.vacio}>No hubo ventas este día.</div> : tickets.map(t => (
            <div key={t.id} style={{ ...D.ticket, ...(t.anulado ? { opacity: 0.45 } : {}) }}>
              <div style={D.ticketHead}>
                <div style={{ minWidth: 0 }}>
                  <div style={D.ticketMeta}>
                    {t.anulado && <span style={D.badgeAnulada}>ANULADA</span>}
                    {t.hora.slice(0, 5)} · {t.empleado}
                  </div>
                  <div style={D.ticketMetodo}>
                    {t.metodoPago}
                    {t.posnet && <span style={{ ...D.posnetDot, background: t.posnet.toUpperCase() === 'AMARILLO' ? '#f5c800' : '#f0f4ff' }} title={`Posnet ${t.posnet.toLowerCase()}`} />}
                    {t.notas && <span style={{ color: 'var(--muted)' }}> · {t.notas}</span>}
                  </div>
                </div>
                <div style={{ ...D.ticketTotal, ...(t.anulado ? { textDecoration: 'line-through' } : {}) }}>{fmt$(t.total)}</div>
              </div>
              {t.items.map((it, i) => (
                <div key={i} style={D.item}>
                  <span style={D.itemNombre}>{it.cantidad} × {it.nombre}</span>
                  <span style={D.itemPrecio}>{fmt$(it.precio)}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

const D = {
  overlay: { position:'fixed', inset:0, background:'rgba(0,0,10,0.7)', zIndex:400, display:'flex', alignItems:'flex-end', justifyContent:'center' },
  sheet: { width:'100%', maxWidth:720, maxHeight:'88vh', display:'flex', flexDirection:'column', background:'var(--surface)', borderTop:'2px solid var(--accent)', borderRadius:'18px 18px 0 0', padding:'14px 16px calc(12px + env(safe-area-inset-bottom, 0px))', gap:10 },
  head: { display:'flex', justifyContent:'space-between', alignItems:'center', gap:12 },
  titulo: { fontFamily:'Barlow Condensed, sans-serif', fontWeight:800, fontSize:22, color:'var(--accent)', letterSpacing:0.5 },
  sub: { fontFamily:'Barlow, sans-serif', fontSize:13, color:'var(--muted)' },
  total: { fontFamily:'Barlow Condensed, sans-serif', fontWeight:800, fontSize:26, color:'#00e676', whiteSpace:'nowrap' },
  cerrar: { background:'var(--surface2)', border:'1.5px solid var(--border)', borderRadius:10, color:'var(--text)', fontSize:18, width:40, height:40, cursor:'pointer', flexShrink:0 },
  metodos: { display:'flex', flexWrap:'wrap', gap:6 },
  metodoChip: { fontFamily:'Barlow, sans-serif', fontSize:12, color:'var(--muted)', background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:20, padding:'3px 10px' },
  lista: { overflowY:'auto', display:'flex', flexDirection:'column', gap:8, paddingBottom:4 },
  vacio: { fontFamily:'Barlow, sans-serif', fontSize:14, color:'var(--muted)', padding:'16px 0' },
  ticket: { background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:10, padding:'10px 12px' },
  ticketHead: { display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:10, marginBottom:4 },
  ticketMeta: { fontFamily:'Barlow Condensed, sans-serif', fontWeight:700, fontSize:16, color:'var(--text)' },
  ticketMetodo: { fontFamily:'Barlow, sans-serif', fontSize:12, color:'var(--muted)', display:'flex', alignItems:'center', gap:6, flexWrap:'wrap' },
  posnetDot: { display:'inline-block', width:18, height:10, borderRadius:3 },
  ticketTotal: { fontFamily:'Barlow Condensed, sans-serif', fontWeight:800, fontSize:18, color:'var(--accent)', whiteSpace:'nowrap' },
  item: { display:'flex', justifyContent:'space-between', gap:10, fontFamily:'Barlow, sans-serif', fontSize:13, color:'var(--text)', padding:'2px 0' },
  itemNombre: { minWidth:0, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', opacity:0.9 },
  itemPrecio: { flexShrink:0, color:'var(--muted)' },
  badgeAnulada: { fontSize:10, fontWeight:800, color:'#ef4444', background:'rgba(239,68,68,0.15)', borderRadius:4, padding:'1px 5px', marginRight:6, letterSpacing:1 },
}

export default function Estadisticas() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [datosGrafico, setDatosGrafico] = useState([])
  const [datosMes, setDatosMes] = useState([])
  const [datosMetodo, setDatosMetodo] = useState([])
  const [datosPct, setDatosPct] = useState([])
  const [datosBlanco, setDatosBlanco] = useState([])
  const [ventasTodas, setVentasTodas] = useState([])
  const [diaAbierto, setDiaAbierto] = useState(null)
  const [totalPeriodo, setTotalPeriodo] = useState(0)
  const [mejorDia, setMejorDia] = useState(null)

  useEffect(() => { cargar() }, [])

  async function cargar() {
    setLoading(true)
    setError(null)
    try {
      const ventas = await getHistoricoVentas()
      const dias = getUltimos35Dias()

      ventas
        .filter(v => !v.anulado)
        .forEach(v => {
          const precio = parsePrecio(v.precioTotalFinal) || parsePrecio(v.precioTotal)
          const diaObj = dias.find(d => d.fechaKey === v.fecha)
          if (diaObj) diaObj.total += precio
        })

      const total = dias.reduce((s, d) => s + d.total, 0)
      const mejor = dias.reduce((a, b) => b.total > a.total ? b : a, dias[0])

      const mesTotales = agruparPorMes(ventas)
      const mesTarjeta = agruparPorMes(ventas, v => esTarjetaOQR(v.metodoPago))

      setVentasTodas(ventas)
      setDatosGrafico(dias)
      setTotalPeriodo(total)
      setMejorDia(mejor)
      setDatosMes(mesTotales)
      setDatosMetodo(mesTarjeta)
      setDatosPct(calcularPctPorMes(mesTotales, mesTarjeta))
      setDatosBlanco(calcularPosnetBlancoPorMes(ventas, mesTotales, mesTarjeta))

    } catch (e) {
      setError('No se pudo cargar. Intentá de nuevo.')
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  if (loading) return (
    <div style={S.center}>
      <div style={S.loadingText}>Calculando estadísticas...</div>
      <div style={S.loadingSub}>Esto puede tardar unos segundos</div>
    </div>
  )

  if (error) return (
    <div style={S.center}>
      <div style={S.errorText}>{error}</div>
      <button style={S.retryBtn} onClick={cargar}>Reintentar</button>
    </div>
  )

  const promedioDiario = totalPeriodo / 35

  return (
    <div style={S.page}>
      <div style={S.header}>
        <div style={S.headerTitle}>ESTADÍSTICAS</div>
        <button style={S.refreshBtn} onClick={cargar}>↻</button>
      </div>

      <div style={S.statsRow}>
        <div style={S.statCard}>
          <div style={S.statValue}>${Math.round(totalPeriodo).toLocaleString('es-AR')}</div>
          <div style={S.statLabel}>Total 35 días</div>
        </div>
        <div style={S.statCard}>
          <div style={S.statValue}>${Math.round(promedioDiario).toLocaleString('es-AR')}</div>
          <div style={S.statLabel}>Promedio diario</div>
        </div>
        <div style={S.statCard}>
          <div style={S.statValue}>${Math.round(mejorDia?.total || 0).toLocaleString('es-AR')}</div>
          <div style={S.statLabel}>Mejor día ({mejorDia?.label})</div>
        </div>
      </div>

      {/* Gráfico diario */}
      <div style={S.chartCard}>
        <div style={S.chartTitle}>Ventas por día — últimos 35 días</div>
        <div style={S.chartHint}>Tocá una columna para ver las ventas de ese día</div>
        <div style={S.chartWrap}>
          <ResponsiveContainer width="100%" height={560}>
            <BarChart data={datosGrafico} margin={{ top: 8, right: 8, left: 0, bottom: 40 }} style={{ cursor:'pointer', outline:'none' }} onClick={st => { const dia = st?.activePayload?.[0]?.payload || datosGrafico[Number(st?.activeTooltipIndex ?? st?.activeIndex)] || datosGrafico.find(x => x.label === st?.activeLabel); if (dia?.fechaKey) setDiaAbierto(dia) }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
              <XAxis dataKey="label" tick={{ fontFamily:'Barlow Condensed, sans-serif', fontSize:11, fill:'#6a8ccc' }} angle={-45} textAnchor="end" interval={2} tickLine={false} axisLine={false} />
              <YAxis tick={{ fontFamily:'Barlow Condensed, sans-serif', fontSize:11, fill:'#6a8ccc' }} tickFormatter={v => v >= 1000000 ? `${(v/1000000).toFixed(1)}M` : v >= 1000 ? `${(v/1000).toFixed(0)}k` : v} tickLine={false} axisLine={false} width={48} />
              <Tooltip content={<CustomTooltip />} cursor={{ fill:'rgba(0,230,118,0.06)' }} />
              <Bar dataKey="total" fill="#00e676" radius={[4, 4, 0, 0]} maxBarSize={32} cursor="pointer" onClick={d => { const dia = d?.payload || d; if (dia?.fechaKey) setDiaAbierto(dia) }} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Gráfico mensual total */}
      <div style={S.chartCard}>
        <div style={S.chartTitle}>Ventas por mes — histórico</div>
        <div style={S.chartWrap}>
          <ResponsiveContainer width="100%" height={560}>
            <BarChart data={datosMes} margin={{ top: 8, right: 8, left: 0, bottom: 40 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
              <XAxis dataKey="label" tick={{ fontFamily:'Barlow Condensed, sans-serif', fontSize:11, fill:'#6a8ccc' }} angle={-45} textAnchor="end" interval={0} tickLine={false} axisLine={false} />
              <YAxis tick={{ fontFamily:'Barlow Condensed, sans-serif', fontSize:11, fill:'#6a8ccc' }} tickFormatter={v => v >= 1000000 ? `${(v/1000000).toFixed(1)}M` : v >= 1000 ? `${(v/1000).toFixed(0)}k` : v} tickLine={false} axisLine={false} width={48} />
              <Tooltip content={<CustomTooltip />} cursor={{ fill:'rgba(33,150,243,0.08)' }} />
              <Bar dataKey="total" fill="#2196f3" radius={[4, 4, 0, 0]} maxBarSize={48} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Gráfico tarjeta + QR por mes */}
      <div style={S.chartCard}>
        <div style={S.chartTitle}>Ventas Tarjeta + QR por mes — histórico</div>
        <div style={S.chartWrap}>
          <ResponsiveContainer width="100%" height={560}>
            <BarChart data={datosMetodo} margin={{ top: 8, right: 8, left: 0, bottom: 40 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
              <XAxis dataKey="label" tick={{ fontFamily:'Barlow Condensed, sans-serif', fontSize:11, fill:'#6a8ccc' }} angle={-45} textAnchor="end" interval={0} tickLine={false} axisLine={false} />
              <YAxis tick={{ fontFamily:'Barlow Condensed, sans-serif', fontSize:11, fill:'#6a8ccc' }} tickFormatter={v => v >= 1000000 ? `${(v/1000000).toFixed(1)}M` : v >= 1000 ? `${(v/1000).toFixed(0)}k` : v} tickLine={false} axisLine={false} width={48} />
              <Tooltip content={<CustomTooltip />} cursor={{ fill:'rgba(239,68,68,0.08)' }} />
              <Bar dataKey="total" fill="#ef4444" radius={[4, 4, 0, 0]} maxBarSize={48} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Gráfico % tarjeta+QR sobre total por mes */}
      <div style={S.chartCard}>
        <div style={S.chartTitle}>% Tarjeta + QR sobre total — por mes</div>
        <div style={S.chartWrap}>
          <ResponsiveContainer width="100%" height={560}>
            <BarChart data={datosPct} margin={{ top: 8, right: 8, left: 0, bottom: 40 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
              <XAxis dataKey="label" tick={{ fontFamily:'Barlow Condensed, sans-serif', fontSize:11, fill:'#6a8ccc' }} angle={-45} textAnchor="end" interval={0} tickLine={false} axisLine={false} />
              <YAxis tick={{ fontFamily:'Barlow Condensed, sans-serif', fontSize:11, fill:'#6a8ccc' }} tickFormatter={v => `${v}%`} domain={[0, 100]} tickLine={false} axisLine={false} width={48} />
              <Tooltip content={<PctTooltip />} cursor={{ fill:'rgba(255,77,210,0.08)' }} />
              <Bar dataKey="pct" fill="#ff4dd2" radius={[4, 4, 0, 0]} maxBarSize={48} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>


      {/* Gráfico % posnet blanco sobre total por mes */}
      <div style={S.chartCard}>
        <div style={S.chartTitle}>% Posnet blanco sobre total — por mes</div>
        {datosBlanco.length === 0 ? <div style={S.sinDatos}>Todavía no hay ventas con posnet registrado.</div> : (
        <div style={S.chartWrap}>
          <ResponsiveContainer width="100%" height={560}>
            <BarChart data={datosBlanco} margin={{ top: 8, right: 8, left: 0, bottom: 40 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
              <XAxis dataKey="label" tick={{ fontFamily:'Barlow Condensed, sans-serif', fontSize:11, fill:'#6a8ccc' }} angle={-45} textAnchor="end" interval={0} tickLine={false} axisLine={false} />
              <YAxis tick={{ fontFamily:'Barlow Condensed, sans-serif', fontSize:11, fill:'#6a8ccc' }} tickFormatter={v => `${v}%`} domain={[0, 100]} tickLine={false} axisLine={false} width={48} />
              <Tooltip content={<BlancoPctTooltip />} cursor={{ fill:'rgba(232,238,252,0.06)' }} />
              <Bar dataKey="pct" fill="#e8eefc" radius={[4, 4, 0, 0]} maxBarSize={48} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        )}
      </div>

      {/* Gráfico total cobrado con posnet blanco por mes */}
      <div style={S.chartCard}>
        <div style={S.chartTitle}>Ventas posnet blanco por mes</div>
        {datosBlanco.length === 0 ? <div style={S.sinDatos}>Todavía no hay ventas con posnet registrado.</div> : (
        <div style={S.chartWrap}>
          <ResponsiveContainer width="100%" height={560}>
            <BarChart data={datosBlanco} margin={{ top: 8, right: 8, left: 0, bottom: 40 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
              <XAxis dataKey="label" tick={{ fontFamily:'Barlow Condensed, sans-serif', fontSize:11, fill:'#6a8ccc' }} angle={-45} textAnchor="end" interval={0} tickLine={false} axisLine={false} />
              <YAxis tick={{ fontFamily:'Barlow Condensed, sans-serif', fontSize:11, fill:'#6a8ccc' }} tickFormatter={v => v >= 1000000 ? `${(v/1000000).toFixed(1)}M` : v >= 1000 ? `${(v/1000).toFixed(0)}k` : v} tickLine={false} axisLine={false} width={48} />
              <Tooltip content={<BlancoTotalTooltip />} cursor={{ fill:'rgba(232,238,252,0.06)' }} />
              <Bar dataKey="total" fill="#e8eefc" radius={[4, 4, 0, 0]} maxBarSize={48} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        )}
      </div>

      {diaAbierto && <DetalleDia dia={diaAbierto} ventas={ventasTodas} onCerrar={() => setDiaAbierto(null)} />}
    </div>
  )
}

const S = {
  page: { display:'flex', flexDirection:'column', height:'100%', overflowY:'auto' },
  center: { display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', height:'100%', gap:12 },
  loadingText: { fontFamily:'Barlow Condensed, sans-serif', fontSize:22, color:'var(--muted)' },
  loadingSub: { fontFamily:'Barlow, sans-serif', fontSize:13, color:'var(--muted)' },
  errorText: { fontFamily:'Barlow, sans-serif', fontSize:16, color:'#ef4444', textAlign:'center' },
  retryBtn: { background:'var(--surface)', border:'1.5px solid var(--border)', borderRadius:10, color:'var(--text)', fontFamily:'Barlow, sans-serif', fontSize:15, padding:'10px 24px', cursor:'pointer' },
  header: { display:'flex', alignItems:'center', justifyContent:'space-between', padding:'16px 20px 12px', borderBottom:'2px solid var(--accent)', flexShrink:0 },
  headerTitle: { fontFamily:'Barlow Condensed, sans-serif', fontWeight:800, fontSize:28, color:'var(--accent)', textTransform:'uppercase', letterSpacing:2 },
  refreshBtn: { background:'var(--surface)', border:'1.5px solid var(--border)', borderRadius:10, color:'var(--text)', fontSize:24, width:44, height:44, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' },
  statsRow: { display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:12, padding:'16px 20px 12px' },
  statCard: { background:'var(--surface)', borderRadius:12, padding:'14px 16px', border:'1.5px solid var(--border)' },
  statValue: { fontFamily:'Barlow Condensed, sans-serif', fontWeight:800, fontSize:24, color:'var(--accent)' },
  statLabel: { fontFamily:'Barlow, sans-serif', fontSize:12, color:'var(--muted)', marginTop:2 },
  chartCard: { margin:'0 20px 16px', background:'var(--surface)', borderRadius:14, border:'1.5px solid var(--border)', padding:'16px' },
  chartTitle: { fontFamily:'Barlow Condensed, sans-serif', fontWeight:700, fontSize:16, color:'var(--muted)', letterSpacing:1, textTransform:'uppercase', marginBottom:12 },
  chartWrap: { width:'100%' },
  chartHint: { fontFamily:'Barlow, sans-serif', fontSize:12, color:'var(--muted)', marginTop:-8, marginBottom:8 },
  sinDatos: { fontFamily:'Barlow, sans-serif', fontSize:14, color:'var(--muted)', padding:'24px 0' },
}
