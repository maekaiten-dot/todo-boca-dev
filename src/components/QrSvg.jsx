// src/components/QrSvg.jsx — dibuja un QR como SVG (usa el encoder de @zxing/library)
import { useMemo } from 'react'
import { QRCodeEncoder, QRCodeDecoderErrorCorrectionLevel } from '@zxing/library'

export default function QrSvg({ texto, size = 280, margen = 2 }) {
  const path = useMemo(() => {
    if (!texto) return null
    const m = QRCodeEncoder.encode(texto, QRCodeDecoderErrorCorrectionLevel.M).getMatrix()
    const n = m.getWidth()
    let d = ''
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (m.get(x, y) === 1) d += `M${x + margen},${y + margen}h1v1h-1z`
    return { d, total: n + margen * 2 }
  }, [texto, margen])

  if (!path) return null
  return (
    <svg width={size} height={size} viewBox={`0 0 ${path.total} ${path.total}`} shapeRendering="crispEdges" role="img" aria-label="Código QR">
      <rect width="100%" height="100%" fill="#fff" />
      <path d={path.d} fill="#000" />
    </svg>
  )
}
