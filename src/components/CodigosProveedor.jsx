// src/components/CodigosProveedor.jsx
// En la ventana del artículo: los códigos que usa cada proveedor para este producto. Con ellos se puede
// buscar o escanear el artículo en cualquier buscador, y Escanear factura lo reconoce solo.
// Se guardan en la hoja MEMORIA FACTURAS.
import { useState } from 'react'
import { codigosDeArticulo, agregarCodigoProveedor, quitarCodigoProveedor, proveedoresConCodigo } from '../api/sheets.js'

export default function CodigosProveedor({ articuloId, empleado, ocupado, setOcupado }) {
  const [lista, setLista] = useState(() => codigosDeArticulo(articuloId))
  const [prov, setProv] = useState('')
  const [cod, setCod] = useState('')
  const [msg, setMsg] = useState(null)
  const refrescar = () => setLista(codigosDeArticulo(articuloId))

  async function agregar() {
    if (!prov.trim() || !cod.trim()) { setMsg({ t: 'Poné el proveedor y su código', err: true }); return }
    setOcupado?.(true); setMsg(null)
    try {
      const ok = await agregarCodigoProveedor({ proveedor: prov, codigo: cod, articuloId, quien: empleado })
      setMsg({ t: ok ? `Código ${cod.trim()} asociado` : 'Ese código ya estaba asociado a este artículo' })
      setCod(''); refrescar()
    } catch { setMsg({ t: 'No se pudo guardar el código', err: true }) } finally { setOcupado?.(false) }
  }
  async function quitar(e) {
    setOcupado?.(true); setMsg(null)
    try { await quitarCodigoProveedor({ proveedor: e.proveedor, codigo: e.codigo, quien: empleado }); refrescar(); setMsg({ t: `Código ${e.codigo} quitado` }) }
    catch { setMsg({ t: 'No se pudo quitar el código', err: true }) } finally { setOcupado?.(false) }
  }

  return (
    <div style={S.box} aria-label="Códigos del proveedor">
      <div style={S.titulo}>CÓDIGOS DEL PROVEEDOR</div>
      <div style={S.ayuda}>Se puede buscar o escanear el artículo con su código {articuloId} o con cualquiera de estos.</div>
      {lista.length === 0 && <div style={S.ayuda}>Todavía no tiene ninguno.</div>}
      {lista.map(e => (
        <div key={`${e.proveedor}|${e.codigo}`} style={S.fila}>
          <span style={S.cod}>{e.codigo}</span>
          <span style={S.prov}>{e.proveedor}</span>
          <button style={S.quitar} disabled={ocupado} onClick={() => quitar(e)} aria-label={`Quitar el código ${e.codigo}`}>Quitar</button>
        </div>
      ))}
      <div style={S.nuevo}>
        <input style={S.input} list="tb-proveedores-cod" value={prov} onChange={e => setProv(e.target.value)} placeholder="Proveedor" aria-label="Proveedor" />
        <input style={S.input} value={cod} onChange={e => setCod(e.target.value)} onKeyDown={e => e.key === 'Enter' && agregar()} placeholder="Su código" aria-label="Código del proveedor" />
        <button style={S.agregar} disabled={ocupado} onClick={agregar}>Agregar</button>
        <datalist id="tb-proveedores-cod">{proveedoresConCodigo().map(p => <option key={p} value={p} />)}</datalist>
      </div>
      {msg && <div style={{ ...S.ayuda, color: msg.err ? '#ef4444' : '#22c55e' }} role="status">{msg.t}</div>}
    </div>
  )
}

const S = {
  box: { border: '1.5px solid var(--border)', borderRadius: 10, padding: 12, display: 'flex', flexDirection: 'column', gap: 8 },
  titulo: { fontFamily: 'Barlow Condensed, sans-serif', fontSize: 13, color: 'var(--accent-text)', letterSpacing: 1, fontWeight: 700 },
  ayuda: { fontFamily: 'Barlow, sans-serif', fontSize: 12, color: 'var(--muted)' },
  fila: { display: 'flex', alignItems: 'center', gap: 10, background: 'var(--surface2)', borderRadius: 8, padding: '6px 10px' },
  cod: { fontFamily: 'monospace', fontSize: 15, fontWeight: 700, color: 'var(--text)' },
  prov: { flex: 1, fontFamily: 'Barlow, sans-serif', fontSize: 13, color: 'var(--muted)', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  quitar: { background: 'none', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--muted)', fontFamily: 'Barlow, sans-serif', fontSize: 12, padding: '4px 10px', cursor: 'pointer' },
  nuevo: { display: 'flex', gap: 8, flexWrap: 'wrap' },
  input: { flex: '1 1 120px', background: 'var(--surface2)', border: '1.5px solid var(--border)', borderRadius: 8, color: 'var(--text)', fontFamily: 'Barlow, sans-serif', fontSize: 15, padding: '8px 10px', outline: 'none', minWidth: 0 },
  agregar: { background: 'var(--accent)', border: 'none', borderRadius: 8, color: '#000', fontFamily: 'Barlow Condensed, sans-serif', fontWeight: 700, fontSize: 15, padding: '8px 14px', cursor: 'pointer' },
}
