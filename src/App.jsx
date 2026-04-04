// src/App.jsx
import { useState, useEffect } from 'react'
import NuevaVenta from './pages/NuevaVenta.jsx'
import VentasDelDia from './pages/VentasDelDia.jsx'
import LogVentas from './pages/LogVentas.jsx'
import { getArticulos, getUsuarios } from './api/sheets.js'

const PERFILES = ['Admin', 'Caja', 'Empleado']

const TABS_POR_PERFIL = {
  Admin:    [{ id:'venta', label:'Vender', icon:'🛒' }, { id:'hoy', label:'Hoy', icon:'📊' }, { id:'log', label:'Log', icon:'📋' }],
  Caja:     [{ id:'venta', label:'Vender', icon:'🛒' }, { id:'hoy', label:'Hoy', icon:'📊' }],
  Empleado: [{ id:'venta', label:'Vender', icon:'🛒' }, { id:'hoy', label:'Hoy', icon:'📊' }],
}

export default function App() {
  const [tab, setTab] = useState('venta')
  const [refreshKey, setRefreshKey] = useState(0)
  const [articulos, setArticulos] = useState([])
  const [loadingArticulos, setLoadingArticulos] = useState(true)
  const [usuarios, setUsuarios] = useState([])
  const [perfilDispositivo, setPerfilDispositivo] = useState(() => {
    return localStorage.getItem('tb_perfil') || null
  })
  const [logoTaps, setLogoTaps] = useState(0)
  const [logoTapTimer, setLogoTapTimer] = useState(null)

  useEffect(() => { cargarArticulos(); cargarUsuarios() }, [])

  async function cargarArticulos() {
    setLoadingArticulos(true)
    try { setArticulos(await getArticulos()) }
    catch (e) { console.error(e) }
    finally { setLoadingArticulos(false) }
  }

  async function cargarUsuarios() {
    try { setUsuarios(await getUsuarios()) }
    catch (e) { console.error(e) }
  }

  function elegirPerfil(perfil) {
    localStorage.setItem('tb_perfil', perfil)
    setPerfilDispositivo(perfil)
    setTab('venta')
  }

  function handleLogoTap() {
    const newCount = logoTaps + 1
    setLogoTaps(newCount)
    if (logoTapTimer) clearTimeout(logoTapTimer)
    if (newCount >= 5) {
      setLogoTaps(0)
      localStorage.removeItem('tb_perfil')
      setPerfilDispositivo(null)
      setTab('venta')
      return
    }
    const t = setTimeout(() => setLogoTaps(0), 2000)
    setLogoTapTimer(t)
  }

  const tabs = TABS_POR_PERFIL[perfilDispositivo] || []
  const esAdmin = perfilDispositivo === 'Admin'

  // Si no hay perfil configurado, mostrar pantalla de setup
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
                    p === 'Admin' ? 'Vender · Hoy · Log completo' :
                    p === 'Caja'  ? 'Vender · Hoy' :
                                    'Vender · Hoy'
                  }</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </>
    )
  }

  return (
    <>
      <style>{CSS_GLOBAL}</style>
      <div style={S.app}>

        {/* Header */}
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

        {/* Content */}
        <div style={S.content}>
          {tab === 'venta' && (
            <NuevaVenta
              articulos={articulos}
              loadingArticulos={loadingArticulos}
              usuarios={usuarios}
              onVentaRegistrada={() => setRefreshKey(k => k + 1)}
            />
          )}
          {tab === 'hoy' && (
            <VentasDelDia
              refreshKey={refreshKey}
              puedeAnular={true}
              esAdmin={esAdmin}
            />
          )}
          {tab === 'log' && esAdmin && <LogVentas />}
        </div>

        {/* Bottom nav */}
        <nav style={S.nav}>
          {tabs.map(t => (
            <button
              key={t.id}
              style={{ ...S.navBtn, ...(tab === t.id ? S.navBtnActive : {}) }}
              onClick={() => setTab(t.id)}
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
  // Setup
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
