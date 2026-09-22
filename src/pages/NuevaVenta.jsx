// src/pages/NuevaVenta.jsx
import { useState, useEffect } from 'react'
import { registrarVenta, registrarLog } from '../api/sheets.js'
import BarcodeScanner from '../components/BarcodeScanner.jsx'

const METODOS_PAGO = [
  { valor: 'Efectivo Pesos',    icon: '💵', label: 'Efectivo $' },
  { valor: 'Efectivo Dólares',  icon: '🇺🇸', label: 'Dólares' },
  { valor: 'Efectivo Reales',   icon: '🇧🇷', label: 'Reales' },
  { valor: 'Efectivo Euros',    icon: '🇪🇺', label: 'Euros' },
  { valor: 'Tarjeta de Crédito', icon: '💳', label: 'Crédito' },
  { valor: 'Tarjeta de Débito',  icon: '💳', label: 'Débito' },
  { valor: 'QR',                icon: '📱', label: 'QR' },
  { valor: 'Transferencia',     icon: '🏦', label: 'Transfer.' },
]

const DESCUENTOS = [0, 5, 10, 15, 20, 25, 30, 40, 50]

// ── Imanes ───────────────────────────────────────────────────────────────────
const IMANES_A = new Set(['TB00049','TB00050','TB00051','TB00052','TB00053','TB00054','TB00055','TB00056','TB00058','TB00359','TB01011','TB01043','TB01044','TB01089','TB01090','TB01127'])
const IMANES_B = new Set(['TB00399','TB00433','TB00587','TB00741','TB00805','TB00059'])

function precioImanConDescuento(grupo, cantidadTotal) {
  if (grupo === 'A') {
    if (cantidadTotal >= 3) return 6000
    if (cantidadTotal === 2) return 7000
    return 8000
  }
  if (grupo === 'B') {
    if (cantidadTotal >= 3) return 4000
    if (cantidadTotal === 2) return 5000
    return 6000
  }
  return null
}

// ── Promos temporales (vencen 15/06/2026 23:00 ART = 16/06/2026 02:00 UTC) ──
const PROMO_EXPIRY = new Date('2026-06-16T02:00:00.000Z')

const LLAVEROS_PROMO = new Set([
  'TB00156','TB00157','TB00158','TB00159','TB00160','TB00161','TB00162','TB00164',
  'TB00165','TB00166','TB00167','TB00168','TB00169','TB00171','TB00240','TB00487',
  'TB00499','TB00558','TB00779','TB00802','TB00819','TB00836','TB00839','TB00847',
  'TB00855','TB00856','TB00865','TB00871','TB00879','TB01008','TB01012','TB01021',
  'TB01034','TB01039','TB01042','TB01064','TB01072','TB01079','TB01080','TB01081',
])
const REMERAS_PROMO = new Set(['TB00708','TB00714'])
const CHOMBAS_PROMO = new Set(['TB00969','TB00970'])

// ── Combo Alfajores (sin vencimiento): 6 unidades combinadas = $13.000 ──────
const ALFAJORES_PROMO = new Set(['TB01118','TB01117','TB01098'])
const ALFAJORES_PRECIO_GRUPO = 13000
const ALFAJORES_CANT_GRUPO = 6

// Reparte el combo en el orden en que los alfajores fueron agregados al carrito:
// las primeras unidades hasta completar cada grupo de 6 van al precio de combo,
// el resto (sueltas) queda al precio de lista de su propio renglón.
function calcularComboAlfajores(carrito) {
  const itemsAlf = carrito.filter(i => ALFAJORES_PROMO.has(i.id))
  const cantTotal = itemsAlf.reduce((s, i) => s + i.cantidad, 0)
  const grupos = Math.floor(cantTotal / ALFAJORES_CANT_GRUPO)
  const unidadesEnCombo = grupos * ALFAJORES_CANT_GRUPO
  const precioPorUnidadCombo = ALFAJORES_PRECIO_GRUPO / ALFAJORES_CANT_GRUPO

  let acumulado = 0
  let descuento = 0
  const detallePorId = {}
  itemsAlf.forEach(item => {
    const desde = acumulado
    const hasta = acumulado + item.cantidad
    const enCombo = Math.max(0, Math.min(hasta, unidadesEnCombo) - desde)
    const sueltas = item.cantidad - enCombo
    const totalLinea = enCombo * precioPorUnidadCombo + sueltas * item.precioUnitario
    detallePorId[item.id] = {
      enCombo, sueltas, totalLinea,
      precioPromedioLinea: item.cantidad > 0 ? totalLinea / item.cantidad : item.precioUnitario,
    }
    descuento += enCombo * (item.precioUnitario - precioPorUnidadCombo)
    acumulado = hasta
  })

  return { cantTotal, grupos, unidadesEnCombo, descuento, detallePorId }
}

function promosActivas() {
  return Date.now() < PROMO_EXPIRY.getTime()
}

function precioLlaveroPromo(cantTotal) {
  if (cantTotal >= 6) return 4667  // $28.000 / 6 = $4.666,67 → redondeado $4.667
  if (cantTotal >= 3) return 5000  // $15.000 / 3 = $5.000
  return 6000
}

// ── Cálculo de totales ────────────────────────────────────────────────────────
function calcularTotalesConDescuento(carrito, descCarrito) {
  const activo = promosActivas()

  let cantA = 0, cantB = 0, cantLlaveros = 0
  carrito.forEach(item => {
    if (IMANES_A.has(item.id)) cantA += item.cantidad
    else if (IMANES_B.has(item.id)) cantB += item.cantidad
    if (activo && LLAVEROS_PROMO.has(item.id)) cantLlaveros += item.cantidad
  })

  let subtotalBruto = 0
  let descuentoImanes = 0
  let descuentoPromo = 0

  carrito.forEach(item => {
    const subtotalItem = item.precioUnitario * item.cantidad
    subtotalBruto += subtotalItem

    if (IMANES_A.has(item.id) && cantA > 1) {
      descuentoImanes += (item.precioUnitario - precioImanConDescuento('A', cantA)) * item.cantidad
    } else if (IMANES_B.has(item.id) && cantB > 1) {
      descuentoImanes += (item.precioUnitario - precioImanConDescuento('B', cantB)) * item.cantidad
    }

    if (activo) {
      if (LLAVEROS_PROMO.has(item.id)) {
        descuentoPromo += (item.precioUnitario - precioLlaveroPromo(cantLlaveros)) * item.cantidad
      } else if (REMERAS_PROMO.has(item.id)) {
        descuentoPromo += (item.precioUnitario - 11500) * item.cantidad
      } else if (CHOMBAS_PROMO.has(item.id)) {
        descuentoPromo += (item.precioUnitario - 18000) * item.cantidad
      }
    }
  })

  const comboAlfajores = calcularComboAlfajores(carrito)
  const descuentoAlfajores = comboAlfajores.descuento

  const subtotalConDesc = subtotalBruto - descuentoImanes - descuentoPromo - descuentoAlfajores
  const descCarritoMonto = subtotalConDesc * (descCarrito / 100)
  const totalNeto = subtotalConDesc - descCarritoMonto

  return { totalBruto: subtotalBruto, descuentoImanes, descuentoPromo, descuentoAlfajores, subtotalConDesc, descCarritoMonto, totalNeto, cantA, cantB, cantLlaveros, comboAlfajores }
}

function precioEfectivoItem(item, totales) {
  const activo = promosActivas()
  if (IMANES_A.has(item.id) && totales.cantA > 1) return precioImanConDescuento('A', totales.cantA)
  if (IMANES_B.has(item.id) && totales.cantB > 1) return precioImanConDescuento('B', totales.cantB)
  if (ALFAJORES_PROMO.has(item.id) && totales.comboAlfajores?.grupos > 0) {
    const detalle = totales.comboAlfajores.detallePorId?.[item.id]
    if (detalle) return detalle.precioPromedioLinea
  }
  if (activo) {
    if (LLAVEROS_PROMO.has(item.id)) return precioLlaveroPromo(totales.cantLlaveros)
    if (REMERAS_PROMO.has(item.id)) return 11500
    if (CHOMBAS_PROMO.has(item.id)) return 18000
  }
  return item.precioUnitario
}

function badgePromo(artId, cantLlaveros) {
  if (ALFAJORES_PROMO.has(artId)) return '🥮 6× combinados $13.000'
  if (!promosActivas()) return null
  if (LLAVEROS_PROMO.has(artId)) {
    if (cantLlaveros >= 6) return '🏷️ $4.667 c/u'
    if (cantLlaveros >= 3) return '🏷️ $5.000 c/u'
    return '🏷️ 3×$15k · 6×$28k'
  }
  if (REMERAS_PROMO.has(artId)) return '🏷️ $11.500'
  if (CHOMBAS_PROMO.has(artId)) return '🏷️ $18.000'
  return null
}

export default function NuevaVenta({ articulos, loadingArticulos, onVentaRegistrada, usuarios: usuariosProp, stockMap = {}, empleadoFijo = null }) {
  const [carrito, setCarrito] = useState([])
  const [busqueda, setBusqueda] = useState('')
  const [metodoPago, setMetodoPago] = useState('Efectivo Pesos')
  const [empleado, setEmpleado] = useState('')
  const [descCarrito, setDescCarrito] = useState(0)
  const [usuarios, setUsuarios] = useState([])
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState(null)
  const [confirmarReinicio, setConfirmarReinicio] = useState(false)
  const [scannerAbierto, setScannerAbierto] = useState(false)
  const [montoDivisa, setMontoDivisa] = useState('')
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 600)

  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 600)
    window.addEventListener('resize', handler)
    return () => window.removeEventListener('resize', handler)
  }, [])

  const DIVISA_INFO = {
    'Efectivo Dólares': { code: 'USD', simbolo: 'US$', label: 'MONTO EN DÓLARES' },
    'Efectivo Euros':   { code: 'EUR', simbolo: '€',   label: 'MONTO EN EUROS' },
    'Efectivo Reales':  { code: 'BRL', simbolo: 'R$',  label: 'MONTO EN REALES' },
  }
  const divisaActual = DIVISA_INFO[metodoPago] || null

  useEffect(() => {
    if (usuariosProp && usuariosProp.length > 0) {
      setUsuarios(usuariosProp)
      setEmpleado(empleadoFijo || usuariosProp[0].nombre)
    }
  }, [usuariosProp, empleadoFijo])

  const normalizr = str => str.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  const articulosFiltrados = articulos.filter(a => {
    if (!busqueda.trim()) return true
    const q = normalizr(busqueda)
    return normalizr(a.nombre).includes(q) || normalizr(a.id).includes(q)
  })

  function agregarAlCarrito(art) {
    setCarrito(prev => {
      const idx = prev.findIndex(i => i.id === art.id)
      if (idx >= 0) {
        const updated = [...prev]
        updated[idx] = { ...updated[idx], cantidad: updated[idx].cantidad + 1 }
        return updated
      }
      return [...prev, { id: art.id, nombre: art.nombre, foto: art.foto, precioUnitario: art.precioUnitario, costoUnitario: art.costoUnitario, cantidad: 1, descuento: 0, articulo: art.id }]
    })
    registrarLog({ accion:'PRODUCTO_AGREGADO', detalle:`${art.nombre} (${art.id}) · $${art.precioUnitario.toLocaleString('es-AR')}`, empleado, resultado:'OK' })
  }

  function cambiarCantidad(idx, delta) {
    setCarrito(prev => {
      const updated = [...prev]
      const nueva = updated[idx].cantidad + delta
      if (nueva <= 0) {
        registrarLog({ accion:'PRODUCTO_QUITADO', detalle:`${updated[idx].nombre} eliminado`, empleado, resultado:'OK' })
        return updated.filter((_, i) => i !== idx)
      }
      updated[idx] = { ...updated[idx], cantidad: nueva }
      return updated
    })
  }

  function quitarDelCarrito(idx) {
    registrarLog({ accion:'PRODUCTO_QUITADO', detalle:`${carrito[idx]?.nombre} eliminado`, empleado, resultado:'OK' })
    setCarrito(prev => prev.filter((_, i) => i !== idx))
  }

  function reiniciarCarrito() {
    registrarLog({ accion:'CARRITO_REINICIADO', detalle:`${carrito.length} producto(s)`, empleado, resultado:'OK' })
    setCarrito([])
    setDescCarrito(0)
    setConfirmarReinicio(false)
  }

  const totales = calcularTotalesConDescuento(carrito, descCarrito)

  async function cerrarVenta() {
    if (carrito.length === 0) return
    setSaving(true)
    try {
      const notas = divisaActual && montoDivisa ? `${divisaActual.code} ${montoDivisa}` : ''
      const idVenta = await registrarVenta({
        items: carrito,
        metodoPago,
        descCarrito,
        empleado,
        notas,
        descuentoImanes: totales.descuentoImanes,
        descuentoPromo: totales.descuentoPromo,
      })
      showToast('Venta ' + idVenta + ' registrada ✓', 'success')
      setCarrito([])
      setDescCarrito(0)
      setMontoDivisa('')
      onVentaRegistrada?.()
    } catch (e) {
      showToast('Error al guardar. Revisá la conexión.', 'error')
      registrarLog({ accion:'ERROR_CERRAR_VENTA', detalle:e?.message||'Error desconocido', empleado, resultado:'ERROR' })
      console.error(e)
    } finally {
      setSaving(false)
    }
  }

  function handleScan(codigo) {
    const art = articulos.find(a => a.id === codigo || a.id === codigo.trim())
    if (art) {
      agregarAlCarrito(art)
      registrarLog({ accion:'SCAN_EXITOSO', detalle:`${art.nombre} (${art.id})`, empleado, resultado:'OK' })
      return { ok: true, nombre: art.nombre }
    }
    registrarLog({ accion:'SCAN_NO_ENCONTRADO', detalle:`No encontrado: ${codigo}`, empleado, resultado:'ERROR' })
    return { ok: false, nombre: `No encontrado: ${codigo}` }
  }

  function showToast(msg, type) {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3500)
  }

  const promoVigente = promosActivas()
  const cantLlavCarrito = carrito.filter(i => LLAVEROS_PROMO.has(i.id)).reduce((s,i) => s+i.cantidad, 0)

  return (
    <div style={isMobile ? S.layoutMobile : S.layout}>
      {toast && (
        <div style={{...S.toast, ...(toast.type==='error' ? S.toastError : S.toastSuccess)}}>{toast.msg}</div>
      )}

      {/* PRODUCTOS */}
      <div style={isMobile ? S.blockMobile : S.col}>
        <div style={S.colHeader}>
          <span style={S.colTitle}>PRODUCTOS</span>
          {loadingArticulos && <span style={{color:'var(--accent)',fontSize:12}}>●</span>}
        </div>
        <div style={S.searchWrap}>
          <span style={S.searchIcon}>⌕</span>
          <input style={S.searchInput} value={busqueda} onChange={e => setBusqueda(e.target.value)} placeholder="Buscar nombre o SKU..." disabled={loadingArticulos} />
          {busqueda && (
            <>
              <button style={S.clearBtn} onClick={() => setBusqueda('')}>✕</button>
              <div style={{width:1, alignSelf:'stretch', background:'var(--border)', margin:'8px 0'}} />
            </>
          )}
          <button style={S.scanBtn} onClick={() => { setScannerAbierto(true); registrarLog({ accion:'SCANNER_ABIERTO', detalle:'Escáner abierto', empleado, resultado:'OK' }) }}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 5v14"/><path d="M6 5v14"/><path d="M9 5v14"/><path d="M12 5v14"/>
              <path d="M15 5v14"/><path d="M18 5v14"/><path d="M21 5v14"/>
              <rect x="1" y="3" width="22" height="18" rx="2" strokeWidth="1.5"/>
            </svg>
          </button>
        </div>
        <div style={isMobile ? S.scrollListMobile : S.scrollList}>
          {articulosFiltrados.map(art => {
            const stock = stockMap[art.id]
            const promo = (promoVigente || ALFAJORES_PROMO.has(art.id)) ? badgePromo(art.id, cantLlavCarrito) : null
            return (
              <button key={art.id} style={isMobile ? S.artRowMobile : S.artRow} onClick={() => agregarAlCarrito(art)}>
                {art.foto
                  ? <img src={art.foto} alt="" style={isMobile ? S.thumbMobile : S.thumb} onError={e => e.target.style.display='none'} />
                  : <div style={isMobile ? S.thumbPHMobile : S.thumbPH}>📦</div>
                }
                <div style={S.artInfo}>
                  <div style={isMobile ? S.artNombreMobile : S.artNombre}>{art.nombre}</div>
                  <div style={{display:'flex', alignItems:'center', gap:6, flexWrap:'wrap'}}>
                    <div style={S.artSku}>{art.id}</div>
                    {stock !== undefined && (
                      <span style={{ fontFamily:'Barlow Condensed, sans-serif', fontWeight:700, fontSize:13,
                        color: stock <= 0 ? '#ef4444' : stock <= 3 ? '#f59e0b' : '#22c55e',
                        background: stock <= 0 ? 'rgba(239,68,68,0.1)' : stock <= 3 ? 'rgba(245,158,11,0.1)' : 'rgba(34,197,94,0.1)',
                        borderRadius:4, padding:'1px 6px' }}>stock: {stock}</span>
                    )}
                    {promo && (
                      <span style={{ fontFamily:'Barlow Condensed, sans-serif', fontWeight:700, fontSize:12,
                        color:'#f59e0b', background:'rgba(245,158,11,0.15)', borderRadius:4, padding:'1px 6px' }}>{promo}</span>
                    )}
                  </div>
                </div>
                <div style={S.artPrecio}>${art.precioUnitario.toLocaleString('es-AR')}</div>
              </button>
            )
          })}
          {!loadingArticulos && articulosFiltrados.length === 0 && <div style={S.emptyMsg}>Sin resultados</div>}
        </div>
      </div>

      {/* CARRITO */}
      <div style={isMobile ? S.blockMobile : S.col}>
        <div style={S.colHeader}>
          <span style={S.colTitle}>DETALLE ÚLTIMA VENTA</span>
          {carrito.length > 0 && <span style={S.badge}>{carrito.reduce((s,i)=>s+i.cantidad,0)}</span>}
        </div>
        <div style={isMobile ? S.scrollListMobile : S.scrollList}>
          {carrito.length === 0 ? (
            <div style={S.emptyCarrito}><div style={{fontSize:48}}>🛒</div><div>El carrito está vacío</div></div>
          ) : carrito.map((item, idx) => {
            const precioEfectivo = precioEfectivoItem(item, totales)
            const tieneDesc = precioEfectivo < item.precioUnitario
            return (
              <div key={item.id+idx} style={isMobile ? S.artRowMobile : S.cartItem}>
                {item.foto
                  ? <img src={item.foto} alt="" style={isMobile ? S.thumbMobile : S.thumb} onError={e=>e.target.style.display='none'} />
                  : <div style={isMobile ? S.thumbPHMobile : S.thumbPH}>📦</div>
                }
                <div style={S.artInfo}>
                  <div style={isMobile ? S.artNombreMobile : S.artNombre}>{item.nombre}</div>
                  <div style={S.artSku}>{item.id}</div>
                  <div style={{display:'flex', alignItems:'center', gap:6, marginTop:2}}>
                    {tieneDesc && <span style={{...S.artSku, textDecoration:'line-through', opacity:0.5}}>${item.precioUnitario.toLocaleString('es-AR')}</span>}
                    <span style={{...S.artSku, color: tieneDesc ? '#22c55e' : 'var(--muted)'}}>${Math.round(precioEfectivo).toLocaleString('es-AR')} c/u</span>
                  </div>
                </div>
                <div style={S.cartRight}>
                  <div style={S.qtyRow}>
                    <button style={S.qtyBtn} onClick={()=>cambiarCantidad(idx,-1)}>−</button>
                    <span style={S.qty}>{item.cantidad}</span>
                    <button style={S.qtyBtn} onClick={()=>cambiarCantidad(idx,+1)}>+</button>
                  </div>
                  <div style={{...S.cartTotal, color: tieneDesc ? '#22c55e' : 'var(--accent)'}}>
                    ${(precioEfectivo * item.cantidad).toLocaleString('es-AR')}
                  </div>
                  <button style={S.removeBtn} onClick={()=>quitarDelCarrito(idx)}>✕</button>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* TOTAL */}
      <div style={{...(isMobile ? S.blockMobile : S.col), borderRight:'none'}}>
        <div style={S.colHeader}><span style={S.colTitle}>TOTAL VENTA</span></div>
        <div style={S.totalPanel}>
          <div style={S.totalNeto}>${Math.round(totales.totalNeto).toLocaleString('es-AR')}</div>
          <div style={S.totalNetoLabel}>TOTAL NETO</div>

          <div style={S.totalBrutoRow}>
            <span style={{fontFamily:'Barlow,sans-serif',fontSize:16,color:'var(--muted)'}}>TOTAL BRUTO</span>
            <span style={{fontFamily:'Barlow Condensed,sans-serif',fontWeight:700,fontSize:18,color:'var(--text)'}}>${totales.totalBruto.toLocaleString('es-AR')}</span>
          </div>
          {totales.descuentoImanes > 0 && (
            <div style={S.totalBrutoRow}>
              <span style={{fontFamily:'Barlow,sans-serif',fontSize:14,color:'#22c55e'}}>🧲 Descuento imanes</span>
              <span style={{fontFamily:'Barlow Condensed,sans-serif',fontWeight:700,fontSize:15,color:'#22c55e'}}>−${totales.descuentoImanes.toLocaleString('es-AR')}</span>
            </div>
          )}
          {totales.descuentoPromo > 0 && (
            <div style={S.totalBrutoRow}>
              <span style={{fontFamily:'Barlow,sans-serif',fontSize:14,color:'#f59e0b'}}>🏷️ Descuento promos</span>
              <span style={{fontFamily:'Barlow Condensed,sans-serif',fontWeight:700,fontSize:15,color:'#f59e0b'}}>−${Math.round(totales.descuentoPromo).toLocaleString('es-AR')}</span>
            </div>
          )}
          {totales.descuentoAlfajores > 0 && (
            <div style={S.totalBrutoRow}>
              <span style={{fontFamily:'Barlow,sans-serif',fontSize:14,color:'#f59e0b'}}>🥮 Descuento alfajores</span>
              <span style={{fontFamily:'Barlow Condensed,sans-serif',fontWeight:700,fontSize:15,color:'#f59e0b'}}>−${Math.round(totales.descuentoAlfajores).toLocaleString('es-AR')}</span>
            </div>
          )}
          {descCarrito > 0 && (
            <div style={S.totalBrutoRow}>
              <span style={{fontFamily:'Barlow,sans-serif',fontSize:14,color:'var(--muted)'}}>Descuento {descCarrito}%</span>
              <span style={{fontFamily:'Barlow Condensed,sans-serif',fontWeight:700,fontSize:15,color:'#22c55e'}}>−${Math.round(totales.descCarritoMonto).toLocaleString('es-AR')}</span>
            </div>
          )}

          <div style={S.divider}/>

          <div style={S.fieldLabel}>MÉTODO DE PAGO</div>
          <div style={S.metodosGrid}>
            {METODOS_PAGO.map(m => (
              <button key={m.valor} style={{...S.metodoBtn,...(metodoPago===m.valor?S.metodoBtnActive:{})}} onClick={()=>setMetodoPago(m.valor)}>
                <span style={S.metodoBtnIcon}>{m.icon}</span>
                <span style={S.metodoBtnLabel}>{m.label}</span>
              </button>
            ))}
          </div>

          {divisaActual && (
            <>
              <div style={S.fieldLabel}>{divisaActual.label}</div>
              <div style={S.divisaInputWrap}>
                <span style={S.divisaSimbolo}>{divisaActual.simbolo}</span>
                <input type="text" inputMode="decimal" placeholder="0.00" value={montoDivisa} onChange={e=>setMontoDivisa(e.target.value)} style={S.divisaInput} />
              </div>
            </>
          )}

          <div style={S.fieldLabel}>EMPLEADO</div>
          <div style={S.metodosGrid}>
            {empleadoFijo
              ? <div style={{...S.empleadoBtn,...S.metodoBtnActive,gridColumn:'span 4'}}>{empleadoFijo}</div>
              : usuarios.filter(u=>u.nombre!=='Tablet').map(u => (
                  <button key={u.id} style={{...S.empleadoBtn,...(empleado===u.nombre?S.metodoBtnActive:{})}} onClick={()=>setEmpleado(u.nombre)}>{u.nombre}</button>
                ))
            }
            {!empleadoFijo && usuarios.length===0 && <span style={{color:'var(--muted)',fontSize:13}}>Sin usuarios</span>}
          </div>

          <div style={S.fieldLabel}>DTO</div>
          <select style={S.select} value={descCarrito} onChange={e=>setDescCarrito(Number(e.target.value))}>
            {DESCUENTOS.map(d=><option key={d} value={d}>{d===0?'':`${d}%`}</option>)}
          </select>

          <div style={S.divider}/>

          <button style={{...S.cerrarBtn,opacity:(saving||carrito.length===0)?0.5:1}} onClick={cerrarVenta} disabled={saving||carrito.length===0}>
            {saving?'Guardando...':`CERRAR VENTA · $${Math.round(totales.totalNeto).toLocaleString('es-AR')}`}
          </button>
          <button style={{...S.reiniciarBtn,opacity:carrito.length===0?0.4:1}} onClick={()=>setConfirmarReinicio(true)} disabled={carrito.length===0}>
            REINICIAR CARRITO
          </button>
        </div>
      </div>

      {confirmarReinicio && (
        <div style={S.overlay} onClick={()=>setConfirmarReinicio(false)}>
          <div style={S.confirmBox} onClick={e=>e.stopPropagation()}>
            <div style={{fontFamily:'Barlow Condensed,sans-serif',fontWeight:800,fontSize:24,color:'var(--text)',marginBottom:10}}>¿Reiniciar carrito?</div>
            <div style={{fontFamily:'Barlow,sans-serif',fontSize:16,color:'var(--muted)',marginBottom:24}}>Se van a borrar {carrito.length} producto{carrito.length!==1?'s':''}.</div>
            <div style={{display:'flex',gap:10}}>
              <button style={S.confirmCancel} onClick={()=>setConfirmarReinicio(false)}>Cancelar</button>
              <button style={S.confirmOk} onClick={reiniciarCarrito}>Sí, reiniciar</button>
            </div>
          </div>
        </div>
      )}

      {scannerAbierto && <BarcodeScanner onDetected={handleScan} onClose={()=>setScannerAbierto(false)} />}
    </div>
  )
}

const S = {
  layout: { display:'grid', gridTemplateColumns:'1fr 1fr 1fr', height:'100%', width:'100%', overflow:'hidden', position:'relative' },
  layoutMobile: { display:'flex', flexDirection:'column', height:'100%', width:'100%', overflowY:'auto', position:'relative' },
  blockMobile: { display:'flex', flexDirection:'column', borderBottom:'2px solid var(--border)', flexShrink:0 },
  toast: { position:'fixed', top:16, left:'50%', transform:'translateX(-50%)', zIndex:300, padding:'12px 28px', borderRadius:10, fontFamily:'Barlow Condensed,sans-serif', fontWeight:700, fontSize:18, whiteSpace:'nowrap', boxShadow:'0 4px 20px rgba(0,0,0,0.5)' },
  toastSuccess: { background:'#22c55e', color:'#000' },
  toastError: { background:'#ef4444', color:'#fff' },
  col: { display:'flex', flexDirection:'column', borderRight:'2px solid var(--border)', overflow:'hidden' },
  colHeader: { display:'flex', alignItems:'center', gap:8, padding:'12px 16px 10px', borderBottom:'2px solid var(--accent)', background:'var(--surface2)', flexShrink:0 },
  colTitle: { fontFamily:'Barlow Condensed,sans-serif', fontWeight:800, fontSize:16, color:'var(--accent)', textTransform:'uppercase', letterSpacing:2 },
  badge: { background:'var(--accent)', color:'#000', fontFamily:'Barlow Condensed,sans-serif', fontWeight:800, fontSize:14, borderRadius:20, padding:'2px 10px' },
  searchWrap: { display:'flex', alignItems:'stretch', margin:'10px 12px 4px', background:'var(--surface2)', border:'1.5px solid var(--border)', borderRadius:8, padding:'0 0 0 12px', flexShrink:0 },
  searchIcon: { fontSize:20, color:'var(--muted)', display:'flex', alignItems:'center' },
  searchInput: { flex:1, background:'none', border:'none', outline:'none', color:'var(--text)', fontFamily:'Barlow,sans-serif', fontSize:16, padding:'10px 6px' },
  clearBtn: { background:'none', border:'none', color:'var(--muted)', cursor:'pointer', fontSize:16, padding:'0 10px', display:'flex', alignItems:'center' },
  scanBtn: { background:'none', border:'none', borderLeft:'1.5px solid var(--border)', color:'var(--accent)', cursor:'pointer', padding:'0 14px', display:'flex', alignItems:'center', justifyContent:'center' },
  scrollList: { flex:1, overflowY:'auto' },
  scrollListMobile: { maxHeight:280, overflowY:'auto' },
  artRow: { width:'100%', display:'flex', alignItems:'center', gap:12, padding:'10px 14px', background:'none', border:'none', borderBottom:'1px solid var(--border)', cursor:'pointer', color:'var(--text)', textAlign:'left' },
  artRowMobile: { width:'100%', display:'flex', alignItems:'center', gap:10, padding:'8px 12px', background:'none', border:'none', borderBottom:'1px solid var(--border)', cursor:'pointer', color:'var(--text)', textAlign:'left' },
  thumb: { width:88, height:88, objectFit:'cover', borderRadius:8, flexShrink:0, border:'1px solid var(--border)' },
  thumbMobile: { width:52, height:52, objectFit:'cover', borderRadius:6, flexShrink:0, border:'1px solid var(--border)' },
  thumbPH: { width:88, height:88, display:'flex', alignItems:'center', justifyContent:'center', background:'var(--surface2)', borderRadius:8, fontSize:32, flexShrink:0, border:'1px solid var(--border)' },
  thumbPHMobile: { width:52, height:52, display:'flex', alignItems:'center', justifyContent:'center', background:'var(--surface2)', borderRadius:6, fontSize:22, flexShrink:0, border:'1px solid var(--border)' },
  artInfo: { flex:1, minWidth:0 },
  artNombre: { fontFamily:'Barlow,sans-serif', fontWeight:600, fontSize:20, color:'var(--text)', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' },
  artNombreMobile: { fontFamily:'Barlow,sans-serif', fontWeight:600, fontSize:15, color:'var(--text)', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' },
  artSku: { fontFamily:'Barlow Condensed,sans-serif', fontSize:17, color:'var(--muted)' },
  artPrecio: { fontFamily:'Barlow Condensed,sans-serif', fontWeight:800, fontSize:22, color:'var(--accent)', flexShrink:0 },
  emptyMsg: { padding:28, textAlign:'center', color:'var(--muted)', fontFamily:'Barlow,sans-serif', fontSize:16 },
  emptyCarrito: { display:'flex', flexDirection:'column', alignItems:'center', gap:12, padding:40, color:'var(--muted)', fontFamily:'Barlow,sans-serif', fontSize:16 },
  cartItem: { display:'flex', alignItems:'center', gap:12, padding:'10px 14px', borderBottom:'1px solid var(--border)' },
  cartRight: { display:'flex', flexDirection:'column', alignItems:'flex-end', gap:6, flexShrink:0 },
  qtyRow: { display:'flex', alignItems:'center', gap:6 },
  qtyBtn: { width:32, height:32, background:'var(--border)', border:'none', borderRadius:6, color:'var(--text)', fontSize:20, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', fontWeight:700 },
  qty: { fontFamily:'Barlow Condensed,sans-serif', fontWeight:700, fontSize:20, minWidth:26, textAlign:'center', color:'var(--text)' },
  cartTotal: { fontFamily:'Barlow Condensed,sans-serif', fontWeight:700, fontSize:18, color:'var(--accent)' },
  removeBtn: { background:'none', border:'none', color:'var(--muted)', cursor:'pointer', fontSize:16, padding:'2px 6px' },
  totalPanel: { flex:1, overflowY:'auto', padding:'16px', display:'flex', flexDirection:'column', gap:10 },
  totalNeto: { fontFamily:'Barlow Condensed,sans-serif', fontWeight:800, fontSize:52, color:'var(--accent)', lineHeight:1 },
  totalNetoLabel: { fontFamily:'Barlow Condensed,sans-serif', fontSize:14, color:'var(--muted)', letterSpacing:2, marginBottom:4 },
  totalBrutoRow: { display:'flex', justifyContent:'space-between', alignItems:'center' },
  divider: { height:1, background:'var(--border)', margin:'6px 0' },
  fieldLabel: { fontFamily:'Barlow Condensed,sans-serif', fontSize:14, color:'var(--accent)', letterSpacing:1, marginBottom:4, marginTop:4 },
  metodosGrid: { display:'grid', gridTemplateColumns:'repeat(4, 1fr)', gap:6, marginBottom:2 },
  metodoBtn: { display:'flex', flexDirection:'column', alignItems:'center', gap:3, padding:'8px 4px', background:'var(--surface2)', border:'1.5px solid var(--border)', borderRadius:8, cursor:'pointer', color:'var(--muted)' },
  metodoBtnActive: { background:'rgba(245,200,0,0.12)', border:'1.5px solid var(--accent)', color:'var(--accent)' },
  metodoBtnIcon: { fontSize:20 },
  metodoBtnLabel: { fontFamily:'Barlow Condensed,sans-serif', fontWeight:700, fontSize:15, letterSpacing:0.5, textAlign:'center', lineHeight:1.2 },
  empleadoBtn: { padding:'8px 6px', background:'var(--surface2)', border:'1.5px solid var(--border)', borderRadius:8, cursor:'pointer', color:'var(--muted)', fontFamily:'Barlow Condensed,sans-serif', fontWeight:700, fontSize:15, letterSpacing:0.5, textAlign:'center' },
  divisaInputWrap: { display:'flex', alignItems:'center', background:'var(--surface2)', border:'1.5px solid var(--accent)', borderRadius:8, marginBottom:2 },
  divisaSimbolo: { padding:'0 10px', fontFamily:'Barlow Condensed,sans-serif', fontWeight:700, fontSize:18, color:'var(--accent)', borderRight:'1.5px solid var(--border)' },
  divisaInput: { flex:1, background:'none', border:'none', outline:'none', color:'var(--text)', fontFamily:'Barlow Condensed,sans-serif', fontWeight:700, fontSize:20, padding:'10px 12px' },
  select: { width:'100%', background:'var(--surface2)', border:'1.5px solid var(--border)', borderRadius:8, color:'var(--text)', fontFamily:'Barlow,sans-serif', fontSize:16, padding:'10px 12px', outline:'none', cursor:'pointer' },
  cerrarBtn: { width:'100%', padding:'16px 8px', background:'var(--accent)', border:'none', borderRadius:10, cursor:'pointer', fontFamily:'Barlow Condensed,sans-serif', fontWeight:800, fontSize:18, color:'#000', textTransform:'uppercase', letterSpacing:1, marginTop:4, boxShadow:'0 3px 12px rgba(245,200,0,0.3)' },
  reiniciarBtn: { width:'100%', padding:'13px', background:'none', border:'1.5px solid var(--border)', borderRadius:10, cursor:'pointer', fontFamily:'Barlow Condensed,sans-serif', fontWeight:700, fontSize:15, color:'var(--muted)', textTransform:'uppercase', letterSpacing:1 },
  overlay: { position:'fixed', inset:0, background:'rgba(0,0,10,0.8)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:200, backdropFilter:'blur(6px)' },
  confirmBox: { background:'var(--surface)', border:'2px solid var(--border)', borderRadius:16, padding:32, width:320, textAlign:'center' },
  confirmCancel: { flex:1, padding:'13px', background:'none', border:'1.5px solid var(--border)', borderRadius:8, color:'var(--muted)', fontFamily:'Barlow,sans-serif', fontSize:15, cursor:'pointer' },
  confirmOk: { flex:1, padding:'13px', background:'#ef4444', border:'none', borderRadius:8, color:'#fff', fontFamily:'Barlow Condensed,sans-serif', fontWeight:700, fontSize:17, cursor:'pointer' },
}
