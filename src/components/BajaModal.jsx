// src/components/BajaModal.jsx
// Registrar una baja de stock (lo que sale sin venderse) desde la solapa Hoy, a mano para el
// mostrador: sobre todo bebida o comida que consume el personal. Es la misma baja que en
// Conteo y stock → Baja (hoja MOVIMIENTOS STOCK).
import { useState } from 'react'
import BarcodeScanner from './BarcodeScanner.jsx'
import { registrarBaja, MOTIVOS_BAJA, idCanonico } from '../api/sheets.js'

const fmt$ = n => '$' + Math.round(n || 0).toLocaleString('es-AR')
const normalizar = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')

export default function BajaModal({ articulos = [], usuarios = [], perfilNombre = '', onCerrar, onGuardada }) {
  const empleados = usuarios.filter(u => u.nombre !== 'Tablet')
  const [empleado, setEmpleado] = useState(empleados.some(u => u.nombre === perfilNombre) ? perfilNombre : '')
  const [art, setArt] = useState(null)
  const [busqueda, setBusqueda] = useState('')
  const [cant, setCant] = useState('1')
  const [motivo, setMotivo] = useState('Uso interno')
  const [detalle, setDetalle] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [scanner, setScanner] = useState(false)
  const [error, setError] = useState('')

  const resultados = (busqueda.trim()
    ? articulos.filter(a => normalizar(a.nombre).includes(normalizar(busqueda)) || normalizar(a.id).includes(normalizar(busqueda)) || (idCanonico(busqueda) === a.id && idCanonico(busqueda) !== busqueda.trim()))
    : [...articulos]).sort((x, y) => String(x.nombre).localeCompare(String(y.nombre), 'es'))
  const n = Number(cant)
  const ok = empleado && art && Number.isInteger(n) && n > 0 && motivo && !(motivo === 'Otro' && !detalle.trim()) && !guardando

  function escanear(codigo) {
    const c = idCanonico(String(codigo || '').trim())
    const a = articulos.find(x => x.id === c || x.id.toLowerCase() === c.toLowerCase())
    if (!a) return { ok: false, nombre: `No encontrado: ${c}` }
    setArt(a); setBusqueda('')
    return { ok: true, nombre: a.nombre }
  }
  async function guardar() {
    if (!ok) return
    setGuardando(true); setError('')
    try {
      await registrarBaja({ articulo: art, cantidad: n, motivo, detalle: detalle.trim(), empleado })
      onGuardada?.(`Baja registrada: ${n} × ${art.nombre}`)
    } catch (e) { console.error(e); setError('No se pudo guardar la baja. Revisá la conexión.') }
    finally { setGuardando(false) }
  }
  const foto = (a, t) => <div style={{ ...S.foto, width: t, height: t }}>{a.foto ? <img src={a.foto} alt="" style={S.img} loading="lazy" /> : <span style={{ fontSize: t * 0.45 }}>📦</span>}</div>

  return (
    <div style={S.overlay} onClick={onCerrar}>
      <div style={S.modal} onClick={e => e.stopPropagation()} role="dialog" aria-label="Registrar baja de stock">
        <div style={S.tit}>Registrar baja</div>
        <div style={S.ayuda}>Lo que sale del stock sin venderse: bebida o comida que se consume en el local, roturas, faltantes o regalos.</div>

        <div style={S.lbl}>QUIÉN</div>
        <div style={S.grid}>
          {empleados.map(u => <button key={u.id} style={{ ...S.opt, ...(empleado === u.nombre ? S.optOn : {}) }} onClick={() => setEmpleado(u.nombre)}>{u.nombre}</button>)}
        </div>

        <div style={S.lbl}>ARTÍCULO</div>
        {art ? (
          <div style={S.sel}>
            {foto(art, 56)}
            <span style={{ minWidth: 0, flex: 1 }}>{art.nombre} {art.precioUnitario > 0 && <span style={S.precio}>{fmt$(art.precioUnitario)}</span>} <span style={{ color: 'var(--muted)' }}>· {art.id}</span></span>
            <button style={S.link} onClick={() => setArt(null)}>Cambiar</button>
          </div>
        ) : (
          <>
            <div style={{ display: 'flex', gap: 8 }}>
              <input style={{ ...S.search, flex: 1 }} placeholder="Buscar por nombre o código…" value={busqueda} onChange={e => setBusqueda(e.target.value)} autoFocus />
              <button style={S.qr} onClick={() => setScanner(true)} aria-label="Escanear código QR">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h3v3h-3z"/><path d="M20 14v.01"/><path d="M14 20h.01"/><path d="M17 20h4v-3"/></svg>
                <span>QR</span>
              </button>
            </div>
            <div style={S.lista}>
              {resultados.length === 0 && <div style={S.ayuda}>No se encontró ningún artículo.</div>}
              {resultados.slice(0, busqueda.trim() ? 60 : 200).map(a => (
                <button key={a.id} style={S.res} onClick={() => setArt(a)}>
                  {foto(a, 44)}
                  <span style={{ minWidth: 0 }}><span style={S.resNombre}>{a.nombre} {a.precioUnitario > 0 && <span style={S.precio}>{fmt$(a.precioUnitario)}</span>}</span><span style={S.resCod}>{a.id}</span></span>
                </button>
              ))}
            </div>
          </>
        )}

        <div style={S.lbl}>CANTIDAD</div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button style={S.paso} onClick={() => setCant(c => String(Math.max(1, (Number(c) || 1) - 1)))} aria-label="Uno menos">−</button>
          <input style={S.cant} type="text" inputMode="numeric" value={cant} onChange={e => setCant(e.target.value.replace(/[^\d]/g, ''))} aria-label="Cantidad" />
          <button style={S.paso} onClick={() => setCant(c => String((Number(c) || 0) + 1))} aria-label="Uno más">+</button>
        </div>

        <div style={S.lbl}>MOTIVO</div>
        <div style={S.grid}>
          {MOTIVOS_BAJA.map(m => <button key={m} style={{ ...S.opt, ...(motivo === m ? S.optOn : {}) }} onClick={() => setMotivo(m)}>{m}</button>)}
        </div>
        <div style={S.lbl}>DETALLE {motivo === 'Otro' ? '' : <span style={{ fontWeight: 400 }}>(opcional)</span>}</div>
        <input style={S.search} placeholder={motivo === 'Uso interno' ? 'Ej: agua para Stefi' : 'Ej: se cayó y se rompió'} value={detalle} maxLength={120} onChange={e => setDetalle(e.target.value)} />

        {error && <div style={S.error}>{error}</div>}
        <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
          <button style={S.cancelar} onClick={onCerrar}>Cancelar</button>
          <button style={{ ...S.guardar, opacity: ok ? 1 : 0.45 }} disabled={!ok} onClick={guardar}>{guardando ? 'Guardando…' : 'REGISTRAR BAJA'}</button>
        </div>
        {!empleado && <div style={S.ayuda}>Elegí quién registra la baja.</div>}
      </div>
      {scanner && <BarcodeScanner titulo="ESCANEAR ARTÍCULO" autoCerrarMs={900} onDetected={escanear} onClose={() => setScanner(false)} />}
    </div>
  )
}

const S = {
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 12 },
  modal: { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, padding: 16, width: '100%', maxWidth: 560, maxHeight: '92vh', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8 },
  tit: { fontFamily: 'Barlow Condensed, sans-serif', fontWeight: 800, fontSize: 24, color: 'var(--accent-text)' },
  ayuda: { fontFamily: 'Barlow, sans-serif', fontSize: 13, color: 'var(--muted)', lineHeight: 1.4 },
  lbl: { fontFamily: 'Barlow Condensed, sans-serif', fontWeight: 700, fontSize: 13, color: 'var(--muted)', letterSpacing: 1.5, marginTop: 4 },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 8 },
  opt: { padding: '10px 8px', background: 'var(--surface2)', border: '1.5px solid var(--border)', borderRadius: 10, cursor: 'pointer', color: 'var(--muted)', fontFamily: 'Barlow Condensed, sans-serif', fontWeight: 700, fontSize: 16, textAlign: 'center' },
  optOn: { background: 'rgba(245,200,0,0.12)', border: '1.5px solid var(--accent)', color: 'var(--accent-text)' },
  search: { fontFamily: 'Barlow, sans-serif', fontSize: 16, padding: '11px 14px', background: 'var(--bg)', border: '1.5px solid var(--border)', borderRadius: 10, color: 'var(--text)', width: '100%', boxSizing: 'border-box' },
  qr: { display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0, background: 'var(--surface2)', border: '1.5px solid var(--accent)', borderRadius: 10, color: 'var(--accent-text)', fontFamily: 'Barlow Condensed, sans-serif', fontWeight: 800, fontSize: 17, padding: '0 12px', cursor: 'pointer' },
  lista: { display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 280, overflowY: 'auto' },
  res: { display: 'flex', alignItems: 'center', gap: 10, textAlign: 'left', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 10, padding: '6px 10px', color: 'var(--text)', cursor: 'pointer', width: '100%' },
  resNombre: { display: 'block', fontFamily: 'Barlow Condensed, sans-serif', fontWeight: 700, fontSize: 17, lineHeight: 1.2 },
  resCod: { display: 'block', fontFamily: 'Barlow, sans-serif', fontSize: 12, color: 'var(--muted)' },
  sel: { display: 'flex', alignItems: 'center', gap: 10, fontFamily: 'Barlow, sans-serif', fontSize: 15, color: 'var(--text)', background: 'var(--surface2)', borderRadius: 10, padding: '8px 10px' },
  link: { background: 'none', border: 'none', color: 'var(--accent-text)', fontFamily: 'Barlow, sans-serif', fontSize: 14, cursor: 'pointer', flexShrink: 0 },
  foto: { borderRadius: 8, background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0 },
  img: { width: '100%', height: '100%', objectFit: 'cover' },
  precio: { display: 'inline-block', fontFamily: 'Barlow Condensed, sans-serif', fontWeight: 700, fontSize: 15, color: 'var(--accent-text)', background: 'rgba(245,200,0,0.1)', borderRadius: 6, padding: '0 6px', whiteSpace: 'nowrap' },
  paso: { width: 48, height: 48, fontSize: 26, fontWeight: 700, background: 'var(--surface2)', border: '1.5px solid var(--border)', borderRadius: 10, color: 'var(--text)', cursor: 'pointer' },
  cant: { width: 80, height: 48, textAlign: 'center', fontFamily: 'Barlow Condensed, sans-serif', fontWeight: 800, fontSize: 24, background: 'var(--bg)', border: '1.5px solid var(--border)', borderRadius: 10, color: 'var(--text)' },
  error: { fontFamily: 'Barlow, sans-serif', fontSize: 14, color: '#f87171' },
  cancelar: { flex: 1, padding: 14, background: 'none', border: '1.5px solid var(--border)', borderRadius: 12, color: 'var(--muted)', fontFamily: 'Barlow Condensed, sans-serif', fontWeight: 700, fontSize: 17, cursor: 'pointer' },
  guardar: { flex: 2, padding: 14, background: '#ef4444', border: 'none', borderRadius: 12, color: '#fff', fontFamily: 'Barlow Condensed, sans-serif', fontWeight: 800, fontSize: 18, letterSpacing: 1, cursor: 'pointer' },
}
