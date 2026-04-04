// src/components/BarcodeScanner.jsx
import { useEffect, useRef, useState } from 'react'
import {
  BrowserMultiFormatReader,
  DecodeHintType,
  BarcodeFormat,
} from '@zxing/library'

const FORMATS = [
  BarcodeFormat.QR_CODE,
  BarcodeFormat.EAN_13,
  BarcodeFormat.EAN_8,
  BarcodeFormat.CODE_128,
  BarcodeFormat.CODE_39,
  BarcodeFormat.UPC_A,
  BarcodeFormat.UPC_E,
  BarcodeFormat.DATA_MATRIX,
  BarcodeFormat.ITF,
  BarcodeFormat.CODABAR,
]

export default function BarcodeScanner({ onDetected, onClose }) {
  const videoRef = useRef(null)
  const readerRef = useRef(null)
  const [confirmacion, setConfirmacion] = useState(null)
  const [error, setError] = useState(null)
  const scanningRef = useRef(true)

  useEffect(() => {
    const hints = new Map()
    hints.set(DecodeHintType.POSSIBLE_FORMATS, FORMATS)
    hints.set(DecodeHintType.TRY_HARDER, true)

    const reader = new BrowserMultiFormatReader(hints, {
      delayBetweenScanAttempts: 50,
      delayBetweenScanSuccess: 1500,
    })
    readerRef.current = reader

    const constraints = {
      video: {
        facingMode: { ideal: 'environment' },
        width: { ideal: 1920 },
        height: { ideal: 1080 },
        advanced: [{ focusMode: 'continuous' }, { exposureMode: 'continuous' }],
      }
    }

    navigator.mediaDevices.getUserMedia(constraints)
      .then(stream => {
        if (!videoRef.current) return
        videoRef.current.srcObject = stream

        // Intentar activar autoenfoque continuo en la pista de video
        const track = stream.getVideoTracks()[0]
        if (track) {
          const caps = track.getCapabilities?.()
          if (caps?.focusMode?.includes('continuous')) {
            track.applyConstraints({ advanced: [{ focusMode: 'continuous' }] }).catch(() => {})
          }
        }

        videoRef.current.play().then(() => {
          scanLoop(reader, stream)
        })
      })
      .catch(() => setError('No se pudo acceder a la cámara. Verificá los permisos.'))

    return () => {
      scanningRef.current = false
      stopStream()
    }
  }, [])

  function stopStream() {
    try {
      if (videoRef.current?.srcObject) {
        videoRef.current.srcObject.getTracks().forEach(t => t.stop())
        videoRef.current.srcObject = null
      }
    } catch (_) {}
  }

  function scanLoop(reader, stream) {
    if (!scanningRef.current || !videoRef.current) return

    try {
      const result = reader.decodeFromVideoElement(videoRef.current)
      if (result) {
        const codigo = result.getText()
        scanningRef.current = false
        const info = onDetected(codigo)
        setConfirmacion(info)
        setTimeout(() => {
          setConfirmacion(null)
          scanningRef.current = true
          scanLoop(reader, stream)
        }, 1500)
        return
      }
    } catch (_) {}

    requestAnimationFrame(() => scanLoop(reader, stream))
  }

  function handleClose() {
    scanningRef.current = false
    stopStream()
    onClose()
  }

  return (
    <div style={S.overlay} onClick={handleClose}>
      <div style={S.box} onClick={e => e.stopPropagation()}>
        <div style={S.header}>
          <span style={S.title}>ESCANEAR PRODUCTO</span>
          <button style={S.closeBtn} onClick={handleClose}>✕</button>
        </div>

        {error ? (
          <div style={S.error}>{error}</div>
        ) : (
          <div style={S.videoWrap}>
            <video ref={videoRef} style={S.video} muted playsInline />
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
  crosshair: { position:'absolute', inset:0, margin:'auto', width:'70%', height:'45%', border:'2.5px solid var(--accent)', borderRadius:8, boxShadow:'0 0 0 2000px rgba(0,0,0,0.35)' },
  hint: { position:'absolute', bottom:16, left:0, right:0, textAlign:'center', fontFamily:'Barlow, sans-serif', fontSize:14, color:'rgba(255,255,255,0.7)' },
  confirmBanner: { position:'absolute', inset:0, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:12 },
  confirmOk: { background:'rgba(34,197,94,0.92)' },
  confirmError: { background:'rgba(239,68,68,0.92)' },
  confirmIcon: { fontSize:64, color:'#fff', lineHeight:1 },
  confirmNombre: { fontFamily:'Barlow Condensed, sans-serif', fontWeight:800, fontSize:26, color:'#fff', textAlign:'center', padding:'0 20px' },
  error: { padding:32, textAlign:'center', fontFamily:'Barlow, sans-serif', fontSize:15, color:'#ef4444' },
}
