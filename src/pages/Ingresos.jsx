// src/pages/Ingresos.jsx
import { useState, useEffect } from 'react'
import { getIngresos, getArticulosAdmin } from '../api/sheets.js'

export default function Ingresos() {
  const [ingresos, setIngresos] = useState([])
  const [articulos, setArticulos] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [busqueda, setBusqueda] = useState('')

  useEffect(() => { cargar() }, [])

  async function cargar() {
    setLoading(true)
    setError(null)
    try {
      const [ing, arts] = await Promise.all([getIngresos(), getArticulosAdmin()])
      setIngresos(ing.sort((a, b) => {
        const fa = a.fecha?.split('/').reverse().join('') + a.hora
        const fb = b.fecha?.split('/').reverse().join('') + b.hora
        return fb.localeCompare(fa)
      }))
      setArticulos(arts)
    } catch (e) {
      setError('No se pudo cargar.')
    } finally {
      setLoading(false)
    }
  }

  const normalizr = str => str.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')

  const ingresosFiltrados = ingresos.filter(i => {
    if (!busqueda.trim()) return true
    const q = normalizr(busqueda)
    return normalizr(i.articuloNombre).includes(q) ||
      normalizr(i.articuloId).includes(q) ||
      normalizr(i.proveedor).includes(q) ||
      normalizr(i.idIngreso).includes(q)
  })

  if (loading) return <div style={S.center}><div style={S.loadingText}>Cargando ingresos...</div></div>
  if (error) return (
    <div style={S.center}>
      <div style={S.errorText}>{error}</div>
      <button style={S.retryBtn} onClick={cargar}>Reintentar</button>
    </div>
  )

  return (
    <div style={S.page}>
      <div style={S.header}>
        <div style={S.headerTitle}>INGRESOS</div>
        <button style={S.refreshBtn} onClick={cargar}>↻</button>
      </div>

      <div style={S.infoBar}>
        <span style={S.infoText}>📋 Solo lectura — los ingresos se registran automáticamente desde PAGOS</span>
      </div>

      <div style={S.searchWrap}>
        <span style={S.searchIcon}>⌕</span>
        <input style={S.searchInput} value={busqueda} onChange={e => setBusqueda(e.target.value)} placeholder="Buscar por artículo, proveedor, ID..." />
        {busqueda && <button style={S.clearBtn} onClick={() => setBusqueda('')}>✕</button>}
      </div>

      <div style={S.tableWrap}>
        {ingresosFiltrados.length === 0 ? (
          <div style={S.emptyText}>Sin ingresos registrados</div>
        ) : (
          <table style={S.table}>
            <thead>
              <tr>
                <th style={S.th}>ID</th>
                <th style={S.th}>Fecha</th>
                <th style={S.th}>Artículo</th>
                <th style={S.th}>Cant.</th>
                <th style={S.th}>Costo unit.</th>
                <th style={S.th}>Costo total</th>
                <th style={S.th}>Proveedor</th>
                <th style={S.th}>Empleado</th>
              </tr>
            </thead>
            <tbody>
              {ingresosFiltrados.map(ing => {
                const art = articulos.find(a => a.id === ing.articuloId)
                return (
                  <tr key={ing.rowNum} style={{...S.tr, ...(ing.anulado ? S.trAnulado : {})}}>
                    <td style={{...S.td, ...S.tdId}}>{ing.idIngreso}</td>
                    <td style={S.td}>{ing.fecha}</td>
                    <td style={{...S.td, ...S.tdNombre}}>
                      <div style={{display:'flex', alignItems:'center', gap:8}}>
                        {art?.foto && <img src={art.foto} alt="" style={S.miniThumb} onError={e => e.currentTarget.style.display='none'} />}
                        <span>
                          {ing.anulado && <span style={S.badgeAnulado}>ANULADO</span>}
                          {ing.articuloNombre || ing.articuloId}
                        </span>
                      </div>
                    </td>
                    <td style={{...S.td, textAlign:'center', fontWeight:700}}>{ing.cantidad}</td>
                    <td style={S.td}>${(ing.costoUnitario||0).toLocaleString('es-AR')}</td>
                    <td style={{...S.td, color:'var(--accent)', fontWeight:700}}>${(ing.costoTotal||0).toLocaleString('es-AR')}</td>
                    <td style={{...S.td, color:'var(--muted)'}}>{ing.proveedor}</td>
                    <td style={{...S.td, color:'var(--muted)'}}>{ing.empleado}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

const S = {
  page: { display:'flex', flexDirection:'column', height:'100%', overflowY:'auto', position:'relative' },
  center: { display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', height:'100%', gap:12 },
  loadingText: { fontFamily:'Barlow Condensed, sans-serif', fontSize:22, color:'var(--muted)' },
  errorText: { fontFamily:'Barlow, sans-serif', fontSize:16, color:'#ef4444', textAlign:'center' },
  retryBtn: { background:'var(--surface)', border:'1.5px solid var(--border)', borderRadius:10, color:'var(--text)', fontFamily:'Barlow, sans-serif', fontSize:15, padding:'10px 24px', cursor:'pointer' },
  header: { display:'flex', alignItems:'center', justifyContent:'space-between', padding:'16px 20px 12px', borderBottom:'2px solid var(--accent)', flexShrink:0 },
  headerTitle: { fontFamily:'Barlow Condensed, sans-serif', fontWeight:800, fontSize:28, color:'var(--accent)', textTransform:'uppercase', letterSpacing:2 },
  refreshBtn: { background:'var(--surface)', border:'1.5px solid var(--border)', borderRadius:10, color:'var(--text)', fontSize:22, width:40, height:40, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' },
  infoBar: { margin:'10px 20px 0', background:'rgba(59,130,246,0.1)', border:'1px solid rgba(59,130,246,0.3)', borderRadius:8, padding:'8px 14px' },
  infoText: { fontFamily:'Barlow, sans-serif', fontSize:13, color:'#93c5fd' },
  searchWrap: { display:'flex', alignItems:'center', margin:'10px 20px 6px', background:'var(--surface)', border:'1.5px solid var(--border)', borderRadius:8, padding:'0 12px' },
  searchIcon: { fontSize:18, color:'var(--muted)' },
  searchInput: { flex:1, background:'none', border:'none', outline:'none', color:'var(--text)', fontFamily:'Barlow, sans-serif', fontSize:15, padding:'8px 6px' },
  clearBtn: { background:'none', border:'none', color:'var(--muted)', cursor:'pointer', fontSize:14 },
  tableWrap: { flex:1, overflowX:'auto', padding:'0 20px 20px' },
  table: { width:'100%', borderCollapse:'collapse' },
  th: { fontFamily:'Barlow Condensed, sans-serif', fontWeight:800, fontSize:12, color:'var(--muted)', letterSpacing:1, textTransform:'uppercase', padding:'8px 10px', borderBottom:'2px solid var(--border)', textAlign:'left', background:'var(--surface)', position:'sticky', top:0, zIndex:1, whiteSpace:'nowrap' },
  td: { fontFamily:'Barlow, sans-serif', fontSize:14, color:'var(--text)', padding:'8px 10px', borderBottom:'1px solid rgba(13,48,128,0.3)', verticalAlign:'middle' },
  tdId: { fontFamily:'Barlow Condensed, sans-serif', fontSize:12, color:'var(--muted)', whiteSpace:'nowrap' },
  tdNombre: { maxWidth:220 },
  miniThumb: { width:28, height:28, objectFit:'cover', borderRadius:4, flexShrink:0, border:'1px solid var(--border)' },
  tr: {},
  trAnulado: { opacity:0.4 },
  badgeAnulado: { fontFamily:'Barlow Condensed, sans-serif', fontWeight:800, fontSize:10, color:'#ef4444', background:'rgba(239,68,68,0.15)', borderRadius:4, padding:'1px 5px', marginRight:6, letterSpacing:1 },
  emptyText: { fontFamily:'Barlow, sans-serif', color:'var(--muted)', textAlign:'center', padding:40, fontSize:16 },
}
