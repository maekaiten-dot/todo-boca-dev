// src/pages/FicharCelular.jsx
// Pantalla que abre cada empleada en SU celular (?fichar=1).
// Muestra un QR firmado que cambia cada 10 segundos para escanear en la tablet.
import { useEffect, useState } from 'react'
import QrSvg from '../components/QrSvg.jsx'
import { CSS_GLOBAL } from '../App.jsx'
import { leerLlave, borrarLlave, vincularCelular, generarQrFichada, sincronizarHora, ahoraServidor, estadoCelular, esIphone, esIconoInicio, CLAVE_CELULAR, QR_ROTACION_MS } from '../api/fichadas.js'

export default function FicharCelular() {
  const tokenUrl = new URLSearchParams(window.location.search).get('v')
  const [estado, setEstado] = useState('cargando') // cargando | sinVincular | vinculando | listo | dadoDeBaja | error
  const [llave, setLlave] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    (async () => {
      if (!window.crypto?.subtle || !window.indexedDB) { setError('Este navegador no es compatible. Abrí el link con Chrome o Safari.'); setEstado('error'); return }
      await sincronizarHora()
      const guardada = await leerLlave(CLAVE_CELULAR)
      if (guardada && !tokenUrl) {
        const activo = await estadoCelular(guardada.idDispositivo)
        if (activo === false) { await borrarLlave(CLAVE_CELULAR); setLlave(guardada); setEstado('dadoDeBaja'); return }
        setLlave(guardada); setEstado('listo')
      }
      else setEstado('sinVincular')
    })()
  }, [])

  async function vincular() {
    setEstado('vinculando'); setError('')
    try {
      const datos = await vincularCelular(tokenUrl)
      window.history.replaceState(null, '', `${window.location.pathname}?fichar=1`)
      setLlave(datos); setEstado('listo')
    } catch (e) { setError(e.message); setEstado('sinVincular') }
  }

  return (
    <>
      <style>{CSS_GLOBAL}</style>
      <div style={S.page}>
        <div style={S.logo}><span style={S.todo}>TODO</span><span style={S.boca}>BOCA</span></div>
        {estado === 'cargando' && <div style={S.muted}>Cargando…</div>}
        {estado === 'error' && <div style={S.error}>{error}</div>}

        {(estado === 'sinVincular' || estado === 'vinculando') && (
          tokenUrl && esIphone() && !esIconoInicio() ? (
            <div style={S.card}>
              <div style={S.titulo}>Antes de vincular</div>
              <div style={S.muted}>En iPhone hay que vincular desde el ícono de la pantalla de inicio:</div>
              <div style={S.pasos}>
                <div>1. Tocá el botón <b>Compartir</b> de Safari (el cuadrado con la flecha).</div>
                <div>2. Elegí <b>Agregar a inicio</b> y después <b>Agregar</b>.</div>
                <div>3. Abrí el ícono nuevo de TODO BOCA y tocá <b>Vincular</b> ahí.</div>
              </div>
              <div style={S.muted}>Hacelo dentro de los próximos 10 minutos, mientras el código de vinculación siga vigente.</div>
            </div>
          ) : tokenUrl ? (
            <div style={S.card}>
              <div style={S.titulo}>Vincular este celular</div>
              <div style={S.muted}>Este va a ser el único celular desde el que vas a poder fichar. Si ya tenías otro vinculado, queda dado de baja.</div>
              {error && <div style={S.error}>{error}</div>}
              <button style={S.btn} onClick={vincular} disabled={estado === 'vinculando'}>{estado === 'vinculando' ? 'Vinculando…' : 'Vincular'}</button>
            </div>
          ) : (
            <div style={S.card}>
              <div style={S.titulo}>Celular sin vincular</div>
              <div style={S.muted}>Pedile al admin que te muestre el QR de vinculación desde TODO BOCA (Más → Fichadas) y escanealo con la cámara de este celular.</div>
            </div>
          )
        )}

        {estado === 'dadoDeBaja' && (
          <div style={S.card}>
            <div style={S.titulo}>Celular desvinculado</div>
            <div style={S.muted}>{llave?.nombre ? `${llave.nombre}, este` : 'Este'} celular ya no está habilitado para fichar (se vinculó otro o lo dieron de baja). Pedile al admin un QR de vinculación nuevo.</div>
          </div>
        )}
        {estado === 'listo' && llave && <QrRotativo llave={llave} />}
      </div>
    </>
  )
}

function QrRotativo({ llave }) {
  const [qr, setQr] = useState('')
  const [, setTick] = useState(0)

  useEffect(() => {
    let vivo = true
    async function renovar() { const t = await generarQrFichada(llave); if (vivo) setQr(t) }
    renovar()
    const iv = setInterval(renovar, QR_ROTACION_MS)
    const tick = setInterval(() => setTick(t => t + 1), 250)
    const resync = setInterval(sincronizarHora, 5 * 60_000)
    return () => { vivo = false; clearInterval(iv); clearInterval(tick); clearInterval(resync) }
  }, [llave])

  const generado = Number(qr.split('.')[2]) || ahoraServidor()
  const restante = Math.max(0, 1 - (ahoraServidor() - generado) / QR_ROTACION_MS)
  const hora = new Date(ahoraServidor()).toLocaleTimeString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })

  return (
    <div style={S.card}>
      <div style={S.nombre}>{llave.nombre}</div>
      <div style={S.qrBox}>{qr ? <QrSvg texto={qr} size={260} /> : <div style={S.muted}>Generando…</div>}</div>
      <div style={S.barra}><div style={{ ...S.barraLlena, width: `${restante * 100}%` }} /></div>
      <div style={S.hora}>{hora}</div>
      <div style={S.muted}>Mostrale este código a la tablet del local. Cambia cada 10 segundos: una captura de pantalla no sirve.</div>
    </div>
  )
}

const S = {
  page: { height: '100%', overflowY: 'auto', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20, padding: '28px 16px', background: 'var(--bg)' },
  logo: { display: 'flex', alignItems: 'baseline', gap: 6 },
  todo: { fontFamily: 'Barlow Condensed, sans-serif', fontWeight: 800, fontSize: 28, color: 'var(--text)', letterSpacing: 3 },
  boca: { fontFamily: 'Barlow Condensed, sans-serif', fontWeight: 800, fontSize: 28, color: 'var(--accent)', letterSpacing: 3 },
  card: { width: '100%', maxWidth: 380, background: 'var(--surface)', border: '2px solid var(--border)', borderRadius: 16, padding: 20, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, textAlign: 'center' },
  titulo: { fontFamily: 'Barlow Condensed, sans-serif', fontWeight: 800, fontSize: 24, color: 'var(--accent)', letterSpacing: 1, textTransform: 'uppercase' },
  nombre: { fontFamily: 'Barlow Condensed, sans-serif', fontWeight: 800, fontSize: 30, color: 'var(--text)', letterSpacing: 1 },
  muted: { fontFamily: 'Barlow, sans-serif', fontSize: 14, color: 'var(--muted)', lineHeight: 1.5 },
  error: { fontFamily: 'Barlow, sans-serif', fontSize: 14, color: '#ef4444', lineHeight: 1.5 },
  btn: { width: '100%', padding: 14, background: 'var(--accent)', border: 'none', borderRadius: 10, color: '#000', fontFamily: 'Barlow Condensed, sans-serif', fontWeight: 800, fontSize: 18, letterSpacing: 1, cursor: 'pointer' },
  pasos: { fontFamily: 'Barlow, sans-serif', fontSize: 14, color: 'var(--text)', lineHeight: 1.6, textAlign: 'left', display: 'flex', flexDirection: 'column', gap: 6 },
  qrBox: { background: '#fff', padding: 10, borderRadius: 12, lineHeight: 0 },
  barra: { width: 260, height: 6, background: 'var(--surface2)', borderRadius: 3, overflow: 'hidden' },
  barraLlena: { height: '100%', background: 'var(--accent)', transition: 'width 0.25s linear' },
  hora: { fontFamily: 'Barlow Condensed, sans-serif', fontWeight: 700, fontSize: 22, color: 'var(--text)', letterSpacing: 2 },
}
