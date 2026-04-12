// src/App.jsx
import { useState, useEffect } from 'react'
import NuevaVenta from './pages/NuevaVenta.jsx'
import VentasDelDia from './pages/VentasDelDia.jsx'
import LogVentas from './pages/LogVentas.jsx'
import Estadisticas from './pages/Estadisticas.jsx'
import Articulos from './pages/Articulos.jsx'
import Ingresos from './pages/Ingresos.jsx'
import Pagos from './pages/Pagos.jsx'
import { getArticulos, getUsuarios, registrarLog, calcularStockTodos } from './api/sheets.js'

const PERFILES = ['Admin', 'Caja', 'Empleado']

const TABS_POR_PERFIL = {
  Admin:    [{ id:'venta', label:'Vender', icon:'🛒' }, { id:'hoy', label:'Hoy', icon:'📊' }, { id:'log', label:'Historial', icon:'📋' }, { id:'stats', label:'Stats', icon:'📈' }, { id:'arts', label:'Arts.', icon:'📦' }, { id:'ing', label:'Ingreso', icon:'📥' }, { id:'pagos', label:'Pagos', icon:'💳' }],
  Caja:     [{ id:'venta', label:'Vender', icon:'🛒' }, { id:'hoy', label:'Hoy', icon:'📊' }, { id:'arts', label:'Arts.', icon:'📦' }],
  Empleado: [{ id:'venta', label:'Vender', icon:'🛒' }, { id:'hoy', label:'Hoy', icon:'📊' }, { id:'arts', label:'Arts.', icon:'📦' }],
}

// ── PIN Modal ────────────────────────────────────────────────────────────────
function PinModal({ onConfirm, onCancel, usuarios }) {
  const [pin, setPin] = useState('')
  const [error, setError] = useState(false)
  const [shake, setShake] = useState(false)

  const adminCodigos = usuarios
    .filter(u => u.tipo?.toLowerCase() === 'admin')
    .map(u => String(u.codigo).trim())
    .filter(Boolean)

  function presionar(digit) {
    if (pin.length >= 6) return
    const nuevo = pin + digit
    setPin(nuevo)
    setError(false)
  }

  function borrar() {
    setPin(p => p.slice(0, -1))
    setError(false)
  }

  function confirmar() {
    if (adminCodigos.includes(pin.trim())) {
      onConfirm()
    } else {
      setError(true)
      setShake(true)
      setPin('')
      setTimeout(() => setShake(false), 500)
    }
  }

  function handleKey(e) {
    if (e.key >= '0' && e.key <= '9') presionar(e.key)
    else if (e.key === 'Backspace') borrar()
    else if (e.key === 'Enter') confirmar()
    else if (e.key === 'Escape') onCancel()
  }

  useEffect(() => {
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [pin, adminCodigos])

  return (
    <div style={P.overlay} onClick={onCancel}>
      <div style={{...P.box, ...(shake ? P.shake : {})}} onClick={e => e.stopPropagation()}>
        <div style={P.title}>CÓDIGO ADMIN</div>
        <div style={P.subtitle}>Ingresá tu código de acceso</div>

        {/* Dots */}
        <div style={P.dots}>
          {[0,1,2,3,4,5].map(i => (
            <div key={i} style={{...P.dot, ...(i < pin.length ? P.dotFilled : {}), ...(error ? P.dotError : {})}} />
          ))}
        </div>

        {error && <div style={P.errorMsg}>Código incorrecto</div>}

        {/* Teclado numérico */}
        <div style={P.grid}>
          {['1','2','3','4','5','6','7','8','9','','0','⌫'].map((k, i) => (
            <button
              key={i}
              style={{...P.key, ...(k === '' ? P.keyEmpty : {}), ...(k === '⌫' ? P.keyDel : {})}}
              onClick={() => {
                if (k === '⌫') borrar()
                else if (k !== '') presionar(k)
              }}
              disabled={k === ''}
            >
              {k}
            </button>
          ))}
        </div>

        <div style={{display:'flex', gap:10, width:'100%'}}>
          <button style={P.cancelBtn} onClick={onCancel}>Cancelar</button>
          <button style={{...P.confirmBtn, opacity: pin.length === 0 ? 0.5 : 1}} onClick={confirmar} disabled={pin.length === 0}>
            Ingresar
          </button>
        </div>
      </div>
    </div>
  )
}

const P = {
  overlay: { position:'fixed', inset:0, background:'rgba(0,0,10,0.9)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:500, backdropFilter:'blur(8px)' },
  box: { background:'var(--surface)', border:'2px solid var(--border)', borderRadius:20, padding:'32px 28px', width:320, display:'flex', flexDirection:'column', alignItems:'center', gap:16 },
  shake: { animation:'none', transform:'translateX(0)' },
  title: { fontFamily:'Barlow Condensed, sans-serif', fontWeight:800, fontSize:26, color:'var(--accent)', letterSpacing:2, textTransform:'uppercase' },
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

// ── App principal ────────────────────────────────────────────────────────────
export default function App() {
  const [tab, setTab] = useState('venta')
  const [refreshKey, setRefreshKey] = useState(0)
  const [articulos, setArticulos] = useState([])
  const [loadingArticulos, setLoadingArticulos] = useState(true)
  const [usuarios, setUsuarios] = useState([])
  const [perfilDispositivo, setPerfilDispositivo] = useState(() => {
    return localStorage.getItem('tb_perfil') || null
  })
  const [stockMap, setStockMap] = useState({})
  const [logoTaps, setLogoTaps] = useState(0)
  const [logoTapTimer, setLogoTapTimer] = useState(null)
  const [pinPendiente, setPinPendiente] = useState(null) // perfil pendiente de confirmación

  useEffect(() => { cargarArticulos(); cargarUsuarios() }, [])

  useEffect(() => {
    if (perfilDispositivo) {
      registrarLog({
        accion: 'SESION_INICIADA',
        detalle: `App abierta con perfil ${perfilDispositivo}`,
        empleado: perfilDispositivo,
        resultado: 'OK',
      })
    }
  }, [])

  async function cargarArticulos() {
    setLoadingArticulos(true)
    try {
      const arts = await getArticulos()
      setArticulos(arts)
      calcularStockTodos(arts).then(conStock => {
        const map = {}
        conStock.forEach(a => { map[a.id] = a.stockActualCalculado })
        setStockMap(map)
      }).catch(() => {})
      await registrarLog({
        accion: 'ARTICULOS_CARGADOS',
        detalle: `${arts.length} artículos cargados`,
        empleado: localStorage.getItem('tb_perfil') || '',
        resultado: 'OK',
      })
    } catch (e) {
      console.error(e)
      await registrarLog({
        accion: 'ERROR_CARGA_ARTICULOS',
        detalle: e?.message || 'Error desconocido al cargar artículos',
        empleado: localStorage.getItem('tb_perfil') || '',
        resultado: 'ERROR',
      })
    } finally {
      setLoadingArticulos(false)
    }
  }

  async function cargarUsuarios() {
    try { setUsuarios(await getUsuarios()) }
    catch (e) { console.error(e) }
  }

  function elegirPerfil(perfil) {
    if (perfil === 'Admin') {
      // Si usuarios ya cargaron, pedir PIN
      setPinPendiente(perfil)
      return
    }
    confirmarPerfil(perfil)
  }

  function confirmarPerfil(perfil) {
    localStorage.setItem('tb_perfil', perfil)
    setPerfilDispositivo(perfil)
    setTab('venta')
    setPinPendiente(null)
    registrarLog({
      accion: 'PERFIL_CONFIGURADO',
      detalle: `Dispositivo configurado con perfil ${perfil}`,
      empleado: perfil,
      resultado: 'OK',
    })
  }

  function handleLogoTap() {
    const newCount = logoTaps + 1
    setLogoTaps(newCount)
    if (logoTapTimer) clearTimeout(logoTapTimer)
    if (newCount >= 5) {
      setLogoTaps(0)
      registrarLog({
        accion: 'PERFIL_RESETEADO',
        detalle: `Perfil ${perfilDispositivo} reseteado manualmente desde el logo`,
        empleado: perfilDispositivo || '',
        resultado: 'OK',
      })
      localStorage.removeItem('tb_perfil')
      setPerfilDispositivo(null)
      setTab('venta')
      return
    }
    const t = setTimeout(() => setLogoTaps(0), 2000)
    setLogoTapTimer(t)
  }

  function handleTabChange(newTab) {
    setTab(newTab)
    const tabNames = { venta:'VENDER', hoy:'HOY', log:'HISTORIAL', stats:'ESTADÍSTICAS' }
    registrarLog({
      accion: 'NAVEGACION',
      detalle: `Navegó a ${tabNames[newTab] || newTab}`,
      empleado: perfilDispositivo || '',
      resultado: 'OK',
    })
  }

  const tabs = TABS_POR_PERFIL[perfilDispositivo] || []
  const esAdmin = perfilDispositivo === 'Admin'

  if (!perfilDispositivo) {
    return (
      <>
        <style>{CSS_GLOBAL}</style>
        <div style={S.setupOverlay}>
          <div style={S.setupBox}>
            <div style={S.setupLogo}>
              <span style={S.logoTodo}>TODO</span>
              <span style={S.logoBoca}>BOCA</span>
            </div>
            <div style={S.setupTitle}>Configurar dispositivo</div>
            <div style={S.setupSub}>Esta configuración se guarda en este dispositivo y no cambia hasta que se resetee manualmente.</div>
            <div style={S.setupBtns}>
              {PERFILES.map(p => (
                <button key={p} style={S.setupBtn} onClick={() => elegirPerfil(p)}>
                  <span style={S.setupBtnLabel}>{p}</span>
                  <span style={S.setupBtnDesc}>{
                    p === 'Admin' ? 'Acceso completo · requiere código' :
                    p === 'Caja'  ? 'Vender · Hoy · Artículos' :
                                    'Vender · Hoy · Artículos'
                  }</span>
                </button>
              ))}
            </div>
          </div>
        </div>
        {pinPendiente && (
          <PinModal
            usuarios={usuarios}
            onConfirm={() => confirmarPerfil(pinPendiente)}
            onCancel={() => setPinPendiente(null)}
          />
        )}
      </>
    )
  }

  return (
    <>
      <style>{CSS_GLOBAL}</style>
      <div style={S.app}>
        <div style={S.header}>
          <div style={S.logo} onClick={handleLogoTap} role="button">
            <span style={S.logoTodo}>TODO</span>
            <span style={S.logoBoca}>BOCA</span>
          </div>
          <div style={S.headerRight}>
            <div style={S.perfilPill}>
              <span style={S.perfilLabel}>{perfilDispositivo}</span>
            </div>
            {loadingArticulos && (
              <span style={S.loadingPill}>Cargando...</span>
            )}
          </div>
        </div>

        <div style={S.content}>
          {tab === 'venta' && (
            <NuevaVenta
              articulos={articulos}
              loadingArticulos={loadingArticulos}
              usuarios={usuarios}
              stockMap={stockMap}
              onVentaRegistrada={() => setRefreshKey(k => k + 1)}
            />
          )}
          {tab === 'hoy' && <VentasDelDia refreshKey={refreshKey} puedeAnular={true} />}
          {tab === 'log' && esAdmin && <LogVentas />}
          {tab === 'stats' && esAdmin && <Estadisticas />}
          {tab === 'arts' && <Articulos empleado={usuarios[0]?.nombre || ''} esAdmin={esAdmin} />}
          {tab === 'ing' && esAdmin && <Ingresos empleado={usuarios[0]?.nombre || ''} usuarios={usuarios} />}
          {tab === 'pagos' && esAdmin && <Pagos empleado={usuarios[0]?.nombre || ''} usuarios={usuarios} />}
        </div>

        <nav style={S.nav}>
          {tabs.map(t => (
            <button
              key={t.id}
              style={{ ...S.navBtn, ...(tab === t.id ? S.navBtnActive : {}) }}
              onClick={() => handleTabChange(t.id)}
            >
              {tab === t.id && <div style={S.navBar} />}
              <span style={S.navIcon}>{t.icon}</span>
              <span style={S.navLabel}>{t.label}</span>
            </button>
          ))}
        </nav>
      </div>
    </>
  )
}

const CSS_GLOBAL = `
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  :root {
    --bg: #021030;
    --surface: #031a4a;
    --surface2: #042060;
    --border: #0d3080;
    --text: #f0f4ff;
    --muted: #6a8ccc;
    --accent: #f5c800;
    --success: #22c55e;
  }
  html, body, #root { height: 100%; width: 100%; background: var(--bg); color: var(--text); -webkit-font-smoothing: antialiased; overflow: hidden; }
  button { transition: opacity 0.1s, transform 0.1s; }
  button:active { opacity: 0.75; transform: scale(0.97); }
  select option { background: #031a4a; color: #f0f4ff; }
  ::-webkit-scrollbar { width: 3px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb { background: var(--border); border-radius: 2px; }
`

const S = {
  app: { height:'100%', display:'flex', flexDirection:'column', overflow:'hidden' },
  header: { display:'flex', alignItems:'center', justifyContent:'space-between', padding:'8px 16px', borderBottom:'2px solid var(--accent)', background:'var(--surface)', flexShrink:0 },
  logo: { display:'flex', alignItems:'baseline', gap:5, cursor:'pointer', userSelect:'none' },
  logoTodo: { fontFamily:'Barlow Condensed, sans-serif', fontWeight:800, fontSize:24, color:'var(--text)', letterSpacing:3 },
  logoBoca: { fontFamily:'Barlow Condensed, sans-serif', fontWeight:800, fontSize:24, color:'var(--accent)', letterSpacing:3 },
  headerRight: { display:'flex', alignItems:'center', gap:8 },
  perfilPill: { background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:20, padding:'3px 12px' },
  perfilLabel: { fontFamily:'Barlow Condensed, sans-serif', fontWeight:700, fontSize:13, color:'var(--muted)', letterSpacing:1, textTransform:'uppercase' },
  loadingPill: { fontFamily:'Barlow, sans-serif', fontSize:11, color:'var(--muted)', background:'var(--bg)', padding:'3px 10px', borderRadius:20, border:'1px solid var(--border)' },
  content: { flex:1, overflow:'hidden', display:'flex', flexDirection:'column' },
  nav: { display:'flex', borderTop:'1.5px solid var(--border)', background:'var(--surface)', flexShrink:0 },
  navBtn: { flex:1, display:'flex', flexDirection:'column', alignItems:'center', gap:2, padding:'8px 0 10px', background:'none', border:'none', cursor:'pointer', color:'var(--muted)', position:'relative' },
  navBtnActive: { color:'var(--accent)' },
  navBar: { position:'absolute', top:0, left:'50%', transform:'translateX(-50%)', width:32, height:2, background:'var(--accent)', borderRadius:'0 0 3px 3px' },
  navIcon: { fontSize:20 },
  navLabel: { fontFamily:'Barlow Condensed, sans-serif', fontWeight:700, fontSize:11, textTransform:'uppercase', letterSpacing:1 },
  setupOverlay: { height:'100%', display:'flex', alignItems:'center', justifyContent:'center', background:'var(--bg)' },
  setupBox: { display:'flex', flexDirection:'column', alignItems:'center', gap:20, padding:32, maxWidth:380, width:'100%' },
  setupLogo: { display:'flex', alignItems:'baseline', gap:6 },
  setupTitle: { fontFamily:'Barlow Condensed, sans-serif', fontWeight:800, fontSize:22, color:'var(--text)', letterSpacing:2, textTransform:'uppercase' },
  setupSub: { fontFamily:'Barlow, sans-serif', fontSize:13, color:'var(--muted)', textAlign:'center', lineHeight:1.5 },
  setupBtns: { display:'flex', flexDirection:'column', gap:10, width:'100%' },
  setupBtn: { width:'100%', display:'flex', flexDirection:'column', alignItems:'flex-start', padding:'16px 20px', background:'var(--surface)', border:'2px solid var(--border)', borderRadius:12, cursor:'pointer', gap:4 },
  setupBtnLabel: { fontFamily:'Barlow Condensed, sans-serif', fontWeight:800, fontSize:22, color:'var(--accent)', letterSpacing:1 },
  setupBtnDesc: { fontFamily:'Barlow, sans-serif', fontSize:12, color:'var(--muted)' },
}
