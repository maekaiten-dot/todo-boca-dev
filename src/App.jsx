// src/App.jsx
import { useState, useEffect, useRef, lazy, Suspense } from 'react'
import NuevaVenta from './pages/NuevaVenta.jsx'
import VentasDelDia from './pages/VentasDelDia.jsx'
import VenderSimple from './pages/VenderSimple.jsx'
import HoySimple from './pages/HoySimple.jsx'
import { LOCAL, TEMA, cssVariablesTema } from './config/local.js'
import FicharTablet from './components/FicharTablet.jsx'
import AvisoPrecios, { totalCambios, resumenCambios } from './components/AvisoPrecios.jsx'
import { BotonModoPartido, BarraModoPartido } from './components/ModoPartido.jsx'
import { escucharCola, procesarCola } from './lib/colaVentas.js'
import { calcularMasVendidos } from './lib/masVendidos.js'
import { prepararGuardadoVentas, getModoPartido, setModoPartido, setModoPartidoLog, getHistoricoVentas, getPromos, getAlias, getArticulos, cargarCodigosProveedor, getUsuarios, registrarLog, calcularStockTodos, leerArticulosVistos, guardarArticulosVistos, getTutoriales, leerTutorialesVistos, guardarTutorialesVistos, getConfig, getPagos, leerPagosVistos, guardarPagosVistos, leerPagosPropios, limpiarPagosPropios, firmaPago } from './api/sheets.js'
import { datoVisto, calcularCambiosArticulos, vistoDespues, unirCambios, detalleLogCambios, calcularCambiosPagos } from './lib/novedades.js'
import { tocaRevisar, CLAVES_REPOSICION, REPOSICION_DEFAULT, puedeVerReposicion } from './lib/reposicion.js'
// Las solapas que no son Vender ni Hoy se bajan aparte (la app abre más rápido). Unos segundos
// después de abrir se precargan en segundo plano, así al tocarlas ya están.
const CARGAS = {
  LogVentas: () => import('./pages/LogVentas.jsx'),
  Estadisticas: () => import('./pages/Estadisticas.jsx'),
  Articulos: () => import('./pages/Articulos.jsx'),
  Ingresos: () => import('./pages/Ingresos.jsx'),
  Pagos: () => import('./pages/Pagos.jsx'),
  Rotacion: () => import('./pages/Rotacion.jsx'),
  GastosCaja: () => import('./pages/GastosCaja.jsx'),
  Tutoriales: () => import('./pages/Tutoriales.jsx'),
  Conteo: () => import('./pages/Conteo.jsx'),
  Fichadas: () => import('./pages/Fichadas.jsx'),
  Asistencia: () => import('./pages/Asistencia.jsx'),
  Administracion: () => import('./pages/Administracion.jsx'),
  Promos: () => import('./pages/Promos.jsx'),
  CobrosMP: () => import('./pages/CobrosMP.jsx'),
  Reposicion: () => import('./pages/Reposicion.jsx'),
  Rentabilidad: () => import('./pages/Rentabilidad.jsx'),
}
const LogVentas = lazy(CARGAS.LogVentas)
const Estadisticas = lazy(CARGAS.Estadisticas)
const Articulos = lazy(CARGAS.Articulos)
const Ingresos = lazy(CARGAS.Ingresos)
const Pagos = lazy(CARGAS.Pagos)
const Rotacion = lazy(CARGAS.Rotacion)
const GastosCaja = lazy(CARGAS.GastosCaja)
const Tutoriales = lazy(CARGAS.Tutoriales)
const Conteo = lazy(CARGAS.Conteo)
const Fichadas = lazy(CARGAS.Fichadas)
const Asistencia = lazy(CARGAS.Asistencia)
const Administracion = lazy(CARGAS.Administracion)
const Promos = lazy(CARGAS.Promos)
const CobrosMP = lazy(CARGAS.CobrosMP)
const Reposicion = lazy(CARGAS.Reposicion)
const Rentabilidad = lazy(CARGAS.Rentabilidad)
const precargarSolapas = () => Object.values(CARGAS).forEach(f => f().catch(() => {}))
const CargandoSolapa = () => <div style={{ padding: 24, fontFamily: 'Barlow, sans-serif', color: 'var(--muted)' }}>Cargando…</div>


// Aviso de cambios en artículos (precios, productos nuevos, activados / desactivados): cada dispositivo
// guarda los artículos que ya vio y la app vuelve a leer ARTICULOS cada INTERVALO_PRECIOS (y al volver
// a la pestaña). Si algo cambió, se actualiza
// sin recargar la página y se avisa: en la tablet (perfiles Caja) con el recuadro por encima de todo,
// hasta tocar "Entendido"; a los Admin, con un aviso chico arriba que abre el detalle si lo tocan.
// Los cambios guardados desde este mismo dispositivo se marcan como vistos (no avisan a quien los hizo).
const INTERVALO_PRECIOS = 90 * 1000
const firmaArticulos = arts => arts.map(a => `${a.id}|${a.precioUnitario}|${a.costoUnitario}|${a.nombre}|${a.foto}|${a.grupo || ""}`).join('\n')

// Nombre y color de la pestaña del navegador según el local
if (typeof document !== 'undefined') {
  document.title = LOCAL.nombre
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', TEMA.metaColor)
}

// Barra inferior: solapas de uso diario. El resto de las solapas de Admin va en el menú "Más".
const TABS_POR_TIPO = {
  Admin: [{ id:'venta', label:'Vender', icon:'🛒' }, { id:'hoy', label:'Hoy', icon:'📊' }, { id:'caja', label:'Gastos', icon:'🧾' }, { id:'log', label:'Historial', icon:'📋' }, { id:'arts', label:'Arts.', icon:'📦' }],
  Caja:  [{ id:'venta', label:'Vender', icon:'🛒' }, { id:'hoy', label:'Hoy', icon:'📊' }, { id:'caja', label:'Gastos', icon:'🧾' }, { id:'conteo', label:'Conteo', icon:'🔢' }, { id:'arts', label:'Arts.', icon:'📦' }, { id:'asis', label:'Asistencia', icon:'🗓' }, { id:'tutos', label:'Tutoriales', icon:'📘' }],
}
// Solapas del menú "Más" (solo Admin). Para agregar una nueva, sumala acá y renderizala abajo con esAdmin.
const TABS_MAS_ADMIN = [
  { id:'stats', label:'Estadísticas', icon:'📈', desc:'Ventas por día y por mes' },
  { id:'rota', label:'Rotación', icon:'🔄', desc:'Más vendidos y reposición' },
  { id:'repo', label:'Reposición', icon:'🚚', desc:'Qué pedir, por urgencia o por proveedor' },
  { id:'rent', label:'Rentabilidad', icon:'💰', desc:'Margen real y GMROI por artículo' },
  { id:'promos', label:'Promos', icon:'🏷️', desc:'Armar promos y ver si funcionan' },
  { id:'ing', label:'Ingresos', icon:'📥', desc:'Mercadería que entró' },
  { id:'pagos', label:'Pagos', icon:'💳', desc:'Pagos a proveedores y gastos' },
  { id:'conteo', label:'Conteo y stock', icon:'🔢', desc:'Contar, bajas y diferencias' },
  { id:'tutos', label:'Tutoriales', icon:'📘', desc:'Instructivos para el equipo' },
  { id:'asis', label:'Asistencia', icon:'🗓', desc:'Tardes, francos y fichadas faltantes' },
  { id:'fich', label:'Fichadas', icon:'⏱', desc:'Tablet y celulares para fichar' },
  { id:'admin', label:'Administración', icon:'🔒', desc:'Cierre de mes, regalías, cuentas y ahorros' },
  { id:'mp', label:'Mercado Pago', icon:'💙', desc:'Cobros del Point y QR, y control contra las ventas' },
]

// Solapas según el local (src/config/local.js). Sin configuración: las de siempre.
const TODAS_LAS_TABS = [...TABS_POR_TIPO.Admin, ...TABS_POR_TIPO.Caja, ...TABS_MAS_ADMIN]
  .filter((t, i, arr) => arr.findIndex(x => x.id === t.id) === i)
const tabsPorIds = ids => (ids || []).map(id => TODAS_LAS_TABS.find(t => t.id === id)).filter(Boolean)
function tabsDelLocal(tipoKey) {
  if (!LOCAL.solapas) return TABS_POR_TIPO[tipoKey] || TABS_POR_TIPO['Caja']
  return tabsPorIds(LOCAL.solapas[tipoKey] || LOCAL.solapas.Caja)
}
function tabsMasDelLocal(esAdmin) {
  if (!esAdmin) return []
  return (LOCAL.solapas ? tabsPorIds(LOCAL.solapas.mas) : TABS_MAS_ADMIN).filter(t => t.id !== 'mp' || LOCAL.planillaMP)
}

function MenuMas({ tabs, tabActual, onElegir, onCerrar }) {
  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape') onCerrar() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCerrar])
  return (
    <div style={M.overlay} onClick={onCerrar}>
      <div style={M.sheet} onClick={e => e.stopPropagation()} role="dialog" aria-label="Más secciones">
        <div style={M.handle} />
        <div style={M.title}>Más secciones</div>
        <div style={M.grid}>
          {tabs.map(t => (
            <button key={t.id} style={{ ...M.item, ...(tabActual === t.id ? M.itemActivo : {}) }} onClick={() => onElegir(t.id)}>
              <span style={M.icon}>{t.icon}</span>
              <span style={M.label}>{t.label}</span>
              <span style={M.desc}>{t.desc}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

const M = {
  overlay: { position:'fixed', inset:0, background:'rgba(0,0,10,0.6)', zIndex:400, display:'flex', alignItems:'flex-end', justifyContent:'center' },
  // maxHeight + scroll: si no entran todas las secciones (pantallas bajas o zoom), se puede bajar dentro del menú
  sheet: { width:'100%', maxWidth:900, maxHeight:'88dvh', overflowY:'auto', overscrollBehavior:'contain', background:'var(--surface)', borderTop:'2px solid var(--accent)', borderRadius:'18px 18px 0 0', padding:'10px 16px calc(16px + env(safe-area-inset-bottom, 0px))', display:'flex', flexDirection:'column', gap:12, boxSizing:'border-box' },
  handle: { width:40, height:4, borderRadius:2, background:'var(--border)', alignSelf:'center' },
  title: { fontFamily:'Barlow Condensed, sans-serif', fontWeight:800, fontSize:18, color:'var(--muted)', letterSpacing:1.5, textTransform:'uppercase' },
  grid: { display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(150px, 1fr))', gap:10 },
  item: { display:'flex', flexDirection:'column', alignItems:'flex-start', gap:2, padding:'14px', background:'var(--surface2)', border:'1.5px solid var(--border)', borderRadius:12, cursor:'pointer', textAlign:'left' },
  itemActivo: { borderColor:'var(--accent)' },
  icon: { fontSize:22, marginBottom:4 },
  label: { fontFamily:'Barlow Condensed, sans-serif', fontWeight:800, fontSize:18, color:'var(--text)', letterSpacing:0.5 },
  desc: { fontFamily:'Barlow, sans-serif', fontSize:12, color:'var(--muted)', lineHeight:1.3 },
}

function PinModal({ onConfirm, onCancel, usuario }) {
  const [pin, setPin] = useState('')
  const [error, setError] = useState(false)
  const [shake, setShake] = useState(false)
  const codigoEsperado = String(usuario?.codigo || '').trim()

  function presionar(digit) { if (pin.length >= 6) return; setPin(p => p + digit); setError(false) }
  function borrar() { setPin(p => p.slice(0, -1)); setError(false) }
  function confirmar() {
    if (codigoEsperado && pin.trim() === codigoEsperado) { onConfirm() }
    else { setError(true); setShake(true); setPin(''); setTimeout(() => setShake(false), 500) }
  }
  function handleKey(e) {
    if (e.key >= '0' && e.key <= '9') presionar(e.key)
    else if (e.key === 'Backspace') borrar()
    else if (e.key === 'Enter') confirmar()
    else if (e.key === 'Escape') onCancel()
  }
  useEffect(() => { window.addEventListener('keydown', handleKey); return () => window.removeEventListener('keydown', handleKey) }, [pin])

  return (
    <div style={P.overlay} onClick={onCancel}>
      <div style={{...P.box, ...(shake ? {transform:'translateX(6px)'} : {})}} onClick={e => e.stopPropagation()}>
        <div style={P.title}>CÓDIGO DE ACCESO</div>
        <div style={P.subtitle}>{usuario?.nombre} · ingresá tu código</div>
        <div style={P.dots}>{[0,1,2,3,4,5].map(i => <div key={i} style={{...P.dot, ...(i < pin.length ? P.dotFilled : {}), ...(error ? P.dotError : {})}} />)}</div>
        {error && <div style={P.errorMsg}>Código incorrecto</div>}
        <div style={P.grid}>
          {['1','2','3','4','5','6','7','8','9','','0','⌫'].map((k, i) => (
            <button key={i} style={{...P.key, ...(k==='' ? P.keyEmpty : {}), ...(k==='⌫' ? P.keyDel : {})}}
              onClick={() => { if (k==='⌫') borrar(); else if (k!=='') presionar(k) }} disabled={k===''}>
              {k}
            </button>
          ))}
        </div>
        <div style={{display:'flex', gap:10, width:'100%'}}>
          <button style={P.cancelBtn} onClick={onCancel}>Cancelar</button>
          <button style={{...P.confirmBtn, opacity: pin.length===0 ? 0.5 : 1}} onClick={confirmar} disabled={pin.length===0}>Ingresar</button>
        </div>
      </div>
    </div>
  )
}

const P = {
  overlay: { position:'fixed', inset:0, background:'rgba(0,0,10,0.9)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:500, backdropFilter:'blur(8px)' },
  box: { background:'var(--surface)', border:'2px solid var(--border)', borderRadius:20, padding:'32px 28px', width:320, display:'flex', flexDirection:'column', alignItems:'center', gap:16, transition:'transform 0.1s' },
  title: { fontFamily:'Barlow Condensed, sans-serif', fontWeight:800, fontSize:26, color:'var(--accent-text)', letterSpacing:2, textTransform:'uppercase' },
  subtitle: { fontFamily:'Barlow, sans-serif', fontSize:14, color:'var(--muted)', marginTop:-8 },
  dots: { display:'flex', gap:12, margin:'8px 0' },
  dot: { width:14, height:14, borderRadius:'50%', border:'2px solid var(--border)', background:'transparent', transition:'all 0.15s' },
  dotFilled: { background:'var(--accent)', border:'2px solid var(--accent)' },
  dotError: { border:'2px solid #ef4444' },
  errorMsg: { fontFamily:'Barlow Condensed, sans-serif', fontWeight:700, fontSize:15, color:'#ef4444', marginTop:-8 },
  grid: { display:'grid', gridTemplateColumns:'repeat(3, 1fr)', gap:10, width:'100%' },
  key: { height:60, background:'var(--surface2)', border:'1.5px solid var(--border)', borderRadius:12, color:'var(--text)', fontFamily:'Barlow Condensed, sans-serif', fontWeight:800, fontSize:24, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' },
  keyEmpty: { background:'transparent', border:'none', cursor:'default' },
  keyDel: { color:'var(--muted)', fontSize:20 },
  cancelBtn: { flex:1, padding:'13px', background:'none', border:'1.5px solid var(--border)', borderRadius:10, color:'var(--muted)', fontFamily:'Barlow, sans-serif', fontSize:15, cursor:'pointer' },
  confirmBtn: { flex:2, padding:'13px', background:'var(--accent)', border:'none', borderRadius:10, color:'#000', fontFamily:'Barlow Condensed, sans-serif', fontWeight:800, fontSize:17, cursor:'pointer', letterSpacing:1 },
}

export default function App() {
  const [tab, setTab] = useState('venta')
  const [refreshKey, setRefreshKey] = useState(0)
  const [articulos, setArticulos] = useState([])
  // Promos configurables (hoja PROMOS): se releen junto con los artículos
  const [promos, setPromos] = useState([])
  const cargarPromos = () => getPromos().then(setPromos).catch(e => console.warn('No se pudieron leer las promos', e))
  const [loadingArticulos, setLoadingArticulos] = useState(true)
  const [usuarios, setUsuarios] = useState([])
  const [loadingUsuarios, setLoadingUsuarios] = useState(true)
  const [stockMap, setStockMap] = useState({})
  const [logoTaps, setLogoTaps] = useState(0)
  const [logoTapTimer, setLogoTapTimer] = useState(null)
  const [pinPendiente, setPinPendiente] = useState(null)
  const [tabsVisitadas, setTabsVisitadas] = useState(new Set(['venta']))
  const [menuMasAbierto, setMenuMasAbierto] = useState(false)

  const [perfilGuardado, setPerfilGuardado] = useState(() => {
    try { return JSON.parse(localStorage.getItem('tb_perfil_v2')) || null }
    catch { return null }
  })

  const [cambiosPrecio, setCambiosPrecio] = useState(null)
  // Tutoriales nuevos que este dispositivo todavía no vio (van en el mismo aviso)
  const [tutosNuevos, setTutosNuevos] = useState([])
  const [versionTutos, setVersionTutos] = useState(0)
  const tutosRef = useRef([])
  // Admin: pagos que cargó el otro Admin y este dispositivo todavía no vio (van en el mismo aviso)
  const [cambiosPagos, setCambiosPagos] = useState([])
  const pagosRef = useRef([])
  const avisoCambios = (cambiosPrecio || tutosNuevos.length || cambiosPagos.length) ? { ...(cambiosPrecio || {}), tutoriales: tutosNuevos, pagos: cambiosPagos } : null
  // Tablet (LOCAL.avisoPorEmpleada): cada empleada tiene su aviso hasta que toca su nombre
  const [artPorPersona, setArtPorPersona] = useState({})   // nombre → cambios en artículos
  const [tutPorPersona, setTutPorPersona] = useState({})   // nombre → tutoriales nuevos
  const [avisoTablet, setAvisoTablet] = useState({ abierto: false, para: null })
  const usuariosRef = useRef([])
  usuariosRef.current = usuarios
  const [avisoReposicion, setAvisoReposicion] = useState(false)
  const [verAvisoPrecios, setVerAvisoPrecios] = useState(false) // Admin: abrió el detalle desde el aviso chico
  const perfilRef = useRef(perfilGuardado)
  perfilRef.current = perfilGuardado
  const articulosRef = useRef([])

  // ── Modo partido ─────────────────────────────────────────────────────────────
  // Lo prende un Admin y lo toman todos los dispositivos (hoja CONFIG, se revisa cada 30 s).
  // Prendido: las ventas van a una cola y se guardan en segundo plano, no se recalcula el stock
  // después de cada venta, no se releen los artículos cada 90 s y el LOG no anota cada producto.
  const [modo, setModo] = useState(() => { try { return JSON.parse(localStorage.getItem('tb_modo_partido')) || { activo: false, masVendidos: [] } } catch { return { activo: false, masVendidos: [] } } })
  const modoRef = useRef(modo)
  modoRef.current = modo
  const [cambiandoModo, setCambiandoModo] = useState(false)
  const [cola, setCola] = useState(null)
  setModoPartidoLog(modo.activo)
  function aplicarModo(m) {
    const antes = modoRef.current.activo
    setModo(m); modoRef.current = m
    try { localStorage.setItem('tb_modo_partido', JSON.stringify(m)) } catch {}
    setModoPartidoLog(m.activo)
    // Al apagarlo se pone todo al día
    if (antes && !m.activo) { setRefreshKey(k => k + 1); recalcularStock(articulosRef.current); refrescarArticulos() }
  }
  async function revisarModo() {
    try { aplicarModo(await getModoPartido()) } catch (e) { console.warn('No se pudo leer el modo partido', e) }
  }
  useEffect(() => {
    revisarModo()
    const id = setInterval(() => { if (document.visibilityState === 'visible') revisarModo() }, 30 * 1000)
    const alVolver = () => { if (document.visibilityState === 'visible') revisarModo() }
    document.addEventListener('visibilitychange', alVolver)
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', alVolver) }
  }, [])
  async function cambiarModo(activo) {
    setCambiandoModo(true)
    try {
      // Al prenderlo se arman los botones de lo más vendido (con las ventas de este dispositivo)
      let masVendidos = null
      if (activo) {
        try { masVendidos = calcularMasVendidos(await getHistoricoVentas({ unificar: true }), articulosRef.current) }
        catch (e) { console.warn('No se pudieron calcular los más vendidos', e) }
      }
      await setModoPartido(activo, perfilRef.current?.nombre || '', masVendidos)
      await revisarModo()
    } catch (e) { console.error(e); alert('No se pudo cambiar el modo partido. Revisá la conexión.') }
    finally { setCambiandoModo(false) }
  }
  // Cola de ventas: se sigue guardando al abrir la app (si quedó algo de antes) y se muestra el estado.
  // Cuando se vacía, Hoy se actualiza (como mucho una vez por minuto).
  useEffect(() => {
    let pendAntes = 0, ultimaRecarga = 0
    const off = escucharCola(e => {
      setCola(e)
      if (pendAntes > 0 && e.pendientes === 0 && Date.now() - ultimaRecarga > 60 * 1000) { ultimaRecarga = Date.now(); setRefreshKey(k => k + 1) }
      pendAntes = e.pendientes
    })
    procesarCola()
    return off
  }, [])

  useEffect(() => { cargarArticulos(); cargarUsuarios() }, [])

  // ── Aviso de novedades ──
  // En la tablet (perfiles Caja) del local con LOCAL.avisoPorEmpleada, lo visto se guarda por empleada
  // (USUARIOS con TIPO Caja, sin "Tablet"): el aviso sigue hasta que cada una toca su nombre, aunque
  // otra ya lo haya leído. En los demás casos, por dispositivo (como antes).
  const esPerfilAdmin = () => ['admin', 'supervisor'].includes(String(perfilRef.current?.tipo || '').toLowerCase())
  // (USUARIOS Caja sin "Tablet") + los que se agregan en LOCAL.avisoTabletTambien (ej. Adrián)
  const empleadasAviso = () => {
    const caja = usuariosRef.current
      .filter(u => String(u.tipo || 'Caja').toLowerCase() === 'caja' && u.nombre && u.nombre.toLowerCase() !== 'tablet')
      .map(u => u.nombre)
    if (!caja.length) return []
    const extra = (LOCAL.avisoTabletTambien || [])
      .map(n => usuariosRef.current.find(u => u.nombre?.toLowerCase() === n.toLowerCase())?.nombre || n)
      .filter(n => !caja.some(c => c.toLowerCase() === n.toLowerCase()))
    return [...caja, ...extra]
  }
  const porEmpleada = () => !!LOCAL.avisoPorEmpleada && !!perfilRef.current && !esPerfilAdmin()
  // La primera vez, cada empleada arranca con lo que había visto la tablet (así no se pierde lo pendiente);
  // una empleada que se suma después arranca sin avisos viejos
  const primeraVezPorEmpleada = clave => { try { if (localStorage.getItem(clave)) return false; localStorage.setItem(clave, '1'); return true } catch { return false } }

  // Compara los artículos activos con los que ya vio cada uno
  function detectarCambiosPrecio(arts) {
    const actuales = Object.fromEntries(arts.map(a => [a.id, datoVisto(a)]))
    if (porEmpleada()) {
      const personas = empleadasAviso()
      if (!personas.length) return   // todavía no se leyeron los usuarios: se revisa cuando lleguen
      const inicial = primeraVezPorEmpleada('tb_aviso_empleadas_art')
      const general = leerArticulosVistos()
      const res = {}
      for (const persona of personas) {
        let v = leerArticulosVistos(persona)
        if (!v) { v = (inicial && general) || { activos: actuales, inactivos: {} }; guardarArticulosVistos(v, persona) }
        const c = calcularCambiosArticulos(arts, v, getAlias())
        if (totalCambios(c)) res[persona] = c
        else if (arts.some(a => v.activos[a.id]?.n !== a.nombre)) guardarArticulosVistos({ ...v, activos: actuales }, persona)
      }
      setArtPorPersona(res)
      return
    }
    const v = leerArticulosVistos()
    if (!v) { guardarArticulosVistos({ activos: actuales, inactivos: {} }); return }
    const cambios = calcularCambiosArticulos(arts, v, getAlias())
    if (!totalCambios(cambios)) {
      // Sin cambios: solo se actualizan los nombres guardados si alguno cambió
      if (arts.some(a => v.activos[a.id]?.n !== a.nombre)) guardarArticulosVistos({ ...v, activos: actuales })
      setCambiosPrecio(null)
      return
    }
    setCambiosPrecio(cambios)
  }

  // Compara los tutoriales activos con los que ya vio cada uno
  function detectarTutoriales(todos) {
    // Los "solo Admin" no se avisan en la tablet de las empleadas ni a perfiles Caja
    const tutos = todos.filter(t => !t.soloAdmin || (esPerfilAdmin() && !porEmpleada()))
    const ids = tutos.map(t => t.id)
    if (ids.join('|') !== tutosRef.current.map(t => t.id).join('|')) setVersionTutos(v => v + 1)
    tutosRef.current = tutos
    const resumen = t => ({ id: t.id, titulo: t.titulo, descripcion: t.descripcion, subidoPor: t.subidoPor, fecha: t.fecha })
    if (porEmpleada()) {
      const personas = empleadasAviso()
      if (!personas.length) return
      const inicial = primeraVezPorEmpleada('tb_aviso_empleadas_tut')
      const general = leerTutorialesVistos()
      const res = {}
      for (const persona of personas) {
        let vistos = leerTutorialesVistos(persona)
        if (!vistos) { vistos = (inicial && general) || ids; guardarTutorialesVistos(vistos, persona) }
        const set = new Set(vistos), nuevos = tutos.filter(t => !set.has(t.id)).map(resumen)
        if (nuevos.length) res[persona] = nuevos
      }
      setTutPorPersona(res)
      return
    }
    const vistos = leerTutorialesVistos()
    if (!vistos) { guardarTutorialesVistos(ids); return }
    const vistosSet = new Set(vistos)
    setTutosNuevos(tutos.filter(t => !vistosSet.has(t.id)).map(resumen))
  }
  async function revisarTutoriales() {
    try { detectarTutoriales(await getTutoriales()) } catch (e) { console.warn('No se pudieron leer los tutoriales', e) }
  }

  // Admin: pagos que cargó el otro Admin (lo que se guarda desde este dispositivo no avisa)
  const hayPagos = () => esPerfilAdmin() && tabsMasDelLocal(true).some(t => t.id === 'pagos')
  // Cada 5 minutos como mucho (no en cada relectura de artículos): Google limita las lecturas por minuto
  const ultimaRevisionPagos = useRef(0)
  async function revisarPagos({ forzar = false } = {}) {
    if (!hayPagos()) return
    if (!forzar && Date.now() - ultimaRevisionPagos.current < 5 * 60 * 1000) return
    ultimaRevisionPagos.current = Date.now()
    try {
      const pagos = await getPagos({ rapido: true })
      pagosRef.current = pagos
      const vistos = leerPagosVistos()
      if (!vistos) { guardarPagosVistos(Object.fromEntries(pagos.map(p => [p.idPago, firmaPago(p)]))); return }
      const { items, absorbidos } = calcularCambiosPagos(pagos, vistos, leerPagosPropios())
      if (absorbidos.length) {
        const porId = Object.fromEntries(pagos.map(p => [p.idPago, p]))
        absorbidos.forEach(id => { vistos[id] = firmaPago(porId[id]) })
        guardarPagosVistos(vistos)
        limpiarPagosPropios(absorbidos)
      }
      setCambiosPagos(items)
    } catch (e) { console.warn('No se pudieron leer los pagos', e) }
  }

  function entendidoPrecios() {
    const tutosVistos = tutosNuevos
    if (tutosVistos.length) {
      guardarTutorialesVistos([...(leerTutorialesVistos() || []), ...tutosRef.current.map(t => t.id)])
      setTutosNuevos([])
      registrarLog({ accion: 'TUTORIALES_NUEVOS_VISTOS', detalle: tutosVistos.map(t => `${t.id} ${t.titulo}`).join(' · ').slice(0, 400), empleado: perfilRef.current?.nombre || '', resultado: 'OK' })
    }
    if (cambiosPagos.length) {
      guardarPagosVistos({ ...(leerPagosVistos() || {}), ...Object.fromEntries(pagosRef.current.map(p => [p.idPago, firmaPago(p)])) })
      registrarLog({ accion: 'PAGOS_DEL_OTRO_ADMIN_VISTOS', detalle: detalleLogCambios({ pagos: cambiosPagos }), empleado: perfilRef.current?.nombre || '', resultado: 'OK' })
      setCambiosPagos([])
    }
    setVerAvisoPrecios(false)
    if (!cambiosPrecio) return
    const c = cambiosPrecio
    guardarArticulosVistos(vistoDespues(articulosRef.current, leerArticulosVistos(), c))
    setCambiosPrecio(null)
    registrarLog({ accion: 'CAMBIOS_ARTICULOS_VISTOS', detalle: detalleLogCambios(c), empleado: perfilRef.current?.nombre || '', resultado: 'OK' })
  }

  // Tablet: una empleada toca su nombre → queda leído solo para ella
  function leidoPor(persona) {
    const c = artPorPersona[persona], tutos = tutPorPersona[persona] || []
    if (c) {
      guardarArticulosVistos(vistoDespues(articulosRef.current, leerArticulosVistos(persona), c), persona)
      registrarLog({ accion: 'CAMBIOS_ARTICULOS_VISTOS', detalle: detalleLogCambios(c), empleado: persona, resultado: 'OK' })
    }
    if (tutos.length) {
      guardarTutorialesVistos([...(leerTutorialesVistos(persona) || []), ...tutosRef.current.map(t => t.id)], persona)
      registrarLog({ accion: 'TUTORIALES_NUEVOS_VISTOS', detalle: tutos.map(t => `${t.id} ${t.titulo}`).join(' · ').slice(0, 400), empleado: persona, resultado: 'OK' })
    }
    setArtPorPersona(x => { const y = { ...x }; delete y[persona]; return y })
    setTutPorPersona(x => { const y = { ...x }; delete y[persona]; return y })
    setAvisoTablet({ abierto: false, para: null })
  }
  const avisoDe = persona => ({ ...(artPorPersona[persona] || {}), tutoriales: tutPorPersona[persona] || [] })
  const pendientesTablet = [...new Set([...Object.keys(artPorPersona), ...Object.keys(tutPorPersona)])]
    .filter(n => totalCambios(avisoDe(n)) > 0)
  const avisoTabletTodos = unirCambios(pendientesTablet.map(avisoDe))
  // Se abre solo cuando aparece algo nuevo (o al abrir la app con avisos pendientes)
  const firmaTablet = pendientesTablet.map(n => `${n}:${detalleLogCambios(avisoDe(n))}`).join('\n')
  const firmaTabletRef = useRef('')
  useEffect(() => {
    // Solo si hay algo que antes no estaba (cuando una empleada lo lee, la lista se achica y no se reabre)
    const antes = new Set(firmaTabletRef.current.split('\n'))
    if (firmaTablet && firmaTablet.split('\n').some(l => !antes.has(l))) setAvisoTablet({ abierto: true, para: null })
    if (!firmaTablet) setAvisoTablet({ abierto: false, para: null })
    firmaTabletRef.current = firmaTablet
  }, [firmaTablet])
  // Cuando ficha la entrada una empleada con avisos pendientes, se le abre su aviso
  function alFichar(nombre, tipo) {
    if (!/entr/i.test(String(tipo || ''))) return
    const persona = pendientesTablet.find(n => n.toLowerCase() === String(nombre || '').toLowerCase())
    if (persona) setTimeout(() => setAvisoTablet({ abierto: true, para: persona }), 2800)
  }

  // Relectura silenciosa de artículos (sin "Cargando..." ni registro en el LOG)
  async function refrescarArticulos() {
    try {
      const arts = await getArticulos()
      if (!arts.length) return
      if (firmaArticulos(arts) !== firmaArticulos(articulosRef.current)) { articulosRef.current = arts; setArticulos(arts) }
      detectarCambiosPrecio(arts)
    } catch (e) { console.warn('No se pudieron releer los artículos', e) }
    revisarTutoriales()
    revisarPagos()
    cargarPromos()
  }
  useEffect(() => {
    const id = setInterval(() => { if (document.visibilityState === 'visible' && !modoRef.current.activo) refrescarArticulos() }, INTERVALO_PRECIOS)
    const alVolver = () => { if (document.visibilityState === 'visible' && !modoRef.current.activo) refrescarArticulos() }
    document.addEventListener('visibilitychange', alVolver)
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', alVolver) }
  }, [])
  // Stock: se recalcula cada 3 minutos y al volver a la app (antes se calculaba solo al abrirla, y
  // durante el día quedaba un número viejo)
  useEffect(() => {
    let ultimo = Date.now()
    const recalc = () => {
      if (document.visibilityState !== 'visible' || !articulosRef.current.length || Date.now() - ultimo < 60 * 1000 || modoRef.current.activo) return
      ultimo = Date.now(); recalcularStock(articulosRef.current)
    }
    const id = setInterval(recalc, 3 * 60 * 1000)
    const pre = setTimeout(() => { if (!modoRef.current.activo) precargarSolapas() }, 5000)
    document.addEventListener('visibilitychange', recalc)
    return () => { clearInterval(id); clearTimeout(pre); document.removeEventListener('visibilitychange', recalc) }
  }, [])
  // Al elegir perfil (o cambiarlo) se revisa enseguida
  useEffect(() => {
    if (perfilGuardado && articulosRef.current.length) detectarCambiosPrecio(articulosRef.current)
    if (perfilGuardado && tutosRef.current.length) detectarTutoriales(tutosRef.current)
    if (perfilGuardado) revisarPagos()
  }, [perfilGuardado])
  // Los avisos por empleada necesitan la lista de usuarios: se revisan cuando llega
  useEffect(() => {
    usuariosRef.current = usuarios
    if (!usuarios.length || !porEmpleada()) return
    if (articulosRef.current.length) detectarCambiosPrecio(articulosRef.current)
    if (tutosRef.current.length) detectarTutoriales(tutosRef.current)
  }, [usuarios])
  useEffect(() => {
    if (perfilGuardado) registrarLog({ accion:'SESION_INICIADA', detalle:`App abierta · ${perfilGuardado.nombre} (${perfilGuardado.tipo})`, empleado:perfilGuardado.nombre, resultado:'OK' })
  }, [])

  async function cargarArticulos() {
    cargarPromos()
    setLoadingArticulos(true)
    try {
      const [arts] = await Promise.all([getArticulos(), cargarCodigosProveedor()])
      articulosRef.current = arts
      setArticulos(arts)
      detectarCambiosPrecio(arts)
      revisarTutoriales()
      revisarPagos()
      recalcularStock(arts)
      // Deja lista la planilla para que la primera venta no espere (columnas y datos de la hoja)
      prepararGuardadoVentas().catch(e => console.warn('No se pudo preparar el guardado de ventas', e))
      await registrarLog({ accion:'ARTICULOS_CARGADOS', detalle:`${arts.length} artículos cargados`, empleado:perfilGuardado?.nombre||'', resultado:'OK' })
    } catch (e) { console.error(e) }
    finally { setLoadingArticulos(false) }
  }

  // Después de cada venta: Hoy se actualiza enseguida (es liviano) y el stock 20 s después de la
  // última venta, así no compite con la venta siguiente si hay varias seguidas
  const stockTimer = useRef(null)
  function despuesDeVenta() {
    if (modoRef.current.activo) return
    setRefreshKey(k => k + 1)
    clearTimeout(stockTimer.current)
    stockTimer.current = setTimeout(() => recalcularStock(articulosRef.current), 20 * 1000)
  }

  // Stock calculado (último conteo + ingresos − ventas − bajas posteriores)
  function recalcularStock(arts = articulos) {
    return calcularStockTodos(arts).then(conStock => {
      const map = {}
      conStock.forEach(a => { map[a.id] = a.stockActualCalculado })
      setStockMap(map)
    }).catch(() => {})
  }

  async function cargarUsuarios() {
    setLoadingUsuarios(true)
    try { setUsuarios(await getUsuarios()) }
    catch (e) { console.error(e) }
    finally { setLoadingUsuarios(false) }
  }

  function elegirUsuario(usuario) {
    if (usuario.tipo?.toLowerCase() === 'admin' || (LOCAL.supervisor && usuario.tipo?.toLowerCase() === 'supervisor')) setPinPendiente(usuario)
    else confirmarPerfil(usuario)
  }

  function confirmarPerfil(usuario) {
    const perfil = { nombre: usuario.nombre, tipo: usuario.tipo || 'Caja' }
    localStorage.setItem('tb_perfil_v2', JSON.stringify(perfil))
    setPerfilGuardado(perfil)
    setTab('venta')
    setTabsVisitadas(new Set(['venta']))
    setPinPendiente(null)
    setMenuMasAbierto(false)
    registrarLog({ accion:'PERFIL_CONFIGURADO', detalle:`${usuario.nombre} · ${usuario.tipo}`, empleado:usuario.nombre, resultado:'OK' })
  }

  function handleLogoTap() {
    const newCount = logoTaps + 1
    setLogoTaps(newCount)
    if (logoTapTimer) clearTimeout(logoTapTimer)
    if (newCount >= 5) {
      setLogoTaps(0)
      registrarLog({ accion:'PERFIL_RESETEADO', detalle:`Perfil ${perfilGuardado?.nombre} reseteado`, empleado:perfilGuardado?.nombre||'', resultado:'OK' })
      localStorage.removeItem('tb_perfil_v2')
      setPerfilGuardado(null)
      setTab('venta')
      setTabsVisitadas(new Set(['venta']))
      return
    }
    setLogoTapTimer(setTimeout(() => setLogoTaps(0), 2000))
  }

  function handleTabChange(newTab) {
    setMenuMasAbierto(false)
    setTab(newTab)
    setTabsVisitadas(prev => new Set([...prev, newTab]))
    registrarLog({ accion:'NAVEGACION', detalle:`Navegó a ${newTab}`, empleado:perfilGuardado?.nombre||'', resultado:'OK' })
  }

  const esAdmin = perfilGuardado?.tipo?.toLowerCase() === 'admin'
  // Aviso a los admin cuando toca revisar la reposición (cada X días; se guarda en CONFIG)
  const hayReposicion = esAdmin && puedeVerReposicion(perfilGuardado?.nombre) && tabsMasDelLocal(true).some(t => t.id === 'repo')
  function revisarAvisoReposicion() {
    if (!hayReposicion) { setAvisoReposicion(false); return }
    getConfig().then(c => setAvisoReposicion(tocaRevisar(c[CLAVES_REPOSICION.ultima]?.valor, Number(c[CLAVES_REPOSICION.cadaDias]?.valor) || REPOSICION_DEFAULT.cadaDias))).catch(() => {})
  }
  useEffect(() => { revisarAvisoReposicion() }, [hayReposicion])
  // Supervisor (solo donde el local lo habilita): ve todo lo del Admin, pero sin modificar
  const esSupervisor = !!LOCAL.supervisor && perfilGuardado?.tipo?.toLowerCase() === 'supervisor'
  const veAdmin = esAdmin || esSupervisor
  // Tablet con aviso por empleada (ver detectarCambiosPrecio)
  const avisoPorEmpleada = !!LOCAL.avisoPorEmpleada && !veAdmin && empleadasAviso().length > 0
  const esAdrian = perfilGuardado?.nombre?.toLowerCase() === 'adrián' || perfilGuardado?.nombre?.toLowerCase() === 'adrian'
  const tipoKey = veAdmin ? 'Admin' : 'Caja'
  const tabsBase = tabsDelLocal(tipoKey)
  // Gastos Fijos visible para todos los Admin, editable solo por Adrián
  const tabs = tabsBase
  const tabsMas = tabsMasDelLocal(veAdmin).filter(t => t.id !== 'repo' || hayReposicion)
  const tabMasActiva = tabsMas.find(t => t.id === tab)
  const empleadoActual = perfilGuardado?.nombre || ''
  const usuariosLogin = usuarios.filter(u => u.tipo?.toLowerCase() === 'admin' || (LOCAL.supervisor && u.tipo?.toLowerCase() === 'supervisor') || u.nombre === 'Tablet')

  const tabStyle = (tabId) => ({
    display: tab === tabId ? 'flex' : 'none',
    flexDirection: 'column',
    flex: 1,
    overflow: 'hidden',
  })

  if (!perfilGuardado) {
    return (
      <>
        <style>{CSS_GLOBAL}</style>
        <div style={S.setupOverlay}>
          <div style={S.setupBox}>
            <div style={S.setupLogo}><span style={S.logoTodo}>{LOCAL.logo[0]}</span><span style={S.logoBoca}>{LOCAL.logo[1]}</span></div>
            <div style={S.setupTitle}>¿Quién sos?</div>
            <div style={S.setupSub}>{loadingUsuarios ? 'Cargando usuarios...' : 'Elegí tu usuario para continuar.'}</div>
            <div style={S.setupBtns}>
              {usuariosLogin.map(u => (
                <button key={u.id} style={S.setupBtn} onClick={() => elegirUsuario(u)}>
                  <span style={S.setupBtnLabel}>{u.nombre}</span>
                  <span style={S.setupBtnDesc}>{u.tipo?.toLowerCase()==='admin' ? 'Admin · requiere código' : u.tipo?.toLowerCase()==='supervisor' ? 'Supervisor · requiere código' : u.tipo||'Caja'}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
        {pinPendiente && <PinModal usuario={pinPendiente} onConfirm={() => confirmarPerfil(pinPendiente)} onCancel={() => setPinPendiente(null)} />}
      </>
    )
  }

  return (
    <>
      <style>{CSS_GLOBAL}</style>
      {avisoPorEmpleada ? (
        <AvisoPrecios cambios={avisoTablet.abierto ? (avisoTablet.para ? avisoDe(avisoTablet.para) : avisoTabletTodos) : null}
          personas={avisoTablet.para ? [avisoTablet.para] : pendientesTablet} onLeido={leidoPor}
          onCerrar={() => setAvisoTablet({ abierto: false, para: null })} onVerTutoriales={() => handleTabChange('tutos')} />
      ) : (
        <AvisoPrecios cambios={!veAdmin || verAvisoPrecios ? avisoCambios : null} onEntendido={entendidoPrecios}
          onVerTutoriales={() => { entendidoPrecios(); handleTabChange('tutos') }} />
      )}
      <div style={S.app}>
        <div style={S.header}>
          <div style={S.logo} onClick={handleLogoTap} role="button">
            <span style={{ ...S.logoTodo, color:'var(--header-text)' }}>{LOCAL.logo[0]}</span><span style={{ ...S.logoBoca, color:'var(--accent)' }}>{LOCAL.logo[1]}</span>
          </div>
          <div style={S.headerRight}>
            {avisoPorEmpleada && pendientesTablet.length > 0 && !avisoTablet.abierto && (
              <button style={S.avisoPreciosPill} onClick={() => setAvisoTablet({ abierto: true, para: null })} title="Ver las novedades que faltan leer">
                📢 Falta leer: {pendientesTablet.length > 1 ? `${pendientesTablet.slice(0, -1).join(', ')} y ${pendientesTablet[pendientesTablet.length - 1]}` : pendientesTablet[0]}
              </button>
            )}
            {veAdmin && totalCambios(avisoCambios) > 0 && (
              <button style={S.avisoPreciosPill} onClick={() => setVerAvisoPrecios(true)} title="Ver qué cambió en los artículos">
                📢 {resumenCambios(avisoCambios)}
              </button>
            )}
            {avisoReposicion && (
              <button style={S.avisoPreciosPill} onClick={() => handleTabChange('repo')} title="Toca revisar qué hay que reponer" aria-label="Revisar reposición">{typeof window !== 'undefined' && window.innerWidth < 600 ? '🚚' : '🚚 Revisar reposición'}</button>
            )}
            {esAdmin && LOCAL.modoPartido && <BotonModoPartido activo={modo.activo} cambiando={cambiandoModo} onCambiar={cambiarModo} />}
            {LOCAL.fichar && <FicharTablet onFichada={alFichar} />}
            <div style={S.perfilPill}><span style={S.perfilLabel}>{empleadoActual}</span></div>
            {loadingArticulos && <span style={S.loadingPill}>Cargando...</span>}
          </div>
        </div>

        <BarraModoPartido activo={modo.activo} quien={modo.quien} cola={cola} esAdmin={veAdmin} perfilNombre={empleadoActual} />

        <div style={S.content}>
          <div style={tabStyle('venta')}>
            {LOCAL.venderSimple ? (
              <VenderSimple articulos={articulos} loadingArticulos={loadingArticulos} usuarios={usuarios} stockMap={stockMap} perfilNombre={empleadoActual} esAdmin={veAdmin}
                onVentaRegistrada={despuesDeVenta} />
            ) : (
            <NuevaVenta promos={promos} articulos={articulos} loadingArticulos={loadingArticulos} usuarios={usuarios} stockMap={stockMap} empleadoFijo={veAdmin ? empleadoActual : null} esAdmin={veAdmin} cargadoPor={empleadoActual}
              modoPartido={modo.activo} masVendidos={modo.masVendidos || []}
              onVentaRegistrada={despuesDeVenta} />
            )}
          </div>
          {tabsVisitadas.has('hoy') && (
            <div style={tabStyle('hoy')}>{LOCAL.hoySimple && !veAdmin ? <HoySimple refreshKey={refreshKey} articulos={articulos} /> : <VentasDelDia soloLectura={esSupervisor} refreshKey={refreshKey} puedeAnular={true} usuarios={usuarios} perfilNombre={empleadoActual} esAdmin={veAdmin} articulos={articulos} verEquilibrio={esAdmin} />}</div>
          )}
          {tabsVisitadas.has('caja') && (
            <div style={tabStyle('caja')}><Suspense fallback={<CargandoSolapa />}><GastosCaja usuarios={usuarios} articulos={articulos} perfilNombre={empleadoActual} onRegistrado={() => setRefreshKey(k => k + 1)} /></Suspense></div>
          )}
          {veAdmin && tabsVisitadas.has('log') && (
            <div style={tabStyle('log')}><Suspense fallback={<CargandoSolapa />}><LogVentas soloLectura={esSupervisor} esAdmin={veAdmin} articulos={articulos} usuarios={usuarios} perfilNombre={empleadoActual} /></Suspense></div>
          )}
          {veAdmin && tabsVisitadas.has('stats') && (
            <div style={tabStyle('stats')}><Suspense fallback={<CargandoSolapa />}><Estadisticas esAdmin={veAdmin} usuarios={usuarios} perfilNombre={empleadoActual} /></Suspense></div>
          )}
          {tabsVisitadas.has('arts') && (
            <div style={tabStyle('arts')}><Suspense fallback={<CargandoSolapa />}><Articulos soloLectura={esSupervisor} empleado={empleadoActual} esAdmin={veAdmin} /></Suspense></div>
          )}
          {tabsVisitadas.has('conteo') && (
            <div style={tabStyle('conteo')}><Suspense fallback={<CargandoSolapa />}><Conteo articulos={articulos} usuarios={usuarios} perfilNombre={empleadoActual} esAdmin={veAdmin} onActualizado={() => recalcularStock()} /></Suspense></div>
          )}
          {tabsVisitadas.has('tutos') && (
            <div style={tabStyle('tutos')}><Suspense fallback={<CargandoSolapa />}><Tutoriales esAdmin={veAdmin} perfilNombre={empleadoActual} version={versionTutos} /></Suspense></div>
          )}
          {veAdmin && tabsVisitadas.has('rota') && (
            <div style={tabStyle('rota')}><Suspense fallback={<CargandoSolapa />}><Rotacion articulos={articulos} stockMap={stockMap} /></Suspense></div>
          )}
          {esAdmin && tabsVisitadas.has('rent') && (
            <div style={tabStyle('rent')}><Suspense fallback={<CargandoSolapa />}><Rentabilidad articulos={articulos} stockMap={stockMap} /></Suspense></div>
          )}
          {hayReposicion && tabsVisitadas.has('repo') && (
            <div style={tabStyle('repo')}><Suspense fallback={<CargandoSolapa />}><Reposicion articulos={articulos} stockMap={stockMap} perfilNombre={empleadoActual} onRevisado={revisarAvisoReposicion} /></Suspense></div>
          )}
          {esAdmin && LOCAL.planillaMP && tabsVisitadas.has('mp') && (
            <div style={tabStyle('mp')}><Suspense fallback={<CargandoSolapa />}><CobrosMP /></Suspense></div>
          )}
          {veAdmin && tabsVisitadas.has('promos') && (
            <div style={tabStyle('promos')}><Suspense fallback={<CargandoSolapa />}><Promos promos={promos} articulos={articulos} perfilNombre={empleadoActual} onCambio={cargarPromos} /></Suspense></div>
          )}
          {veAdmin && tabsVisitadas.has('ing') && (
            <div style={tabStyle('ing')}><Suspense fallback={<CargandoSolapa />}><Ingresos /></Suspense></div>
          )}
          {veAdmin && tabsVisitadas.has('pagos') && (
            <div style={tabStyle('pagos')}><Suspense fallback={<CargandoSolapa />}><Pagos empleado={empleadoActual} empleadoFijo={empleadoActual} usuarios={usuarios} /></Suspense></div>
          )}
          {tabsVisitadas.has('asis') && (
            <div style={tabStyle('asis')}><Suspense fallback={<CargandoSolapa />}><Asistencia usuarios={usuarios} esAdmin={veAdmin} verBonos={esAdmin} perfilNombre={perfilGuardado?.nombre || ''} /></Suspense></div>
          )}
          {veAdmin && tabsVisitadas.has('fich') && (
            <div style={tabStyle('fich')}><Suspense fallback={<CargandoSolapa />}><Fichadas usuarios={usuarios} /></Suspense></div>
          )}
          {veAdmin && tabsVisitadas.has('admin') && (
            <div style={tabStyle('admin')}><Suspense fallback={<CargandoSolapa />}><Administracion perfilNombre={empleadoActual} /></Suspense></div>
          )}
        </div>

        <nav style={S.nav}>
          {tabs.map(t => (
            <button key={t.id} style={{ ...S.navBtn, ...(tab === t.id ? S.navBtnActive : {}) }} onClick={() => handleTabChange(t.id)}>
              {tab === t.id && <div style={S.navBar} />}
              <span style={LOCAL.barraGrande ? S.navIconGrande : S.navIcon}>{t.icon}</span>
              <span style={LOCAL.barraGrande ? S.navLabelGrande : S.navLabel}>{t.label}</span>
            </button>
          ))}
          {tabsMas.length > 0 && (
            <button style={{ ...S.navBtn, ...(tabMasActiva || menuMasAbierto ? S.navBtnActive : {}) }} onClick={() => setMenuMasAbierto(v => !v)} aria-expanded={menuMasAbierto}>
              {tabMasActiva && <div style={S.navBar} />}
              <span style={S.navIcon}>{tabMasActiva ? tabMasActiva.icon : '☰'}</span>
              <span style={S.navLabel}>{tabMasActiva ? tabMasActiva.label : 'Más'}</span>
            </button>
          )}
        </nav>
      </div>
      {menuMasAbierto && <MenuMas tabs={tabsMas} tabActual={tab} onElegir={handleTabChange} onCerrar={() => setMenuMasAbierto(false)} />}
    </>
  )
}

export const CSS_GLOBAL = `
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  :root { ${cssVariablesTema()} }
  html, body, #root { height: 100%; width: 100%; background: var(--bg); color: var(--text); -webkit-font-smoothing: antialiased; overflow: hidden; }
  button { transition: opacity 0.1s, transform 0.1s; }
  button:active { opacity: 0.75; transform: scale(0.97); }
  select option { background: var(--surface); color: var(--text); }
  ::-webkit-scrollbar { width: 3px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb { background: var(--border); border-radius: 2px; }
`

const S = {
  app: { height:'100%', display:'flex', flexDirection:'column', overflow:'hidden' },
  header: { display:'flex', alignItems:'center', justifyContent:'space-between', padding:'8px 16px', borderBottom:'2px solid var(--accent)', background:'var(--header-bg)', flexShrink:0 },
  logo: { display:'flex', alignItems:'baseline', gap:5, cursor:'pointer', userSelect:'none' },
  logoTodo: { fontFamily:'Barlow Condensed, sans-serif', fontWeight:800, fontSize:24, color:'var(--text)', letterSpacing:3 },
  logoBoca: { fontFamily:'Barlow Condensed, sans-serif', fontWeight:800, fontSize:24, color:'var(--accent-text)', letterSpacing:3 },
  headerRight: { display:'flex', alignItems:'center', gap:8 },
  avisoPreciosPill: { fontFamily:'Barlow Condensed, sans-serif', fontWeight:700, fontSize:13, color:'#000', background:'var(--accent)', border:'none', borderRadius:20, padding:'4px 12px', cursor:'pointer', whiteSpace:'nowrap' },
  perfilPill: { background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:20, padding:'3px 12px' },
  perfilLabel: { fontFamily:'Barlow Condensed, sans-serif', fontWeight:700, fontSize:13, color:'var(--muted)', letterSpacing:1, textTransform:'uppercase' },
  loadingPill: { fontFamily:'Barlow, sans-serif', fontSize:11, color:'var(--muted)', background:'var(--bg)', padding:'3px 10px', borderRadius:20, border:'1px solid var(--border)' },
  content: { flex:1, overflow:'hidden', display:'flex', flexDirection:'column', position:'relative' },
  nav: { display:'flex', borderTop:'1.5px solid var(--border)', background:'var(--surface)', flexShrink:0 },
  navBtn: { flex:1, display:'flex', flexDirection:'column', alignItems:'center', gap:2, padding:'8px 0 10px', background:'none', border:'none', cursor:'pointer', color:'var(--muted)', position:'relative' },
  navBtnActive: { color:'var(--accent-text)' },
  navBar: { position:'absolute', top:0, left:'50%', transform:'translateX(-50%)', width:32, height:2, background:'var(--accent)', borderRadius:'0 0 3px 3px' },
  navIcon: { fontSize:20 },
  navIconGrande: { fontSize:30, lineHeight:1.1 },
  navLabelGrande: { fontFamily:'Barlow Condensed, sans-serif', fontWeight:700, fontSize:20, textTransform:'uppercase', letterSpacing:1, paddingBottom:4 },
  navLabel: { fontFamily:'Barlow Condensed, sans-serif', fontWeight:700, fontSize:11, textTransform:'uppercase', letterSpacing:1 },
  setupOverlay: { height:'100%', display:'flex', alignItems:'center', justifyContent:'center', background:'var(--bg)' },
  setupBox: { display:'flex', flexDirection:'column', alignItems:'center', gap:20, padding:32, maxWidth:380, width:'100%' },
  setupLogo: { display:'flex', alignItems:'baseline', gap:6 },
  setupTitle: { fontFamily:'Barlow Condensed, sans-serif', fontWeight:800, fontSize:28, color:'var(--text)', letterSpacing:2, textTransform:'uppercase' },
  setupSub: { fontFamily:'Barlow, sans-serif', fontSize:13, color:'var(--muted)', textAlign:'center', lineHeight:1.5 },
  setupBtns: { display:'flex', flexDirection:'column', gap:10, width:'100%' },
  setupBtn: { width:'100%', display:'flex', flexDirection:'column', alignItems:'flex-start', padding:'16px 20px', background:'var(--surface)', border:'2px solid var(--border)', borderRadius:12, cursor:'pointer', gap:4 },
  setupBtnLabel: { fontFamily:'Barlow Condensed, sans-serif', fontWeight:800, fontSize:22, color:'var(--accent-text)', letterSpacing:1 },
  setupBtnDesc: { fontFamily:'Barlow, sans-serif', fontSize:12, color:'var(--muted)' },
}
