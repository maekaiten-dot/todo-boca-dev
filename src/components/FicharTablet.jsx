// src/components/FicharTablet.jsx
// Botón "Fichar" de la tablet del local: escanea el QR del celular y lo manda al servidor.
import { useRef, useState } from 'react'
import BarcodeScanner from './BarcodeScanner.jsx'
import { leerLlave, registrarFichada, CLAVE_TERMINAL } from '../api/fichadas.js'

export default function FicharTablet() {
  const [abierto, setAbierto] = useState(false)
  const [aviso, setAviso] = useState('')
  const ultimoQr = useRef({ qr: '', info: null })

  async function abrir() {
    const term = await leerLlave(CLAVE_TERMINAL)
    if (!term) { setAviso('Esta tablet todavía no está habilitada para fichar. Un admin tiene que habilitarla en Más → Fichadas.'); return }
    ultimoQr.current = { qr: '', info: null }
    setAbierto(true)
  }

  async function procesar(qr) {
    // El mismo QR puede leerse dos veces seguidas: no lo mandamos de nuevo
    if (qr === ultimoQr.current.qr && ultimoQr.current.info) return ultimoQr.current.info
    const r = await registrarFichada(qr)
    let info
    if (r.ok && r.duplicada) info = { ok: true, nombre: r.nombre, detalle: `Ya estaba registrada · ${r.tipo} ${r.hora}` }
    else if (r.ok) info = { ok: true, nombre: r.nombre, detalle: `${r.tipo} · ${r.hora}` }
    else info = { ok: false, nombre: r.nombre || 'No registrada', detalle: r.error || 'Error desconocido', duracionMs: 3500 }
    ultimoQr.current = { qr, info }
    return info
  }

  return (
    <>
      <button style={S.btn} onClick={abrir}>⏱ Fichar</button>
      {abierto && <BarcodeScanner titulo="FICHAR INGRESO / SALIDA" onDetected={procesar} onClose={() => setAbierto(false)} autoCerrarMs={2500} />}
      {aviso && (
        <div style={S.overlay} onClick={() => setAviso('')}>
          <div style={S.box} onClick={e => e.stopPropagation()}>
            <div style={S.texto}>{aviso}</div>
            <button style={S.ok} onClick={() => setAviso('')}>Entendido</button>
          </div>
        </div>
      )}
    </>
  )
}

const S = {
  btn: { background: 'var(--accent)', border: 'none', borderRadius: 20, padding: '5px 14px', color: '#000', fontFamily: 'Barlow Condensed, sans-serif', fontWeight: 800, fontSize: 14, letterSpacing: 1, textTransform: 'uppercase', cursor: 'pointer' },
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,10,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 500, padding: 16 },
  box: { background: 'var(--surface)', border: '2px solid var(--border)', borderRadius: 16, padding: 24, maxWidth: 360, display: 'flex', flexDirection: 'column', gap: 16 },
  texto: { fontFamily: 'Barlow, sans-serif', fontSize: 15, color: 'var(--text)', lineHeight: 1.5 },
  ok: { padding: 12, background: 'var(--accent)', border: 'none', borderRadius: 10, color: '#000', fontFamily: 'Barlow Condensed, sans-serif', fontWeight: 800, fontSize: 16, cursor: 'pointer' },
}
