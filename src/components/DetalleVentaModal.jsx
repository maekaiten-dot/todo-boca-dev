// src/components/DetalleVentaModal.jsx
import { useState } from 'react'
import { anularItemVenta } from '../api/sheets.js'

export default function DetalleVentaModal({ venta, onClose, onActualizar }) {
  const [confirmItem, setConfirmItem] = useState(null)
  const [anulando, setAnulando] = useState(false)
  const [toast, setToast] = useState(null)

  const METODO_ICONS = {
    'Efectivo Pesos':'💵','Efectivo ARS':'💵',
    'Tarjeta de Crédito':'💳','Tarjeta de Débito':'💳','Tarjeta':'💳',
    'QR':'📱','Transferencia':'🏦',
    'Efectivo Dólares':'🇺🇸','Efectivo USD':'🇺🇸',
    'Efectivo Reales':'🇧🇷','Efectivo BRL':'🇧🇷',
    'Efectivo Euros':'🇪🇺','Efectivo EUR':'🇪🇺',
  }

  const itemsActivos = venta.items.filter(i => !i.anulado)
  const totalActivo = itemsActivos.reduce((s, i) => s + (i.precioTotalFinal || i.precioTotal || 0), 0)
  const totalOriginal = venta.items.reduce((s, i) => s + (i.precioTotalFinal || i.precioTotal || 0), 0)
  const tieneParcial = !venta.anulado && venta.items.some(i => i.anulado)

  async function confirmarAnulacionItem() {
    setAnulando(true)
    try {
      await anularItemVenta(confirmItem, venta.items)
      showToast('Producto anulado', 'success')
      setConfirmItem(null)
      await onActualizar()
    } catch (e) {
      showToast('Error al anular', 'error')
    } finally {
      setAnulando(false)
    }
  }

  function showToast(msg, type) {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 2500)
  }

  return (
    <div style={S.overlay} onClick={onClose}>
      <div style={S.modal} onClick={e => e.stopPropagation()}>

        {toast && (
          <div style={{...S.toast, ...(toast.type==='error' ? S.toastError : S.toastSuccess)}}>
            {toast.msg}
          </div>
        )}

        {/* Header */}
        <div style={S.header}>
          <div>
            <div style={S.ventaId}>{venta.idVenta}</div>
            <div style={S.ventaMeta}>
              {METODO_ICONS[venta.metodoPago] || '💰'} {venta.metodoPago}
              {venta.empleado ? ` · ${venta.empleado}` : ''}
              {' · '}{venta.hora}
            </div>
          </div>
          <button style={S.closeBtn} onClick={onClose}>✕</button>
        </div>

        {venta.anulado && <div style={S.anuladoBanner}>⚠ VENTA COMPLETAMENTE ANULADA</div>}
        {tieneParcial && <div style={S.parcialBanner}>⚠ Venta con productos anulados</div>}

        {/* Total */}
        <div style={S.totalSection}>
          <div>
            <div style={S.totalLabel}>TOTAL</div>
          </div>
          <div style={S.totalWrap}>
            {(venta.anulado || tieneParcial) && (
              <span style={S.totalOriginal}>
                ${Math.round(totalOriginal).toLocaleString('es-AR')}
              </span>
            )}
            <span style={{...S.totalValue, ...(venta.anulado ? {color:'var(--muted)', opacity:0.5} : {})}}>
              ${Math.round(totalActivo).toLocaleString('es-AR')}
            </span>
          </div>
        </div>

        {/* Items */}
        <div style={S.itemsSection}>
          {venta.items.map((item, idx) => (
            <div key={item.idDetalle || idx} style={{...S.itemRow, ...(item.anulado ? S.itemRowAnulado : {})}}>
              <div style={S.itemLeft}>
                {/* Foto siempre visible, overlay ✕ si anulado */}
                <div style={S.thumbWrap}>
                  {item.foto
                    ? <img src={item.foto} alt="" style={{...S.thumb, ...(item.anulado ? S.thumbAnulado : {})}} onError={e => e.target.style.display='none'} />
                    : <div style={S.thumbPH}>📦</div>
                  }
                  {item.anulado && <div style={S.thumbOverlay}>✕</div>}
                </div>
                <div style={S.itemInfo}>
                  <div style={{...S.itemNombre, ...(item.anulado ? S.strikethrough : {})}}>{item.nombre}</div>
                  <div style={S.itemSku}>{item.articulo}</div>
                  <div style={S.itemDetalle}>
                    {item.cantidad} × ${(item.precioUnitario || 0).toLocaleString('es-AR')}
                    {item.descuento > 0 && <span style={S.descTag}> -{item.descuento}%</span>}
                    {item.descCarrito && item.descCarrito !== '0' && item.descCarrito !== '' &&
                      <span style={S.descTag}> carrito {item.descCarrito}</span>
                    }
                  </div>
                </div>
              </div>
              <div style={S.itemRight}>
                <div style={{...S.itemTotal, ...(item.anulado ? S.strikethrough : {})}}>
                  ${Math.round(item.precioTotalFinal || item.precioTotal || 0).toLocaleString('es-AR')}
                </div>
                {item.anulado
                  ? <div style={S.anuladoTag}>ANULADO</div>
                  : <button style={S.anularItemBtn} onClick={() => setConfirmItem(item.idDetalle)}>
                      Anular
                    </button>
                }
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Confirm anular item */}
      {confirmItem && (
        <div style={S.confirmOverlay} onClick={() => !anulando && setConfirmItem(null)}>
          <div style={S.confirmBox} onClick={e => e.stopPropagation()}>
            <div style={S.confirmTitle}>¿Anular producto?</div>
            <div style={S.confirmSub}>
              Se marcará como anulado en el sheet.
              {itemsActivos.length === 1 && <strong style={{color:'#ef4444'}}> Esto anulará toda la venta.</strong>}
            </div>
            <div style={{display:'flex', gap:10, marginTop:20}}>
              <button style={S.confirmCancel} onClick={() => setConfirmItem(null)} disabled={anulando}>Cancelar</button>
              <button style={S.confirmOk} onClick={confirmarAnulacionItem} disabled={anulando}>
                {anulando ? 'Anulando...' : 'Sí, anular'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const S = {
  overlay: { position:'fixed', inset:0, background:'rgba(0,0,10,0.85)', display:'flex', alignItems:'flex-end', justifyContent:'center', zIndex:300, backdropFilter:'blur(6px)' },
  modal: { background:'var(--surface)', borderRadius:'20px 20px 0 0', width:'100%', maxWidth:700, maxHeight:'85vh', display:'flex', flexDirection:'column', overflow:'hidden', position:'relative', animation:'slideUp 0.25s ease' },
  toast: { position:'absolute', top:12, left:'50%', transform:'translateX(-50%)', zIndex:10, padding:'8px 20px', borderRadius:8, fontFamily:'Barlow Condensed, sans-serif', fontWeight:700, fontSize:15, whiteSpace:'nowrap' },
  toastSuccess: { background:'#22c55e', color:'#000' },
  toastError: { background:'#ef4444', color:'#fff' },
  header: { display:'flex', justifyContent:'space-between', alignItems:'flex-start', padding:'20px 20px 12px', borderBottom:'1px solid var(--border)' },
  ventaId: { fontFamily:'Barlow Condensed, sans-serif', fontWeight:800, fontSize:22, color:'var(--accent)', letterSpacing:1 },
  ventaMeta: { fontFamily:'Barlow, sans-serif', fontSize:14, color:'var(--muted)', marginTop:4 },
  closeBtn: { background:'none', border:'none', color:'var(--muted)', fontSize:20, cursor:'pointer', padding:4 },
  anuladoBanner: { background:'rgba(239,68,68,0.15)', borderBottom:'1px solid rgba(239,68,68,0.3)', padding:'8px 20px', fontFamily:'Barlow Condensed, sans-serif', fontWeight:800, fontSize:14, color:'#ef4444', letterSpacing:1 },
  parcialBanner: { background:'rgba(245,158,11,0.1)', borderBottom:'1px solid rgba(245,158,11,0.3)', padding:'6px 20px', fontFamily:'Barlow Condensed, sans-serif', fontWeight:700, fontSize:13, color:'#f59e0b', letterSpacing:0.5 },
  totalSection: { display:'flex', justifyContent:'space-between', alignItems:'center', padding:'12px 20px', borderBottom:'2px solid var(--border)', background:'var(--surface2)' },
  totalLabel: { fontFamily:'Barlow Condensed, sans-serif', fontSize:14, color:'var(--muted)', letterSpacing:2 },
  totalWrap: { display:'flex', alignItems:'center', gap:10 },
  totalOriginal: { fontFamily:'Barlow Condensed, sans-serif', fontWeight:700, fontSize:18, color:'var(--muted)', textDecoration:'line-through', opacity:0.5 },
  totalValue: { fontFamily:'Barlow Condensed, sans-serif', fontWeight:800, fontSize:32, color:'var(--accent)' },
  itemsSection: { flex:1, overflowY:'auto', padding:'8px 0' },
  itemRow: { display:'flex', alignItems:'center', justifyContent:'space-between', padding:'12px 20px', borderBottom:'1px solid var(--border)' },
  itemRowAnulado: { background:'rgba(239,68,68,0.04)' },
  itemLeft: { display:'flex', alignItems:'center', gap:12, flex:1, minWidth:0 },
  thumbWrap: { position:'relative', flexShrink:0 },
  thumb: { width:56, height:56, objectFit:'cover', borderRadius:8, border:'1px solid var(--border)', display:'block' },
  thumbAnulado: { opacity:0.35 },
  thumbPH: { width:56, height:56, display:'flex', alignItems:'center', justifyContent:'center', background:'var(--surface2)', borderRadius:8, fontSize:20, border:'1px solid var(--border)', color:'var(--muted)' },
  thumbOverlay: { position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center', background:'rgba(239,68,68,0.55)', borderRadius:8, fontSize:22, fontWeight:900, color:'#fff' },
  itemInfo: { flex:1, minWidth:0 },
  itemNombre: { fontFamily:'Barlow, sans-serif', fontWeight:600, fontSize:15, color:'var(--text)', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' },
  itemSku: { fontFamily:'Barlow Condensed, sans-serif', fontSize:12, color:'var(--muted)', marginTop:2 },
  itemDetalle: { fontFamily:'Barlow Condensed, sans-serif', fontSize:13, color:'var(--muted)', marginTop:2 },
  descTag: { color:'var(--accent)', fontWeight:700 },
  strikethrough: { textDecoration:'line-through', opacity:0.5 },
  itemRight: { display:'flex', flexDirection:'column', alignItems:'flex-end', gap:6, flexShrink:0, marginLeft:12 },
  itemTotal: { fontFamily:'Barlow Condensed, sans-serif', fontWeight:800, fontSize:18, color:'var(--accent)' },
  anuladoTag: { fontFamily:'Barlow Condensed, sans-serif', fontWeight:800, fontSize:11, color:'#ef4444', letterSpacing:1 },
  anularItemBtn: { background:'none', border:'1px solid rgba(239,68,68,0.4)', borderRadius:6, color:'rgba(239,68,68,0.8)', fontFamily:'Barlow Condensed, sans-serif', fontWeight:700, fontSize:12, padding:'3px 10px', cursor:'pointer', letterSpacing:0.5, textTransform:'uppercase' },
  confirmOverlay: { position:'fixed', inset:0, background:'rgba(0,0,10,0.85)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:400 },
  confirmBox: { background:'var(--surface)', border:'2px solid #ef4444', borderRadius:16, padding:28, width:300, textAlign:'center' },
  confirmTitle: { fontFamily:'Barlow Condensed, sans-serif', fontWeight:800, fontSize:22, color:'#ef4444', marginBottom:10 },
  confirmSub: { fontFamily:'Barlow, sans-serif', fontSize:13, color:'var(--muted)', lineHeight:1.5 },
  confirmCancel: { flex:1, padding:'11px', background:'none', border:'1.5px solid var(--border)', borderRadius:8, color:'var(--muted)', fontFamily:'Barlow, sans-serif', fontSize:14, cursor:'pointer' },
  confirmOk: { flex:1, padding:'11px', background:'#ef4444', border:'none', borderRadius:8, color:'#fff', fontFamily:'Barlow Condensed, sans-serif', fontWeight:700, fontSize:15, cursor:'pointer' },
}
