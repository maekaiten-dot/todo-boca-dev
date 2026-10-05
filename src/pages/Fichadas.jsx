// src/pages/Fichadas.jsx — Admin: habilitar la tablet, vincular celulares y ver dispositivos
import { useEffect, useState } from 'react'
import QrSvg from '../components/QrSvg.jsx'
import { leerLlave, borrarLlave, vincularTerminal, iniciarVinculacion, listarDispositivos, darDeBajaDispositivo, pedirAlmacenamientoPersistente, CLAVE_TERMINAL } from '../api/fichadas.js'

export default function Fichadas({ usuarios = [] }) {
  const [pin, setPin] = useState('')
  const [terminal, setTerminal] = useState(null)
  const [empleada, setEmpleada] = useState('')
  const [vinculacion, setVinculacion] = useState(null) // { url, nombre, vence }
  const [dispositivos, setDispositivos] = useState(null)
  const [cargando, setCargando] = useState('')
  const [error, setError] = useState('')
  const [, setTick] = useState(0)

  const empleadas = usuarios.filter(u => u.nombre && u.nombre !== 'Tablet')

  useEffect(() => { leerLlave(CLAVE_TERMINAL).then(setTerminal); pedirAlmacenamientoPersistente() }, [])
  useEffect(() => { if (!vinculacion) return; const iv = setInterval(() => setTick(t => t + 1), 1000); return () => clearInterval(iv) }, [vinculacion])

  async function accion(nombre, fn) {
    if (!pin) { setError('Ingresá el PIN de fichadas'); return }
    setCargando(nombre); setError('')
    try { await fn() } catch (e) { setError(e.message) } finally { setCargando('') }
  }

  const habilitarTablet = () => accion('tablet', async () => {
    if (terminal && !confirm('Esta tablet ya está habilitada. ¿Volver a habilitarla? (la anterior queda activa hasta que la des de baja)')) return
    const t = await vincularTerminal(pin, 'Tablet del local')
    setTerminal(t)
  })

  const deshabilitarTabletLocal = async () => {
    if (!confirm('¿Quitar la habilitación de esta tablet? Después dala de baja también en la lista de dispositivos.')) return
    await borrarLlave(CLAVE_TERMINAL); setTerminal(null)
  }

  const generarVinculacion = () => accion('vincular', async () => {
    const u = empleadas.find(x => x.id === empleada)
    if (!u) throw new Error('Elegí la empleada')
    const { token } = await iniciarVinculacion(pin, u.id, u.nombre)
    const url = `${window.location.origin}${window.location.pathname}?fichar=1&v=${encodeURIComponent(token)}`
    setVinculacion({ url, nombre: u.nombre, vence: Date.now() + 10 * 60_000 })
  })

  const verDispositivos = () => accion('lista', async () => setDispositivos((await listarDispositivos(pin)).dispositivos))
  const darDeBaja = (d) => accion('baja', async () => {
    if (!confirm(`¿Dar de baja "${d.nombre}" (${d.idDispositivo})? Ya no va a poder fichar con ese dispositivo.`)) return
    setDispositivos((await darDeBajaDispositivo(pin, d.idDispositivo)).dispositivos)
  })

  const segRestantes = vinculacion ? Math.max(0, Math.round((vinculacion.vence - Date.now()) / 1000)) : 0

  return (
    <div style={S.page}>
      <div style={S.titulo}>Fichadas</div>

      <div style={S.card}>
        <label style={S.label}>PIN de fichadas</label>
        <input style={S.input} type="password" inputMode="numeric" value={pin} onChange={e => setPin(e.target.value)} placeholder="El que configuraste en Vercel" />
        {error && <div style={S.error}>{error}</div>}
      </div>

      <div style={S.card}>
        <div style={S.subtitulo}>1 · Esta tablet</div>
        {terminal
          ? <div style={S.ok}>✓ Habilitada para fichar desde el {new Date(terminal.vinculado).toLocaleDateString('es-AR')}</div>
          : <div style={S.muted}>Todavía no está habilitada. Solo las tablets habilitadas pueden registrar fichadas.</div>}
        <div style={S.fila}>
          <button style={S.btn} onClick={habilitarTablet} disabled={!!cargando}>{cargando === 'tablet' ? 'Habilitando…' : terminal ? 'Volver a habilitar' : 'Habilitar esta tablet'}</button>
          {terminal && <button style={S.btnSec} onClick={deshabilitarTabletLocal}>Quitar</button>}
        </div>
      </div>

      <div style={S.card}>
        <div style={S.subtitulo}>2 · Vincular el celular de una empleada</div>
        <div style={S.muted}>La empleada escanea este QR con la cámara de su celular y toca "Vincular". En iPhone, primero tiene que agregar la página a la pantalla de inicio y vincular desde ese ícono (la pantalla se lo explica). Vale una sola vez y por 10 minutos. Si ya tenía otro celular, queda dado de baja.</div>
        <select style={S.input} value={empleada} onChange={e => { setEmpleada(e.target.value); setVinculacion(null) }}>
          <option value="">Elegí la empleada…</option>
          {empleadas.map(u => <option key={u.id} value={u.id}>{u.nombre} ({u.id})</option>)}
        </select>
        <button style={S.btn} onClick={generarVinculacion} disabled={!!cargando}>{cargando === 'vincular' ? 'Generando…' : 'Generar QR de vinculación'}</button>
        {vinculacion && (segRestantes > 0 ? (
          <div style={S.qrWrap}>
            <div style={S.qrBox}><QrSvg texto={vinculacion.url} size={240} /></div>
            <div style={S.muted}>Para {vinculacion.nombre} · vence en {Math.floor(segRestantes / 60)}:{String(segRestantes % 60).padStart(2, '0')}</div>
          </div>
        ) : <div style={S.error}>El QR venció. Generá uno nuevo.</div>)}
      </div>

      <div style={S.card}>
        <div style={S.subtitulo}>3 · Dispositivos vinculados</div>
        <button style={S.btnSec} onClick={verDispositivos} disabled={!!cargando}>{cargando === 'lista' ? 'Cargando…' : 'Ver lista'}</button>
        {dispositivos && (dispositivos.length === 0 ? <div style={S.muted}>No hay dispositivos vinculados.</div> : (
          <div style={S.lista}>
            {dispositivos.map(d => (
              <div key={d.idDispositivo} style={{ ...S.item, opacity: d.activo ? 1 : 0.5 }}>
                <div>
                  <div style={S.itemNombre}>{d.idUsuario === 'TERMINAL' ? '🖥 ' : '📱 '}{d.nombre}</div>
                  <div style={S.itemDet}>{d.activo ? 'Activo' : 'De baja'} · desde {d.fechaAlta} · {d.idDispositivo}</div>
                </div>
                {d.activo && <button style={S.btnBaja} onClick={() => darDeBaja(d)} disabled={!!cargando}>Dar de baja</button>}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

const S = {
  page: { flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 640, width: '100%', margin: '0 auto' },
  titulo: { fontFamily: 'Barlow Condensed, sans-serif', fontWeight: 800, fontSize: 26, color: 'var(--accent)', letterSpacing: 1.5, textTransform: 'uppercase' },
  card: { background: 'var(--surface)', border: '1.5px solid var(--border)', borderRadius: 14, padding: 16, display: 'flex', flexDirection: 'column', gap: 10 },
  subtitulo: { fontFamily: 'Barlow Condensed, sans-serif', fontWeight: 800, fontSize: 19, color: 'var(--text)', letterSpacing: 0.5 },
  label: { fontFamily: 'Barlow Condensed, sans-serif', fontWeight: 700, fontSize: 14, color: 'var(--muted)', letterSpacing: 1, textTransform: 'uppercase' },
  input: { padding: '12px 14px', background: 'var(--surface2)', border: '1.5px solid var(--border)', borderRadius: 10, color: 'var(--text)', fontFamily: 'Barlow, sans-serif', fontSize: 16 },
  muted: { fontFamily: 'Barlow, sans-serif', fontSize: 13, color: 'var(--muted)', lineHeight: 1.5 },
  ok: { fontFamily: 'Barlow, sans-serif', fontSize: 14, color: 'var(--success)' },
  error: { fontFamily: 'Barlow, sans-serif', fontSize: 14, color: '#ef4444' },
  fila: { display: 'flex', gap: 10, flexWrap: 'wrap' },
  btn: { padding: '12px 16px', background: 'var(--accent)', border: 'none', borderRadius: 10, color: '#000', fontFamily: 'Barlow Condensed, sans-serif', fontWeight: 800, fontSize: 16, letterSpacing: 0.5, cursor: 'pointer' },
  btnSec: { padding: '12px 16px', background: 'none', border: '1.5px solid var(--border)', borderRadius: 10, color: 'var(--text)', fontFamily: 'Barlow Condensed, sans-serif', fontWeight: 700, fontSize: 16, cursor: 'pointer', alignSelf: 'flex-start' },
  btnBaja: { padding: '8px 12px', background: 'none', border: '1.5px solid #ef4444', borderRadius: 8, color: '#ef4444', fontFamily: 'Barlow Condensed, sans-serif', fontWeight: 700, fontSize: 14, cursor: 'pointer', flexShrink: 0 },
  qrWrap: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, paddingTop: 6 },
  qrBox: { background: '#fff', padding: 10, borderRadius: 12, lineHeight: 0 },
  lista: { display: 'flex', flexDirection: 'column', gap: 8 },
  item: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, padding: 12, background: 'var(--surface2)', borderRadius: 10 },
  itemNombre: { fontFamily: 'Barlow Condensed, sans-serif', fontWeight: 700, fontSize: 17, color: 'var(--text)' },
  itemDet: { fontFamily: 'Barlow, sans-serif', fontSize: 12, color: 'var(--muted)', wordBreak: 'break-all' },
}
