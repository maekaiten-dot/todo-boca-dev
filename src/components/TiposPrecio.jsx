// src/components/TiposPrecio.jsx
// Rotación → "Tipos y precios": cada artículo activo en Popular / Estándar / Premium (por precio) y
// rotación alta / media / baja dentro de su tipo. Matriz 3×3 con la ganancia por semana de cada
// casillero y la acción de precio sugerida; tocando un casillero se ven sus artículos.
import { useMemo, useState } from 'react'
import { clasificarArticulos, TIPOS, NIVELES, NOMBRE_TIPO, NOMBRE_NIVEL, ACCION, SEMANAS_VENTANA } from '../lib/tiposProducto.js'
import { metodosDe } from '../api/sheets.js'

const $ = n => '$' + Math.round(n || 0).toLocaleString('es-AR')
const pct = x => x == null ? '–' : Math.round(x * 100) + '%'
const u1 = n => !n ? '–' : n < 0.1 ? '<0,1' : n.toLocaleString('es-AR', { maximumFractionDigits: 1 })
const COLOR = { POPULAR: '#22c55e', ESTANDAR: '#60a5fa', PREMIUM: '#f5c800' }
const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')

export default function TiposPrecio({ articulos, ventas, ingresos, hoy }) {
  const { cortes, filas } = useMemo(() => clasificarArticulos({ articulos, ventas, ingresos, hoy, metodosDe }), [articulos, ventas, ingresos, hoy])
  const [sel, setSel] = useState(null)       // { tipo, nivel } o null = todos
  const [busq, setBusq] = useState('')
  const [orden, setOrden] = useState({ k: 'ganSem', dir: -1 })

  const resumen = useMemo(() => {
    const factTot = filas.reduce((s, f) => s + f.fact, 0) || 1
    return Object.fromEntries(TIPOS.map(t => {
      const g = filas.filter(f => f.tipo === t)
      const m = g.map(f => f.margen).filter(x => x != null).sort((a, b) => a - b)
      const pagos = g.reduce((s, f) => { if (f.pctTurista != null) { s.t += f.pctTurista * f.u; s.l += f.pctLocal * f.u; s.n += f.u } return s }, { t: 0, l: 0, n: 0 })
      return [t, {
        n: g.length, uSem: g.reduce((s, f) => s + f.uSem, 0), fact: g.reduce((s, f) => s + f.fact, 0) / factTot,
        margen: m.length ? m[Math.floor(m.length / 2)] : null, ganSem: g.reduce((s, f) => s + (f.ganSem || 0), 0),
        turista: pagos.n ? pagos.t / pagos.n : null, local: pagos.n ? pagos.l / pagos.n : null,
      }]
    }))
  }, [filas])
  const celda = (t, n) => { const g = filas.filter(f => f.tipo === t && f.nivel === n); return { n: g.length, gan: g.reduce((s, f) => s + (f.ganSem || 0), 0) } }
  const nuevos = filas.filter(f => f.nivel === 'NUEVO')

  const visibles = useMemo(() => {
    const q = norm(busq)
    const l = filas.filter(f => (!sel || (f.tipo === sel.tipo && f.nivel === sel.nivel)) && (!q || norm(`${f.nombre} ${f.id} ${f.grupo}`).includes(q)))
    const v = r => { const x = r[orden.k]; return x == null ? -Infinity : typeof x === 'string' ? x : x }
    return l.sort((a, b) => { const x = v(a), y = v(b); return (typeof x === 'string' ? x.localeCompare(y) : x - y) * orden.dir })
  }, [filas, sel, busq, orden])
  const ordenar = k => setOrden(o => ({ k, dir: o.k === k ? -o.dir : (k === 'nombre' ? 1 : -1) }))
  const flecha = k => orden.k === k ? (orden.dir > 0 ? ' ▲' : ' ▼') : ''

  if (!cortes) return <div style={S.nota}>Faltan precios en los artículos para armar los tipos.</div>
  return (
    <div style={S.wrap}>
      <div style={S.nota}>
        <b>Tipo por precio</b> (tercios de los {cortes.n} artículos activos con precio, se recalcula solo):{' '}
        <b style={{ color: COLOR.POPULAR }}>Popular</b> hasta {$(cortes.c1 - 1)} · <b style={{ color: COLOR.ESTANDAR }}>Estándar</b> de {$(cortes.c1)} a {$(cortes.c2 - 1)} · <b style={{ color: COLOR.PREMIUM }}>Premium</b> desde {$(cortes.c2)}.
        {' '}<b>Rotación</b>: unidades por semana en las últimas {SEMANAS_VENTANA} semanas, comparada contra los de su mismo tipo (los artículos con menos tiempo se cuentan desde que llegaron).
        {' '}<b>Ganancia/semana</b> = (precio − costo) × unidades por semana, con el precio y el costo de hoy. Es lo que conviene maximizar, no las unidades.
        {' '}<b>🌎 Turistas</b>: parte de lo vendido que se pagó en dólares, reales, euros o Pix (seguro turista); <b>🏠 Locales</b>: efectivo en pesos o transferencia. La tarjeta y el QR los usan los dos y no cuentan para ninguno.
      </div>

      <div style={S.resumen}>
        {TIPOS.map(t => { const r = resumen[t]; return (
          <div key={t} style={{ ...S.card, borderColor: COLOR[t] }}>
            <div style={{ ...S.cardTit, color: COLOR[t] }}>{NOMBRE_TIPO[t].toUpperCase()}</div>
            <div style={S.cardBig}>{Math.round(r.fact * 100)}% <span style={S.cardSub}>de la facturación</span></div>
            <div style={S.cardLin}>{r.n} artículos · {u1(r.uSem)} u./semana</div>
            <div style={S.cardLin}>Margen típico {pct(r.margen)} · gana {$(r.ganSem)}/semana</div>
            <div style={S.cardLin}>🌎 {pct(r.turista)} · 🏠 {pct(r.local)}</div>
          </div>
        ) })}
      </div>

      <div style={S.matrizWrap}>
        <div style={S.matriz}>
          <div />
          {NIVELES.map(n => <div key={n} style={S.mHead}>{NOMBRE_NIVEL[n]}</div>)}
          {TIPOS.map(t => [
            <div key={t} style={{ ...S.mTipo, color: COLOR[t] }}>{NOMBRE_TIPO[t]}</div>,
            ...NIVELES.map(n => {
              const c = celda(t, n), activa = sel && sel.tipo === t && sel.nivel === n
              return (
                <button key={t + n} style={{ ...S.mCelda, ...(activa ? { borderColor: COLOR[t], background: 'rgba(245,200,0,0.08)' } : {}) }}
                  onClick={() => setSel(activa ? null : { tipo: t, nivel: n })} aria-pressed={activa} aria-label={`${NOMBRE_TIPO[t]}, ${NOMBRE_NIVEL[n]}`}>
                  <div style={S.mN}>{c.n} <span style={S.mNsub}>art.</span></div>
                  <div style={S.mGan}>{$(c.gan)}/sem</div>
                  <div style={S.mAccion}>{ACCION[t][n]}</div>
                </button>
              )
            }),
          ])}
        </div>
      </div>
      {nuevos.length > 0 && <div style={S.nota}>Además hay {nuevos.length} artículos nuevos (menos de 4 semanas de historia) que todavía no se clasifican por rotación.</div>}

      <div style={S.filtros}>
        <input style={S.search} placeholder="Buscar artículo…" value={busq} onChange={e => setBusq(e.target.value)} aria-label="Buscar artículo" />
        {sel && <button style={S.chipSel} onClick={() => setSel(null)}>{NOMBRE_TIPO[sel.tipo]} · {NOMBRE_NIVEL[sel.nivel]} ✕</button>}
        <span style={S.cuenta}>{visibles.length} artículos</span>
      </div>
      <div style={S.tablaWrap}>
        <table style={S.tabla}>
          <thead><tr>
            {[['nombre', 'Artículo'], ['tipo', 'Tipo'], ['precio', 'Precio'], ['margen', 'Margen'], ['uSem', 'u./sem'], ['ganSem', 'Gana/sem'], ['pctTurista', '🌎'], ['pctLocal', '🏠'], ['accion', 'Sugerencia']].map(([k, l]) => (
              <th key={k} style={{ ...S.th, textAlign: k === 'nombre' || k === 'accion' ? 'left' : 'right' }} onClick={() => ordenar(k)}>{l}{flecha(k)}</th>
            ))}
          </tr></thead>
          <tbody>
            {visibles.slice(0, 300).map(f => (
              <tr key={f.id}>
                <td style={{ ...S.td, textAlign: 'left', whiteSpace: 'normal', minWidth: 180 }}>{f.nombre}<div style={S.cod}>{f.id}{f.grupo ? ` · ${f.grupo}` : ''}</div></td>
                <td style={{ ...S.td, color: COLOR[f.tipo] }}>{NOMBRE_TIPO[f.tipo]}{f.manual && <span title={`Forzado a mano (por precio sería ${NOMBRE_TIPO[f.tipoAuto] || '–'})`}> ✋</span>}<div style={S.cod}>{NOMBRE_NIVEL[f.nivel]}</div></td>
                <td style={S.td}>{$(f.precio)}</td>
                <td style={{ ...S.td, color: f.margen == null ? 'var(--muted)' : f.margen < 0.4 ? '#f59e0b' : 'var(--text)' }}>{pct(f.margen)}</td>
                <td style={S.td}>{u1(f.uSem)}</td>
                <td style={{ ...S.td, fontWeight: 700 }}>{f.ganSem == null ? '–' : $(f.ganSem)}</td>
                <td style={S.td}>{pct(f.pctTurista)}</td>
                <td style={S.td}>{pct(f.pctLocal)}</td>
                <td style={{ ...S.td, textAlign: 'left', whiteSpace: 'normal', minWidth: 170 }}>{f.accion}{f.aviso && <div style={S.aviso}>{f.aviso}</div>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {visibles.length > 300 && <div style={S.nota}>Se muestran los primeros 300. Usá la búsqueda o tocá un casillero de la matriz.</div>}
    </div>
  )
}

const S = {
  wrap: { display: 'flex', flexDirection: 'column', gap: 14, padding: '14px 20px 20px' },
  nota: { fontFamily: 'Barlow, sans-serif', fontSize: 12, color: 'var(--muted)', lineHeight: 1.5 },
  resumen: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 12 },
  card: { background: 'var(--surface)', border: '1.5px solid var(--border)', borderRadius: 12, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 3 },
  cardTit: { fontFamily: 'Barlow Condensed, sans-serif', fontWeight: 800, fontSize: 15, letterSpacing: 1.5 },
  cardBig: { fontFamily: 'Barlow Condensed, sans-serif', fontWeight: 800, fontSize: 26, color: 'var(--text)' },
  cardSub: { fontFamily: 'Barlow, sans-serif', fontWeight: 400, fontSize: 12, color: 'var(--muted)' },
  cardLin: { fontFamily: 'Barlow, sans-serif', fontSize: 13, color: 'var(--text)' },
  matrizWrap: { overflowX: 'auto' },
  matriz: { display: 'grid', gridTemplateColumns: '78px repeat(3, minmax(96px, 1fr))', gap: 8, minWidth: 380 },
  mHead: { fontFamily: 'Barlow Condensed, sans-serif', fontWeight: 700, fontSize: 12, color: 'var(--muted)', letterSpacing: 1, textTransform: 'uppercase', textAlign: 'center', alignSelf: 'end' },
  mTipo: { fontFamily: 'Barlow Condensed, sans-serif', fontWeight: 800, fontSize: 15, alignSelf: 'center' },
  mCelda: { background: 'var(--surface)', border: '1.5px solid var(--border)', borderRadius: 10, padding: '8px 8px', textAlign: 'left', cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 2, color: 'var(--text)' },
  mN: { fontFamily: 'Barlow Condensed, sans-serif', fontWeight: 800, fontSize: 20 },
  mNsub: { fontFamily: 'Barlow, sans-serif', fontWeight: 400, fontSize: 11, color: 'var(--muted)' },
  mGan: { fontFamily: 'Barlow, sans-serif', fontSize: 12, color: '#22c55e', fontWeight: 600 },
  mAccion: { fontFamily: 'Barlow, sans-serif', fontSize: 11, color: 'var(--muted)', lineHeight: 1.3 },
  filtros: { display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' },
  search: { fontFamily: 'Barlow, sans-serif', fontSize: 15, padding: '9px 12px', background: 'var(--bg)', border: '1.5px solid var(--border)', borderRadius: 10, color: 'var(--text)', width: '100%', maxWidth: 300, boxSizing: 'border-box' },
  chipSel: { fontFamily: 'Barlow Condensed, sans-serif', fontWeight: 700, fontSize: 14, background: 'rgba(245,200,0,0.12)', border: '1.5px solid var(--accent)', color: 'var(--accent)', borderRadius: 999, padding: '5px 12px', cursor: 'pointer' },
  cuenta: { fontFamily: 'Barlow, sans-serif', fontSize: 12, color: 'var(--muted)' },
  tablaWrap: { overflowX: 'auto', WebkitOverflowScrolling: 'touch' },
  tabla: { width: '100%', minWidth: 860, borderCollapse: 'collapse' },
  th: { fontFamily: 'Barlow Condensed, sans-serif', fontWeight: 700, fontSize: 12, color: 'var(--muted)', letterSpacing: 1, textTransform: 'uppercase', padding: '8px', borderBottom: '1.5px solid var(--border)', cursor: 'pointer', whiteSpace: 'nowrap', userSelect: 'none' },
  td: { fontFamily: 'Barlow, sans-serif', fontSize: 14, color: 'var(--text)', padding: '8px', borderBottom: '1px solid var(--border)', textAlign: 'right', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums', verticalAlign: 'top' },
  cod: { fontSize: 11, color: 'var(--muted)', marginTop: 2 },
  aviso: { fontSize: 11, color: '#f59e0b', marginTop: 2, fontWeight: 600 },
}
