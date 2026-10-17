// src/components/AvisoPrecios.jsx
// Aviso por encima de todo cuando cambia el precio de algún artículo.
// La app vuelve a leer ARTICULOS cada 90 segundos (y al volver a la pestaña) y compara con los
// precios que ese dispositivo ya vio (guardados en el navegador). Si alguno cambió, muestra este
// aviso hasta que la persona toque "Entendido". No se cierra tocando afuera.
const fmt$ = n => '$' + Math.round(n).toLocaleString('es-AR')

export default function AvisoPrecios({ cambios, onEntendido }) {
  if (!cambios?.length) return null
  return (
    <div style={S.overlay} role="alertdialog" aria-modal="true" aria-label="Cambios de precio">
      <div style={S.box}>
        <div style={S.titulo}>💲 {cambios.length === 1 ? 'Cambió un precio' : `Cambiaron ${cambios.length} precios`}</div>
        <div style={S.sub}>Desde ahora se cobra con el precio nuevo. En el carrito ya está actualizado.</div>
        <div style={S.lista}>
          {cambios.map(c => {
            const sube = c.ahora > c.antes
            return (
              <div key={c.id} style={S.fila}>
                <div style={S.foto}>{c.foto ? <img src={c.foto} alt="" style={S.img} /> : <span style={{ fontSize: 26 }}>📦</span>}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={S.nombre}>{c.nombre}</div>
                  <div style={S.codigo}>{c.id}</div>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div style={S.antes}>{fmt$(c.antes)}</div>
                  <div style={S.ahora}>{fmt$(c.ahora)} <span style={{ color: sube ? '#ef4444' : '#22c55e', fontSize: 18 }}>{sube ? '▲' : '▼'}</span></div>
                </div>
              </div>
            )
          })}
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
  fila: { display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', background: 'var(--surface2)', border: '1.5px solid var(--border)', borderRadius: 10 },
  foto: { width: 56, height: 56, flexShrink: 0, borderRadius: 8, overflow: 'hidden', background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  img: { width: '100%', height: '100%', objectFit: 'cover' },
  nombre: { fontFamily: 'Barlow Condensed, sans-serif', fontWeight: 700, fontSize: 19, color: 'var(--text)', lineHeight: 1.15 },
  codigo: { fontFamily: 'Barlow, sans-serif', fontSize: 12, color: 'var(--muted)', marginTop: 2 },
  antes: { fontFamily: 'Barlow Condensed, sans-serif', fontSize: 16, color: 'var(--muted)', textDecoration: 'line-through' },
  ahora: { fontFamily: 'Barlow Condensed, sans-serif', fontWeight: 800, fontSize: 26, color: 'var(--accent)', lineHeight: 1.1 },
  btn: { width: '100%', padding: '16px', background: 'var(--accent)', border: 'none', borderRadius: 10, color: '#000', fontFamily: 'Barlow Condensed, sans-serif', fontWeight: 800, fontSize: 20, letterSpacing: 1, cursor: 'pointer', flexShrink: 0 },
}
