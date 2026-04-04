// src/components/BarcodeScanner.jsx
import { useEffect, useRef, useState } from 'react'
import jsQR from 'jsqr'

export default function BarcodeScanner({ onDetected, onClose }) {
  const videoRef = useRef(null)
  const canvasRef = useRef(null)
  const streamRef = useRef(null)
  const animFrameRef = useRef(null)
  const [confirmacion, setConfirmacion] = useState(null)
  const [error, setError] = useState(null)
  const pausedRef = useRef(false)

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
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        }
      })
      streamRef.current = stream

      // Intentar autoenfoque continuo
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

  function scanLoop() {
    if (pausedRef.current) return

    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas || video.readyState !== video.HAVE_ENOUGH_DATA) {
      animFrameRef.current = requestAnimationFrame(scanLoop)
      return
    }

    const w = video.videoWidth
    const h = video.videoHeight
    canvas.width = w
    canvas.height = h

    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    ctx.drawImage(video, 0, 0, w, h)
    const imageData = ctx.getImageData(0, 0, w, h)

    const code = jsQR(imageData.data, w, h, {
      inversionAttempts: 'dontInvert',
    })

    if (code?.data) {
      pausedRef.current = true
      const info = onDetected(code.data)
      setConfirmacion(info)
      setTimeout(() => {
        setConfirmacion(null)
        pausedRef.current = false
        scanLoop()
      }, 1500)
      return
    }

    animFrameRef.current = requestAnimationFrame(scanLoop)
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
          <button style={S.closeBtn} onClick={handleClose}>✕</button>
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
