// src/pages/Rentabilidad.jsx
// Margen real y GMROI por artículo o por grupo (solo Admin).
import { useEffect, useMemo, useState } from 'react'
import { getHistoricoVentas, getIngresos } from '../api/sheets.js'
import { calcularRentabilidad, agruparRentabilidad, sumarRentabilidad, clasificarGmroi } from '../lib/rentabilidad.js'

const $ = n => (n < 0 ? '−$' : '$') + Math.abs(Math.round(n || 0)).toLocaleString('es-AR')
const pct = v => v == null ? '–' : `${(v * 100).toLocaleString('es-AR', { maximumFractionDigits: 1 })}%`
const num = (v, d = 1) => v == null ? '–' : v.toLocaleString('es-AR', { maximumFractionDigits: d })
const PERIODOS = [[30, '30 días'], [90, '90 días'], [180, '6 meses'], [365, '1 año']]
const ORDENES = [['margen', 'Margen $'], ['margenPct', 'Margen %'], ['gmroi', 'GMROI'], ['venta', 'Venta'], ['invActual', 'Inventario']]
const gm = v => v == null ? '–' : v > 50 ? '+50' : num(v, 1)
const colorPct = v => v == null ? 'var(--muted)' : v < 0.3 ? '#f87171' : v < 0.5 ? '#fbbf24' : '#4ade80'

export default function Rentabilidad({ articulos = [], stockMap = {} }) {
  const [datos, setDatos] = useState(null)
  const [error, setError] = useState('')
  const [dias, setDias] = useState(90)
  const [vista, setVista] = useState('articulo')
  const [orden, setOrden] = useState('margen')
  const [buscar, setBuscar] = useState('')
  const [abierto, setAbierto] = useState(null)
  const [verTodos, setVerTodos] = useState(false)
  const [ayuda, setAyuda] = useState(false)

  useEffect(() => {
    Promise.all([getHistoricoVentas({ unificar: true }), getIngresos({ unificar: true }).catch(() => [])])
      .then(([ventas, ingresos]) => setDatos({ ventas, ingresos })).catch(e => setError(e.message))
  }, [])

  const { items } = useMemo(() => datos ? calcularRentabilidad({ ...datos, articulos, stockMap, dias }) : { items: [] }, [datos, articulos, stockMap, dias])
  const total = useMemo(() => sumarRentabilidad(items, dias), [items, dias])
  const filas = useMemo(() => {
    const base = vista === 'grupo' ? agruparRentabilidad(items, dias) : items
    const q = buscar.trim().toLowerCase()
    const f = q ? base.filter(x => x.nombre.toLowerCase().includes(q) || String(x.id).toLowerCase().includes(q)) : base
    const val = x => x[orden] ?? -Infinity
    return [...f].sort((a, b) => val(b) - val(a))
  }, [items, vista, buscar, orden, dias])
  const conEstimado = items.filter(x => x.costoEstimado > 0).length
  const sinCosto = items.filter(x => x.vendidasSinCosto > 0)
  const revisar = items.filter(x => x.gmroi != null && x.gmroi < 1 && x.invActual > 0).sort((a, b) => b.invActual - a.invActual)

  if (error) return <div style={S.page}><div style={S.wrap}><div style={S.error}>⚠ {error}</div></div></div>
  if (!datos) return <div style={S.page}><div style={S.wrap}><div style={S.muted}>Calculando márgenes…</div></div></div>

  const mostradas = verTodos ? filas : filas.slice(0, 60)
  return (
    <div style={S.page}>
      <div style={S.wrap}>
        <div style={S.filaTit}>
          <div style={S.tit}>Rentabilidad</div>
          <button style={S.btnChico} onClick={() => setAyuda(a => !a)}>{ayuda ? 'Cerrar' : '¿Cómo se calcula?'}</button>
        </div>
        {ayuda && (
          <div style={S.ayuda}>
            <b>Margen</b> = venta (precio final, con promos y descuentos) − costo de la mercadería − costo de cobro (comisión del posnet o QR con IVA, IIBB e impuesto al cheque). El servicio fijo de Payway no se reparte por artículo.<br />
            <b>GMROI</b> = margen del período llevado a un año ÷ inventario promedio a costo. Ej.: GMROI 3 = cada $1 invertido en stock de ese artículo deja $3 de margen por año. Más de 3: muy rentable · entre 1 y 3: bien · menos de 1: el stock rinde poco.<br />
            <b>Inventario promedio</b> = promedio entre el stock al principio y al final del período, al costo actual. <b>Días de inventario</b>: cuántos días alcanza el stock actual al ritmo de venta del período.
          </div>
        )}

        <div style={S.chips}>
          {PERIODOS.map(([d, t]) => <button key={d} style={{ ...S.chip, ...(dias === d ? S.chipOn : {}) }} aria-pressed={dias === d} onClick={() => setDias(d)}>{t}</button>)}
        </div>

        <div style={S.cards}>
          <Card t="Venta" v={$(total.venta)} s={`${num(total.unidades, 0)} unidades`} />
          <Card t="Costo mercadería" v={$(total.costo)} s={pct(total.venta ? total.costo / total.venta : null) + ' de la venta'} />
          <Card t="Costo de cobro" v={$(total.cobro)} s={pct(total.venta ? total.cobro / total.venta : null) + ' de la venta'} />
          <Card t="Margen" v={$(total.margen)} s={pct(total.margenPct) + ' de la venta'} color={colorPct(total.margenPct)} />
          <Card t="Inventario a costo" v={$(total.invActual)} s={total.diasInventario != null ? `alcanza ${num(total.diasInventario, 0)} días` : ''} />
          <Card t="GMROI" v={num(total.gmroi, 2)} s={`rotación ${num(total.rotacion, 1)} veces por año`} color={clasificarGmroi(total.gmroi).color} />
        </div>

        {(conEstimado > 0 || sinCosto.length > 0) && (
          <div style={S.aviso}>
            {conEstimado > 0 && <div>⚠ {conEstimado} artículos tienen ventas sin costo guardado: se usó su costo actual.</div>}
            {sinCosto.length > 0 && <div>⚠ {sinCosto.length} artículos no tienen costo cargado y sus ventas no entran en el margen: {sinCosto.slice(0, 8).map(x => x.nombre).join(' · ')}{sinCosto.length > 8 ? ` y ${sinCosto.length - 8} más` : ''}.</div>}
          </div>
        )}

        {revisar.length > 0 && (
          <div style={S.revisar}>
            <b>Stock que rinde poco (GMROI menor a 1):</b> {$(revisar.reduce((s, x) => s + x.invActual, 0))} a costo en {revisar.length} artículos. Los de más plata parada: {revisar.slice(0, 5).map(x => `${x.nombre} (${$(x.invActual)})`).join(' · ')}.
          </div>
        )}

        <div style={S.controles}>
          <div style={S.chips}>
            {[['articulo', 'Por artículo'], ['grupo', 'Por grupo']].map(([k, t]) => <button key={k} style={{ ...S.chip, ...(vista === k ? S.chipOn : {}) }} aria-pressed={vista === k} onClick={() => setVista(k)}>{t}</button>)}
          </div>
          <label style={S.lbl}>Ordenar por <select style={S.select} value={orden} onChange={e => setOrden(e.target.value)}>{ORDENES.map(([k, t]) => <option key={k} value={k}>{t}</option>)}</select></label>
          <input style={S.input} placeholder="Buscar…" value={buscar} onChange={e => setBuscar(e.target.value)} aria-label="Buscar artículo o grupo" />
        </div>

        <div style={S.tablaWrap}>
          <table style={S.tabla}>
            <thead><tr>{['', 'Unid.', 'Venta', 'Costo', 'Cobro', 'Margen', 'Margen %', 'Por unidad', 'Stock (costo)', 'Días inv.', 'GMROI', ''].map((h, i) => <th key={i} style={{ ...S.th, textAlign: i === 0 || i === 11 ? 'left' : 'right' }}>{h}</th>)}</tr></thead>
            <tbody>
              {mostradas.map(x => {
                const c = clasificarGmroi(x.gmroi)
                return [
                  <tr key={x.id} style={x.esGrupo ? { cursor: 'pointer' } : undefined} onClick={x.esGrupo ? () => setAbierto(a => a === x.id ? null : x.id) : undefined}>
                    <td style={{ ...S.td, textAlign: 'left' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        {!x.esGrupo && (x.foto ? <img src={x.foto} alt="" style={S.foto} loading="lazy" /> : <div style={S.foto} />)}
                        <div>
                          <div style={S.nombre}>{x.esGrupo ? `${abierto === x.id ? '▾' : '▸'} ${x.nombre}` : x.nombre}</div>
                          <div style={S.codigo}>{x.esGrupo ? `${x.cantidad} artículos` : x.id}{x.costoEstimado > 0 ? ' · costo estimado' : ''}{x.vendidasSinCosto > 0 ? ' · sin costo ⚠' : ''}</div>
                        </div>
                      </div>
                    </td>
                    <td style={S.td}>{num(x.unidades, 0)}</td>
                    <td style={S.td}>{$(x.venta)}</td>
                    <td style={S.td}>{$(x.costo)}</td>
                    <td style={S.td}>{$(x.cobro)}</td>
                    <td style={{ ...S.td, fontWeight: 700 }}>{$(x.margen)}</td>
                    <td style={{ ...S.td, fontWeight: 700, color: colorPct(x.margenPct) }}>{pct(x.margenPct)}</td>
                    <td style={S.td}>{x.esGrupo ? '–' : x.margenUnit != null ? $(x.margenUnit) : '–'}</td>
                    <td style={S.td}>{$(x.invActual)}</td>
                    <td style={S.td}>{num(x.diasInventario, 0)}</td>
                    <td style={{ ...S.td, fontWeight: 700, color: c.color }}>{gm(x.gmroi)}</td>
                    <td style={{ ...S.td, textAlign: 'left', color: c.color }}>{c.texto}</td>
                  </tr>,
                  x.esGrupo && abierto === x.id && x.hijos.sort((a, b) => (b[orden] ?? -Infinity) - (a[orden] ?? -Infinity)).map(h => {
                    const ch = clasificarGmroi(h.gmroi)
                    return (
                      <tr key={x.id + h.id} style={{ background: 'var(--surface2)' }}>
                        <td style={{ ...S.td, textAlign: 'left', paddingLeft: 24 }}><div style={S.nombre}>{h.nombre}</div><div style={S.codigo}>{h.id}</div></td>
                        <td style={S.td}>{num(h.unidades, 0)}</td><td style={S.td}>{$(h.venta)}</td><td style={S.td}>{$(h.costo)}</td><td style={S.td}>{$(h.cobro)}</td>
                        <td style={S.td}>{$(h.margen)}</td><td style={{ ...S.td, color: colorPct(h.margenPct) }}>{pct(h.margenPct)}</td>
                        <td style={S.td}>{h.margenUnit != null ? $(h.margenUnit) : '–'}</td><td style={S.td}>{$(h.invActual)}</td><td style={S.td}>{num(h.diasInventario, 0)}</td>
                        <td style={{ ...S.td, color: ch.color }}>{gm(h.gmroi)}</td><td style={{ ...S.td, textAlign: 'left', color: ch.color }}>{ch.texto}</td>
                      </tr>
                    )
                  }),
                ]
              })}
            </tbody>
          </table>
        </div>
        {filas.length > 60 && <button style={S.btnChico} onClick={() => setVerTodos(v => !v)}>{verTodos ? 'Ver menos' : `Ver los ${filas.length}`}</button>}
      </div>
    </div>
  )
}

function Card({ t, v, s, color }) {
  return <div style={S.card}><div style={S.cardT}>{t}</div><div style={{ ...S.cardV, ...(color ? { color } : {}) }}>{v}</div>{s && <div style={S.cardS}>{s}</div>}</div>
}

const S = {
  page: { flex: 1, minHeight: 0, overflowY: 'auto', width: '100%', paddingBottom: 24 },
  wrap: { padding: 16, display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 1200, margin: '0 auto' },
  filaTit: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' },
  tit: { fontFamily: 'Barlow Condensed, sans-serif', fontWeight: 800, fontSize: 26, color: 'var(--accent-text)' },
  muted: { fontFamily: 'Barlow, sans-serif', fontSize: 14, color: 'var(--muted)' },
  error: { fontFamily: 'Barlow, sans-serif', fontSize: 15, color: '#f87171' },
  ayuda: { fontFamily: 'Barlow, sans-serif', fontSize: 14, color: 'var(--text)', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 12, lineHeight: 1.5 },
  btnChico: { fontFamily: 'Barlow Condensed, sans-serif', fontWeight: 700, fontSize: 15, background: 'none', color: 'var(--accent-text)', border: '1.5px solid var(--accent)', borderRadius: 10, padding: '6px 14px', cursor: 'pointer', alignSelf: 'flex-start' },
  chips: { display: 'flex', gap: 6, flexWrap: 'wrap' },
  chip: { fontFamily: 'Barlow Condensed, sans-serif', fontWeight: 700, fontSize: 15, background: 'var(--surface)', color: 'var(--muted)', border: '1px solid var(--border)', borderRadius: 20, padding: '6px 14px', cursor: 'pointer' },
  chipOn: { background: 'var(--accent)', color: '#000', borderColor: 'var(--accent)' },
  cards: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 8 },
  card: { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '10px 12px' },
  cardT: { fontFamily: 'Barlow Condensed, sans-serif', fontWeight: 700, fontSize: 13, letterSpacing: 0.5, color: 'var(--muted)', textTransform: 'uppercase' },
  cardV: { fontFamily: 'Barlow Condensed, sans-serif', fontWeight: 800, fontSize: 24, color: 'var(--text)' },
  cardS: { fontFamily: 'Barlow, sans-serif', fontSize: 12, color: 'var(--muted)' },
  aviso: { fontFamily: 'Barlow, sans-serif', fontSize: 13, color: '#fbbf24', lineHeight: 1.5 },
  revisar: { fontFamily: 'Barlow, sans-serif', fontSize: 14, color: 'var(--text)', background: 'var(--surface)', border: '1px solid #f87171', borderRadius: 12, padding: '10px 12px', lineHeight: 1.5 },
  controles: { display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' },
  lbl: { fontFamily: 'Barlow, sans-serif', fontSize: 14, color: 'var(--muted)', display: 'flex', gap: 6, alignItems: 'center' },
  select: { fontFamily: 'Barlow, sans-serif', fontSize: 15, padding: '6px 8px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface2)', color: 'var(--text)' },
  input: { fontFamily: 'Barlow, sans-serif', fontSize: 15, padding: '6px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface2)', color: 'var(--text)', minWidth: 160, flex: 1 },
  tablaWrap: { overflowX: 'auto', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12 },
  tabla: { width: '100%', borderCollapse: 'collapse', minWidth: 980 },
  th: { fontFamily: 'Barlow Condensed, sans-serif', fontWeight: 700, fontSize: 12, letterSpacing: 0.5, color: 'var(--muted)', padding: '8px', borderBottom: '1px solid var(--border)', textTransform: 'uppercase', whiteSpace: 'nowrap' },
  td: { fontFamily: 'Barlow, sans-serif', fontSize: 14, color: 'var(--text)', padding: '6px 8px', borderBottom: '1px solid var(--border)', textAlign: 'right', whiteSpace: 'nowrap' },
  foto: { width: 34, height: 34, objectFit: 'cover', borderRadius: 6, background: 'var(--surface2)', flexShrink: 0 },
  nombre: { whiteSpace: 'normal', minWidth: 170, fontWeight: 600 },
  codigo: { fontSize: 12, color: 'var(--muted)' },
}
