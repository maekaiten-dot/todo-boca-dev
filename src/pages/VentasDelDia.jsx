// src/pages/VentasDelDia.jsx
import { useState, useEffect, Fragment } from 'react'
import { getVentasHoy, anularVenta, registrarLog, getGastosCajaHoy, POSNET_METODOS } from '../api/sheets.js'
import CorregirPosnetModal from '../components/CorregirPosnetModal.jsx'
import DetalleVentaModal from '../components/DetalleVentaModal.jsx'

const METODO_ICONS = {
  'Efectivo Pesos':'💵','Efectivo ARS':'💵',
  'Tarjeta de Crédito':'💳','Tarjeta de Débito':'💳','Tarjeta':'💳',
  'QR':'📱','Transferencia':'🏦',
  'Efectivo Dólares':'🇺🇸','Efectivo USD':'🇺🇸',
  'Efectivo Reales':'🇧🇷','Efectivo BRL':'🇧🇷',
  'Efectivo Euros':'🇪🇺','Efectivo EUR':'🇪🇺',
}

// Métodos que cuentan como pesos en efectivo dentro de la caja
const METODOS_EFECTIVO_PESOS = new Set(['Efectivo Pesos', 'Efectivo ARS', 'Efectivo'])
const DIVISAS = { USD: 'US$', BRL: 'R$', EUR: '€' }

export default function VentasDelDia({ refreshKey, usuarios = [], perfilNombre = '', esAdmin = false }) {
  const [ventas, setVentas] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [confirmAnular, setConfirmAnular] = useState(null)
  const [anulando, setAnulando] = useState(false)
  const [corrigiendo, setCorrigiendo] = useState(null)
  const [toast, setToast] = useState(null)
  const [ventaSeleccionada, setVentaSeleccionada] = useState(null)
  const [gastosCaja, setGastosCaja] = useState([])
  const [errorGastos, setErrorGastos] = useState(false)
  // Detalle del resumen (caja y métodos de pago) plegado por defecto; se recuerda en este dispositivo
  const [detalleAbierto, setDetalleAbierto] = useState(() => {
    try { return localStorage.getItem('tb_hoy_detalle') === '1' } catch { return false }
  })
  function toggleDetalle() {
    setDetalleAbierto(v => {
      try { localStorage.setItem('tb_hoy_detalle', v ? '0' : '1') } catch {}
      return !v
    })
  }

  useEffect(() => { cargar() }, [refreshKey])

  async function cargar() {
    setLoading(true)
    setError(null)
    // Los gastos de caja se cargan aparte: si fallan, las ventas se muestran igual
    getGastosCajaHoy()
      .then(g => { setGastosCaja(g); setErrorGastos(false) })
      .catch(e => { console.error(e); setErrorGastos(true) })
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
      acc[key] = { idVenta: key, hora: v.hora, metodoPago: v.metodoPago, empleado: v.empleado, posnet: v.posnet || '', correccionPosnet: v.correccionPosnet || '', items: [], total: 0, totalOriginal: 0, anulado: false }
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

  // ── Totales por posnet (tarjeta y QR), para controlar contra el cierre de cada terminal ──
  const porPosnet = ventas
    .filter(v => !v.anulado && v.posnet)
    .reduce((acc, v) => {
      if (!acc[v.posnet]) acc[v.posnet] = { total: 0, ventas: new Set() }
      acc[v.posnet].total += v.precioTotalFinal || v.precioTotal || 0
      acc[v.posnet].ventas.add(v.idVenta || v.idDetalle)
      return acc
    }, {})

  // ── Caja en efectivo: ventas en pesos − salidas + entradas ──
  const ventasEfectivo = ventas
    .filter(v => !v.anulado && METODOS_EFECTIVO_PESOS.has(v.metodoPago))
    .reduce((s, v) => s + (v.precioTotalFinal || v.precioTotal || 0), 0)
  const gastosActivos = gastosCaja.filter(g => !g.anulado)
  const salidas = gastosActivos.filter(g => g.tipo === 'SALIDA')
  const entradas = gastosActivos.filter(g => g.tipo === 'ENTRADA')
  const totalSalidas = salidas.reduce((s, g) => s + g.monto, 0)
  const totalEntradas = entradas.reduce((s, g) => s + g.monto, 0)
  const efectivoEsperado = ventasEfectivo - totalSalidas + totalEntradas
  // Divisas cobradas hoy: el monto en moneda extranjera queda en NOTAS (ej. "USD 20"), una vez por venta
  const divisas = {}
  ventasActivas.forEach(v => {
    const nota = v.items.find(i => !i.anulado && i.notas)?.notas || ''
    const m = String(nota).match(/^(USD|BRL|EUR)\s*([\d.,]+)/)
    if (m) divisas[m[1]] = (divisas[m[1]] || 0) + (Number(m[2].replace(',', '.')) || 0)
  })

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

      {/* Resumen compacto: siempre visible, ocupa una sola franja */}
      <button style={S.resumenBar} onClick={toggleDetalle} aria-expanded={detalleAbierto}>
        <div style={S.resumenItem}>
          <span style={S.resumenValor}>${Math.round(totalDia).toLocaleString('es-AR')}</span>
          <span style={S.resumenEtiqueta}>Total del día</span>
        </div>
        <div style={S.resumenItem}>
          <span style={S.resumenValor}>{cantVentas}</span>
          <span style={S.resumenEtiqueta}>Ventas</span>
        </div>
        <div style={S.resumenItem}>
          <span style={S.resumenValor}>${Math.round(efectivoEsperado).toLocaleString('es-AR')}</span>
          <span style={S.resumenEtiqueta}>Debería haber en caja{errorGastos ? ' ⚠️' : ''}</span>
        </div>
        <span style={S.resumenToggle}>{detalleAbierto ? 'Ocultar ▴' : 'Detalle ▾'}</span>
      </button>

      {detalleAbierto && (
        <div style={S.detalleGrid}>
          <div style={S.cajaSection}>
            <div style={S.cajaTitulo}>💵 Efectivo en caja (pesos)</div>
            <div style={S.cajaRow}><span>Ventas en efectivo</span><span style={S.cajaMonto}>${Math.round(ventasEfectivo).toLocaleString('es-AR')}</span></div>
            <div style={S.cajaRow}>
              <span>Gastos y salidas{salidas.length > 0 ? ` (${salidas.length})` : ''}</span>
              <span style={{ ...S.cajaMonto, color: '#ef4444' }}>− ${Math.round(totalSalidas).toLocaleString('es-AR')}</span>
            </div>
            <div style={S.cajaRow}>
              <span>Entradas{entradas.length > 0 ? ` (${entradas.length})` : ''}</span>
              <span style={{ ...S.cajaMonto, color: '#22c55e' }}>+ ${Math.round(totalEntradas).toLocaleString('es-AR')}</span>
            </div>
            <div style={S.cajaTotalRow}>
              <span>Debería haber en caja</span>
              <span style={S.cajaTotal}>${Math.round(efectivoEsperado).toLocaleString('es-AR')}</span>
            </div>
            <div style={S.cajaNota}>
              {errorGastos ? '⚠️ No se pudieron cargar los gastos de caja; tocá ↻ para reintentar. ' : ''}
              Sin contar el cambio con el que se abrió la caja.
              {Object.keys(divisas).length > 0 && (
                <> Además, en divisas: {Object.entries(divisas).map(([c, v]) => `${DIVISAS[c]} ${v.toLocaleString('es-AR')}`).join(' · ')}.</>
              )}
            </div>
          </div>

          {Object.keys(porMetodo).length > 0 && (
            <div style={S.metodoSection}>
              {Object.entries(porMetodo).sort((a, b) => b[1] - a[1]).map(([m, total]) => (
                <div key={m} style={S.metodoRow}>
                  <span>{METODO_ICONS[m] || '💰'} {m}</span>
                  <span style={S.metodoTotal}>${Math.round(total).toLocaleString('es-AR')}</span>
                </div>
              ))}
              {['AMARILLO', 'BLANCO'].filter(p => porPosnet[p]).map(p => (
                <div key={p} style={{ ...S.metodoRow, background:'var(--surface2)' }}>
                  <span>{p === 'AMARILLO' ? '🟡' : '⚪'} Posnet {p.toLowerCase()} ({porPosnet[p].ventas.size} {porPosnet[p].ventas.size === 1 ? 'venta' : 'ventas'})</span>
                  <span style={S.metodoTotal}>${Math.round(porPosnet[p].total).toLocaleString('es-AR')}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div style={S.tableWrap}>
        {listaVentas.length === 0 ? (
          <div style={S.emptyText}>Sin ventas registradas hoy</div>
        ) : (
          <table style={S.table}>
            <colgroup>
              <col style={{ width: 76 }} />
              <col />
              <col style={{ width: 56 }} />
              <col style={{ width: 96 }} />
              <col style={{ width: 120 }} />
              <col style={{ width: 150 }} />
              <col style={{ width: 96 }} />
            </colgroup>
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
                  <Fragment key={v.idVenta}>
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
                        {esAdmin && !v.anulado && POSNET_METODOS.has(v.metodoPago) && (
                          <button style={S.posnetBtnInline} title={v.correccionPosnet ? `Corregido: ${v.correccionPosnet}` : 'Corregir el posnet registrado'} onClick={e => { e.stopPropagation(); setCorrigiendo(v) }}>
                            Posnet{v.correccionPosnet ? ' ✎' : ''}
                          </button>
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
                          <td style={S.td}>
                            {METODO_ICONS[item.metodoPago] || '💰'} {item.metodoPago}
                            {item.posnet && <span style={{ display:'block', fontSize:11, color: item.posnet === 'AMARILLO' ? 'var(--accent)' : 'var(--muted)' }} title={item.correccionPosnet || undefined}>Posnet {item.posnet.toLowerCase()}{item.correccionPosnet ? ' · corregido' : ''}</span>}
                          </td>
                          <td style={S.td}>{item.empleado}</td>
                        </tr>
                      )
                    })}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {corrigiendo && (
        <CorregirPosnetModal
          venta={corrigiendo} usuarios={usuarios} perfilNombre={perfilNombre}
          onCerrar={() => setCorrigiendo(null)}
          onGuardado={nuevo => { showToast(`Posnet corregido a ${nuevo.toLowerCase()}`, 'success'); setCorrigiendo(null); cargar() }}
        />
      )}

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
  resumenBar: { display:'flex', flexWrap:'wrap', alignItems:'center', gap:'6px 24px', margin:'10px 20px', padding:'8px 16px', background:'var(--surface)', border:'1.5px solid var(--border)', borderRadius:12, cursor:'pointer', textAlign:'left', flexShrink:0 },
  resumenItem: { display:'flex', flexDirection:'column' },
  resumenValor: { fontFamily:'Barlow Condensed, sans-serif', fontWeight:800, fontSize:24, lineHeight:1.1, color:'var(--accent)' },
  resumenEtiqueta: { fontFamily:'Barlow, sans-serif', fontSize:12, color:'var(--muted)' },
  resumenToggle: { marginLeft:'auto', fontFamily:'Barlow Condensed, sans-serif', fontWeight:700, fontSize:14, color:'var(--muted)', letterSpacing:0.5, textTransform:'uppercase', whiteSpace:'nowrap' },
  detalleGrid: { display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(300px, 1fr))', gap:12, margin:'0 20px 12px', alignItems:'start' },
  cajaSection: { background:'var(--surface)', borderRadius:12, border:'1.5px solid var(--accent)', padding:'12px 16px', display:'flex', flexDirection:'column', gap:4 },
  cajaTitulo: { fontFamily:'Barlow Condensed, sans-serif', fontWeight:800, fontSize:16, color:'var(--muted)', letterSpacing:1, textTransform:'uppercase', marginBottom:4 },
  cajaRow: { display:'flex', justifyContent:'space-between', fontFamily:'Barlow, sans-serif', fontSize:15, color:'var(--text)' },
  cajaMonto: { fontFamily:'Barlow Condensed, sans-serif', fontWeight:700, fontSize:18, color:'var(--text)' },
  cajaTotalRow: { display:'flex', justifyContent:'space-between', alignItems:'baseline', borderTop:'1.5px solid var(--border)', paddingTop:8, marginTop:4, fontFamily:'Barlow Condensed, sans-serif', fontWeight:800, fontSize:18, color:'var(--text)', textTransform:'uppercase', letterSpacing:0.5 },
  cajaTotal: { fontFamily:'Barlow Condensed, sans-serif', fontWeight:800, fontSize:32, color:'var(--accent)' },
  cajaNota: { fontFamily:'Barlow, sans-serif', fontSize:12, color:'var(--muted)', lineHeight:1.4 },
  metodoSection: { background:'var(--surface)', borderRadius:10, border:'1.5px solid var(--border)', overflow:'hidden' },
  metodoRow: { display:'flex', justifyContent:'space-between', padding:'8px 14px', borderBottom:'1px solid var(--border)', fontFamily:'Barlow, sans-serif', fontSize:15, color:'var(--text)' },
  metodoTotal: { fontFamily:'Barlow Condensed, sans-serif', fontWeight:700, fontSize:17, color:'var(--accent)' },
  tableWrap: { flex:1, overflowX:'auto', padding:'0 20px 20px' },
  table: { width:'100%', minWidth:860, borderCollapse:'collapse', tableLayout:'fixed' },
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
  posnetBtnInline: { marginLeft:12, background:'none', border:'1px solid rgba(245,200,0,0.45)', borderRadius:6, color:'var(--accent)', fontFamily:'Barlow Condensed, sans-serif', fontWeight:700, fontSize:11, padding:'3px 8px', cursor:'pointer', letterSpacing:0.5, textTransform:'uppercase' },
  anularBtnInline: { marginLeft:12, background:'none', border:'1px solid rgba(239,68,68,0.4)', borderRadius:6, color:'rgba(239,68,68,0.8)', fontFamily:'Barlow Condensed, sans-serif', fontWeight:700, fontSize:11, padding:'3px 8px', cursor:'pointer', letterSpacing:0.5, textTransform:'uppercase' },
  emptyText: { fontFamily:'Barlow, sans-serif', color:'var(--muted)', textAlign:'center', padding:40, fontSize:18 },
  overlay: { position:'fixed', inset:0, background:'rgba(0,0,10,0.8)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:200, backdropFilter:'blur(6px)' },
  confirmBox: { background:'var(--surface)', border:'2px solid #ef4444', borderRadius:16, padding:28, width:320, textAlign:'center' },
  confirmTitle: { fontFamily:'Barlow Condensed, sans-serif', fontWeight:800, fontSize:24, color:'#ef4444', marginBottom:10 },
  confirmSub: { fontFamily:'Barlow, sans-serif', fontSize:14, color:'var(--muted)', lineHeight:1.5 },
  confirmCancel: { flex:1, padding:'12px', background:'none', border:'1.5px solid var(--border)', borderRadius:8, color:'var(--muted)', fontFamily:'Barlow, sans-serif', fontSize:14, cursor:'pointer' },
  confirmOk: { flex:1, padding:'12px', background:'#ef4444', border:'none', borderRadius:8, color:'#fff', fontFamily:'Barlow Condensed, sans-serif', fontWeight:700, fontSize:16, cursor:'pointer' },
}
