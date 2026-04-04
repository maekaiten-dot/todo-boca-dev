// src/pages/VentasDelDia.jsx
import { useState, useEffect } from 'react'
import { getVentasHoy, anularVenta } from '../api/sheets.js'
import DetalleVentaModal from '../components/DetalleVentaModal.jsx'

export default function VentasDelDia({ refreshKey, esAdmin }) {
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
    } catch (e) {
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

  const METODO_ICONS = {
    'Efectivo Pesos':'💵','Efectivo ARS':'💵',
    'Tarjeta de Crédito':'💳','Tarjeta de Débito':'💳','Tarjeta':'💳',
    'QR':'📱','Transferencia':'🏦',
    'Efectivo Dólares':'🇺🇸','Efectivo USD':'🇺🇸',
    'Efectivo Reales':'🇧🇷','Efectivo BRL':'🇧🇷',
    'Efectivo Euros':'🇪🇺','Efectivo EUR':'🇪🇺',
  }

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
        {esAdmin && (
          <div style={S.resumenCard}>
            <div style={S.resumenValue}>${Math.round(totalDia).toLocaleString('es-AR')}</div>
            <div style={S.resumenLabel}>Total del día</div>
          </div>
        )}
        {esAdmin && (
          <div style={S.resumenCard}>
            <div style={S.resumenValue}>{cantVentas}</div>
            <div style={S.resumenLabel}>Ventas</div>
          </div>
        )}
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

      <div style={S.lista}>
        {listaVentas.length === 0 ? (
          <div style={S.emptyText}>Sin ventas registradas hoy</div>
        ) : listaVentas.map(v => {
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
                      <span style={{textDecoration:'line-through', opacity:0.4, fontSize:24, color:'var(--muted)'}}>
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
              {!v.anulado && (
                <button style={S.anularBtn} onClick={e => { e.stopPropagation(); setConfirmAnular(v.idVenta) }}>
                  Anular venta completa
                </button>
              )}
            </div>
          )
        })}
      </div>

      {confirmAnular && (
        <div style={S.overlay} onClick={() => !anulando && setConfirmAnular(null)}>
          <div style={S.confirmBox} onClick={e => e.stopPropagation()}>
            <div style={S.confirmTitle}>¿Anular venta?</div>
            <div style={S.confirmSub}>
              Se va a marcar la venta <strong style={{color:'var(--accent)'}}>{confirmAnular}</strong> como anulada. Esta acción queda registrada.
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
  toast: { position:'fixed', top:16, left:'50%', transform:'translateX(-50%)', zIndex:300, padding:'12px 28px', borderRadius:10, fontFamily:'Barlow Condensed, sans-serif', fontWeight:700, fontSize:17, whiteSpace:'nowrap', boxShadow:'0 4px 20px rgba(0,0,0,0.5)' },
  toastSuccess: { background:'#22c55e', color:'#000' },
  toastError: { background:'#ef4444', color:'#fff' },
  header: { display:'flex', alignItems:'center', justifyContent:'space-between', padding:'16px 20px 12px', borderBottom:'2px solid var(--accent)' },
  headerTitle: { fontFamily:'Barlow Condensed, sans-serif', fontWeight:800, fontSize:28, color:'var(--accent)', textTransform:'uppercase', letterSpacing:2 },
  refreshBtn: { background:'var(--surface)', border:'1.5px solid var(--border)', borderRadius:10, color:'var(--text)', fontSize:24, width:44, height:44, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' },
  resumen: { display:'flex', gap:12, padding:'16px 20px 12px' },
  resumenCard: { flex:1, background:'var(--surface)', borderRadius:14, padding:'16px 20px', border:'1.5px solid var(--border)' },
  resumenValue: { fontFamily:'Barlow Condensed, sans-serif', fontWeight:800, fontSize:32, color:'var(--accent)' },
  resumenLabel: { fontFamily:'Barlow, sans-serif', fontSize:14, color:'var(--muted)', marginTop:2 },
  metodoSection: { margin:'0 20px 12px', background:'var(--surface)', borderRadius:12, border:'1.5px solid var(--border)', overflow:'hidden' },
  metodoRow: { display:'flex', justifyContent:'space-between', padding:'10px 16px', borderBottom:'1px solid var(--border)', fontFamily:'Barlow, sans-serif', fontSize:16, color:'var(--text)' },
  metodoTotal: { fontFamily:'Barlow Condensed, sans-serif', fontWeight:700, fontSize:18, color:'var(--accent)' },
  lista: { padding:'0 20px 20px', display:'flex', flexDirection:'column', gap:10 },
  emptyText: { fontFamily:'Barlow, sans-serif', color:'var(--muted)', textAlign:'center', padding:40, fontSize:16 },
  ventaCard: { background:'var(--surface)', borderRadius:12, border:'1.5px solid var(--border)', padding:'14px 16px', position:'relative' },
  ventaCardAnulada: { background:'rgba(239,68,68,0.05)', border:'1.5px solid rgba(239,68,68,0.3)', opacity:0.75 },
  anuladoBanner: { fontFamily:'Barlow Condensed, sans-serif', fontWeight:800, fontSize:13, color:'#ef4444', letterSpacing:1, marginBottom:6, textTransform:'uppercase' },
  parcialBanner: { fontFamily:'Barlow Condensed, sans-serif', fontWeight:700, fontSize:12, color:'#f59e0b', letterSpacing:0.5, marginBottom:6 },
  ventaTop: { display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:6 },
  ventaId: { fontFamily:'Barlow Condensed, sans-serif', fontWeight:700, fontSize:24, color:'var(--muted)', letterSpacing:1 },
  ventaHora: { fontFamily:'Barlow Condensed, sans-serif', fontSize:24, color:'var(--muted)' },
  ventaBottom: { display:'flex', justifyContent:'space-between', alignItems:'center' },
  ventaMetodo: { fontFamily:'Barlow, sans-serif', fontSize:23, color:'var(--text)' },
  ventaTotal: { fontFamily:'Barlow Condensed, sans-serif', fontWeight:800, fontSize:36, color:'var(--accent)' },
  textAnulado: { color:'var(--muted)', opacity:0.6 },
  ventaItems: { marginTop:8, display:'flex', flexWrap:'wrap', gap:8 },
  ventaItem: { fontFamily:'Barlow, sans-serif', fontSize:20, color:'var(--muted)', background:'var(--border)', borderRadius:6, padding:'4px 10px', display:'flex', alignItems:'center', gap:7 },
  ventaItemAnulado: { textDecoration:'line-through', opacity:0.5 },
  ventaItemThumb: { width:48, height:48, objectFit:'cover', borderRadius:4, flexShrink:0 },
  ventaItemThumbPH: { width:48, height:48, display:'flex', alignItems:'center', justifyContent:'center', fontSize:24, flexShrink:0 },
  anularBtn: { marginTop:10, background:'none', border:'1px solid rgba(239,68,68,0.4)', borderRadius:8, color:'rgba(239,68,68,0.8)', fontFamily:'Barlow Condensed, sans-serif', fontWeight:700, fontSize:13, padding:'5px 14px', cursor:'pointer', letterSpacing:0.5, textTransform:'uppercase' },
  overlay: { position:'fixed', inset:0, background:'rgba(0,0,10,0.8)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:200, backdropFilter:'blur(6px)' },
  confirmBox: { background:'var(--surface)', border:'2px solid #ef4444', borderRadius:16, padding:28, width:320, textAlign:'center' },
  confirmTitle: { fontFamily:'Barlow Condensed, sans-serif', fontWeight:800, fontSize:24, color:'#ef4444', marginBottom:10 },
  confirmSub: { fontFamily:'Barlow, sans-serif', fontSize:14, color:'var(--muted)', lineHeight:1.5 },
  confirmCancel: { flex:1, padding:'12px', background:'none', border:'1.5px solid var(--border)', borderRadius:8, color:'var(--muted)', fontFamily:'Barlow, sans-serif', fontSize:14, cursor:'pointer' },
  confirmOk: { flex:1, padding:'12px', background:'#ef4444', border:'none', borderRadius:8, color:'#fff', fontFamily:'Barlow Condensed, sans-serif', fontWeight:700, fontSize:16, cursor:'pointer' },
}
