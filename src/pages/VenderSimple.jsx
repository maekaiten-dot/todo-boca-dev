// src/pages/VenderSimple.jsx
// Pantalla de Vender grande y simple (local Mitad de cuadra). Misma estructura que NuevaVenta
// (PRODUCTOS | ESTA VENTA | TOTAL VENTA) con letra y botones más grandes, categorías en lugar de
// escribir en el buscador, 4 medios de pago y un aviso grande de "venta guardada" con sonido.
// Guarda con la misma registrarVenta() que la Esquina, así las ventas quedan igual en la planilla.
import { useState, useEffect, useMemo } from 'react'
import { registrarVenta, anularVenta, registrarLog } from '../api/sheets.js'
import { LOCAL } from '../config/local.js'

// Mismos valores que METODOS_PAGO de NuevaVenta
export const METODOS_SIMPLE = [
  { valor: 'Efectivo Pesos', label: 'Efectivo', corto: 'Efectivo', icono: 'billete' },
  { valor: 'Tarjeta de Crédito', label: 'Tarjeta de\nCrédito', corto: 'Crédito', icono: 'tarjeta' },
  { valor: 'Tarjeta de Débito', label: 'Tarjeta de\nDébito', corto: 'Débito', icono: 'tarjeta' },
  { valor: 'Transferencia', label: 'Transferencia', corto: 'Transferencia', icono: 'banco' },
]

const TODAS = '__todas__'
const CLAVE_VENDEDOR = 'tb_vendedor_simple'
const fmt = n => '$' + Math.round(n || 0).toLocaleString('es-AR')

// Sonido corto de "venta guardada": dos notas ascendentes, generado en el navegador
let _audio = null
export function sonarVentaGuardada() {
  try { if (navigator.vibrate) navigator.vibrate(60) } catch {}
  try {
    const AC = window.AudioContext || window.webkitAudioContext
    if (!AC) return
    if (!_audio) _audio = new AC()
    if (_audio.state === 'suspended') _audio.resume()
    const t0 = _audio.currentTime
    ;[[880, 0], [1318.5, 0.13]].forEach(([freq, delay]) => {
      const o = _audio.createOscillator(), g = _audio.createGain()
      o.type = 'sine'; o.frequency.value = freq
      g.gain.setValueAtTime(0.0001, t0 + delay)
      g.gain.exponentialRampToValueAtTime(0.35, t0 + delay + 0.02)
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + delay + 0.35)
      o.connect(g); g.connect(_audio.destination)
      o.start(t0 + delay); o.stop(t0 + delay + 0.4)
    })
  } catch {}
}

export function Icono({ tipo, size = 34 }) {
  const p = { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true, style: { flexShrink: 0 } }
  if (tipo === 'billete') return <svg {...p}><rect x="2" y="6" width="20" height="12" rx="2" /><circle cx="12" cy="12" r="3" /></svg>
  if (tipo === 'tarjeta') return <svg {...p}><rect x="2" y="5" width="20" height="14" rx="2" /><path d="M2 10h20" /></svg>
  if (tipo === 'banco') return <svg {...p}><path d="M3 10 12 4l9 6" /><path d="M5 10v8M10 10v8M14 10v8M19 10v8" /><path d="M3 20h18" /></svg>
  if (tipo === 'carrito') return <svg {...p}><circle cx="9" cy="20" r="1.5" /><circle cx="18" cy="20" r="1.5" /><path d="M2 3h3l2.5 12h11l2.5-8H6.2" /></svg>
  if (tipo === 'menos') return <svg {...p} strokeWidth={2.5}><path d="M5 12h14" /></svg>
  if (tipo === 'mas') return <svg {...p} strokeWidth={2.5}><path d="M12 5v14M5 12h14" /></svg>
  if (tipo === 'ok') return <svg {...p} strokeWidth={2.6}><path d="M5 12.5l4.5 4.5L19 7" /></svg>
  if (tipo === 'lupa') return <svg {...p}><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></svg>
  // caja: producto sin foto
  return <svg {...p} strokeWidth={1.5}><path d="M3 7.5 12 3l9 4.5v9L12 21l-9-4.5z" /><path d="M3 7.5 12 12l9-4.5" /><path d="M12 12v9" /></svg>
}

// Foto del producto (o la cajita si no tiene)
export function FotoProducto({ src, size = 76 }) {
  const [rota, setRota] = useState(false)
  useEffect(() => setRota(false), [src])
  return (
    <div style={{ width: size, height: size, flexShrink: 0, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface2)', color: 'var(--muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
      {src && !rota
        ? <img src={src} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={() => setRota(true)} />
        : <Icono tipo="caja" size={Math.round(size * 0.55)} />}
    </div>
  )
}

function useAncho() {
  const [w, setW] = useState(() => window.innerWidth)
  useEffect(() => { const f = () => setW(window.innerWidth); window.addEventListener('resize', f); return () => window.removeEventListener('resize', f) }, [])
  return w
}

export default function VenderSimple({ articulos = [], loadingArticulos, usuarios = [], perfilNombre = '', esAdmin = false, onVentaRegistrada }) {
  const angosto = useAncho() < 900
  const [cat, setCat] = useState(TODAS)
  const [busqueda, setBusqueda] = useState('')
  const [carrito, setCarrito] = useState([])
  const [metodo, setMetodo] = useState(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [guardada, setGuardada] = useState(null)   // { idVenta, total, metodo, carrito, metodoValor, empleado }
  const [deshaciendo, setDeshaciendo] = useState(false)
  const [otroAbierto, setOtroAbierto] = useState(false)
  const [otro, setOtro] = useState('')

  // Vendedores: perfiles Caja de USUARIOS (sin "Tablet"). El Admin vende a su nombre.
  const vendedores = useMemo(() => usuarios.filter(u => (u.tipo || 'Caja').toLowerCase() !== 'admin' && u.nombre && u.nombre.toLowerCase() !== 'tablet').map(u => u.nombre), [usuarios])
  const pideVendedor = !esAdmin && LOCAL.pedirVendedor && vendedores.length > 0
  const [vendedor, setVendedor] = useState(() => { try { return localStorage.getItem(CLAVE_VENDEDOR) || '' } catch { return '' } })
  useEffect(() => { if (vendedor && vendedores.length && !vendedores.includes(vendedor)) setVendedor('') }, [vendedores, vendedor])
  function elegirVendedor(n) { setVendedor(n); try { localStorage.setItem(CLAVE_VENDEDOR, n) } catch {} }
  const empleado = esAdmin ? perfilNombre : pideVendedor ? vendedor : perfilNombre

  // Categorías (columna CATEGORÍA de ARTICULOS). Sin categorías: se muestran todos.
  const categorias = useMemo(() => {
    const cuenta = {}
    articulos.forEach(a => { if (a.categoria) cuenta[a.categoria] = (cuenta[a.categoria] || 0) + 1 })
    return Object.keys(cuenta).sort((a, b) => a.localeCompare(b, 'es'))
  }, [articulos])
  useEffect(() => { if (cat !== TODAS && !categorias.includes(cat)) setCat(TODAS) }, [categorias, cat])

  const lista = useMemo(() => {
    const q = busqueda.trim().toLowerCase()
    return articulos
      .filter(a => a.precioUnitario > 0)
      .filter(a => q ? (a.nombre.toLowerCase().includes(q) || String(a.id).toLowerCase().includes(q)) : (cat === TODAS || a.categoria === cat))
      .slice(0, 300)
  }, [articulos, cat, busqueda])

  const cantDe = id => carrito.find(i => i.id === id)?.cantidad || 0
  const total = carrito.reduce((s, i) => s + i.precioUnitario * i.cantidad, 0)
  const unidades = carrito.reduce((s, i) => s + i.cantidad, 0)
  const faltaVendedor = pideVendedor && !vendedor
  const puedeCerrar = carrito.length > 0 && !!metodo && !faltaVendedor && !saving
  const ayudaCerrar = saving ? 'Guardando…' : carrito.length === 0 ? 'Agregá productos' : faltaVendedor ? 'Elegí quién vende' : 'Elegí cómo paga'

  function agregar(art) {
    try { if (navigator.vibrate) navigator.vibrate(30) } catch {}
    setError('')
    setCarrito(prev => {
      const i = prev.findIndex(x => x.id === art.id)
      if (i >= 0) return prev.map((x, k) => k === i ? { ...x, cantidad: x.cantidad + 1 } : x)
      return [...prev, { id: art.id, articulo: art.id, nombre: art.nombre, foto: art.foto, precioUnitario: art.precioUnitario, costoUnitario: art.costoUnitario || 0, cantidad: 1 }]
    })
  }
  function cambiarCant(id, d) {
    setCarrito(prev => prev.map(x => x.id === id ? { ...x, cantidad: x.cantidad + d } : x).filter(x => x.cantidad > 0))
  }
  function reiniciar() {
    if (carrito.length) registrarLog({ accion: 'CARRITO_REINICIADO', detalle: `${carrito.length} producto(s) · pantalla simple`, empleado, resultado: 'OK' })
    setCarrito([]); setMetodo(null); setError('')
  }

  // "Otro producto": algo que no está cargado, con el precio escrito a mano
  function tecla(k) {
    setOtro(v => k === 'del' ? v.slice(0, -1) : v.length >= 9 ? v : (v + k).replace(/^0+/, ''))
  }
  function agregarOtro() {
    const n = parseInt(otro || '0', 10)
    if (n > 0) {
      setCarrito(prev => [...prev, { id: `OTRO-${Date.now()}`, articulo: 'OTRO', nombre: 'Otro producto', foto: '', precioUnitario: n, costoUnitario: 0, cantidad: 1 }])
      registrarLog({ accion: 'OTRO_PRODUCTO', detalle: `Precio a mano ${fmt(n)}`, empleado, resultado: 'OK' })
    }
    setOtroAbierto(false); setOtro('')
  }

  async function cerrar() {
    if (!puedeCerrar) return
    const m = METODOS_SIMPLE.find(x => x.valor === metodo)
    setSaving(true); setError('')
    try {
      const items = carrito.map(({ id, ...i }) => ({ ...i, id: i.articulo }))
      const idVenta = await registrarVenta({ items, metodoPago: metodo, empleado, cargadaPor: perfilNombre, promos: [], posnet: '', notas: '' })
      sonarVentaGuardada()
      setGuardada({ idVenta, total, metodo: m.corto, metodoValor: metodo, carrito, empleado })
      setCarrito([]); setMetodo(null)
      onVentaRegistrada?.()
    } catch (e) {
      console.error(e)
      setError('No se pudo guardar la venta. Revisá que haya internet y tocá CERRAR VENTA otra vez.')
      registrarLog({ accion: 'VENTA_ERROR', detalle: `Pantalla simple · ${e?.message || e}`.slice(0, 400), empleado, resultado: 'ERROR' })
    } finally {
      setSaving(false)
    }
  }

  async function deshacer() {
    if (!guardada || deshaciendo) return
    setDeshaciendo(true)
    try {
      await anularVenta(guardada.idVenta, guardada.empleado)
      setCarrito(guardada.carrito); setMetodo(guardada.metodoValor)
      setGuardada(null)
      onVentaRegistrada?.()
    } catch (e) {
      console.error(e)
      setError('No se pudo deshacer la venta. Avisale a un encargado.')
      setGuardada(null)
    } finally {
      setDeshaciendo(false)
    }
  }

  // ── Columnas ───────────────────────────────────────────────────────────────
  const colProductos = (
    <section style={angosto ? S.bloque : S.col}>
      <div style={S.colHeader}><span style={S.colTitle}>PRODUCTOS</span>{loadingArticulos && <span style={{ color: 'var(--accent-text)', fontSize: 14 }}>Cargando…</span>}</div>
      <div style={S.buscador}>
        <span style={{ color: 'var(--muted)', display: 'flex' }}><Icono tipo="lupa" size={26} /></span>
        <input style={S.buscadorInput} value={busqueda} onChange={e => setBusqueda(e.target.value)} placeholder="Buscar producto…" aria-label="Buscar producto" />
        {busqueda && <button style={S.limpiar} onClick={() => setBusqueda('')} aria-label="Borrar búsqueda">✕</button>}
      </div>
      <div style={angosto ? { ...S.chips, gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', maxHeight: 'none' } : S.chips}>
        {categorias.length > 0 && (
          <button style={cat === TODAS && !busqueda ? S.chipOn : S.chip} onClick={() => { setCat(TODAS); setBusqueda('') }}>Todos</button>
        )}
        {categorias.map(c => (
          <button key={c} style={cat === c && !busqueda ? S.chipOn : S.chip} onClick={() => { setCat(c); setBusqueda('') }}>{c}</button>
        ))}
        <button style={S.chipOtro} onClick={() => { setOtro(''); setOtroAbierto(true) }}>+ Otro</button>
      </div>
      <div style={angosto ? S.listaAngosta : S.lista}>
        {lista.map(a => {
          const q = cantDe(a.id)
          return (
            <button key={a.id} style={S.artRow} onClick={() => agregar(a)} aria-label={`Agregar ${a.nombre}`}>
              <div style={{ position: 'relative' }}>
                <FotoProducto src={a.foto} size={76} />
                {q > 0 && <span style={S.globo}>{q}</span>}
              </div>
              <span style={S.artNombre}>{a.nombre}</span>
              <span style={S.artPrecio}>{fmt(a.precioUnitario)}</span>
            </button>
          )
        })}
        {!loadingArticulos && lista.length === 0 && <div style={S.vacio}>No hay productos{busqueda ? ' con ese nombre' : ''}</div>}
      </div>
    </section>
  )

  const colVenta = (
    <section style={angosto ? S.bloque : S.col}>
      <div style={S.colHeader}>
        <span style={S.colTitle}>ESTA VENTA</span>
        {unidades > 0 && <span style={S.badge}>{unidades}</span>}
      </div>
      <div style={angosto ? undefined : S.lista}>
        {carrito.length === 0 && (
          <div style={S.carritoVacio}><Icono tipo="carrito" size={64} /><span>Tocá un producto<br />para agregarlo</span></div>
        )}
        {carrito.map(i => (
          <div key={i.id} style={S.cartItem}>
            <FotoProducto src={i.foto} size={64} />
            <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span style={S.cartNombre}>{i.nombre}</span>
              <span style={S.cartUnit}>{fmt(i.precioUnitario)} c/u</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6, flexShrink: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <button style={S.qtyBtn} onClick={() => cambiarCant(i.id, -1)} aria-label="Quitar uno"><Icono tipo="menos" size={24} /></button>
                <span style={S.qty}>{i.cantidad}</span>
                <button style={S.qtyBtn} onClick={() => cambiarCant(i.id, 1)} aria-label="Agregar uno"><Icono tipo="mas" size={24} /></button>
              </div>
              <span style={S.cartLinea}>{fmt(i.precioUnitario * i.cantidad)}</span>
            </div>
          </div>
        ))}
      </div>
    </section>
  )

  const colTotal = (
    <section style={angosto ? S.bloque : { ...S.col, borderRight: 'none' }}>
      <div style={S.colHeader}><span style={S.colTitle}>TOTAL VENTA</span></div>
      <div style={S.totalPanel}>
        <div>
          <div style={S.total}>{fmt(total)}</div>
          <div style={S.totalLabel}>TOTAL</div>
        </div>
        {pideVendedor && (<>
          <div style={S.divider} />
          <div style={S.fieldLabel}>VENDE</div>
          <div style={S.vendedores}>
            {vendedores.map(n => (
              <button key={n} style={vendedor === n ? S.vendOn : S.vend} onClick={() => elegirVendedor(n)} aria-pressed={vendedor === n}>{n}</button>
            ))}
          </div>
        </>)}
        <div style={S.divider} />
        <div style={S.fieldLabel}>MÉTODO DE PAGO</div>
        <div style={S.metodos}>
          {METODOS_SIMPLE.map(m => (
            <button key={m.valor} style={metodo === m.valor ? S.metodoOn : S.metodo} onClick={() => setMetodo(m.valor)} aria-pressed={metodo === m.valor}>
              <Icono tipo={m.icono} size={34} />
              <span style={S.metodoLabel}>{m.label}</span>
            </button>
          ))}
        </div>
        {error && <div style={S.error} role="alert">{error}</div>}
        <div style={{ flex: 1 }} />
        {puedeCerrar
          ? <button style={S.cerrarBtn} onClick={cerrar}>Cerrar venta · {fmt(total)}</button>
          : <button style={S.cerrarOff} disabled>{ayudaCerrar}</button>}
        <button style={{ ...S.reiniciarBtn, opacity: carrito.length ? 1 : 0.5 }} onClick={reiniciar} disabled={!carrito.length || saving}>Reiniciar carrito</button>
      </div>
    </section>
  )

  return (
    <div style={angosto ? S.layoutAngosto : S.layout}>
      {colProductos}
      {colVenta}
      {colTotal}

      {guardada && (
        <div style={S.overlay}>
          <div style={S.okBox} role="dialog" aria-label="Venta guardada">
            <div style={S.okCirculo}><Icono tipo="ok" size={88} /></div>
            <div style={S.okTitulo}>¡VENTA GUARDADA!</div>
            <div style={S.okDetalle}>{fmt(guardada.total)} · {guardada.metodo}</div>
            <div style={S.okBotones}>
              <button style={S.deshacerBtn} onClick={deshacer} disabled={deshaciendo}>{deshaciendo ? 'Deshaciendo…' : 'Me equivoqué, deshacer'}</button>
              <button style={S.nuevaBtn} onClick={() => setGuardada(null)} disabled={deshaciendo}>Nueva venta</button>
            </div>
          </div>
        </div>
      )}

      {otroAbierto && (
        <div style={S.overlay} onClick={() => setOtroAbierto(false)}>
          <div style={S.tecladoBox} onClick={e => e.stopPropagation()} role="dialog" aria-label="Otro producto">
            <div style={S.tecladoTitulo}>OTRO PRODUCTO · PRECIO</div>
            <div style={S.tecladoVisor}>{fmt(parseInt(otro || '0', 10))}</div>
            <div style={S.teclas}>
              {['1','2','3','4','5','6','7','8','9','000','0','del'].map(k => (
                <button key={k} style={S.tecla} onClick={() => tecla(k)} aria-label={k === 'del' ? 'Borrar' : k}>{k === 'del' ? '⌫' : k}</button>
              ))}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 10 }}>
              <button style={S.cancelar} onClick={() => setOtroAbierto(false)}>Cancelar</button>
              <button style={S.agregar} onClick={agregarOtro}>AGREGAR</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const CONDENSED = 'Barlow Condensed, sans-serif'
const metodoBase = { height: 80, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 12, cursor: 'pointer', padding: '0 6px' }
const chipBase = { minHeight: 54, padding: '4px 8px', borderRadius: 10, fontFamily: CONDENSED, fontSize: 20, lineHeight: 1.05, letterSpacing: 0.5, textTransform: 'uppercase', cursor: 'pointer', overflowWrap: 'anywhere' }
const vendBase = { minHeight: 52, padding: '0 12px', borderRadius: 10, fontFamily: CONDENSED, fontWeight: 700, fontSize: 22, cursor: 'pointer' }

const S = {
  layout: { display: 'grid', gridTemplateColumns: '1.3fr 1fr 1fr', height: '100%', width: '100%', overflow: 'hidden', position: 'relative', fontFamily: 'Barlow, sans-serif', color: 'var(--text)' },
  layoutAngosto: { display: 'flex', flexDirection: 'column', height: '100%', width: '100%', overflowY: 'auto', position: 'relative', fontFamily: 'Barlow, sans-serif', color: 'var(--text)' },
  col: { display: 'flex', flexDirection: 'column', minWidth: 0, minHeight: 0, borderRight: '2px solid var(--border)', overflow: 'hidden' },
  bloque: { display: 'flex', flexDirection: 'column', borderBottom: '2px solid var(--border)' },
  colHeader: { display: 'flex', alignItems: 'center', gap: 10, minHeight: 52, padding: '0 18px', background: 'var(--surface2)', borderBottom: '2px solid var(--accent)', flexShrink: 0 },
  colTitle: { fontFamily: CONDENSED, fontWeight: 800, fontSize: 22, letterSpacing: 2, color: 'var(--accent-text)' },
  badge: { background: 'var(--accent)', color: 'var(--on-accent)', fontFamily: CONDENSED, fontWeight: 800, fontSize: 18, borderRadius: 20, padding: '2px 12px' },
  buscador: { display: 'flex', alignItems: 'center', gap: 8, margin: '12px 14px 0', padding: '0 12px', border: '1.5px solid var(--border)', borderRadius: 10, background: 'var(--surface)', flexShrink: 0 },
  buscadorInput: { flex: 1, minWidth: 0, height: 52, background: 'none', border: 'none', outline: 'none', color: 'var(--text)', fontFamily: 'Barlow, sans-serif', fontSize: 21 },
  limpiar: { width: 44, height: 44, background: 'none', border: 'none', color: 'var(--muted)', fontSize: 22, cursor: 'pointer' },
  chips: { display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8, padding: '12px 14px', borderBottom: '1px solid var(--border)', flexShrink: 0, maxHeight: 190, overflowY: 'auto' },
  chip: { ...chipBase, fontWeight: 700, border: '1.5px solid var(--border)', background: 'var(--surface2)', color: 'var(--text)' },
  chipOn: { ...chipBase, fontWeight: 700, border: '1.5px solid var(--accent)', background: 'var(--accent)', color: 'var(--on-accent)' },
  chipOtro: { ...chipBase, fontWeight: 700, border: '1.5px dashed var(--muted)', background: 'transparent', color: 'var(--text)' },
  lista: { flex: 1, minHeight: 0, overflowY: 'auto' },
  listaAngosta: { maxHeight: '60vh', overflowY: 'auto' },
  artRow: { width: '100%', display: 'flex', alignItems: 'center', gap: 14, padding: '12px 16px', background: 'none', border: 'none', borderBottom: '1px solid var(--border)', color: 'var(--text)', textAlign: 'left', cursor: 'pointer' },
  globo: { position: 'absolute', top: -8, right: -8, minWidth: 34, height: 34, padding: '0 8px', borderRadius: 17, background: 'var(--accent)', color: 'var(--on-accent)', fontFamily: CONDENSED, fontWeight: 800, fontSize: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', boxSizing: 'border-box' },
  artNombre: { flex: 1, minWidth: 0, fontWeight: 600, fontSize: 24, lineHeight: 1.15 },
  artPrecio: { flexShrink: 0, fontFamily: CONDENSED, fontWeight: 800, fontSize: 30, color: 'var(--accent-text)' },
  vacio: { padding: 32, textAlign: 'center', color: 'var(--muted)', fontSize: 20 },
  carritoVacio: { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14, padding: '48px 24px', color: 'var(--muted)', textAlign: 'center', fontSize: 22, lineHeight: 1.3 },
  cartItem: { display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', borderBottom: '1px solid var(--border)' },
  cartNombre: { fontWeight: 600, fontSize: 21, lineHeight: 1.15 },
  cartUnit: { fontFamily: CONDENSED, fontSize: 18, color: 'var(--muted)' },
  qtyBtn: { width: 50, height: 50, border: 'none', borderRadius: 8, background: 'var(--border)', color: 'var(--text)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' },
  qty: { minWidth: 30, textAlign: 'center', fontFamily: CONDENSED, fontWeight: 700, fontSize: 26 },
  cartLinea: { fontFamily: CONDENSED, fontWeight: 700, fontSize: 22, color: 'var(--accent-text)' },
  totalPanel: { flex: 1, minHeight: 0, overflowY: 'auto', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 10 },
  total: { fontFamily: CONDENSED, fontWeight: 800, fontSize: 62, lineHeight: 1, color: 'var(--accent-text)' },
  totalLabel: { fontFamily: CONDENSED, fontSize: 18, letterSpacing: 2, color: 'var(--muted)' },
  divider: { height: 1, background: 'var(--border)' },
  fieldLabel: { fontFamily: CONDENSED, fontSize: 18, letterSpacing: 1, color: 'var(--accent-text)' },
  vendedores: { display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8 },
  vend: { ...vendBase, border: '3px solid var(--border)', background: 'var(--surface2)', color: 'var(--text)' },
  vendOn: { ...vendBase, border: '3px solid var(--accent)', background: 'rgba(245, 200, 0, 0.16)', color: 'var(--accent-text)' },
  metodos: { display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 },
  // Mismo borde y letra elegido o no: así el texto no se mueve al tocarlo
  metodo: { ...metodoBase, border: '3px solid var(--border)', background: 'var(--surface2)', color: 'var(--text)' },
  metodoOn: { ...metodoBase, border: '3px solid var(--accent)', background: 'rgba(245, 200, 0, 0.16)', color: 'var(--accent-text)' },
  metodoLabel: { fontFamily: CONDENSED, fontWeight: 700, fontSize: 23, letterSpacing: 0.5, lineHeight: 1.05, textAlign: 'center', whiteSpace: 'pre-line' },
  error: { padding: '12px 14px', borderRadius: 10, border: '2px solid #ef4444', background: 'rgba(239, 68, 68, 0.1)', color: 'var(--text)', fontSize: 19, lineHeight: 1.3 },
  cerrarBtn: { minHeight: 84, border: 'none', borderRadius: 12, background: 'var(--accent)', color: 'var(--on-accent)', fontFamily: CONDENSED, fontWeight: 800, fontSize: 30, letterSpacing: 1, textTransform: 'uppercase', cursor: 'pointer', boxShadow: '0 3px 12px rgba(245, 200, 0, 0.3)', flexShrink: 0 },
  cerrarOff: { minHeight: 84, border: '1.5px dashed var(--border)', borderRadius: 12, background: 'var(--surface)', color: 'var(--muted)', fontFamily: CONDENSED, fontWeight: 700, fontSize: 24, letterSpacing: 1, textTransform: 'uppercase', cursor: 'default', flexShrink: 0 },
  reiniciarBtn: { minHeight: 50, border: '1.5px solid var(--border)', borderRadius: 10, background: 'none', color: 'var(--muted)', fontFamily: CONDENSED, fontWeight: 700, fontSize: 18, letterSpacing: 1, textTransform: 'uppercase', cursor: 'pointer', flexShrink: 0 },
  overlay: { position: 'fixed', inset: 0, background: 'var(--overlay)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 300, padding: 16 },
  okBox: { width: 600, maxWidth: '100%', boxSizing: 'border-box', padding: '40px 36px', borderRadius: 20, border: '2px solid var(--success)', background: 'var(--surface)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 18 },
  okCirculo: { width: 140, height: 140, borderRadius: 70, background: '#22c55e', color: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  okTitulo: { fontFamily: CONDENSED, fontWeight: 800, fontSize: 48, letterSpacing: 2, color: 'var(--success)', textAlign: 'center' },
  okDetalle: { fontFamily: CONDENSED, fontWeight: 700, fontSize: 34, color: 'var(--text)' },
  okBotones: { display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12, width: '100%', marginTop: 8 },
  deshacerBtn: { minHeight: 80, border: '1.5px solid var(--muted)', borderRadius: 12, background: 'none', color: 'var(--text)', fontFamily: CONDENSED, fontWeight: 700, fontSize: 24, letterSpacing: 0.5, textTransform: 'uppercase', cursor: 'pointer' },
  nuevaBtn: { minHeight: 80, border: 'none', borderRadius: 12, background: 'var(--accent)', color: 'var(--on-accent)', fontFamily: CONDENSED, fontWeight: 800, fontSize: 26, letterSpacing: 1, textTransform: 'uppercase', cursor: 'pointer' },
  tecladoBox: { width: 480, maxWidth: '100%', boxSizing: 'border-box', padding: 28, borderRadius: 20, border: '2px solid var(--border)', background: 'var(--surface)', display: 'flex', flexDirection: 'column', gap: 14 },
  tecladoTitulo: { fontFamily: CONDENSED, fontWeight: 800, fontSize: 28, letterSpacing: 2, color: 'var(--accent-text)', textAlign: 'center' },
  tecladoVisor: { height: 84, borderRadius: 12, border: '1.5px solid var(--border)', background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', padding: '0 22px', fontFamily: CONDENSED, fontWeight: 800, fontSize: 54, color: 'var(--accent-text)' },
  teclas: { display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 10 },
  tecla: { height: 72, border: '1.5px solid var(--border)', borderRadius: 12, background: 'var(--surface2)', color: 'var(--text)', fontFamily: CONDENSED, fontWeight: 800, fontSize: 32, cursor: 'pointer' },
  cancelar: { height: 72, border: '1.5px solid var(--border)', borderRadius: 10, background: 'none', color: 'var(--muted)', fontSize: 22, cursor: 'pointer' },
  agregar: { height: 72, border: 'none', borderRadius: 10, background: 'var(--accent)', color: 'var(--on-accent)', fontFamily: CONDENSED, fontWeight: 800, fontSize: 26, letterSpacing: 1, cursor: 'pointer' },
}
