// src/pages/VentasDelDia.jsx
import { useState, useEffect } from 'react'
import { getVentasHoy, anularVenta, registrarLog } from '../api/sheets.js'
import DetalleVentaModal from '../components/DetalleVentaModal.jsx'

const METODO_ICONS = {
  'Efectivo Pesos':'💵','Efectivo ARS':'💵',
  'Tarjeta de Crédito':'💳','Tarjeta de Débito':'💳','Tarjeta':'💳',
  'QR':'📱','Transferencia':'🏦',
  'Efectivo Dólares':'🇺🇸','Efectivo USD':'🇺🇸',
  'Efectivo Reales':'🇧🇷','Efectivo BRL':'🇧🇷',
  'Efectivo Euros':'🇪🇺','Efectivo EUR':'🇪🇺',
}

export default function VentasDelDia({ refreshKey }) {
  const [ventas, setVentas] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [confirmAnular, setConfirmAnular] = useState(null)
  const [anulando, setAnulando] = useState(false)
  const [toast, setToast] = useState(null)
  const [ventaSeleccionada, setVentaSeleccionada] = useState(null)

  useEffect(() => { cargar() }, [refreshKey])

  async function cargar() {
    setLoading(true)
    setError(null)
    try {
      const data = await getVentasHoy()
      setVentas(data)
      await registrarLog({ accion: 'VENTAS_HOY_CARGADAS', detalle: `${data.length} registros cargados`, resultado: 'OK' })
    } catch (e) {
      await registrarLog({ accion: 'ERROR_CARGA_HOY', detalle: e?.message || 'Error desconocido', resultado: 'ERROR' })
      setError('No se pudo cargar. Revisá las credenciales.')
    } finally {
      setLoading(false)
    }
  }

  async function confirmarAnulacion() {
    setAnulando(true)
    try {
      await anularVenta(confirmAnular)
      showToast('Venta anulada correctamente', 'success')
      setConfirmAnular(null)
      await cargar()
    } catch (e) {
      showToast('Error al anular. Intentá de nuevo.', 'error')
    } finally {
      setAnulando(false)
    }
  }

  function showToast(msg, type) {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3500)
  }

  const ventasAgrupadas = ventas.reduce((acc, v) => {
    const key = v.idVenta || v.idDetalle
    if (!acc[key]) {
      acc[key] = { idVenta: key, hora: v.hora, metodoPago: v.metodoPago, empleado: v.empleado, items: [], total: 0, totalOriginal: 0, anulado: false }
    }
    acc[key].items.push(v)
    acc[key].totalOriginal += v.precioTotalFinal || v.precioTotal || 0
    if (!v.anulado) acc[key].total += v.precioTotalFinal || v.precioTotal || 0
    return acc
  }, {})

  Object.values(ventasAgrupadas).forEach(v => {
    v.anulado = v.items.length > 0 && v.items.every(i => i.anulado)
  })

  const listaVentas = Object.values(ventasAgrupadas).sort((a, b) => b.hora.localeCompare(a.hora))
  const ventasActivas = listaVentas.filter(v => !v.anulado)
  const totalDia = ventasActivas.reduce((s, v) => s + v.total, 0)
  const cantVentas = ventasActivas.length

  const porMetodo = ventas
    .filter(v => !v.anulado)
    .reduce((acc, v) => {
      const m = v.metodoPago || 'Sin datos'
      acc[m] = (acc[m] || 0) + (v.precioTotalFinal || v.precioTotal || 0)
      return acc
    }, {})

  if (loading) return (
    <div style={S.center}><div style={S.loadingText}>Cargando ventas...</div></div>
  )
  if (error) return (
    <div style={S.center}>
      <div style={S.errorText}>{error}</div>
      <button style={S.retryBtn} onClick={cargar}>Reintentar</button>
    </div>
  )

  return (
    <div style={S.page}>
      {toast && (
        <div style={{...S.toast, ...(toast.type==='error' ? S.toastError : S.toastSuccess)}}>
          {toast.msg}
        </div>
      )}

      <div style={S.header}>
        <div style={S.headerTitle}>VENTAS DE HOY</div>
        <button style={S.refreshBtn} onClick={cargar}>↻</button>
      </div>

      <div style={S.resumen}>
        <div style={S.resumenCard}>
          <div style={S.resumenValue}>${Math.round(totalDia).toLocaleString('es-AR')}</div>
          <div style={S.resumenLabel}>Total del día</div>
        </div>
        <div style={S.resumenCard}>
          <div style={S.resumenValue}>{cantVentas}</div>
          <div style={S.resumenLabel}>Ventas</div>
        </div>
      </div>

      {Object.keys(porMetodo).length > 0 && (
        <div style={S.metodoSection}>
          {Object.entries(porMetodo).map(([m, total]) => (
            <div key={m} style={S.metodoRow}>
              <span>{METODO_ICONS[m] || '💰'} {m}</span>
              <span style={S.metodoTotal}>${Math.round(total).toLocaleString('es-AR')}</span>
            </div>
          ))}
        </div>
      )}

      <div style={S.tableWrap}>
        {listaVentas.length === 0 ? (
          <div style={S.emptyText}>Sin ventas registradas hoy</div>
        ) : (
          <table style={S.table}>
            <thead>
              <tr>
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
              {listaVentas.map(v => {
                const tieneParcial = !v.anulado && v.items.some(i => i.anulado)
                return (
                  <>
                    <tr key={`h-${v.idVenta}`} style={{...S.ventaHeaderRow, ...(v.anulado ? S.ventaHeaderAnulada : {})}} onClick={() => { setVentaSeleccionada(v); registrarLog({ accion: 'MODAL_VENTA_ABIERTO', detalle: `Venta ${v.idVenta}`, idReferencia: v.idVenta, resultado: 'OK' }) }}>
                      <td colSpan={5} style={S.ventaHeaderId}>
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
                        {!v.anulado && (
                          <button style={S.anularBtnInline} onClick={e => { e.stopPropagation(); setConfirmAnular(v.idVenta) }}>
                            Anular
                          </button>
                        )}
                      </td>
                    </tr>
                    {v.items.map((item, i) => {
                      const ptf = Math.round(item.precioTotalFinal || 0)
                      const pt  = Math.round(item.precioTotal || 0)
                      const tieneDto = ptf > 0 && ptf < pt
                      return (
                        <tr key={`${v.idVenta}-${i}`} style={{...S.itemRow, ...(item.anulado ? S.itemRowAnulado : {})}} onClick={() => { setVentaSeleccionada(v); registrarLog({ accion: 'MODAL_VENTA_ABIERTO', detalle: `Venta ${v.idVenta}`, idReferencia: v.idVenta, resultado: 'OK' }) }}>
                          <td style={S.td}>{v.hora}</td>
                          <td style={{...S.td, ...S.tdArticulo}}>
                            <div style={S.articuloCell}>
                              <div style={S.fotoBox}>
                                <span style={{fontSize:16}}>📦</span>
                                {item.foto && <img src={item.foto} alt="" style={S.foto} onError={e => e.currentTarget.style.display='none'} />}
                              </div>
                              <span style={{...(item.anulado ? {textDecoration:'line-through', opacity:0.5} : {})}}>{item.nombre}</span>
                            </div>
                          </td>
                          <td style={{...S.td, textAlign:'center'}}>{item.cantidad}</td>
                          <td style={S.td}>${(item.precioUnitario || 0).toLocaleString('es-AR')}</td>
                          <td style={{...S.td, verticalAlign:'middle'}}>
                            {item.anulado ? (
                              <span style={{textDecoration:'line-through', opacity:0.5, color:'var(--muted)', fontWeight:700}}>
                                ${pt.toLocaleString('es-AR')}
                              </span>
                            ) : tieneDto ? (
                              <span style={{display:'flex', alignItems:'center', gap:6}}>
                                <span style={{textDecoration:'line-through', opacity:0.45, color:'var(--muted)', fontWeight:600, fontSize:12}}>
                                  ${pt.toLocaleString('es-AR')}
                                </span>
                                <span style={{color:'#22c55e', fontWeight:700, fontFamily:'Barlow Condensed, sans-serif', fontSize:15}}>
                                  ${ptf.toLocaleString('es-AR')}
                                </span>
                              </span>
                            ) : (
                              <span style={{color:'var(--accent)', fontWeight:700}}>
                                ${ptf > 0 ? ptf.toLocaleString('es-AR') : pt.toLocaleString('es-AR')}
                              </span>
                            )}
                          </td>
                          <td style={S.td}>{METODO_ICONS[item.metodoPago] || '💰'} {item.metodoPago}</td>
                          <td style={S.td}>{item.empleado}</td>
                        </tr>
                      )
                    })}
                  </>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {confirmAnular && (
        <div style={S.overlay} onClick={() => !anulando && setConfirmAnular(null)}>
          <div style={S.confirmBox} onClick={e => e.stopPropagation()}>
            <div style={S.confirmTitle}>¿Anular venta?</div>
            <div style={S.confirmSub}>
              Se va a marcar la venta <strong style={{color:'var(--accent)'}}>{confirmAnular}</strong> como anulada.
            </div>
            <div style={{display:'flex', gap:10, marginTop:20}}>
              <button style={S.confirmCancel} onClick={() => setConfirmAnular(null)} disabled={anulando}>Cancelar</button>
              <button style={S.confirmOk} onClick={confirmarAnulacion} disabled={anulando}>
                {anulando ? 'Anulando...' : 'Sí, anular'}
              </button>
            </div>
          </div>
        </div>
      )}

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
  center: { display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', height:'100%', gap:16 },
  loadingText: { fontFamily:'Barlow Condensed, sans-serif', fontSize:22, color:'var(--muted)' },
  errorText: { fontFamily:'Barlow, sans-serif', fontSize:16, color:'#ef4444', textAlign:'center', padding:'0 20px' },
  retryBtn: { background:'var(--surface)', border:'1.5px solid var(--border)', borderRadius:10, color:'var(--text)', fontFamily:'Barlow, sans-serif', fontSize:16, padding:'10px 24px', cursor:'pointer' },
  toast: { position:'fixed', top:16, left:'50%', transform:'translateX(-50%)', zIndex:300, padding:'12px 28px', borderRadius:10, fontFamily:'Barlow Condensed, sans-serif', fontWeight:700, fontSize:20, whiteSpace:'nowrap', boxShadow:'0 4px 20px rgba(0,0,0,0.5)' },
  toastSuccess: { background:'#22c55e', color:'#000' },
  toastError: { background:'#ef4444', color:'#fff' },
  header: { display:'flex', alignItems:'center', justifyContent:'space-between', padding:'16px 20px 12px', borderBottom:'2px solid var(--accent)', flexShrink:0 },
  headerTitle: { fontFamily:'Barlow Condensed, sans-serif', fontWeight:800, fontSize:32, color:'var(--accent)', textTransform:'uppercase', letterSpacing:2 },
  refreshBtn: { background:'var(--surface)', border:'1.5px solid var(--border)', borderRadius:10, color:'var(--text)', fontSize:24, width:44, height:44, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' },
  resumen: { display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, padding:'14px 20px 10px' },
  resumenCard: { background:'var(--surface)', borderRadius:12, padding:'14px 18px', border:'1.5px solid var(--border)' },
  resumenValue: { fontFamily:'Barlow Condensed, sans-serif', fontWeight:800, fontSize:36, color:'var(--accent)' },
  resumenLabel: { fontFamily:'Barlow, sans-serif', fontSize:14, color:'var(--muted)', marginTop:2 },
  metodoSection: { margin:'0 20px 12px', background:'var(--surface)', borderRadius:10, border:'1.5px solid var(--border)', overflow:'hidden' },
  metodoRow: { display:'flex', justifyContent:'space-between', padding:'8px 14px', borderBottom:'1px solid var(--border)', fontFamily:'Barlow, sans-serif', fontSize:15, color:'var(--text)' },
  metodoTotal: { fontFamily:'Barlow Condensed, sans-serif', fontWeight:700, fontSize:17, color:'var(--accent)' },
  tableWrap: { flex:1, overflowX:'auto', padding:'0 20px 20px' },
  table: { width:'100%', borderCollapse:'collapse', tableLayout:'fixed' },
  th: { fontFamily:'Barlow Condensed, sans-serif', fontWeight:800, fontSize:13, color:'var(--muted)', letterSpacing:1, textTransform:'uppercase', padding:'8px 10px', borderBottom:'2px solid var(--border)', textAlign:'left', background:'var(--surface)', position:'sticky', top:0, zIndex:1 },
  td: { fontFamily:'Barlow, sans-serif', fontSize:14, color:'var(--text)', padding:'8px 10px', borderBottom:'1px solid rgba(13,48,128,0.4)', verticalAlign:'middle' },
  tdArticulo: { maxWidth:0 },
  articuloCell: { display:'flex', alignItems:'center', gap:8, overflow:'hidden' },
  fotoBox: { width:36, height:36, borderRadius:6, overflow:'hidden', flexShrink:0, background:'var(--surface2)', border:'1px solid var(--border)', position:'relative', display:'flex', alignItems:'center', justifyContent:'center' },
  foto: { position:'absolute', inset:0, width:'100%', height:'100%', objectFit:'cover' },
  ventaHeaderRow: { background:'var(--surface2)', cursor:'pointer' },
  ventaHeaderAnulada: { background:'rgba(239,68,68,0.08)' },
  ventaHeaderId: { fontFamily:'Barlow Condensed, sans-serif', fontWeight:800, fontSize:14, color:'var(--muted)', letterSpacing:1, padding:'10px 10px 6px', borderTop:'2px solid var(--border)' },
  ventaHeaderTotal: { fontFamily:'Barlow Condensed, sans-serif', fontWeight:800, fontSize:18, color:'var(--accent)', padding:'10px 10px 6px', borderTop:'2px solid var(--border)', textAlign:'right' },
  badge_anulada: { fontFamily:'Barlow Condensed, sans-serif', fontSize:11, fontWeight:800, color:'#ef4444', background:'rgba(239,68,68,0.15)', borderRadius:4, padding:'2px 6px', marginRight:8, letterSpacing:1 },
  badge_parcial: { fontFamily:'Barlow Condensed, sans-serif', fontSize:11, fontWeight:800, color:'#f59e0b', background:'rgba(245,158,11,0.15)', borderRadius:4, padding:'2px 6px', marginRight:8, letterSpacing:1 },
  itemRow: { cursor:'pointer', transition:'background 0.1s' },
  itemRowAnulado: { opacity:0.45 },
  anularBtnInline: { marginLeft:12, background:'none', border:'1px solid rgba(239,68,68,0.4)', borderRadius:6, color:'rgba(239,68,68,0.8)', fontFamily:'Barlow Condensed, sans-serif', fontWeight:700, fontSize:11, padding:'3px 8px', cursor:'pointer', letterSpacing:0.5, textTransform:'uppercase' },
  emptyText: { fontFamily:'Barlow, sans-serif', color:'var(--muted)', textAlign:'center', padding:40, fontSize:18 },
  overlay: { position:'fixed', inset:0, background:'rgba(0,0,10,0.8)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:200, backdropFilter:'blur(6px)' },
  confirmBox: { background:'var(--surface)', border:'2px solid #ef4444', borderRadius:16, padding:28, width:320, textAlign:'center' },
  confirmTitle: { fontFamily:'Barlow Condensed, sans-serif', fontWeight:800, fontSize:24, color:'#ef4444', marginBottom:10 },
  confirmSub: { fontFamily:'Barlow, sans-serif', fontSize:14, color:'var(--muted)', lineHeight:1.5 },
  confirmCancel: { flex:1, padding:'12px', background:'none', border:'1.5px solid var(--border)', borderRadius:8, color:'var(--muted)', fontFamily:'Barlow, sans-serif', fontSize:14, cursor:'pointer' },
  confirmOk: { flex:1, padding:'12px', background:'#ef4444', border:'none', borderRadius:8, color:'#fff', fontFamily:'Barlow Condensed, sans-serif', fontWeight:700, fontSize:16, cursor:'pointer' },
}
