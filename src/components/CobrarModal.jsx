// src/components/CobrarModal.jsx
// "A cobrar" en Pagos: lo que le deben al local (ej. Mitad de cuadra / Mamá).
//  · modo "nuevo": mercadería que se le pasa (sale del stock) o un gasto que el local pagó en su nombre.
//  · modo "cobro": registrar lo que devolvió en plata (efectivo o transferencia) de un renglón.
//  · modo "editar": corregir un renglón (si es mercadería, también se corrige su baja de stock).
import { useMemo, useState } from 'react'
import { parseMonto } from '../lib/montos.js'
import { registrarACobrar, registrarCobro, actualizarACobrar, anotarCorreccionPago, coincideCodigoProv } from '../api/sheets.js'
import MotivoCorreccion, { faltaMotivo } from './MotivoCorreccion.jsx'
import { GRUPOS_GASTO } from '../lib/etiquetasGastos.js'

const fmt$ = n => '$' + Math.round(n || 0).toLocaleString('es-AR')
const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
const hoyInput = () => new Date(Date.now() - 3 * 3600000).toISOString().slice(0, 10)
const aDDMMAAAA = v => { const [a, m, d] = String(v || '').split('-'); return a ? `${d}/${m}/${a}` : '' }
const aInput = f => { const [d, m, a] = String(f || '').replace(/^'/, '').split(' ')[0].split('/'); return a ? `${a}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}` : hoyInput() }
export const DEUDOR_POR_DEFECTO = 'Mamá'

export default function CobrarModal({ modo = 'nuevo', renglon = null, articulos = [], deudores = [], empleado = '', onCerrar, onGuardado }) {
  const ed = modo === 'editar' ? renglon : null
  const [tipo, setTipo] = useState(ed ? (ed.articuloId ? 'MERCADERÍA' : 'GASTO') : 'MERCADERÍA')
  const [deudor, setDeudor] = useState(ed ? ed.proveedor : DEUDOR_POR_DEFECTO)
  const [fecha, setFecha] = useState(ed ? aInput(ed.fechaIngreso) : hoyInput())
  const [q, setQ] = useState('')
  const [art, setArt] = useState(ed?.articuloId ? (articulos.find(a => a.id === ed.articuloId) || { id: ed.articuloId, nombre: ed.articuloNombre }) : null)
  const [cantidad, setCantidad] = useState(ed?.articuloId ? String(ed.cantidad) : '1')
  const [precio, setPrecio] = useState(ed?.articuloId ? String(Math.round(ed.costoUnitario || 0)) : '')
  const [descripcion, setDescripcion] = useState(ed && !ed.articuloId ? ed.descripcion || '' : '')
  const [etiqueta, setEtiqueta] = useState(ed?.etiqueta || '')
  const [importe, setImporte] = useState(ed && !ed.articuloId ? String(Math.round(ed.costoTotal || 0)) : '')
  const saldo = renglon ? Math.max(0, (renglon.costoTotal || 0) - (renglon.montoPagado || 0)) : 0
  const [monto, setMonto] = useState(saldo ? String(Math.round(saldo)) : '')
  const [forma, setForma] = useState('Efectivo')
  const [guardando, setGuardando] = useState(false)
  const [motivoCorr, setMotivoCorr] = useState({ motivo: '', detalle: '' })
  const [error, setError] = useState('')

  const resultados = useMemo(() => {
    const t = norm(q).trim()
    if (t.length < 2) return []
    const pal = t.split(/\s+/)
    return articulos.filter(a => pal.every(p => norm(a.nombre).includes(p) || norm(a.id).includes(p)) || coincideCodigoProv(a.id, q)).slice(0, 30)
  }, [q, articulos])

  const elegir = a => { setArt(a); setQ(''); setPrecio(String(Math.round(parseMonto(a.costoUnitario) || 0))) }
  const cant = Math.max(0, Math.round(Number(cantidad) || 0))
  const total = modo === 'cobro' ? 0 : tipo === 'MERCADERÍA' ? cant * parseMonto(precio) : parseMonto(importe)

  async function guardar() {
    setError('')
    if (modo === 'cobro') {
      const m = parseMonto(monto)
      if (!(m > 0)) return setError('Poné cuánto te devolvió')
      if (m > saldo + 0.5) return setError(`Es más de lo que falta cobrar (${fmt$(saldo)})`)
      setGuardando(true)
      try { await registrarCobro(renglon, m, forma, empleado); onGuardado(`Cobro de ${fmt$(m)} registrado${m >= saldo - 0.5 ? ' · quedó saldado' : ''}`) }
      catch { setError('No se pudo guardar. Probá de nuevo.'); setGuardando(false) }
      return
    }
    if (!deudor.trim()) return setError('¿Quién lo debe?')
    if (tipo === 'MERCADERÍA') {
      if (!art) return setError('Elegí el artículo')
      if (!(cant > 0)) return setError('Poné la cantidad')
      if (!(parseMonto(precio) > 0)) return setError('Poné el precio por unidad que se le cobra')
    } else {
      if (!descripcion.trim()) return setError('Escribí qué se pagó')
      if (!(parseMonto(importe) > 0)) return setError('Poné el importe')
    }
    if (ed && faltaMotivo(motivoCorr)) return setError(faltaMotivo(motivoCorr))
    setGuardando(true)
    if (ed) {
      try {
        const totalAntes = ed.costoTotal || 0
        const nota = await actualizarACobrar(ed, tipo === 'MERCADERÍA'
          ? { articulo: art, cantidad: cant, costoUnitario: parseMonto(precio), fecha: aDDMMAAAA(fecha) }
          : { descripcion: descripcion.trim(), etiqueta, monto: parseMonto(importe), fecha: aDDMMAAAA(fecha) }, empleado)
        const cambios = [Math.round(totalAntes) !== Math.round(total) ? `total ${fmt$(totalAntes)} → ${fmt$(total)}` : '', String(nota || '').replace(/^ · /, '')].filter(Boolean).join(', ')
        await anotarCorreccionPago(ed, { ...motivoCorr, editor: empleado, cambios })
        onGuardado(`${ed.idPago} corregido${nota || ''}`)
      } catch (e) { console.error('No se pudo corregir el renglón a cobrar', e); setError('No se pudo guardar. Probá de nuevo.'); setGuardando(false) }
      return
    }
    try {
      const id = await registrarACobrar(tipo === 'MERCADERÍA'
        ? { deudor: deudor.trim(), fecha: aDDMMAAAA(fecha), articulo: art, cantidad: cant, costoUnitario: parseMonto(precio), empleado }
        : { deudor: deudor.trim(), fecha: aDDMMAAAA(fecha), descripcion: descripcion.trim(), etiqueta, monto: parseMonto(importe), empleado })
      onGuardado(`${id}: ${deudor.trim()} debe ${fmt$(total)}${tipo === 'MERCADERÍA' ? ` · ${cant} u. salieron del stock` : ''}`)
    } catch { setError('No se pudo guardar. Probá de nuevo.'); setGuardando(false) }
  }

  return (
    <div style={S.overlay} onClick={() => !guardando && onCerrar()}>
      <div style={S.modal} onClick={e => e.stopPropagation()} role="dialog" aria-label={modo === 'cobro' ? 'Registrar cobro' : ed ? 'Corregir a cobrar' : 'Nuevo a cobrar'}>
        <div style={S.titulo}>{modo === 'cobro' ? '💵 REGISTRAR COBRO' : ed ? `✏️ CORREGIR ${ed.idPago}` : '🧾 NUEVO A COBRAR'}</div>

        {modo === 'cobro' ? (
          <>
            <div style={S.info}><b>{renglon.proveedor}</b> · {renglon.articuloNombre || renglon.descripcion} · total {fmt$(renglon.costoTotal)}{renglon.montoPagado > 0 ? ` · ya cobrado ${fmt$(renglon.montoPagado)}` : ''}</div>
            <div style={S.info}>Falta cobrar: <b style={{ color: '#2dd4bf' }}>{fmt$(saldo)}</b></div>
            <label style={S.lbl}>CUÁNTO DEVOLVIÓ</label>
            <input style={S.input} inputMode="numeric" value={monto} onChange={e => setMonto(e.target.value)} aria-label="Monto cobrado" />
            <label style={S.lbl}>CÓMO</label>
            <div style={S.fila}>{['Efectivo', 'Transferencia'].map(f => <button key={f} style={{ ...S.chip, ...(forma === f ? S.chipOn : {}) }} onClick={() => setForma(f)}>{f}</button>)}</div>
            <div style={S.nota}>Si en vez de pagar se descuenta de lo que el local le debe, usá "Compensar" en la cuenta de arriba.</div>
          </>
        ) : (
          <>
            <label style={S.lbl}>QUIÉN LO DEBE</label>
            <input style={S.input} value={deudor} onChange={e => setDeudor(e.target.value)} list="deudores-a-cobrar" aria-label="Quién lo debe" disabled={!!ed} />
            <datalist id="deudores-a-cobrar">{deudores.map(d => <option key={d} value={d} />)}</datalist>
            <label style={S.lbl}>FECHA</label>
            <input style={S.input} type="date" value={fecha} onChange={e => setFecha(e.target.value)} aria-label="Fecha" />
            {!ed && <div style={{ ...S.fila, marginTop: 12 }}>
              {[['MERCADERÍA', '📦 Mercadería que se le pasa'], ['GASTO', '💸 Gasto pagado por el local']].map(([t, l]) => (
                <button key={t} style={{ ...S.chip, flex: 1, ...(tipo === t ? S.chipOn : {}) }} onClick={() => setTipo(t)} aria-pressed={tipo === t}>{l}</button>
              ))}
            </div>}
            {ed && ed.montoPagado > 0 && <div style={S.nota}>Ya se cobraron {fmt$(ed.montoPagado)}: eso se mantiene.</div>}

            {tipo === 'MERCADERÍA' ? (
              <>
                <label style={S.lbl}>ARTÍCULO</label>
                {art ? (
                  <div style={S.elegido}><span><b>{art.id}</b> · {art.nombre}</span><button style={S.cambiar} onClick={() => setArt(null)}>Cambiar</button></div>
                ) : (
                  <>
                    <input style={S.input} value={q} onChange={e => setQ(e.target.value)} placeholder="Buscá por nombre o código…" aria-label="Buscar artículo" autoFocus />
                    {resultados.length > 0 && <div style={S.lista}>{resultados.map(a => (
                      <button key={a.id} style={S.opcion} onClick={() => elegir(a)}><b>{a.id}</b> · {a.nombre} <span style={{ color: 'var(--muted)' }}>· costo {fmt$(parseMonto(a.costoUnitario))}</span></button>
                    ))}</div>}
                  </>
                )}
                <div style={S.fila}>
                  <div style={{ flex: 1 }}>
                    <label style={S.lbl}>CANTIDAD</label>
                    <input style={S.input} inputMode="numeric" value={cantidad} onChange={e => setCantidad(e.target.value)} aria-label="Cantidad" />
                  </div>
                  <div style={{ flex: 2 }}>
                    <label style={S.lbl}>PRECIO POR UNIDAD <span style={{ fontWeight: 400 }}>(por defecto, el costo)</span></label>
                    <input style={S.input} inputMode="numeric" value={precio} onChange={e => setPrecio(e.target.value)} aria-label="Precio por unidad" />
                  </div>
                </div>
                <div style={S.nota}>{ed ? 'Si cambiás el artículo o la cantidad, la baja de stock se corrige sola.' : <>Al guardar, estas unidades salen del stock de la Esquina (baja "Pasado a Mitad de cuadra").</>}</div>
              </>
            ) : (
              <>
                <label style={S.lbl}>QUÉ SE PAGÓ</label>
                <input style={S.input} value={descripcion} onChange={e => setDescripcion(e.target.value)} placeholder="Ej: luz de Mitad de cuadra, bolsas para Mamá…" aria-label="Qué se pagó" />
                <label style={S.lbl}>ETIQUETA <span style={{ fontWeight: 400 }}>(opcional)</span></label>
                <div style={{ ...S.fila, flexWrap: 'wrap' }}>
                  {GRUPOS_GASTO.flatMap(g => g.etiquetas).filter(e => !/^(Sueldo|Bono|Regal|Impuesto 931|Obra social)/.test(e)).map(e => (
                    <button key={e} style={{ ...S.chip, fontSize: 12, padding: '5px 9px', ...(etiqueta === e ? S.chipOn : {}) }} onClick={() => setEtiqueta(etiqueta === e ? '' : e)}>{e}</button>
                  ))}
                </div>
                <label style={S.lbl}>IMPORTE</label>
                <input style={S.input} inputMode="numeric" value={importe} onChange={e => setImporte(e.target.value)} aria-label="Importe" />
              </>
            )}
            <div style={S.total}>Debe: <b style={{ color: '#2dd4bf' }}>{fmt$(total)}</b></div>
            {ed && <MotivoCorreccion valor={motivoCorr} onChange={setMotivoCorr} editor={empleado} anteriores={ed.ediciones} />}
          </>
        )}

        {error && <div style={S.error}>{error}</div>}
        <div style={{ ...S.fila, marginTop: 14 }}>
          <button style={S.cancelar} onClick={onCerrar} disabled={guardando}>Cancelar</button>
          <button style={S.guardar} onClick={guardar} disabled={guardando}>{guardando ? 'Guardando…' : 'GUARDAR'}</button>
        </div>
      </div>
    </div>
  )
}

const S = {
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 },
  modal: { background: 'var(--surface)', border: '1.5px solid var(--border)', borderRadius: 14, padding: 20, width: '100%', maxWidth: 560, maxHeight: '92vh', overflowY: 'auto' },
  titulo: { fontFamily: 'Barlow Condensed, sans-serif', fontWeight: 800, fontSize: 22, letterSpacing: 1, color: 'var(--accent-text)', marginBottom: 10 },
  info: { fontFamily: 'Barlow, sans-serif', fontSize: 15, color: 'var(--text)', marginBottom: 6 },
  lbl: { display: 'block', fontFamily: 'Barlow Condensed, sans-serif', fontWeight: 700, fontSize: 13, letterSpacing: 0.5, color: 'var(--muted)', margin: '12px 0 4px' },
  input: { width: '100%', boxSizing: 'border-box', padding: '10px 12px', background: 'var(--surface2, var(--bg))', border: '1.5px solid var(--border)', borderRadius: 8, color: 'var(--text)', fontFamily: 'Barlow, sans-serif', fontSize: 16 },
  fila: { display: 'flex', gap: 8 },
  chip: { padding: '8px 12px', background: 'none', border: '1.5px solid var(--border)', borderRadius: 8, color: 'var(--text)', fontFamily: 'Barlow, sans-serif', fontSize: 14, cursor: 'pointer' },
  chipOn: { border: '1.5px solid #2dd4bf', background: 'rgba(45,212,191,0.15)', color: '#2dd4bf', fontWeight: 700 },
  lista: { maxHeight: 220, overflowY: 'auto', border: '1.5px solid var(--border)', borderRadius: 8, marginTop: 4 },
  opcion: { display: 'block', width: '100%', textAlign: 'left', padding: '8px 10px', background: 'none', border: 'none', borderBottom: '1px solid var(--border)', color: 'var(--text)', fontFamily: 'Barlow, sans-serif', fontSize: 14, cursor: 'pointer' },
  elegido: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, padding: '10px 12px', border: '1.5px solid #2dd4bf', borderRadius: 8, fontFamily: 'Barlow, sans-serif', fontSize: 15, color: 'var(--text)' },
  cambiar: { background: 'none', border: 'none', color: 'var(--muted)', textDecoration: 'underline', cursor: 'pointer', fontSize: 13 },
  nota: { fontFamily: 'Barlow, sans-serif', fontSize: 12, color: 'var(--muted)', marginTop: 8 },
  total: { fontFamily: 'Barlow Condensed, sans-serif', fontSize: 20, color: 'var(--text)', marginTop: 12, textAlign: 'right' },
  error: { marginTop: 10, color: '#ef4444', fontFamily: 'Barlow, sans-serif', fontSize: 14 },
  cancelar: { flex: 1, padding: 12, background: 'none', border: '1.5px solid var(--border)', borderRadius: 10, color: 'var(--muted)', fontFamily: 'Barlow Condensed, sans-serif', fontWeight: 700, fontSize: 16, cursor: 'pointer' },
  guardar: { flex: 2, padding: 12, background: '#2dd4bf', border: 'none', borderRadius: 10, color: '#00122e', fontFamily: 'Barlow Condensed, sans-serif', fontWeight: 800, fontSize: 18, cursor: 'pointer' },
}
