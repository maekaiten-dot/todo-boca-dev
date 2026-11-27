// src/components/FotoArticulo.jsx
// Foto chica de un artículo para listas y desplegables (o 📦 si no tiene o no carga)
import { useState } from 'react'

export default function FotoArticulo({ src, tam = 52 }) {
  const [mal, setMal] = useState(false)
  const caja = { width: tam, height: tam, borderRadius: 6, flexShrink: 0, objectFit: 'cover', background: 'var(--surface2, var(--bg))', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: Math.round(tam * 0.42) }
  return src && !mal ? <img src={src} alt="" style={caja} onError={() => setMal(true)} /> : <span style={caja} aria-hidden="true">📦</span>
}
