// src/pages/HoySimple.jsx
// Solapa Hoy grande y simple (perfiles Caja de Mitad de cuadra): total del día, total por medio
// de pago y cada venta en su tarjeta, con la foto de cada producto. Solo lectura: anular o editar
// sigue siendo desde la solapa Hoy de siempre (perfil Admin).
import { useState, useEffect, useMemo } from 'react'
import { getVentasHoy } from '../api/sheets.js'
import { METODOS_SIMPLE, FotoProducto } from './VenderSimple.jsx'

const fmt = n => '$' + Math.round(n || 0).toLocaleString('es-AR')
const etiquetaMetodo = m => METODOS_SIMPLE.find(x => x.valor === m)?.corto || m || '—'

export default function HoySimple({ refreshKey = 0, articulos = [] }) {
  const [filas, setFilas] = useState(null)
  const [error, setError] = useState('')
  const [cargando, setCargando] = useState(false)

  async function cargar() {
    setCargando(true); setError('')
    try { setFilas(await getVentasHoy()) }
    catch (e) { console.error(e); setError('No se pudieron leer las ventas de hoy. Revisá que haya internet.') }
    finally { setCargando(false) }
  }
  useEffect(() => { cargar() }, [refreshKey])
  // Al volver a la app (o a la pestaña) se actualiza sola
  useEffect(() => {
    const f = () => { if (document.visibilityState === 'visible') cargar() }
    document.addEventListener('visibilitychange', f)
    return () => document.removeEventListener('visibilitychange', f)
  }, [])

  const fotoDe = useMemo(() => Object.fromEntries(articulos.map(a => [a.id, a.foto])), [articulos])

  const ventas = useMemo(() => {
    const porId = new Map()
    ;(filas || []).forEach(r => {
      if (!r.idVenta) return
      if (!porId.has(r.idVenta)) porId.set(r.idVenta, { id: r.idVenta, hora: String(r.hora || '').replace(/^'/, '').slice(0, 5), metodo: r.metodoPago, anulada: true, items: [], total: 0 })
      const v = porId.get(r.idVenta)
      if (r.anulado) return
      v.anulada = false
      v.total += r.precioTotalFinal || r.precioTotal || 0
      v.items.push({ id: r.idDetalle, nombre: r.nombre, cantidad: r.cantidad, foto: r.foto || fotoDe[r.articulo] || '' })
    })
    return [...porId.values()].filter(v => !v.anulada).sort((a, b) => b.hora.localeCompare(a.hora))
  }, [filas, fotoDe])

  const totalDia = ventas.reduce((s, v) => s + v.total, 0)
  const porMetodo = METODOS_SIMPLE.map(m => ({ label: m.corto, total: ventas.filter(v => v.metodo === m.valor).reduce((s, v) => s + v.total, 0) }))
  const otros = ventas.filter(v => !METODOS_SIMPLE.some(m => m.valor === v.metodo)).reduce((s, v) => s + v.total, 0)
  if (otros > 0) porMetodo.push({ label: 'Otros', total: otros })

  return (
    <div style={S.page}>
      <div style={S.header}>
        <span style={S.titulo}>VENTAS DE HOY</span>
        <button style={S.actualizar} onClick={cargar} disabled={cargando}>{cargando ? 'Actualizando…' : 'Actualizar'}</button>
      </div>
      {error && <div style={S.error} role="alert">{error}</div>}
      <div style={S.cuerpo}>
        <div style={S.izq}>
          <div style={S.totalBox}>
            <span style={S.totalEtiqueta}>TOTAL DEL DÍA</span>
            <span style={S.total}>{fmt(totalDia)}</span>
            <span style={{ fontSize: 20 }}>{ventas.length === 1 ? '1 venta' : `${ventas.length} ventas`}</span>
          </div>
          <div style={S.metodosBox}>
            {porMetodo.map(m => (
              <div key={m.label} style={S.metodoRow}>
                <span style={{ fontSize: 22 }}>{m.label}</span>
                <span style={S.metodoTotal}>{fmt(m.total)}</span>
              </div>
            ))}
          </div>
        </div>
        <div style={S.der}>
          <div style={S.tablaHeader}>
            <span style={{ width: 64 }}>HORA</span><span style={{ flex: 1 }}>PRODUCTOS</span><span style={{ width: 120 }}>PAGO</span><span style={{ width: 120, textAlign: 'right' }}>TOTAL</span>
          </div>
          <div style={S.lista}>
            {filas === null && !error && <div style={S.vacio}>Cargando…</div>}
            {filas !== null && ventas.length === 0 && <div style={S.vacio}>Todavía no hay ventas hoy</div>}
            {ventas.map(v => (
              <div key={v.id} style={S.tarjeta}>
                <span style={S.hora}>{v.hora}</span>
                <div style={S.items}>
                  {v.items.map(it => (
                    <div key={it.id} style={S.item}>
                      <div style={{ position: 'relative' }}>
                        <FotoProducto src={it.foto} size={60} />
                        {it.cantidad > 1 && <span style={S.globo}>×{it.cantidad}</span>}
                      </div>
                      <span style={{ fontSize: 19, lineHeight: 1.2 }}>{it.nombre}</span>
                    </div>
                  ))}
                </div>
                <span style={S.pago}>{etiquetaMetodo(v.metodo)}</span>
                <span style={S.ventaTotal}>{fmt(v.total)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

const CONDENSED = 'Barlow Condensed, sans-serif'
const S = {
  page: { display: 'flex', flexDirection: 'column', height: '100%', overflowY: 'auto', fontFamily: 'Barlow, sans-serif', color: 'var(--text)' },
  header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, minHeight: 64, padding: '0 24px', borderBottom: '2px solid var(--accent)', flexShrink: 0 },
  titulo: { fontFamily: CONDENSED, fontWeight: 800, fontSize: 36, letterSpacing: 2, color: 'var(--accent-text)' },
  actualizar: { minHeight: 52, padding: '0 20px', border: '1.5px solid var(--border)', borderRadius: 10, background: 'var(--surface)', color: 'var(--text)', fontFamily: CONDENSED, fontWeight: 700, fontSize: 20, letterSpacing: 1, textTransform: 'uppercase', cursor: 'pointer' },
  error: { margin: '12px 24px 0', padding: '12px 14px', borderRadius: 10, border: '2px solid #ef4444', background: 'rgba(239, 68, 68, 0.1)', fontSize: 19 },
  cuerpo: { flex: 1, minHeight: 0, padding: '20px 24px', display: 'flex', flexWrap: 'wrap', gap: 20 },
  izq: { flex: '1 1 340px', maxWidth: 420, display: 'flex', flexDirection: 'column', gap: 12 },
  totalBox: { padding: '20px 22px', borderRadius: 12, border: '1.5px solid var(--accent)', background: 'var(--surface)', display: 'flex', flexDirection: 'column', gap: 4 },
  totalEtiqueta: { fontFamily: CONDENSED, fontWeight: 800, fontSize: 20, letterSpacing: 1, color: 'var(--muted)' },
  total: { fontFamily: CONDENSED, fontWeight: 800, fontSize: 64, lineHeight: 1, color: 'var(--accent-text)' },
  metodosBox: { borderRadius: 10, border: '1.5px solid var(--border)', background: 'var(--surface)', overflow: 'hidden' },
  metodoRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', borderBottom: '1px solid var(--border)' },
  metodoTotal: { fontFamily: CONDENSED, fontWeight: 700, fontSize: 26, color: 'var(--accent-text)' },
  der: { flex: '999 1 560px', minWidth: 0, minHeight: 320, display: 'flex', flexDirection: 'column', borderRadius: 10, border: '1.5px solid var(--border)', background: 'var(--surface)', overflow: 'hidden' },
  tablaHeader: { display: 'flex', gap: 16, padding: '10px 30px', background: 'var(--surface2)', borderBottom: '2px solid var(--border)', fontFamily: CONDENSED, fontWeight: 800, fontSize: 17, letterSpacing: 1, color: 'var(--muted)' },
  lista: { flex: 1, minHeight: 0, overflowY: 'auto', padding: 12, display: 'flex', flexDirection: 'column', gap: 12 },
  vacio: { padding: 32, textAlign: 'center', color: 'var(--muted)', fontSize: 20 },
  // Cada venta en su tarjeta con borde, para diferenciar un carrito del otro
  tarjeta: { display: 'flex', alignItems: 'center', gap: 16, padding: '14px 16px', borderRadius: 12, border: '2px solid var(--muted)', background: 'var(--surface2)' },
  hora: { width: 64, flexShrink: 0, fontFamily: CONDENSED, fontWeight: 700, fontSize: 22, color: 'var(--muted)' },
  items: { flex: 1, minWidth: 0, display: 'flex', flexWrap: 'wrap', gap: '10px 16px' },
  item: { display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 },
  globo: { position: 'absolute', top: -8, right: -8, minWidth: 28, height: 28, padding: '0 7px', boxSizing: 'border-box', borderRadius: 14, background: 'var(--accent)', color: 'var(--on-accent)', fontFamily: CONDENSED, fontWeight: 800, fontSize: 17, display: 'flex', alignItems: 'center', justifyContent: 'center' },
  pago: { width: 120, flexShrink: 0, fontFamily: CONDENSED, fontWeight: 700, fontSize: 19 },
  ventaTotal: { width: 120, flexShrink: 0, textAlign: 'right', fontFamily: CONDENSED, fontWeight: 800, fontSize: 24, color: 'var(--accent-text)' },
}
