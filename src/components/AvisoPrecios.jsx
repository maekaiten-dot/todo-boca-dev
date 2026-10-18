// src/components/AvisoPrecios.jsx
// Aviso por encima de todo cuando cambian los artículos: precios, productos nuevos, productos que
// pasan a INACTIVO (ya no se venden) o que vuelven a ACTIVO.
// La app vuelve a leer ARTICULOS cada 90 segundos (y al volver a la pestaña) y compara con lo que
// ese dispositivo ya vio (guardado en el navegador). En la tablet el aviso queda hasta tocar
// "Entendido" (no se cierra tocando afuera); a los Admin se les abre solo si tocan el aviso chico.
const fmt$ = n => '$' + Math.round(n).toLocaleString('es-AR')

export const totalCambios = c => !c ? 0 : (c.precios?.length || 0) + (c.nuevos?.length || 0) + (c.reactivados?.length || 0) + (c.bajas?.length || 0)

// Texto corto para el aviso chico de los Admin
export function resumenCambios(c) {
  const n = totalCambios(c)
  if (n === (c.precios?.length || 0)) return `${n} ${n === 1 ? 'precio cambió' : 'precios cambiaron'}`
  return `${n} ${n === 1 ? 'cambio' : 'cambios'} en artículos`
}

function titulo(c) {
  const n = totalCambios(c)
  const soloUno = [c.precios, c.nuevos, c.reactivados, c.bajas].filter(x => x?.length).length === 1
  if (soloUno && c.precios?.length) return n === 1 ? 'Cambió un precio' : `Cambiaron ${n} precios`
  if (soloUno && c.nuevos?.length) return n === 1 ? 'Hay un producto nuevo' : `Hay ${n} productos nuevos`
  if (soloUno && c.bajas?.length) return n === 1 ? 'Un producto ya no se vende' : `${n} productos ya no se venden`
  if (soloUno && c.reactivados?.length) return n === 1 ? 'Un producto vuelve a venderse' : `${n} productos vuelven a venderse`
  return `${n} cambios en artículos`
}

function Foto({ src }) {
  return <div style={S.foto}>{src ? <img src={src} alt="" style={S.img} /> : <span style={{ fontSize: 26 }}>📦</span>}</div>
}

function Seccion({ titulo, color, items, render }) {
  if (!items?.length) return null
  return (
    <>
      <div style={{ ...S.seccion, color }}>{titulo}</div>
      {items.map(render)}
    </>
  )
}

export default function AvisoPrecios({ cambios, onEntendido }) {
  if (!totalCambios(cambios)) return null
  const fila = (c, derecha, extra = {}) => (
    <div key={c.id} style={{ ...S.fila, ...extra }}>
      <Foto src={c.foto} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={S.nombre}>{c.nombre || c.id}</div>
        <div style={S.codigo}>{c.id}</div>
      </div>
      <div style={{ textAlign: 'right', flexShrink: 0 }}>{derecha}</div>
    </div>
  )
  return (
    <div style={S.overlay} role="alertdialog" aria-modal="true" aria-label="Cambios en artículos">
      <div style={S.box}>
        <div style={S.titulo}>📢 {titulo(cambios)}</div>
        <div style={S.sub}>Ya está actualizado en la app{cambios.precios?.length ? ': se cobra con el precio nuevo, también en el carrito' : ''}.</div>
        <div style={S.lista}>
          <Seccion titulo="💲 Cambios de precio" color="var(--accent)" items={cambios.precios} render={c => {
            const sube = c.ahora > c.antes
            return fila(c, <>
              <div style={S.antes}>{fmt$(c.antes)}</div>
              <div style={S.ahora}>{fmt$(c.ahora)} <span style={{ color: sube ? '#ef4444' : '#22c55e', fontSize: 18 }}>{sube ? '▲' : '▼'}</span></div>
            </>)
          }} />
          <Seccion titulo="🆕 Productos nuevos" color="#22c55e" items={cambios.nuevos} render={c => fila(c, <div style={S.ahora}>{fmt$(c.precio)}</div>)} />
          <Seccion titulo="✅ Vuelven a venderse (activos)" color="#22c55e" items={cambios.reactivados} render={c => fila(c, <div style={S.ahora}>{fmt$(c.precio)}</div>)} />
          <Seccion titulo="⛔ Ya no se venden (inactivos)" color="#ef4444" items={cambios.bajas} render={c => fila(c, <div style={{ ...S.antes, textDecoration: 'none' }}>INACTIVO</div>, { opacity: 0.8 })} />
        </div>
        <button style={S.btn} onClick={onEntendido}>ENTENDIDO</button>
      </div>
    </div>
  )
}

const S = {
  overlay: { position: 'fixed', inset: 0, zIndex: 10000, background: 'rgba(0,0,0,0.78)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 },
  box: { width: '100%', maxWidth: 560, maxHeight: '88dvh', display: 'flex', flexDirection: 'column', background: 'var(--surface)', border: '2px solid var(--accent)', borderRadius: 16, padding: 20, boxShadow: '0 10px 40px rgba(0,0,0,0.6)', boxSizing: 'border-box' },
  titulo: { fontFamily: 'Barlow Condensed, sans-serif', fontWeight: 800, fontSize: 30, color: 'var(--accent)', letterSpacing: 1, textTransform: 'uppercase', lineHeight: 1.1 },
  sub: { fontFamily: 'Barlow, sans-serif', fontSize: 15, color: 'var(--muted)', marginTop: 6, marginBottom: 12 },
  lista: { overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 },
  seccion: { fontFamily: 'Barlow Condensed, sans-serif', fontWeight: 800, fontSize: 16, letterSpacing: 1, textTransform: 'uppercase', marginTop: 4 },
  fila: { display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', background: 'var(--surface2)', border: '1.5px solid var(--border)', borderRadius: 10 },
  foto: { width: 56, height: 56, flexShrink: 0, borderRadius: 8, overflow: 'hidden', background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  img: { width: '100%', height: '100%', objectFit: 'cover' },
  nombre: { fontFamily: 'Barlow Condensed, sans-serif', fontWeight: 700, fontSize: 19, color: 'var(--text)', lineHeight: 1.15 },
  codigo: { fontFamily: 'Barlow, sans-serif', fontSize: 12, color: 'var(--muted)', marginTop: 2 },
  antes: { fontFamily: 'Barlow Condensed, sans-serif', fontSize: 16, color: 'var(--muted)', textDecoration: 'line-through' },
  ahora: { fontFamily: 'Barlow Condensed, sans-serif', fontWeight: 800, fontSize: 26, color: 'var(--accent)', lineHeight: 1.1 },
  btn: { width: '100%', padding: '16px', background: 'var(--accent)', border: 'none', borderRadius: 10, color: '#000', fontFamily: 'Barlow Condensed, sans-serif', fontWeight: 800, fontSize: 20, letterSpacing: 1, cursor: 'pointer', flexShrink: 0 },
}
