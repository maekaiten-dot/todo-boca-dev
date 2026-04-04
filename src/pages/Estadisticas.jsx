// src/pages/Estadisticas.jsx
import { useState, useEffect } from 'react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { getHistoricoVentas } from '../api/sheets.js'

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
    // formato D/M/YYYY como viene del sheet
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

const CustomTooltip = ({ active, payload, label }) => {
  if (active && payload && payload.length) {
    return (
      <div style={{
        background: 'var(--surface)',
        border: '1.5px solid var(--border)',
        borderRadius: 8,
        padding: '10px 14px',
      }}>
        <div style={{ fontFamily: 'Barlow Condensed, sans-serif', fontSize: 13, color: 'var(--muted)', marginBottom: 4 }}>{label}</div>
        <div style={{ fontFamily: 'Barlow Condensed, sans-serif', fontWeight: 800, fontSize: 20, color: 'var(--accent)' }}>
          ${Math.round(payload[0].value).toLocaleString('es-AR')}
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
  const [totalPeriodo, setTotalPeriodo] = useState(0)
  const [mejorDia, setMejorDia] = useState(null)

  useEffect(() => { cargar() }, [])

  async function cargar() {
    setLoading(true)
    setError(null)
    try {
      const ventas = await getHistoricoVentas()
      const dias = getUltimos35Dias()

      // Sumar ventas no anuladas por fecha
      ventas
        .filter(v => !v.anulado)
        .forEach(v => {
          const precio = parsePrecio(v.precioTotalFinal) || parsePrecio(v.precioTotal)
          const diaObj = dias.find(d => d.fechaKey === v.fecha)
          if (diaObj) diaObj.total += precio
        })

      const total = dias.reduce((s, d) => s + d.total, 0)
      const mejor = dias.reduce((a, b) => b.total > a.total ? b : a, dias[0])

      setDatosGrafico(dias)
      setTotalPeriodo(total)
      setMejorDia(mejor)
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

      {/* Cards resumen */}
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

      {/* Gráfico */}
      <div style={S.chartCard}>
        <div style={S.chartTitle}>Ventas por día — últimos 35 días</div>
        <div style={S.chartWrap}>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={datosGrafico} margin={{ top: 8, right: 8, left: 0, bottom: 40 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
              <XAxis
                dataKey="label"
                tick={{ fontFamily: 'Barlow Condensed, sans-serif', fontSize: 11, fill: '#6a8ccc' }}
                angle={-45}
                textAnchor="end"
                interval={2}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                tick={{ fontFamily: 'Barlow Condensed, sans-serif', fontSize: 11, fill: '#6a8ccc' }}
                tickFormatter={v => v >= 1000000 ? `${(v/1000000).toFixed(1)}M` : v >= 1000 ? `${(v/1000).toFixed(0)}k` : v}
                tickLine={false}
                axisLine={false}
                width={48}
              />
              <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(245,200,0,0.06)' }} />
              <Bar dataKey="total" fill="#00e676" radius={[4, 4, 0, 0]} maxBarSize={32} />
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
  chartCard: { margin:'0 20px 20px', background:'var(--surface)', borderRadius:14, border:'1.5px solid var(--border)', padding:'16px' },
  chartTitle: { fontFamily:'Barlow Condensed, sans-serif', fontWeight:700, fontSize:16, color:'var(--muted)', letterSpacing:1, textTransform:'uppercase', marginBottom:12 },
  chartWrap: { width:'100%' },
}
