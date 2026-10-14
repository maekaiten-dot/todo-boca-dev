// src/pages/Administracion.jsx
// Administración: finanzas del local, cuentas con la familia, regalías y ahorros.
// Etapa 1: entrada con PIN propio y conexión con la planilla de Administración.
import { useState, useEffect } from 'react'
import { getSesion, cerrarSesion, ingresar, pedirAdmin, ErrorSesion } from '../api/admin.js'

const QUIENES = ['Adrián', 'Jorge']
const horaCorta = ms => new Date(ms).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })

function Login({ perfilNombre, onEntrar }) {
  const [quien, setQuien] = useState(QUIENES.includes(perfilNombre) ? perfilNombre : 'Adrián')
  const [pin, setPin] = useState('')
  const [entrando, setEntrando] = useState(false)
  const [error, setError] = useState(null)
  const [faltan, setFaltan] = useState(null)
  async function entrar() {
    if (!pin || entrando) return
    setEntrando(true); setError(null); setFaltan(null)
    try { onEntrar(await ingresar(pin, quien)) }
    catch (e) { setError(e.message); setFaltan(e.configuracion || null); setPin('') }
    finally { setEntrando(false) }
  }
  return (
    <div style={S.loginCard}>
      <div style={S.candado}>🔒</div>
      <div style={S.loginTitulo}>Administración</div>
      <div style={S.ayuda}>Cuentas del local, regalías, alquiler, servicios y ahorros. Solo para Adrián y Jorge.</div>
      <div style={S.fieldLabel}>QUIÉN ENTRA</div>
      <div style={S.quienes}>
        {QUIENES.map(q => <button key={q} style={{ ...S.optBtn, ...(quien === q ? S.optBtnActivo : {}) }} onClick={() => setQuien(q)}>{q}</button>)}
      </div>
      <div style={S.fieldLabel}>PIN DE ADMINISTRACIÓN</div>
      <input style={S.pin} type="password" inputMode="numeric" autoComplete="off" value={pin} onChange={e => setPin(e.target.value)} onKeyDown={e => e.key === 'Enter' && entrar()} aria-label="PIN de administración" />
      {error && <div style={S.error}>{error}</div>}
      {faltan && <div style={S.ayuda}>Cuando estén cargadas en Vercel, hacé un Redeploy para que la app las tome.</div>}
      <button style={{ ...S.btn, opacity: pin && !entrando ? 1 : 0.5 }} disabled={!pin || entrando} onClick={entrar}>{entrando ? 'Verificando…' : 'Entrar'}</button>
      <div style={{ ...S.ayuda, fontSize: 12 }}>Es un PIN distinto del de fichadas. La sesión queda abierta 12 horas en este dispositivo.</div>
    </div>
  )
}

export default function Administracion({ perfilNombre = '' }) {
  const [sesion, setSesion] = useState(getSesion())
  const [estado, setEstado] = useState(null)
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState(null)

  async function cargar() {
    setCargando(true); setError(null)
    try { setEstado(await pedirAdmin('estado')) }
    catch (e) { if (e instanceof ErrorSesion) setSesion(null); else setError(e.message) }
    finally { setCargando(false) }
  }
  useEffect(() => { if (sesion) cargar() }, [sesion?.token])

  function salir() { cerrarSesion(); setSesion(null); setEstado(null) }

  return (
    <div style={S.page}>
      <div style={S.header}>
        <div>
          <div style={S.headerTitle}>ADMINISTRACIÓN</div>
          <div style={S.headerSub}>{sesion ? `Sesión de ${sesion.quien || 'admin'} · hasta el ${horaCorta(sesion.exp)}` : 'Ingresá con el PIN de administración'}</div>
        </div>
        {sesion && (
          <div style={{ display: 'flex', gap: 8 }}>
            <button style={S.refreshBtn} onClick={cargar} aria-label="Actualizar">↻</button>
            <button style={S.salirBtn} onClick={salir}>Cerrar sesión</button>
          </div>
        )}
      </div>
      <div style={S.body}>
        {!sesion ? <Login perfilNombre={perfilNombre} onEntrar={setSesion} /> : (
          <>
            {cargando && !estado && <div style={S.muted}>Conectando con la planilla de Administración…</div>}
            {error && <div style={S.card}><div style={S.error}>{error}</div><button style={S.btnSec} onClick={cargar}>Reintentar</button></div>}
            {estado && (
              <>
                <div style={S.card}>
                  <div style={S.cardTitulo}>Conexiones</div>
                  <div style={S.fila}><span style={S.ok}>✓</span><span>Planilla de Administración: <strong>{estado.planilla}</strong></span></div>
                  {estado.local.ok
                    ? <div style={S.fila}><span style={S.ok}>✓</span><span>Planilla del local: <strong>{estado.local.titulo}</strong> (solo para leer ventas y pagos)</span></div>
                    : <div style={S.fila}><span style={S.mal}>✕</span><span>Planilla del local: {estado.local.error}</span></div>}
                </div>
                <div style={S.card}>
                  <div style={S.cardTitulo}>Tablas</div>
                  {estado.tablas.some(t => t.creada) && <div style={S.ayuda}>Se crearon las tablas que faltaban, con sus encabezados. PERSONAS y CONFIG arrancan con los datos que hablamos; podés corregirlos en la planilla.</div>}
                  <div style={S.tablas}>
                    {estado.tablas.map(t => (
                      <div key={t.nombre} style={S.tabla}>
                        <div style={{ minWidth: 0 }}>
                          <div style={S.tablaNombre}>{t.nombre}{t.creada && <span style={S.badgeNueva}>NUEVA</span>}</div>
                          <div style={S.tablaDesc}>{t.desc}</div>
                        </div>
                        <div style={S.tablaFilas}>{t.filas}<span style={S.tablaFilasTxt}> {t.filas === 1 ? 'fila' : 'filas'}</span></div>
                      </div>
                    ))}
                  </div>
                </div>
                <div style={S.card}>
                  <div style={S.cardTitulo}>Lo que viene</div>
                  <div style={S.ayuda}>Cierre de mes (sueldos, alquiler con dólar blue, regalías y liquidación con Mamá), tarjeta, impresiones 3D, servicios y ahorros.</div>
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  )
}

const S = {
  page: { display: 'flex', flexDirection: 'column', height: '100%', overflowY: 'auto' },
  header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '16px 20px 12px', borderBottom: '2px solid var(--accent)', flexShrink: 0, flexWrap: 'wrap' },
  headerTitle: { fontFamily: 'Barlow Condensed, sans-serif', fontWeight: 800, fontSize: 28, color: 'var(--accent)', letterSpacing: 2 },
  headerSub: { fontFamily: 'Barlow, sans-serif', fontSize: 13, color: 'var(--muted)' },
  refreshBtn: { background: 'var(--surface)', border: '1.5px solid var(--border)', borderRadius: 10, color: 'var(--text)', fontSize: 22, width: 44, height: 44, cursor: 'pointer' },
  salirBtn: { background: 'none', border: '1.5px solid var(--border)', borderRadius: 10, color: 'var(--muted)', fontFamily: 'Barlow, sans-serif', fontSize: 14, padding: '0 14px', cursor: 'pointer' },
  body: { display: 'flex', flexDirection: 'column', gap: 12, padding: '16px 20px 28px', maxWidth: 760, width: '100%', margin: '0 auto' },
  loginCard: { display: 'flex', flexDirection: 'column', gap: 10, background: 'var(--surface)', border: '1.5px solid var(--border)', borderRadius: 16, padding: 22, maxWidth: 420, width: '100%', margin: '20px auto 0' },
  candado: { fontSize: 34, textAlign: 'center' },
  loginTitulo: { fontFamily: 'Barlow Condensed, sans-serif', fontWeight: 800, fontSize: 26, color: 'var(--text)', textAlign: 'center', letterSpacing: 1 },
  fieldLabel: { fontFamily: 'Barlow Condensed, sans-serif', fontWeight: 700, fontSize: 13, color: 'var(--muted)', letterSpacing: 1.5, marginTop: 4 },
  quienes: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 },
  optBtn: { padding: '11px 8px', background: 'var(--surface2)', border: '1.5px solid var(--border)', borderRadius: 10, cursor: 'pointer', color: 'var(--muted)', fontFamily: 'Barlow Condensed, sans-serif', fontWeight: 700, fontSize: 17 },
  optBtnActivo: { background: 'rgba(245,200,0,0.12)', border: '1.5px solid var(--accent)', color: 'var(--accent)' },
  pin: { fontFamily: 'Barlow Condensed, sans-serif', fontWeight: 800, fontSize: 26, letterSpacing: 6, textAlign: 'center', padding: '10px', background: 'var(--bg)', border: '1.5px solid var(--border)', borderRadius: 10, color: 'var(--text)', width: '100%' },
  btn: { marginTop: 6, padding: '14px', background: 'var(--accent)', border: 'none', borderRadius: 12, color: '#000', fontFamily: 'Barlow Condensed, sans-serif', fontWeight: 800, fontSize: 19, letterSpacing: 1, cursor: 'pointer' },
  btnSec: { marginTop: 8, background: 'var(--surface2)', border: '1.5px solid var(--border)', borderRadius: 10, color: 'var(--text)', fontFamily: 'Barlow, sans-serif', fontSize: 14, padding: '8px 18px', cursor: 'pointer' },
  ayuda: { fontFamily: 'Barlow, sans-serif', fontSize: 13, color: 'var(--muted)', lineHeight: 1.45 },
  error: { fontFamily: 'Barlow, sans-serif', fontSize: 14, color: '#ef4444', lineHeight: 1.4 },
  muted: { fontFamily: 'Barlow, sans-serif', fontSize: 14, color: 'var(--muted)', padding: '8px 0' },
  card: { background: 'var(--surface)', border: '1.5px solid var(--border)', borderRadius: 14, padding: 16, display: 'flex', flexDirection: 'column', gap: 8 },
  cardTitulo: { fontFamily: 'Barlow Condensed, sans-serif', fontWeight: 800, fontSize: 18, color: 'var(--accent)', letterSpacing: 1, textTransform: 'uppercase' },
  fila: { display: 'flex', gap: 10, alignItems: 'baseline', fontFamily: 'Barlow, sans-serif', fontSize: 14, color: 'var(--text)', lineHeight: 1.4 },
  ok: { color: '#22c55e', fontWeight: 800 },
  mal: { color: '#ef4444', fontWeight: 800 },
  tablas: { display: 'flex', flexDirection: 'column', gap: 6 },
  tabla: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, background: 'var(--surface2)', borderRadius: 10, padding: '9px 12px' },
  tablaNombre: { fontFamily: 'Barlow Condensed, sans-serif', fontWeight: 700, fontSize: 16, color: 'var(--text)' },
  tablaDesc: { fontFamily: 'Barlow, sans-serif', fontSize: 12, color: 'var(--muted)' },
  tablaFilas: { fontFamily: 'Barlow Condensed, sans-serif', fontWeight: 800, fontSize: 20, color: 'var(--text)', flexShrink: 0 },
  tablaFilasTxt: { fontSize: 12, fontWeight: 600, color: 'var(--muted)' },
  badgeNueva: { marginLeft: 8, fontSize: 10, fontWeight: 800, color: '#22c55e', background: 'rgba(34,197,94,0.15)', borderRadius: 4, padding: '1px 5px', letterSpacing: 1, verticalAlign: 'middle' },
}
