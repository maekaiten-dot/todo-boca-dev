// src/components/EditarVentaModal.jsx
// Editar una venta ya cerrada (solo Admin): artículos (agregar, quitar, cambiar), cantidades, precios,
// totales, medio de pago (uno o dos), posnet, notas y vendedor. Queda constancia de quién y qué cambió.
import { useState, useMemo } from 'react'
import { editarVenta, POSNETS, usaPosnet, metodosDe, SEP_METODOS } from '../api/sheets.js'

const METODOS = ['Efectivo Pesos', 'Efectivo Dólares', 'Efectivo Reales', 'Efectivo Euros', 'Tarjeta de Crédito', 'Tarjeta de Débito', 'QR', 'Transferencia', 'Pix']
const fmt$ = n => (n < 0 ? '−$' : '$') + Math.abs(Math.round(n || 0)).toLocaleString('es-AR')
const num = v => typeof v === 'number' ? v : Number(String(v ?? '').replace(/[$\s.]/g, '').replace(',', '.')) || 0
const normalizar = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')

function BuscarArticulo({ articulos, onElegir, placeholder, autoFocus }) {
  const [q, setQ] = useState('')
  const res = q.trim().length < 2 ? [] : articulos.filter(a => normalizar(a.nombre).includes(normalizar(q)) || normalizar(a.id).includes(normalizar(q))).slice(0, 8)
  return (
    <div style={{ position: 'relative' }}>
      <input style={S.input} autoFocus={autoFocus} value={q} onChange={e => setQ(e.target.value)} placeholder={placeholder} aria-label={placeholder} />
      {res.length > 0 && (
        <div style={S.lista}>
          {res.map(a => (
            <button key={a.id} style={S.opcion} onClick={() => { onElegir(a); setQ('') }}>
              <b>{a.id}</b> · {a.nombre} <span style={{ color: 'var(--muted)' }}>· {fmt$(num(a.precioUnitario))}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export default function EditarVentaModal({ venta, articulos = [], usuarios = [], editor = '', onCerrar, onGuardado }) {
  const activos = venta.items.filter(i => !i.anulado)
  const ref = activos[0] || venta.items[0] || {}
  const [lineas, setLineas] = useState(() => activos.map(i => {
    const bruto = (i.cantidad || 0) * (i.precioUnitario || 0)
    const final = i.precioTotalFinal || i.precioTotal || 0
    return { idDetalle: i.idDetalle, articulo: i.articulo, nombre: i.nombre, foto: i.foto, cantidad: i.cantidad, precioUnitario: i.precioUnitario, precioTotalFinal: Math.round(final), costoUnitario: i.costoUnitario || 0, factor: bruto ? final / bruto : 1, quitar: false, cambiando: false }
  }))
  const metodosOrig = metodosDe(ref.metodoPago)
  const opcionesMetodo = [...new Set([...METODOS, ...metodosOrig])]
  const [metodo1, setMetodo1] = useState(metodosOrig[0] || 'Efectivo Pesos')
  const [dividido, setDividido] = useState(metodosOrig.length === 2)
  const [metodo2, setMetodo2] = useState(metodosOrig[1] || '')
  const [monto1, setMonto1] = useState(String(ref.pagos?.[0]?.monto ?? ''))
  const [posnet, setPosnet] = useState(ref.posnet || '')
  const [notas, setNotas] = useState(ref.notas || '')
  const [vendedor, setVendedor] = useState(ref.empleado || '')
  const [agregando, setAgregando] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')

  const totalAntes = activos.reduce((s, i) => s + (i.precioTotalFinal || i.precioTotal || 0), 0)
  const total = lineas.filter(l => !l.quitar).reduce((s, l) => s + Math.round(num(l.precioTotalFinal)), 0)
  const metodoFinal = dividido && metodo2 ? `${metodo1}${SEP_METODOS}${metodo2}` : metodo1
  const conPosnet = usaPosnet(metodoFinal)
  const vendedores = useMemo(() => [...new Set([...usuarios.filter(u => u.nombre && u.nombre !== 'Tablet').map(u => u.nombre), ref.empleado].filter(Boolean))], [usuarios, ref.empleado])

  const cambiar = (k, campos) => setLineas(ls => ls.map((l, i) => i === k ? { ...l, ...campos } : l))
  const recalcular = (l, cambios) => {
    const n = { ...l, ...cambios }
    n.precioTotalFinal = Math.round(num(n.cantidad) * num(n.precioUnitario) * (n.factor || 1))
    return n
  }
  function ponerArticulo(k, a) {
    setLineas(ls => ls.map((l, i) => i !== k ? l : recalcular(l, { articulo: a.id, nombre: a.nombre, foto: a.foto || '', precioUnitario: num(a.precioUnitario), costoUnitario: num(a.costoUnitario), factor: 1, cambiando: false })))
  }
  function agregar(a) {
    setLineas(ls => [...ls, { articulo: a.id, nombre: a.nombre, foto: a.foto || '', cantidad: 1, precioUnitario: num(a.precioUnitario), precioTotalFinal: Math.round(num(a.precioUnitario)), costoUnitario: num(a.costoUnitario), factor: 1, quitar: false, nueva: true }])
    setAgregando(false)
  }

  async function guardar() {
    setError('')
    if (!lineas.some(l => !l.quitar)) { setError('La venta tiene que quedar con al menos un artículo. Para anularla entera, usá Anular.'); return }
    if (lineas.some(l => !l.quitar && !(num(l.cantidad) !== 0))) { setError('Hay un artículo con cantidad 0'); return }
    if (dividido && (!metodo2 || metodo2 === metodo1)) { setError('Elegí dos medios de pago distintos'); return }
    const m1 = Math.round(num(monto1))
    if (dividido && !(m1 > 0 && m1 < total)) { setError(`Lo cobrado con ${metodo1} tiene que ser más que $0 y menos que el total`); return }
    if (conPosnet && !POSNETS.includes(posnet)) { setError('Elegí con qué posnet se cobró'); return }
    setGuardando(true)
    try {
      const registro = await editarVenta({
        venta,
        lineas: lineas.filter(l => !(l.nueva && l.quitar)).map(l => ({ ...l, cantidad: num(l.cantidad), precioUnitario: num(l.precioUnitario), precioTotalFinal: Math.round(num(l.precioTotalFinal)) })),
        metodoPago: metodo1, pagos: dividido ? [{ metodo: metodo1, monto: m1 }, { metodo: metodo2, monto: total - m1 }] : null,
        posnet: conPosnet ? posnet : '', notas: notas.trim(), vendedor, editor,
      })
      await onGuardado(registro ? 'Venta editada ✓' : 'No había cambios')
    } catch (e) {
      setError(e.message === 'PAGOS_MONTO' ? 'Revisá el reparto entre los dos medios de pago' : e.message === 'VENTA_VACIA' ? 'La venta no puede quedar vacía' : e.message?.startsWith('La planilla') ? e.message : 'No se pudo guardar')
    } finally { setGuardando(false) }
  }

  return (
    <div style={S.overlay} onClick={() => !guardando && onCerrar()}>
      <div style={S.modal} onClick={e => e.stopPropagation()} role="dialog" aria-label="Editar venta">
        <div style={S.header}>
          <div>
            <div style={S.titulo}>EDITAR VENTA {venta.idVenta}</div>
            <div style={S.sub}>{ref.fecha} {venta.hora} · queda registrado que lo editó {editor || 'Admin'}</div>
          </div>
          <button style={S.cerrar} onClick={onCerrar} aria-label="Cerrar">✕</button>
        </div>
        <div style={S.cuerpo}>
          {lineas.map((l, k) => (
            <div key={l.idDetalle || `n${k}`} style={{ ...S.linea, ...(l.quitar ? { opacity: 0.45 } : {}), ...(l.nueva ? { borderColor: '#22c55e' } : {}) }} data-linea={l.articulo}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'flex-start' }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ ...S.nombre, ...(l.quitar ? { textDecoration: 'line-through' } : {}) }}>{l.nombre}</div>
                  <div style={S.chico}>{l.articulo}{l.nueva ? ' · NUEVO' : ''}{l.quitar ? ' · SE QUITA' : ''}</div>
                </div>
                <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                  {!l.quitar && <button style={S.mini} onClick={() => cambiar(k, { cambiando: !l.cambiando })}>Cambiar artículo</button>}
                  <button style={{ ...S.mini, color: l.quitar ? 'var(--text)' : '#ef4444' }} onClick={() => cambiar(k, { quitar: !l.quitar })}>{l.quitar ? 'Volver a poner' : 'Quitar'}</button>
                </div>
              </div>
              {l.cambiando && <BuscarArticulo articulos={articulos} autoFocus placeholder="Buscá el artículo correcto…" onElegir={a => ponerArticulo(k, a)} />}
              {!l.quitar && (
                <div style={S.campos}>
                  <label style={S.campo}><span style={S.label}>CANT.</span><input style={S.input} inputMode="numeric" value={l.cantidad} onChange={e => setLineas(ls => ls.map((x, i) => i === k ? recalcular(x, { cantidad: e.target.value }) : x))} aria-label={`Cantidad ${l.articulo}`} /></label>
                  <label style={S.campo}><span style={S.label}>PRECIO UNIT.</span><input style={S.input} inputMode="numeric" value={l.precioUnitario} onChange={e => setLineas(ls => ls.map((x, i) => i === k ? recalcular(x, { precioUnitario: e.target.value }) : x))} aria-label={`Precio ${l.articulo}`} /></label>
                  <label style={S.campo}><span style={S.label}>TOTAL COBRADO</span><input style={S.input} inputMode="numeric" value={l.precioTotalFinal} onChange={e => cambiar(k, { precioTotalFinal: e.target.value })} aria-label={`Total ${l.articulo}`} /></label>
                </div>
              )}
            </div>
          ))}
          {agregando
            ? <BuscarArticulo articulos={articulos} autoFocus placeholder="Buscá el artículo a agregar…" onElegir={agregar} />
            : <button style={S.btnSec} onClick={() => setAgregando(true)}>➕ Agregar artículo</button>}
          <div style={S.chico}>¿No está en la lista? Crealo primero en Arts. y después agregalo acá.</div>

          <div style={S.caja}>
            <div style={S.totales}>
              <span>Total: {Math.round(total) !== Math.round(totalAntes) && <span style={{ color: 'var(--muted)', textDecoration: 'line-through', marginRight: 6 }}>{fmt$(totalAntes)}</span>}<b style={{ color: 'var(--accent)', fontSize: 22 }}>{fmt$(total)}</b></span>
              {Math.round(total) !== Math.round(totalAntes) && <span style={{ color: total > totalAntes ? '#22c55e' : '#f59e0b' }}>{total > totalAntes ? `+${fmt$(total - totalAntes)} más que antes` : `${fmt$(totalAntes - total)} menos que antes`}</span>}
            </div>
            <div style={S.campos}>
              <label style={S.campo}><span style={S.label}>MEDIO DE PAGO</span>
                <select style={S.input} value={metodo1} onChange={e => setMetodo1(e.target.value)} aria-label="Medio de pago">{opcionesMetodo.map(m => <option key={m}>{m}</option>)}</select></label>
              {dividido && <label style={S.campo}><span style={S.label}>MONTO CON ESE MEDIO</span><input style={S.input} inputMode="numeric" value={monto1} onChange={e => setMonto1(e.target.value)} aria-label="Monto del primer medio" /></label>}
            </div>
            <label style={S.check}><input type="checkbox" checked={dividido} onChange={e => setDividido(e.target.checked)} /> Se cobró con 2 medios</label>
            {dividido && (
              <div style={S.campos}>
                <label style={S.campo}><span style={S.label}>SEGUNDO MEDIO</span>
                  <select style={S.input} value={metodo2} onChange={e => setMetodo2(e.target.value)} aria-label="Segundo medio"><option value="">Elegí…</option>{opcionesMetodo.filter(m => m !== metodo1).map(m => <option key={m}>{m}</option>)}</select></label>
                <div style={S.campo}><span style={S.label}>RESTO</span><div style={{ ...S.input, display: 'flex', alignItems: 'center' }}>{fmt$(total - Math.round(num(monto1)))}</div></div>
              </div>
            )}
            {conPosnet && (
              <div style={S.campo}><span style={S.label}>POSNET</span>
                <div style={{ display: 'flex', gap: 8 }}>{POSNETS.map(p => <button key={p} style={{ ...S.btnSec, ...(posnet === p ? S.activo : {}) }} onClick={() => setPosnet(p)}>{p}</button>)}</div>
              </div>
            )}
            <div style={S.campos}>
              <label style={S.campo}><span style={S.label}>VENDEDOR</span>
                <select style={S.input} value={vendedor} onChange={e => setVendedor(e.target.value)} aria-label="Vendedor">{vendedores.map(v => <option key={v}>{v}</option>)}</select></label>
              <label style={S.campo}><span style={S.label}>NOTAS</span><input style={S.input} value={notas} onChange={e => setNotas(e.target.value)} placeholder="Ej: USD 20" aria-label="Notas" /></label>
            </div>
          </div>
          {error && <div style={S.error}>{error}</div>}
        </div>
        <div style={S.pie}>
          <button style={S.btnSec} onClick={onCerrar} disabled={guardando}>Cancelar</button>
          <button style={S.btn} onClick={guardar} disabled={guardando}>{guardando ? 'Guardando…' : 'GUARDAR CAMBIOS'}</button>
        </div>
      </div>
    </div>
  )
}

const S = {
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,10,0.85)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 320, backdropFilter: 'blur(6px)' },
  modal: { background: 'var(--surface)', borderRadius: '20px 20px 0 0', width: '100%', maxWidth: 640, maxHeight: '92vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '16px 20px 10px', borderBottom: '1px solid var(--border)' },
  titulo: { fontFamily: 'Barlow Condensed, sans-serif', fontWeight: 800, fontSize: 21, color: 'var(--accent)', letterSpacing: 1 },
  sub: { fontFamily: 'Barlow, sans-serif', fontSize: 12, color: 'var(--muted)', marginTop: 2 },
  cerrar: { background: 'none', border: 'none', color: 'var(--muted)', fontSize: 20, cursor: 'pointer' },
  cuerpo: { overflowY: 'auto', padding: '12px 20px', display: 'flex', flexDirection: 'column', gap: 10 },
  linea: { display: 'flex', flexDirection: 'column', gap: 8, padding: 10, border: '1.5px solid var(--border)', borderRadius: 10, background: 'var(--surface2)' },
  nombre: { fontFamily: 'Barlow, sans-serif', fontSize: 15, color: 'var(--text)', fontWeight: 600 },
  chico: { fontFamily: 'Barlow, sans-serif', fontSize: 12, color: 'var(--muted)' },
  campos: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 8 },
  campo: { display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 },
  label: { fontFamily: 'Barlow Condensed, sans-serif', fontSize: 11, color: 'var(--accent)', letterSpacing: 1, fontWeight: 700 },
  input: { width: '100%', boxSizing: 'border-box', minWidth: 0, background: 'var(--surface)', border: '1.5px solid var(--border)', borderRadius: 8, color: 'var(--text)', fontFamily: 'Barlow, sans-serif', fontSize: 15, padding: '8px 10px', outline: 'none' },
  lista: { position: 'absolute', zIndex: 5, left: 0, right: 0, top: '100%', background: 'var(--surface)', border: '1.5px solid var(--border)', borderRadius: 8, maxHeight: 260, overflowY: 'auto' },
  opcion: { display: 'block', width: '100%', textAlign: 'left', background: 'none', border: 'none', borderBottom: '1px solid var(--border)', color: 'var(--text)', fontFamily: 'Barlow, sans-serif', fontSize: 14, padding: '8px 10px', cursor: 'pointer' },
  mini: { background: 'none', border: '1.5px solid var(--border)', borderRadius: 6, color: 'var(--text)', fontFamily: 'Barlow, sans-serif', fontSize: 12, padding: '4px 8px', cursor: 'pointer' },
  caja: { display: 'flex', flexDirection: 'column', gap: 10, padding: 12, border: '1.5px solid var(--border)', borderRadius: 10 },
  totales: { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10, flexWrap: 'wrap', fontFamily: 'Barlow, sans-serif', fontSize: 14, color: 'var(--text)' },
  check: { display: 'flex', alignItems: 'center', gap: 8, fontFamily: 'Barlow, sans-serif', fontSize: 14, color: 'var(--text)' },
  btn: { flex: 2, padding: 13, background: 'var(--accent)', border: 'none', borderRadius: 8, color: '#000', fontFamily: 'Barlow Condensed, sans-serif', fontWeight: 800, fontSize: 16, letterSpacing: 1, cursor: 'pointer' },
  btnSec: { flex: 1, padding: '10px 12px', background: 'var(--surface2)', border: '1.5px solid var(--border)', borderRadius: 8, color: 'var(--text)', fontFamily: 'Barlow Condensed, sans-serif', fontWeight: 700, fontSize: 15, cursor: 'pointer' },
  activo: { border: '1.5px solid var(--accent)', color: 'var(--accent)', background: 'rgba(245,200,0,0.1)' },
  pie: { display: 'flex', gap: 10, padding: '12px 20px', borderTop: '1px solid var(--border)' },
  error: { fontFamily: 'Barlow, sans-serif', fontSize: 13, color: '#ef4444' },
}
