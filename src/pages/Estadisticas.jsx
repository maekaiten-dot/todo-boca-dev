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

export default function Estadisticas() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [datosGrafico, setDatosGrafico] = useState([])
  const [datosMes, setDatosMes] = useState([])
  const [datosMetodo, setDatosMetodo] = useState([])
  const [datosPct, setDatosPct] = useState([])
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

      setDatosGrafico(dias)
      setTotalPeriodo(total)
      setMejorDia(mejor)
      setDatosMes(mesTotales)
      setDatosMetodo(mesTarjeta)
      setDatosPct(calcularPctPorMes(mesTotales, mesTarjeta))

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
        <div style={S.chartWrap}>
          <ResponsiveContainer width="100%" height={560}>
            <BarChart data={datosGrafico} margin={{ top: 8, right: 8, left: 0, bottom: 40 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
              <XAxis dataKey="label" tick={{ fontFamily:'Barlow Condensed, sans-serif', fontSize:11, fill:'#6a8ccc' }} angle={-45} textAnchor="end" interval={2} tickLine={false} axisLine={false} />
              <YAxis tick={{ fontFamily:'Barlow Condensed, sans-serif', fontSize:11, fill:'#6a8ccc' }} tickFormatter={v => v >= 1000000 ? `${(v/1000000).toFixed(1)}M` : v >= 1000 ? `${(v/1000).toFixed(0)}k` : v} tickLine={false} axisLine={false} width={48} />
              <Tooltip content={<CustomTooltip />} cursor={{ fill:'rgba(0,230,118,0.06)' }} />
              <Bar dataKey="total" fill="#00e676" radius={[4, 4, 0, 0]} maxBarSize={32} />
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
}
