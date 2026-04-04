// src/pages/LogVentas.jsx
import { useState, useEffect } from 'react'
import { getHistoricoVentas } from '../api/sheets.js'
import DetalleVentaModal from '../components/DetalleVentaModal.jsx'

export default function LogVentas() {
  const [ventas, setVentas] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [busqueda, setBusqueda] = useState('')
  const [ventaSeleccionada, setVentaSeleccionada] = useState(null)

  useEffect(() => { cargar() }, [])

  async function cargar() {
    setLoading(true)
    setError(null)
    try {
      const data = await getHistoricoVentas()
      setVentas(data)
    } catch (e) {
      setError('No se pudo cargar el historial.')
    } finally {
      setLoading(false)
    }
  }

  const ventasAgrupadas = ventas.reduce((acc, v) => {
    const key = v.idVenta || v.idDetalle
    if (!acc[key]) {
      acc[key] = { idVenta: key, fecha: v.fecha, hora: v.hora, metodoPago: v.metodoPago, empleado: v.empleado, items: [], total: 0, totalOriginal: 0, anulado: false }
    }
    acc[key].items.push(v)
    acc[key].totalOriginal += v.precioTotalFinal || v.precioTotal || 0
    if (!v.anulado) acc[key].total += v.precioTotalFinal || v.precioTotal || 0
    return acc
  }, {})

  Object.values(ventasAgrupadas).forEach(v => {
    v.anulado = v.items.length > 0 && v.items.every(i => i.anulado)
  })

  const todasVentas = Object.values(ventasAgrupadas).sort((a, b) => {
    const fa = a.fecha?.split('/').reverse().join('') + a.hora
    const fb = b.fecha?.split('/').reverse().join('') + b.hora
    return fb.localeCompare(fa)
  })

  const ventasFiltradas = busqueda.trim()
    ? todasVentas.filter(v =>
        v.idVenta?.toLowerCase().includes(busqueda.toLowerCase()) ||
        v.metodoPago?.toLowerCase().includes(busqueda.toLowerCase()) ||
        v.empleado?.toLowerCase().includes(busqueda.toLowerCase()) ||
        v.items.some(i => i.nombre?.toLowerCase().includes(busqueda.toLowerCase()))
      )
    : todasVentas

  const porFecha = ventasFiltradas.reduce((acc, v) => {
    const f = v.fecha || 'Sin fecha'
    if (!acc[f]) acc[f] = []
    acc[f].push(v)
    return acc
  }, {})

  const totalGeneral = todasVentas.filter(v => !v.anulado).reduce((s, v) => s + v.total, 0)
  const cantTotal = todasVentas.filter(v => !v.anulado).length
  const cantAnuladas = todasVentas.filter(v => v.anulado).length

  const METODO_ICONS = {
    'Efectivo Pesos':'💵','Efectivo ARS':'💵',
    'Tarjeta de Crédito':'💳','Tarjeta de Débito':'💳','Tarjeta':'💳',
    'QR':'📱','Transferencia':'🏦',
    'Efectivo Dólares':'🇺🇸','Efectivo USD':'🇺🇸',
    'Efectivo Reales':'🇧🇷','Efectivo BRL':'🇧🇷',
    'Efectivo Euros':'🇪🇺','Efectivo EUR':'🇪🇺',
  }

  if (loading) return (
    <div style={S.center}>
      <div style={S.loadingText}>Cargando historial...</div>
      <div style={S.loadingSub}>Esto puede tardar unos segundos</div>
    </div>
  )

  if (error) return (
    <div style={S.center}>
      <div style={S.errorText}>{error}</div>
      <button style={S.retryBtn} onClick={cargar}>Reintentar</button>
    </div>
  )

  return (
    <div style={S.page}>
      <div style={S.header}>
        <div style={S.headerTitle}>REGISTRO DE VENTAS HISTÓRICO</div>
        <button style={S.refreshBtn} onClick={cargar}>↻</button>
      </div>

      <div style={S.statsRow}>
        <div style={S.statCard}>
          <div style={S.statValue}>${Math.round(totalGeneral).toLocaleString('es-AR')}</div>
          <div style={S.statLabel}>Total histórico</div>
        </div>
        <div style={S.statCard}>
          <div style={S.statValue}>{cantTotal}</div>
          <div style={S.statLabel}>Ventas</div>
        </div>
        <div style={S.statCard}>
          <div style={{...S.statValue, color:'#ef4444'}}>{cantAnuladas}</div>
          <div style={S.statLabel}>Anuladas</div>
        </div>
      </div>

      <div style={S.searchWrap}>
        <span style={S.searchIcon}>⌕</span>
        <input
          style={S.searchInput}
          value={busqueda}
          onChange={e => setBusqueda(e.target.value)}
          placeholder="Buscar por ID, producto, empleado, método..."
        />
        {busqueda && <button style={S.clearBtn} onClick={() => setBusqueda('')}>✕</button>}
      </div>

      <div style={S.lista}>
        {Object.entries(porFecha).map(([fecha, ventasDelDia]) => (
          <div key={fecha}>
            <div style={S.fechaHeader}>
              <span>{fecha}</span>
              <span style={S.fechaTotal}>
                ${Math.round(ventasDelDia.filter(v=>!v.anulado).reduce((s,v)=>s+v.total,0)).toLocaleString('es-AR')}
                · {ventasDelDia.filter(v=>!v.anulado).length} ventas
              </span>
            </div>
            {ventasDelDia.map(v => {
              const tieneParcial = !v.anulado && v.items.some(i => i.anulado)
              return (
                <div key={v.idVenta} style={{...S.ventaCard, ...(v.anulado ? S.ventaCardAnulada : {}), cursor:'pointer'}} onClick={() => setVentaSeleccionada(v)}>
                  {v.anulado && <div style={S.anuladoBanner}>⚠ ANULADA</div>}
                  {tieneParcial && <div style={S.parcialBanner}>⚠ Tiene productos anulados</div>}
                  <div style={S.ventaTop}>
                    <div style={{...S.ventaId, ...(v.anulado ? S.textAnulado : {})}}>{v.idVenta}</div>
                    <div style={{...S.ventaHora, ...(v.anulado ? S.textAnulado : {})}}>{v.hora}</div>
                  </div>
                  <div style={S.ventaBottom}>
                    <div style={{...S.ventaMetodo, ...(v.anulado ? S.textAnulado : {})}}>
                      {METODO_ICONS[v.metodoPago] || '💰'} {v.metodoPago}
                      · {v.items.length} producto{v.items.length !== 1 ? 's' : ''}
                      {v.empleado ? ` · ${v.empleado}` : ''}
                    </div>
                    <div style={S.ventaTotal}>
                      {v.anulado ? (
                        <span style={{textDecoration:'line-through', color:'var(--muted)', opacity:0.6}}>
                          ${Math.round(v.totalOriginal).toLocaleString('es-AR')}
                        </span>
                      ) : tieneParcial ? (
                        <span style={{display:'flex', alignItems:'center', gap:6}}>
                          <span style={{textDecoration:'line-through', opacity:0.4, fontSize:21, color:'var(--muted)'}}>
                            ${Math.round(v.totalOriginal).toLocaleString('es-AR')}
                          </span>
                          <span>${Math.round(v.total).toLocaleString('es-AR')}</span>
                        </span>
                      ) : (
                        `$${Math.round(v.total).toLocaleString('es-AR')}`
                      )}
                    </div>
                  </div>
                  <div style={S.ventaItems}>
                    {v.items.map((item, i) => (
                      <div key={item.idDetalle || item.articulo || i} style={{...S.ventaItem, ...(item.anulado ? S.ventaItemAnulado : {})}}>
                        {item.foto
                          ? <img src={item.foto} alt="" style={S.ventaItemThumb} onError={e => e.target.style.display='none'} />
                          : <div style={S.ventaItemThumbPH}>📦</div>
                        }
                        <span>{item.nombre} ×{item.cantidad}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        ))}
        {ventasFiltradas.length === 0 && (
          <div style={S.emptyText}>Sin resultados para "{busqueda}"</div>
        )}
      </div>

      {ventaSeleccionada && (
        <DetalleVentaModal
          venta={ventaSeleccionada}
          onClose={() => setVentaSeleccionada(null)}
          onActualizar={async () => {
            await cargar()
            setVentaSeleccionada(null)
          }}
        />
      )}
    </div>
  )
}

const S = {
  page: { display:'flex', flexDirection:'column', height:'100%', overflowY:'auto', position:'relative' },
  center: { display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', height:'100%', gap:12 },
  loadingText: { fontFamily:'Barlow Condensed, sans-serif', fontSize:22, color:'var(--muted)' },
  loadingSub: { fontFamily:'Barlow, sans-serif', fontSize:13, color:'var(--muted)' },
  errorText: { fontFamily:'Barlow, sans-serif', fontSize:16, color:'#ef4444', textAlign:'center' },
  retryBtn: { background:'var(--surface)', border:'1.5px solid var(--border)', borderRadius:10, color:'var(--text)', fontFamily:'Barlow, sans-serif', fontSize:15, padding:'10px 24px', cursor:'pointer' },
  header: { display:'flex', alignItems:'center', justifyContent:'space-between', padding:'16px 20px 12px', borderBottom:'2px solid var(--accent)', flexShrink:0 },
  headerTitle: { fontFamily:'Barlow Condensed, sans-serif', fontWeight:800, fontSize:28, color:'var(--accent)', textTransform:'uppercase', letterSpacing:2 },
  refreshBtn: { background:'var(--surface)', border:'1.5px solid var(--border)', borderRadius:10, color:'var(--text)', fontSize:24, width:44, height:44, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' },
  statsRow: { display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:10, padding:'14px 20px 10px' },
  statCard: { background:'var(--surface)', borderRadius:12, padding:'12px 14px', border:'1.5px solid var(--border)' },
  statValue: { fontFamily:'Barlow Condensed, sans-serif', fontWeight:800, fontSize:22, color:'var(--accent)' },
  statLabel: { fontFamily:'Barlow, sans-serif', fontSize:12, color:'var(--muted)', marginTop:2 },
  searchWrap: { display:'flex', alignItems:'center', margin:'0 20px 10px', background:'var(--surface)', border:'1.5px solid var(--border)', borderRadius:8, padding:'0 12px' },
  searchIcon: { fontSize:20, color:'var(--muted)' },
  searchInput: { flex:1, background:'none', border:'none', outline:'none', color:'var(--text)', fontFamily:'Barlow, sans-serif', fontSize:15, padding:'10px 6px' },
  clearBtn: { background:'none', border:'none', color:'var(--muted)', cursor:'pointer', fontSize:14 },
  lista: { padding:'0 20px 20px', display:'flex', flexDirection:'column', gap:0 },
  fechaHeader: { display:'flex', justifyContent:'space-between', alignItems:'center', padding:'10px 4px 6px', fontFamily:'Barlow Condensed, sans-serif', fontWeight:800, fontSize:15, color:'var(--muted)', letterSpacing:1, textTransform:'uppercase', borderBottom:'1px solid var(--border)', marginBottom:6, marginTop:10 },
  fechaTotal: { fontFamily:'Barlow Condensed, sans-serif', fontWeight:700, fontSize:14, color:'var(--accent)' },
  emptyText: { fontFamily:'Barlow, sans-serif', color:'var(--muted)', textAlign:'center', padding:40, fontSize:15 },
  ventaCard: { background:'var(--surface)', borderRadius:10, border:'1px solid var(--border)', padding:'12px 14px', marginBottom:6 },
  ventaCardAnulada: { background:'rgba(239,68,68,0.05)', border:'1px solid rgba(239,68,68,0.25)', opacity:0.7 },
  anuladoBanner: { fontFamily:'Barlow Condensed, sans-serif', fontWeight:800, fontSize:12, color:'#ef4444', letterSpacing:1, marginBottom:4 },
  parcialBanner: { fontFamily:'Barlow Condensed, sans-serif', fontWeight:700, fontSize:12, color:'#f59e0b', letterSpacing:0.5, marginBottom:4 },
  ventaTop: { display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:4 },
  ventaId: { fontFamily:'Barlow Condensed, sans-serif', fontWeight:700, fontSize:23, color:'var(--muted)', letterSpacing:1 },
  ventaHora: { fontFamily:'Barlow Condensed, sans-serif', fontSize:21, color:'var(--muted)' },
  ventaBottom: { display:'flex', justifyContent:'space-between', alignItems:'center' },
  ventaMetodo: { fontFamily:'Barlow, sans-serif', fontSize:21, color:'var(--text)' },
  ventaTotal: { fontFamily:'Barlow Condensed, sans-serif', fontWeight:800, fontSize:30, color:'var(--accent)' },
  textAnulado: { color:'var(--muted)', opacity:0.5 },
  ventaItems: { marginTop:6, display:'flex', flexWrap:'wrap', gap:7 },
  ventaItem: { fontFamily:'Barlow, sans-serif', fontSize:18, color:'var(--muted)', background:'var(--border)', borderRadius:5, padding:'3px 9px', display:'flex', alignItems:'center', gap:6 },
  ventaItemAnulado: { textDecoration:'line-through', opacity:0.4 },
  ventaItemThumb: { width:48, height:48, objectFit:'cover', borderRadius:4, flexShrink:0 },
  ventaItemThumbPH: { width:48, height:48, display:'flex', alignItems:'center', justifyContent:'center', fontSize:22, flexShrink:0 },
}
