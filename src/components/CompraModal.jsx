// src/components/CompraModal.jsx
// Detalle de una compra a un proveedor (todos sus renglones) y pago de la compra entera o de una
// parte: el monto se reparte entre los renglones según lo que le falta a cada uno.
import { useState } from 'react'
import { pagarCompra, repartirPagoCompra, actualizarComprobanteCompra } from '../api/sheets.js'

const fmt$ = n => '$' + Math.round(n || 0).toLocaleString('es-AR')
const parseMonto = v => Number(String(v ?? '').replace(/[$\s.]/g, '').replace(',', '.')) || 0
const hoy = () => new Date().toLocaleDateString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' })
const aInput = d => { const [dd, mm, aa] = String(d || '').split('/'); return dd && mm && aa ? `${aa}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}` : '' }
const deInput = v => { const [a, m, d] = String(v || '').split('-'); return a ? `${Number(d)}/${Number(m)}/${a}` : '' }

// Agrupa los pagos de mercadería en compras
export function armarCompras(pagos, claveCompra) {
  const m = new Map()
  for (const p of pagos) {
    if (p.anulado || p.tipo !== 'MERCADERÍA') continue
    const k = claveCompra(p)
    const c = m.get(k) || { clave: k, compra: p.compra || '', comprobante: '', proveedor: p.proveedor || '', fechaIngreso: p.fechaIngreso || '', renglones: [], total: 0, pagado: 0, ultimaMs: 0 }
    c.renglones.push(p)
    c.total += p.costoTotal || 0
    c.pagado += p.montoPagado || 0
    c.comprobante = c.comprobante || p.comprobante || ''
    c.ultimaMs = Math.max(c.ultimaMs, p.modificadoMs || 0)
    m.set(k, c)
  }
  return [...m.values()].map(c => ({ ...c, saldo: Math.max(0, c.renglones.reduce((s, r) => s + Math.max(0, (r.costoTotal || 0) - (r.montoPagado || 0)), 0)), todoPagado: c.renglones.every(r => r.pagado) }))
}

export default function CompraModal({ compra, empleado = '', onCerrar, onCambio }) {
  const [monto, setMonto] = useState(String(Math.round(compra.saldo)))
  const [fecha, setFecha] = useState(hoy())
  const [comprobante, setComprobante] = useState(compra.comprobante || '')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')
  const m = parseMonto(monto)
  const reparto = repartirPagoCompra(compra.renglones, m)
  const cubre = m >= compra.saldo - 0.5

  async function pagar(montoFinal) {
    if (!(montoFinal > 0)) { setError('Poné el monto a pagar'); return }
    setGuardando(true); setError('')
    try {
      await pagarCompra({ renglones: compra.renglones, monto: montoFinal, fechaPago: fecha, empleado })
      await onCambio(montoFinal >= compra.saldo - 0.5 ? `Compra pagada completa: ${fmt$(montoFinal)}` : `Pago parcial de ${fmt$(montoFinal)} registrado`)
    } catch (e) { setError('No se pudo registrar el pago') }
    finally { setGuardando(false) }
  }
  async function guardarComprobante() {
    setGuardando(true); setError('')
    try { await actualizarComprobanteCompra(compra.renglones, comprobante.trim()); await onCambio('Comprobante guardado') }
    catch (e) { setError('No se pudo guardar el comprobante') }
    finally { setGuardando(false) }
  }

  return (
    <div style={S.overlay} onClick={() => !guardando && onCerrar()}>
      <div style={S.modal} onClick={e => e.stopPropagation()} role="dialog" aria-label="Compra">
        <div style={S.header}>
          <div>
            <div style={S.titulo}>{compra.compra ? `COMPRA ${compra.compra}` : 'COMPRA SIN NÚMERO'}</div>
            <div style={S.sub}>{compra.proveedor || 'Sin proveedor'}{compra.fechaIngreso ? ` · ingresó ${compra.fechaIngreso}` : ''}{compra.comprobante ? ` · Nº ${compra.comprobante}` : ''}</div>
          </div>
          <button style={S.cerrar} onClick={onCerrar} aria-label="Cerrar">✕</button>
        </div>
        <div style={S.cuerpo}>
          <div style={S.resumen}>
            <div><div style={S.num}>{fmt$(compra.total)}</div><div style={S.lbl}>Total ({compra.renglones.length} {compra.renglones.length === 1 ? 'renglón' : 'renglones'})</div></div>
            <div><div style={{ ...S.num, color: '#22c55e' }}>{fmt$(compra.pagado)}</div><div style={S.lbl}>Pagado</div></div>
            <div><div style={{ ...S.num, color: compra.saldo > 0 ? '#f59e0b' : '#22c55e' }}>{fmt$(compra.saldo)}</div><div style={S.lbl}>Falta pagar</div></div>
          </div>

          <table style={S.tabla}>
            <thead><tr><th style={{ ...S.th, textAlign: 'left' }}>Artículo</th><th style={S.th}>Cant.</th><th style={S.th}>Costo</th><th style={S.th}>Pagado</th>{compra.saldo > 0 && m > 0 && <th style={S.th}>Este pago</th>}</tr></thead>
            <tbody>
              {reparto.map(r => (
                <tr key={r.rowNum} data-renglon-compra={r.idPago}>
                  <td style={{ ...S.td, textAlign: 'left', whiteSpace: 'normal' }}>{r.articuloNombre || r.descripcion}<div style={S.chico}>{r.idPago}</div></td>
                  <td style={S.td}>{r.cantidad}</td>
                  <td style={S.td}>{fmt$(r.costoTotal)}</td>
                  <td style={{ ...S.td, color: compra.renglones.find(x => x.rowNum === r.rowNum)?.pagado ? '#22c55e' : 'var(--text)' }}>{fmt$(compra.renglones.find(x => x.rowNum === r.rowNum)?.montoPagado)}</td>
                  {compra.saldo > 0 && m > 0 && <td style={{ ...S.td, color: 'var(--accent)', fontWeight: 700 }}>{r.parte > 0 ? `+${fmt$(r.parte)}` : '–'}</td>}
                </tr>
              ))}
            </tbody>
          </table>

          {compra.saldo > 0 ? (
            <div style={S.caja}>
              <div style={S.cajaTitulo}>PAGAR LA COMPRA</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div><label style={S.label}>MONTO</label><input style={S.input} inputMode="numeric" value={monto} onChange={e => setMonto(e.target.value)} aria-label="Monto a pagar" /></div>
                <div><label style={S.label}>FECHA DE PAGO</label><input style={S.input} type="date" value={aInput(fecha)} onChange={e => setFecha(deInput(e.target.value))} /></div>
              </div>
              <div style={S.chico}>{cubre ? 'Cubre todo lo que falta: todos los renglones quedan pagados.' : m > 0 ? `Pago parcial: se reparte según lo que le falta a cada renglón. Quedan ${fmt$(compra.saldo - m)} por pagar.` : ''}</div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button style={S.btnSec} disabled={guardando} onClick={() => { setMonto(String(Math.round(compra.saldo))); pagar(compra.saldo) }}>Pagar todo ({fmt$(compra.saldo)})</button>
                <button style={S.btn} disabled={guardando || !(m > 0)} onClick={() => pagar(Math.min(m, compra.saldo))}>{guardando ? 'Guardando…' : cubre ? 'REGISTRAR PAGO TOTAL' : 'REGISTRAR PAGO PARCIAL'}</button>
              </div>
            </div>
          ) : <div style={{ ...S.chico, color: '#22c55e', fontSize: 14 }}>✓ Compra pagada completa.</div>}

          {compra.compra ? (
            <div style={S.caja}>
              <label style={S.label}>Nº DE FACTURA O REMITO</label>
              <div style={{ display: 'flex', gap: 8 }}>
                <input style={{ ...S.input, flex: 1 }} value={comprobante} onChange={e => setComprobante(e.target.value)} placeholder="Opcional" aria-label="Comprobante" />
                <button style={{ ...S.btnSec, flex: '0 0 auto' }} disabled={guardando || comprobante.trim() === (compra.comprobante || '')} onClick={guardarComprobante}>Guardar</button>
              </div>
            </div>
          ) : <div style={S.chico}>Compra cargada antes de que existieran los números de compra: se agrupa por proveedor y fecha de ingreso.</div>}
          {error && <div style={{ color: '#ef4444', fontFamily: 'Barlow, sans-serif', fontSize: 13 }}>{error}</div>}
        </div>
      </div>
    </div>
  )
}

const S = {
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,10,0.85)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 300, backdropFilter: 'blur(6px)' },
  modal: { background: 'var(--surface)', borderRadius: '20px 20px 0 0', width: '100%', maxWidth: 680, maxHeight: '90vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '18px 22px 12px', borderBottom: '1px solid var(--border)' },
  titulo: { fontFamily: 'Barlow Condensed, sans-serif', fontWeight: 800, fontSize: 22, color: 'var(--accent)', letterSpacing: 1 },
  sub: { fontFamily: 'Barlow, sans-serif', fontSize: 13, color: 'var(--muted)', marginTop: 2 },
  cerrar: { background: 'none', border: 'none', color: 'var(--muted)', fontSize: 20, cursor: 'pointer' },
  cuerpo: { overflowY: 'auto', padding: '14px 22px 22px', display: 'flex', flexDirection: 'column', gap: 12 },
  resumen: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 },
  num: { fontFamily: 'Barlow Condensed, sans-serif', fontWeight: 800, fontSize: 24, color: 'var(--accent)' },
  lbl: { fontFamily: 'Barlow, sans-serif', fontSize: 12, color: 'var(--muted)' },
  tabla: { width: '100%', borderCollapse: 'collapse' },
  th: { fontFamily: 'Barlow Condensed, sans-serif', fontWeight: 700, fontSize: 12, color: 'var(--muted)', letterSpacing: 1, textTransform: 'uppercase', padding: '6px 8px', borderBottom: '1.5px solid var(--border)', textAlign: 'right' },
  td: { fontFamily: 'Barlow, sans-serif', fontSize: 14, color: 'var(--text)', padding: '7px 8px', borderBottom: '1px solid var(--border)', textAlign: 'right', whiteSpace: 'nowrap' },
  chico: { fontFamily: 'Barlow, sans-serif', fontSize: 12, color: 'var(--muted)', lineHeight: 1.4 },
  caja: { display: 'flex', flexDirection: 'column', gap: 8, padding: 12, border: '1.5px solid var(--border)', borderRadius: 10, background: 'var(--surface2)' },
  cajaTitulo: { fontFamily: 'Barlow Condensed, sans-serif', fontWeight: 800, fontSize: 14, color: 'var(--accent)', letterSpacing: 1 },
  label: { display: 'block', fontFamily: 'Barlow Condensed, sans-serif', fontSize: 12, color: 'var(--accent)', letterSpacing: 1, fontWeight: 700, marginBottom: 4 },
  input: { width: '100%', boxSizing: 'border-box', background: 'var(--surface)', border: '1.5px solid var(--border)', borderRadius: 8, color: 'var(--text)', fontFamily: 'Barlow, sans-serif', fontSize: 15, padding: '9px 12px', outline: 'none', colorScheme: 'dark' },
  btn: { flex: 2, padding: '12px', background: 'var(--accent)', border: 'none', borderRadius: 8, color: '#000', fontFamily: 'Barlow Condensed, sans-serif', fontWeight: 800, fontSize: 15, letterSpacing: 1, cursor: 'pointer' },
  btnSec: { flex: 1, padding: '10px 12px', background: 'var(--surface)', border: '1.5px solid var(--border)', borderRadius: 8, color: 'var(--text)', fontFamily: 'Barlow Condensed, sans-serif', fontWeight: 700, fontSize: 15, cursor: 'pointer' },
}
