// src/components/BarcodeScanner.jsx
import { useEffect, useRef, useState, useCallback } from 'react'
import { BrowserMultiFormatReader } from '@zxing/browser'

// Tablet: pantalla mínima >= 768px → cámara delantera
// Teléfono: pantalla mínima < 768px → cámara trasera
const facingMode = Math.min(window.screen.width, window.screen.height) >= 768
  ? 'user'
  : 'environment'

export default function BarcodeScanner({ onDetected, onClose }) {
  const videoRef = useRef(null)
  const controlsRef = useRef(null)
  const [confirmacion, setConfirmacion] = useState(null) // { nombre, ok }
  const [error, setError] = useState(null)

  const startScanning = useCallback(() => {
    const reader = new BrowserMultiFormatReader()
    reader.decodeFromConstraints(
      { video: { facingMode } },
      videoRef.current,
      (result) => {
        if (!result) return
        const codigo = result.getText()
        try { controlsRef.current?.stop() } catch (_) {}
        controlsRef.current = null
        const info = onDetected(codigo) // devuelve { nombre, ok }
        setConfirmacion(info)
        setTimeout(() => {
          setConfirmacion(null)
          startScanning()
        }, 2000)
      }
    )
    .then(controls => { controlsRef.current = controls })
    .catch(() => setError('No se pudo acceder a la cámara. Verificá los permisos.'))
  }, [])

  useEffect(() => {
    startScanning()
    return () => {
      try { controlsRef.current?.stop() } catch (_) {}
    }
  }, [])

  return (
    <div style={S.overlay} onClick={onClose}>
      <div style={S.box} onClick={e => e.stopPropagation()}>
        <div style={S.header}>
          <span style={S.title}>ESCANEAR PRODUCTO</span>
          <button style={S.closeBtn} onClick={onClose}>✕</button>
        </div>

        {error ? (
          <div style={S.error}>{error}</div>
        ) : (
          <div style={S.videoWrap}>
            <video ref={videoRef} style={S.video} />
            <div style={S.crosshair} />
            {!confirmacion && <div style={S.hint}>Apuntá al código de barras o QR</div>}

            {confirmacion && (
              <div style={{...S.confirmBanner, ...(confirmacion.ok ? S.confirmOk : S.confirmError)}}>
                <div style={S.confirmIcon}>{confirmacion.ok ? '✓' : '✕'}</div>
                <div style={S.confirmNombre}>{confirmacion.nombre}</div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

const S = {
  overlay: { position:'fixed', inset:0, background:'rgba(0,0,10,0.85)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:300, backdropFilter:'blur(4px)' },
  box: { background:'var(--surface)', border:'2px solid var(--border)', borderRadius:16, overflow:'hidden', width:'min(480px, 95vw)', display:'flex', flexDirection:'column' },
  header: { display:'flex', justifyContent:'space-between', alignItems:'center', padding:'14px 18px', borderBottom:'1px solid var(--border)' },
  title: { fontFamily:'Barlow Condensed, sans-serif', fontWeight:800, fontSize:20, color:'var(--accent)', letterSpacing:1 },
  closeBtn: { background:'none', border:'none', color:'var(--muted)', fontSize:20, cursor:'pointer', padding:'0 4px' },
  videoWrap: { position:'relative', background:'#000', aspectRatio:'4/3' },
  video: { width:'100%', height:'100%', objectFit:'cover', display:'block' },
  crosshair: { position:'absolute', inset:0, margin:'auto', width:'60%', height:'40%', border:'2px solid var(--accent)', borderRadius:8, boxShadow:'0 0 0 2000px rgba(0,0,0,0.4)' },
  hint: { position:'absolute', bottom:16, left:0, right:0, textAlign:'center', fontFamily:'Barlow, sans-serif', fontSize:14, color:'rgba(255,255,255,0.7)' },
  confirmBanner: { position:'absolute', inset:0, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:12 },
  confirmOk: { background:'rgba(34,197,94,0.92)' },
  confirmError: { background:'rgba(239,68,68,0.92)' },
  confirmIcon: { fontSize:64, color:'#fff', lineHeight:1 },
  confirmNombre: { fontFamily:'Barlow Condensed, sans-serif', fontWeight:800, fontSize:26, color:'#fff', textAlign:'center', padding:'0 20px' },
  error: { padding:32, textAlign:'center', fontFamily:'Barlow, sans-serif', fontSize:15, color:'#ef4444' },
}
