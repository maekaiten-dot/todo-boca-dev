// src/components/ModoPartido.jsx
// Botón del modo partido (solo Admin) y barra de estado debajo del encabezado: si el modo está
// prendido y cuántas ventas faltan guardar. Las ventas con problema las ve y resuelve un Admin.
import { useState } from 'react'
import { reintentarVenta, descartarVenta } from '../lib/colaVentas.js'

export function BotonModoPartido({ activo, cambiando, onCambiar }) {
  const [confirmar, setConfirmar] = useState(false)
  const angosto = typeof window !== 'undefined' && window.innerWidth < 600
  return (
    <div style={{ position: 'relative' }}>
      <button style={{ ...S.boton, ...(activo ? S.botonActivo : {}), ...(angosto ? { padding: '4px 9px' } : {}) }} onClick={() => setConfirmar(c => !c)} disabled={cambiando} aria-pressed={activo}
        aria-label={activo ? 'Modo partido prendido' : 'Modo partido'}
        title={activo ? 'Apagar el modo partido en todos los dispositivos' : 'Prender el modo partido en todos los dispositivos'}>
        {cambiando ? '…' : activo ? (angosto ? '⚡ ON' : '⚡ PARTIDO · ON') : (angosto ? '⚡' : '⚡ Partido')}
      </button>
      {confirmar && (
        <div style={S.confirmWrap} role="group" aria-label="Confirmar modo partido">
          <div style={S.confirmTxt}>{activo ? 'Apagar el modo partido en todos los dispositivos?' : 'Prender el modo partido en todos los dispositivos?'}</div>
          <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
            <button style={S.confirmSi} onClick={() => { setConfirmar(false); onCambiar(!activo) }}>{activo ? 'Sí, apagar' : 'Sí, prender'}</button>
            <button style={S.confirmNo} onClick={() => setConfirmar(false)}>No</button>
          </div>
        </div>
      )}
    </div>
  )
}

export function BarraModoPartido({ activo, quien, cola, esAdmin, perfilNombre }) {
  const [verErrores, setVerErrores] = useState(false)
  const [descartando, setDescartando] = useState(null)
  const { pendientes = 0, conError = [], sinConexion } = cola || {}
  if (!activo && !pendientes && !conError.length) return null
  return (
    <>
      <div style={{ ...S.barra, ...(activo ? S.barraActiva : S.barraNormal) }} role="status">
        {activo && <span style={S.titulo}>⚡ MODO PARTIDO{quien ? <span style={S.quien}> · lo prendió {quien}</span> : null}</span>}
        <span style={S.estado}>
          {pendientes > 0
            ? <>⏳ {pendientes === 1 ? '1 venta guardándose' : `${pendientes} ventas guardándose`}{sinConexion ? ' · esperando conexión' : ''} · <b>no cierres la app</b></>
            : '✓ Todas las ventas guardadas'}
        </span>
        {conError.length > 0 && (
          esAdmin
            ? <button style={S.errBtn} onClick={() => setVerErrores(true)}>⚠ {conError.length} con problema</button>
            : <span style={S.errTxt}>⚠ {conError.length} {conError.length === 1 ? 'venta' : 'ventas'} con problema · avisale a un admin</span>
        )}
      </div>
      {verErrores && (
        <div style={S.overlay} onClick={() => setVerErrores(false)}>
          <div style={S.modal} onClick={e => e.stopPropagation()} role="dialog" aria-label="Ventas con problema">
            <div style={S.modalTitulo}>Ventas que no se pudieron guardar</div>
            <div style={S.modalSub}>Están guardadas en este dispositivo. Probá de nuevo; si sigue igual, cargala a mano desde Vender y después descartala acá.</div>
            {conError.length === 0 && <div style={S.modalSub}>No queda ninguna.</div>}
            {conError.map(v => (
              <div key={v.uid} style={S.item}>
                <div style={{ flex: 1 }}>
                  <div style={S.itemResumen}>{v.resumen}</div>
                  <div style={S.itemSub}>Cobrada {v.creada} · {v.error}</div>
                </div>
                <button style={S.itemBtn} onClick={() => reintentarVenta(v.uid)}>Reintentar</button>
                {descartando === v.uid
                  ? <button style={{ ...S.itemBtn, background: '#ef4444', color: '#fff' }} onClick={() => { descartarVenta(v.uid, perfilNombre); setDescartando(null) }}>¿Seguro? Descartar</button>
                  : <button style={{ ...S.itemBtn, background: 'none', color: 'var(--muted)', border: '1px solid var(--border)' }} onClick={() => setDescartando(v.uid)}>Descartar</button>}
              </div>
            ))}
            <button style={S.cerrar} onClick={() => setVerErrores(false)}>Cerrar</button>
          </div>
        </div>
      )}
    </>
  )
}

const S = {
  boton: { fontFamily: 'Barlow Condensed, sans-serif', fontWeight: 700, fontSize: 13, color: 'var(--accent)', background: 'none', border: '1.5px solid var(--accent)', borderRadius: 20, padding: '4px 12px', cursor: 'pointer', whiteSpace: 'nowrap' },
  botonActivo: { color: '#000', background: '#f97316', borderColor: '#f97316' },
  confirmWrap: { position: 'absolute', top: 'calc(100% + 8px)', right: 0, zIndex: 250, width: 230, background: 'var(--surface2)', border: '1px solid var(--accent)', borderRadius: 12, padding: 12, boxShadow: '0 8px 24px rgba(0,0,0,0.5)' },
  confirmTxt: { fontFamily: 'Barlow, sans-serif', fontSize: 14, color: 'var(--text)', lineHeight: 1.3 },
  confirmSi: { flex: 1, fontFamily: 'Barlow Condensed, sans-serif', fontWeight: 700, fontSize: 15, background: 'var(--accent)', color: '#000', border: 'none', borderRadius: 8, padding: '8px 12px', cursor: 'pointer' },
  confirmNo: { fontFamily: 'Barlow Condensed, sans-serif', fontWeight: 700, fontSize: 15, background: 'none', color: 'var(--muted)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 14px', cursor: 'pointer' },
  barra: { display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', padding: '6px 16px', fontFamily: 'Barlow, sans-serif', fontSize: 14, flexShrink: 0 },
  barraActiva: { background: '#f97316', color: '#000' },
  barraNormal: { background: 'var(--surface2)', color: 'var(--text)', borderBottom: '1px solid var(--border)' },
  titulo: { fontFamily: 'Barlow Condensed, sans-serif', fontWeight: 800, fontSize: 16, letterSpacing: 1 },
  quien: { fontFamily: 'Barlow, sans-serif', fontWeight: 400, fontSize: 13, letterSpacing: 0 },
  estado: { flex: 1, minWidth: 180 },
  errBtn: { fontFamily: 'Barlow Condensed, sans-serif', fontWeight: 700, fontSize: 14, background: '#7f1d1d', color: '#fff', border: 'none', borderRadius: 16, padding: '4px 12px', cursor: 'pointer' },
  errTxt: { fontWeight: 700, color: '#7f1d1d' },
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 },
  modal: { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: 20, width: '100%', maxWidth: 560, maxHeight: '85vh', overflowY: 'auto' },
  modalTitulo: { fontFamily: 'Barlow Condensed, sans-serif', fontWeight: 800, fontSize: 22, color: 'var(--text)', marginBottom: 6 },
  modalSub: { fontFamily: 'Barlow, sans-serif', fontSize: 14, color: 'var(--muted)', marginBottom: 12 },
  item: { display: 'flex', alignItems: 'center', gap: 8, padding: '10px 0', borderTop: '1px solid var(--border)', flexWrap: 'wrap' },
  itemResumen: { fontFamily: 'Barlow, sans-serif', fontSize: 15, color: 'var(--text)' },
  itemSub: { fontFamily: 'Barlow, sans-serif', fontSize: 13, color: '#f87171' },
  itemBtn: { fontFamily: 'Barlow Condensed, sans-serif', fontWeight: 700, fontSize: 14, background: 'var(--accent)', color: '#000', border: 'none', borderRadius: 8, padding: '6px 12px', cursor: 'pointer' },
  cerrar: { marginTop: 12, width: '100%', padding: 12, background: 'none', border: '1.5px solid var(--border)', borderRadius: 10, color: 'var(--muted)', fontFamily: 'Barlow, sans-serif', fontSize: 15, cursor: 'pointer' },
}
