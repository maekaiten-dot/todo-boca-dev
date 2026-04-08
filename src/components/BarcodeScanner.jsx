// src/components/BarcodeScanner.jsx
import { useEffect, useRef, useState } from 'react'
import jsQR from 'jsqr'

export default function BarcodeScanner({ onDetected, onClose }) {
  const videoRef = useRef(null)
  const canvasRef = useRef(null)
  const streamRef = useRef(null)
  const animFrameRef = useRef(null)
  const detectorRef = useRef(null)
  const [confirmacion, setConfirmacion] = useState(null)
  const [error, setError] = useState(null)
  const pausedRef = useRef(false)
  const [usando, setUsando] = useState('') // 'native' | 'jsqr'

  useEffect(() => {
    startCamera()
    return () => {
      pausedRef.current = true
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current)
      stopStream()
    }
  }, [])

  async function startCamera() {
    try {
      // Intentar BarcodeDetector nativo primero
      if ('BarcodeDetector' in window) {
        try {
          const supported = await window.BarcodeDetector.getSupportedFormats()
          if (supported.includes('qr_code')) {
            detectorRef.current = new window.BarcodeDetector({ formats: ['qr_code'] })
            setUsando('native')
          }
        } catch (_) {}
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'user' }, // cámara delantera
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        }
      })
      streamRef.current = stream

      // Autoenfoque continuo
      const track = stream.getVideoTracks()[0]
      try {
        const caps = track.getCapabilities?.()
        if (caps?.focusMode?.includes('continuous')) {
          await track.applyConstraints({ advanced: [{ focusMode: 'continuous' }] })
        }
      } catch (_) {}

      if (videoRef.current) {
        videoRef.current.srcObject = stream
        videoRef.current.setAttribute('playsinline', true)
        await videoRef.current.play()
        if (!usando) setUsando(detectorRef.current ? 'native' : 'jsqr')
        scanLoop()
      }
    } catch (e) {
      setError('No se pudo acceder a la cámara. Verificá los permisos.')
    }
  }

  function stopStream() {
    try {
      streamRef.current?.getTracks().forEach(t => t.stop())
      streamRef.current = null
      if (videoRef.current) videoRef.current.srcObject = null
    } catch (_) {}
  }

  async function scanLoop() {
    if (pausedRef.current) return

    const video = videoRef.current
    if (!video || video.readyState !== video.HAVE_ENOUGH_DATA) {
      animFrameRef.current = requestAnimationFrame(scanLoop)
      return
    }

    try {
      // Intento 1: BarcodeDetector nativo (más preciso, usa hardware)
      if (detectorRef.current) {
        const barcodes = await detectorRef.current.detect(video)
        if (barcodes.length > 0) {
          handleDetected(barcodes[0].rawValue)
          return
        }
        animFrameRef.current = requestAnimationFrame(scanLoop)
        return
      }

      // Fallback: jsQR
      const canvas = canvasRef.current
      if (!canvas) { animFrameRef.current = requestAnimationFrame(scanLoop); return }

      const w = video.videoWidth
      const h = video.videoHeight
      canvas.width = w
      canvas.height = h

      const ctx = canvas.getContext('2d', { willReadFrequently: true })
      ctx.drawImage(video, 0, 0, w, h)
      const imageData = ctx.getImageData(0, 0, w, h)

      const code = jsQR(imageData.data, w, h, { inversionAttempts: 'attemptBoth' })
      if (code?.data) {
        handleDetected(code.data)
        return
      }
    } catch (_) {}

    animFrameRef.current = requestAnimationFrame(scanLoop)
  }

  function handleDetected(valor) {
    pausedRef.current = true
    const info = onDetected(valor)
    setConfirmacion(info)
    setTimeout(() => {
      setConfirmacion(null)
      pausedRef.current = false
      scanLoop()
    }, 1500)
  }

  function handleClose() {
    pausedRef.current = true
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current)
    stopStream()
    onClose()
  }

  return (
    <div style={S.overlay} onClick={handleClose}>
      <div style={S.box} onClick={e => e.stopPropagation()}>
        <div style={S.header}>
          <span style={S.title}>ESCANEAR QR</span>
          <div style={{display:'flex', alignItems:'center', gap:8}}>
            {usando && (
              <span style={{...S.badge, ...(usando==='native' ? S.badgeNative : S.badgeJsqr)}}>
                {usando === 'native' ? '⚡ Nativo' : 'jsQR'}
              </span>
            )}
            <button style={S.closeBtn} onClick={handleClose}>✕</button>
          </div>
        </div>

        {error ? (
          <div style={S.error}>{error}</div>
        ) : (
          <div style={S.videoWrap}>
            <video ref={videoRef} style={S.video} muted playsInline />
            <canvas ref={canvasRef} style={{ display: 'none' }} />
            <div style={S.crosshair} />
            {!confirmacion && <div style={S.hint}>Apuntá el QR al recuadro</div>}
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
  badge: { fontFamily:'Barlow Condensed, sans-serif', fontWeight:700, fontSize:11, padding:'2px 8px', borderRadius:20, letterSpacing:0.5 },
  badgeNative: { background:'rgba(34,197,94,0.2)', color:'#22c55e' },
  badgeJsqr: { background:'rgba(245,200,0,0.15)', color:'var(--accent)' },
  closeBtn: { background:'none', border:'none', color:'var(--muted)', fontSize:20, cursor:'pointer', padding:'0 4px' },
  videoWrap: { position:'relative', background:'#000', aspectRatio:'4/3' },
  video: { width:'100%', height:'100%', objectFit:'cover', display:'block' },
  crosshair: { position:'absolute', inset:0, margin:'auto', width:'65%', height:'65%', border:'2.5px solid var(--accent)', borderRadius:12, boxShadow:'0 0 0 2000px rgba(0,0,0,0.4)' },
  hint: { position:'absolute', bottom:16, left:0, right:0, textAlign:'center', fontFamily:'Barlow, sans-serif', fontSize:14, color:'rgba(255,255,255,0.8)' },
  confirmBanner: { position:'absolute', inset:0, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:12 },
  confirmOk: { background:'rgba(34,197,94,0.92)' },
  confirmError: { background:'rgba(239,68,68,0.92)' },
  confirmIcon: { fontSize:64, color:'#fff', lineHeight:1 },
  confirmNombre: { fontFamily:'Barlow Condensed, sans-serif', fontWeight:800, fontSize:26, color:'#fff', textAlign:'center', padding:'0 20px' },
  error: { padding:32, textAlign:'center', fontFamily:'Barlow, sans-serif', fontSize:15, color:'#ef4444' },
}
