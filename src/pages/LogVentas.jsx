// src/pages/LogVentas.jsx
import { useState } from 'react'
import { getHistoricoVentas, registrarLog } from '../api/sheets.js'
import DetalleVentaModal from '../components/DetalleVentaModal.jsx'

const METODO_ICONS = {
  'Efectivo Pesos':'💵','Efectivo ARS':'💵',
  'Tarjeta de Crédito':'💳','Tarjeta de Débito':'💳','Tarjeta':'💳',
  'QR':'📱','Transferencia':'🏦',
  'Efectivo Dólares':'🇺🇸','Efectivo USD':'🇺🇸',
  'Efectivo Reales':'🇧🇷','Efectivo BRL':'🇧🇷',
  'Efectivo Euros':'🇪🇺','Efectivo EUR':'🇪🇺',
}

export default function LogVentas() {
  const [ventas, setVentas] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [busqueda, setBusqueda] = useState('')
  const [ventaSeleccionada, setVentaSeleccionada] = useState(null)

  async function cargar() {
    setLoading(true)
    setError(null)
    try {
      const data = await getHistoricoVentas()
      setVentas(data)
      await registrarLog({ accion: 'HISTORIAL_CARGADO', detalle: `${data.length} registros`, resultado: 'OK' })
    } catch (e) {
      await registrarLog({ accion: 'ERROR_CARGA_HISTORIAL', detalle: e?.message || 'Error desconocido', resultado: 'ERROR' })
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

  if (ventas.length === 0 && !loading && !error) return (
    <div style={S.center}>
      <button style={S.loadBtn} onClick={cargar}>Cargar historial</button>
      <div style={{fontFamily:'Barlow, sans-serif', fontSize:14, color:'var(--muted)', marginTop:8}}>
        Puede tardar unos segundos
      </div>
    </div>
  )

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

      <div style={S.tableWrap}>
        {ventasFiltradas.length === 0 ? (
          <div style={S.emptyText}>Sin resultados para "{busqueda}"</div>
        ) : (
          <table style={S.table}>
            <thead>
              <tr>
                <th style={S.th}>Fecha</th>
                <th style={S.th}>Hora</th>
                <th style={S.th}>Artículo</th>
                <th style={S.th}>Cant.</th>
                <th style={S.th}>P. Unit.</th>
                <th style={S.th}>Total</th>
                <th style={S.th}>Método</th>
                <th style={S.th}>Empleado</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(porFecha).map(([fecha, ventasDelDia]) => (
                <>
                  {/* Separador de fecha */}
                  <tr key={`fecha-${fecha}`}>
                    <td colSpan={8} style={S.fechaSep}>
                      <span>{fecha}</span>
                      <span style={S.fechaSepTotal}>
                        ${Math.round(ventasDelDia.filter(v=>!v.anulado).reduce((s,v)=>s+v.total,0)).toLocaleString('es-AR')}
                        {' · '}{ventasDelDia.filter(v=>!v.anulado).length} ventas
                      </span>
                    </td>
                  </tr>
                  {ventasDelDia.map(v => {
                    const tieneParcial = !v.anulado && v.items.some(i => i.anulado)
                    return (
                      <>
                        {/* Header de venta */}
                        <tr key={`h-${v.idVenta}`} style={{...S.ventaHeaderRow, ...(v.anulado ? S.ventaHeaderAnulada : {})}} onClick={() => { setVentaSeleccionada(v); registrarLog({ accion: 'MODAL_HISTORIAL_ABIERTO', detalle: `Venta ${v.idVenta} · ${v.fecha}`, idReferencia: v.idVenta, resultado: 'OK' }) }}>
                          <td colSpan={6} style={S.ventaHeaderId}>
                            {v.anulado && <span style={S.badge_anulada}>ANULADA</span>}
                            {tieneParcial && <span style={S.badge_parcial}>PARCIAL</span>}
                            <span>{v.idVenta}</span>
                          </td>
                          <td colSpan={2} style={S.ventaHeaderTotal}>
                            {v.anulado ? (
                              <span style={{textDecoration:'line-through', opacity:0.5}}>${Math.round(v.totalOriginal).toLocaleString('es-AR')}</span>
                            ) : tieneParcial ? (
                              <span>
                                <span style={{textDecoration:'line-through', opacity:0.4, fontSize:13, marginRight:6}}>${Math.round(v.totalOriginal).toLocaleString('es-AR')}</span>
                                ${Math.round(v.total).toLocaleString('es-AR')}
                              </span>
                            ) : (
                              `$${Math.round(v.total).toLocaleString('es-AR')}`
                            )}
                          </td>
                        </tr>
                        {/* Items */}
                        {v.items.map((item, i) => (
                          <tr key={`${v.idVenta}-${i}`} style={{...S.itemRow, ...(item.anulado ? S.itemRowAnulado : {})}} onClick={() => { setVentaSeleccionada(v); registrarLog({ accion: 'MODAL_HISTORIAL_ABIERTO', detalle: `Venta ${v.idVenta}`, idReferencia: v.idVenta, resultado: 'OK' }) }}>
                            <td style={S.td}>{item.fecha}</td>
                            <td style={S.td}>{item.hora}</td>
                            <td style={{...S.td, ...S.tdArticulo}}>
                              <div style={S.articuloCell}>
                                <div style={S.fotoBox}>
                                  <span style={{fontSize:14}}>📦</span>
                                  {item.foto && <img src={item.foto} alt="" style={S.foto} onError={e => e.currentTarget.style.display='none'} />}
                                </div>
                                <span style={{...(item.anulado ? {textDecoration:'line-through', opacity:0.5} : {})}}>{item.nombre}</span>
                              </div>
                            </td>
                            <td style={{...S.td, textAlign:'center'}}>{item.cantidad}</td>
                            <td style={S.td}>${(item.precioUnitario || 0).toLocaleString('es-AR')}</td>
                            <td style={{...S.td, color: item.anulado ? 'var(--muted)' : 'var(--accent)', fontWeight:700, textDecoration: item.anulado ? 'line-through' : 'none'}}>
                              ${Math.round(item.precioTotalFinal || item.precioTotal || 0).toLocaleString('es-AR')}
                            </td>
                            <td style={S.td}>{METODO_ICONS[item.metodoPago] || '💰'} {item.metodoPago}</td>
                            <td style={S.td}>{item.empleado}</td>
                          </tr>
                        ))}
                      </>
                    )
                  })}
                </>
              ))}
            </tbody>
          </table>
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
  loadingSub: { fontFamily:'Barlow, sans-serif', fontSize:14, color:'var(--muted)' },
  errorText: { fontFamily:'Barlow, sans-serif', fontSize:16, color:'#ef4444', textAlign:'center' },
  retryBtn: { background:'var(--surface)', border:'1.5px solid var(--border)', borderRadius:10, color:'var(--text)', fontFamily:'Barlow, sans-serif', fontSize:15, padding:'10px 24px', cursor:'pointer' },
  loadBtn: { background:'var(--accent)', border:'none', borderRadius:12, color:'#000', fontFamily:'Barlow Condensed, sans-serif', fontWeight:800, fontSize:20, padding:'16px 40px', cursor:'pointer', letterSpacing:1 },
  header: { display:'flex', alignItems:'center', justifyContent:'space-between', padding:'16px 20px 12px', borderBottom:'2px solid var(--accent)', flexShrink:0 },
  headerTitle: { fontFamily:'Barlow Condensed, sans-serif', fontWeight:800, fontSize:24, color:'var(--accent)', textTransform:'uppercase', letterSpacing:2 },
  refreshBtn: { background:'var(--surface)', border:'1.5px solid var(--border)', borderRadius:10, color:'var(--text)', fontSize:24, width:44, height:44, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' },
  statsRow: { display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:10, padding:'14px 20px 10px' },
  statCard: { background:'var(--surface)', borderRadius:12, padding:'12px 14px', border:'1.5px solid var(--border)' },
  statValue: { fontFamily:'Barlow Condensed, sans-serif', fontWeight:800, fontSize:22, color:'var(--accent)' },
  statLabel: { fontFamily:'Barlow, sans-serif', fontSize:12, color:'var(--muted)', marginTop:2 },
  searchWrap: { display:'flex', alignItems:'center', margin:'0 20px 10px', background:'var(--surface)', border:'1.5px solid var(--border)', borderRadius:8, padding:'0 12px' },
  searchIcon: { fontSize:20, color:'var(--muted)' },
  searchInput: { flex:1, background:'none', border:'none', outline:'none', color:'var(--text)', fontFamily:'Barlow, sans-serif', fontSize:15, padding:'10px 6px' },
  clearBtn: { background:'none', border:'none', color:'var(--muted)', cursor:'pointer', fontSize:14 },
  tableWrap: { flex:1, overflowX:'auto', padding:'0 20px 20px' },
  table: { width:'100%', borderCollapse:'collapse' },
  th: { fontFamily:'Barlow Condensed, sans-serif', fontWeight:800, fontSize:12, color:'var(--muted)', letterSpacing:1, textTransform:'uppercase', padding:'8px 10px', borderBottom:'2px solid var(--border)', textAlign:'left', background:'var(--surface)', position:'sticky', top:0, zIndex:1, whiteSpace:'nowrap' },
  td: { fontFamily:'Barlow, sans-serif', fontSize:13, color:'var(--text)', padding:'7px 10px', borderBottom:'1px solid rgba(13,48,128,0.3)', verticalAlign:'middle', whiteSpace:'nowrap' },
  tdArticulo: { maxWidth:200, whiteSpace:'normal' },
  articuloCell: { display:'flex', alignItems:'center', gap:8 },
  fotoBox: { width:32, height:32, borderRadius:5, overflow:'hidden', flexShrink:0, background:'var(--surface2)', border:'1px solid var(--border)', position:'relative', display:'flex', alignItems:'center', justifyContent:'center' },
  foto: { position:'absolute', inset:0, width:'100%', height:'100%', objectFit:'cover' },
  fechaSep: { fontFamily:'Barlow Condensed, sans-serif', fontWeight:800, fontSize:13, color:'var(--muted)', letterSpacing:1, textTransform:'uppercase', padding:'14px 10px 6px', borderTop:'2px solid var(--border)', display:'flex', justifyContent:'space-between' },
  fechaSepTotal: { fontFamily:'Barlow Condensed, sans-serif', fontWeight:700, fontSize:13, color:'var(--accent)', float:'right' },
  ventaHeaderRow: { background:'var(--surface2)', cursor:'pointer' },
  ventaHeaderAnulada: { background:'rgba(239,68,68,0.08)' },
  ventaHeaderId: { fontFamily:'Barlow Condensed, sans-serif', fontWeight:800, fontSize:13, color:'var(--muted)', letterSpacing:1, padding:'8px 10px 5px', borderTop:'1.5px solid var(--border)' },
  ventaHeaderTotal: { fontFamily:'Barlow Condensed, sans-serif', fontWeight:800, fontSize:16, color:'var(--accent)', padding:'8px 10px 5px', borderTop:'1.5px solid var(--border)', textAlign:'right' },
  badge_anulada: { fontFamily:'Barlow Condensed, sans-serif', fontSize:10, fontWeight:800, color:'#ef4444', background:'rgba(239,68,68,0.15)', borderRadius:4, padding:'2px 5px', marginRight:7, letterSpacing:1 },
  badge_parcial: { fontFamily:'Barlow Condensed, sans-serif', fontSize:10, fontWeight:800, color:'#f59e0b', background:'rgba(245,158,11,0.15)', borderRadius:4, padding:'2px 5px', marginRight:7, letterSpacing:1 },
  itemRow: { cursor:'pointer' },
  itemRowAnulado: { opacity:0.4 },
  emptyText: { fontFamily:'Barlow, sans-serif', color:'var(--muted)', textAlign:'center', padding:40, fontSize:16 },
}
