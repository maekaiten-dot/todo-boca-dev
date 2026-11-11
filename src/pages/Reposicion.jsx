// src/pages/Reposicion.jsx
// Lista de reposición (solo Admin): qué pedir para que alcance hasta la próxima revisión más lo que
// tarda en llegar el pedido. Cada X días (CONFIG) la app avisa a los admin que toca revisarla.
import { useEffect, useMemo, useState } from 'react'
import { getHistoricoVentas, getIngresos, getConfig, setConfig } from '../api/sheets.js'
import { calcularReposicion, REPOSICION_DEFAULT, CLAVES_REPOSICION, hoyDia, diaDe, fechaDeDia, tocaRevisar } from '../lib/reposicion.js'

const $ = n => '$' + Math.round(n || 0).toLocaleString('es-AR')
const n1 = n => n.toLocaleString('es-AR', { maximumFractionDigits: 1 })
const URG = {
  sin: { titulo: 'Sin stock', color: '#f87171' },
  antes: { titulo: 'Se terminan antes de que llegue el pedido', color: '#fb923c' },
  revision: { titulo: 'No llegan a la próxima revisión', color: '#fbbf24' },
}

export default function Reposicion({ articulos = [], stockMap = {}, perfilNombre = '', onRevisado }) {
  const [datos, setDatos] = useState(null)
  const [error, setError] = useState('')
  const [valores, setValores] = useState(REPOSICION_DEFAULT)
  const [ultima, setUltima] = useState('')
  const [vista, setVista] = useState('urgencia')
  const [editando, setEditando] = useState(false)
  const [borrador, setBorrador] = useState(REPOSICION_DEFAULT)
  const [guardando, setGuardando] = useState(false)

  useEffect(() => {
    Promise.all([getHistoricoVentas({ unificar: true }), getIngresos({ unificar: true }).catch(() => []), getConfig().catch(() => ({}))])
      .then(([ventas, ingresos, cfg]) => {
        const num = (k, d) => { const v = Number(String(cfg[CLAVES_REPOSICION[k]]?.valor ?? '').replace(',', '.')); return v > 0 || (k === 'demoraDias' && v === 0 && cfg[CLAVES_REPOSICION[k]]) ? v : d }
        setValores({ cadaDias: num('cadaDias', REPOSICION_DEFAULT.cadaDias), demoraDias: num('demoraDias', REPOSICION_DEFAULT.demoraDias) })
        const ult = String(cfg[CLAVES_REPOSICION.ultima]?.valor || '')
        setUltima(ult)
        setDatos({ ventas, ingresos })
        // Con abrir la lista ya cuenta como revisada: se apaga el aviso hasta la próxima
        const cada = num('cadaDias', REPOSICION_DEFAULT.cadaDias)
        if (tocaRevisar(ult, cada)) {
          const f = fechaDeDia(hoyDia())
          setConfig({ [CLAVES_REPOSICION.ultima]: f }, perfilNombre).then(() => { setUltima(f); onRevisado?.() }).catch(() => {})
        }
      }).catch(e => setError(e.message))
  }, [])

  const { items, dias } = useMemo(() => datos ? calcularReposicion({ ...datos, articulos, stockMap, ...valores }) : { items: [], dias: 0 }, [datos, articulos, stockMap, valores])
  const negativos = items.filter(i => i.negativo)
  const total = items.reduce((s, i) => s + i.pedir * i.ultimoCosto, 0)
  const hoy = hoyDia()
  const uDia = diaDe(ultima)
  const proxima = uDia != null ? uDia + valores.cadaDias : null

  async function guardarValores() {
    setGuardando(true)
    try {
      const v = { cadaDias: Math.max(1, Math.round(Number(borrador.cadaDias) || 15)), demoraDias: Math.max(0, Math.round(Number(borrador.demoraDias) || 0)) }
      await setConfig({ [CLAVES_REPOSICION.cadaDias]: v.cadaDias, [CLAVES_REPOSICION.demoraDias]: v.demoraDias }, perfilNombre)
      setValores(v); setEditando(false); onRevisado?.()
    } catch (e) { setError('No se pudo guardar: ' + e.message) } finally { setGuardando(false) }
  }

  const grupos = useMemo(() => {
    if (vista === 'urgencia') return ['sin', 'antes', 'revision'].map(k => ({ clave: k, titulo: URG[k].titulo, color: URG[k].color, items: items.filter(i => i.urgencia === k) })).filter(g => g.items.length)
    const m = {}
    for (const i of items) (m[i.proveedor || ''] ||= []).push(i)
    return Object.entries(m).sort((a, b) => (a[0] ? 0 : 1) - (b[0] ? 0 : 1) || b[1].length - a[1].length)
      .map(([p, lista]) => ({ clave: p || '-', titulo: p || 'Sin proveedor cargado', items: lista, costo: lista.reduce((s, i) => s + i.pedir * i.ultimoCosto, 0) }))
  }, [items, vista])

  if (error) return <div style={S.page}><div style={S.wrap}><div style={S.error}>⚠ {error}</div></div></div>
  if (!datos) return <div style={S.page}><div style={S.wrap}><div style={S.muted}>Calculando la reposición…</div></div></div>

  return (
    <div style={S.page}>
    <div style={S.wrap}>
      <div style={S.filaTit}>
        <div>
          <div style={S.tit}>Reposición</div>
          <div style={S.muted}>
            Pedido para {dias} días: revisión cada {valores.cadaDias} días + {valores.demoraDias} de demora en llegar.
            {' '}{uDia == null ? '' : `Próximo aviso: ${fechaDeDia(proxima)}.`}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button style={S.btnChico} onClick={() => { setBorrador(valores); setEditando(e => !e) }}>{editando ? 'Cancelar' : 'Valores'}</button>
        </div>
      </div>

      {editando && (
        <div style={S.form}>
          <label style={S.campo}><span style={S.lbl}>Revisar cada (días)</span><input style={S.input} type="number" min="1" value={borrador.cadaDias} onChange={e => setBorrador(b => ({ ...b, cadaDias: e.target.value }))} /></label>
          <label style={S.campo}><span style={S.lbl}>Demora del pedido (días)</span><input style={S.input} type="number" min="0" value={borrador.demoraDias} onChange={e => setBorrador(b => ({ ...b, demoraDias: e.target.value }))} /></label>
          <button style={{ ...S.btn, alignSelf: 'end' }} onClick={guardarValores} disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar'}</button>
        </div>
      )}

      <div style={S.resumen}>
        {['sin', 'antes', 'revision'].map(k => (
          <div key={k} style={{ ...S.chip, borderColor: URG[k].color }}><b style={{ color: URG[k].color, fontSize: 22 }}>{items.filter(i => i.urgencia === k).length}</b><span>{URG[k].titulo.toLowerCase()}</span></div>
        ))}
        <div style={S.chip}><b style={{ fontSize: 22, color: 'var(--accent-text)' }}>{$(total)}</b><span>costo estimado del pedido (último costo)</span></div>
      </div>

      {negativos.length > 0 && (
        <div style={S.aviso}>
          <b>⚠ Contar antes de pedir ({negativos.length}):</b> figuran con stock negativo, o sea que se vendió más de lo contado e ingresado. Seguro falta cargar un ingreso o hay un error de conteo: la cantidad a pedir puede ser menor.
          <div style={{ marginTop: 6 }}>{negativos.slice(0, 15).map(i => `${i.nombre} (${i.stock})`).join(' · ')}{negativos.length > 15 ? ` · y ${negativos.length - 15} más (marcados con ⚠ en la lista)` : ''}</div>
        </div>
      )}

      <div style={S.toggle} role="group" aria-label="Agrupar por">
        {[['urgencia', 'Por urgencia'], ['proveedor', 'Por proveedor']].map(([k, t]) => (
          <button key={k} style={{ ...S.toggleBtn, ...(vista === k ? S.toggleOn : {}) }} aria-pressed={vista === k} onClick={() => setVista(k)}>{t}</button>
        ))}
      </div>

      {!items.length && <div style={S.muted}>No hay nada para reponer: todo alcanza para {dias} días.</div>}

      {grupos.map(g => (
        <div key={g.clave} style={S.grupo}>
          <div style={{ ...S.grupoTit, ...(g.color ? { color: g.color } : {}) }}>{g.titulo} · {g.items.length}{g.costo != null ? ` · ${$(g.costo)}` : ''}</div>
          <div style={S.tablaWrap}>
            <table style={S.tabla}>
              <thead><tr>{['Artículo', 'Stock', 'Por semana', 'Alcanza', 'Pedir', vista === 'urgencia' ? 'Proveedor' : 'Urgencia', 'Costo est.'].map((h, i) => <th key={h} style={{ ...S.th, textAlign: i === 0 || i === 5 ? 'left' : 'right' }}>{h}</th>)}</tr></thead>
              <tbody>
                {g.items.map(i => (
                  <tr key={i.id}>
                    <td style={{ ...S.td, textAlign: 'left' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        {i.foto ? <img src={i.foto} alt="" style={S.foto} loading="lazy" /> : <div style={S.foto} />}
                        <div><div style={S.nombre}>{i.nombre}</div><div style={S.codigo}>{i.id}{i.ultimoIngreso != null ? ` · último ingreso ${fechaDeDia(i.ultimoIngreso)}` : ''}</div></div>
                      </div>
                    </td>
                    <td style={{ ...S.td, ...(i.negativo ? { color: '#f87171', fontWeight: 700 } : {}) }}>{i.stock ?? '–'}{i.negativo ? ' ⚠' : ''}</td>
                    <td style={S.td}>{n1(i.porSemana)}</td>
                    <td style={S.td}>{i.stock > 0 ? `${n1(i.alcanza)} d` : '—'}</td>
                    <td style={{ ...S.td, fontWeight: 800, fontSize: 16, color: 'var(--accent-text)' }}>{i.pedir}</td>
                    <td style={{ ...S.td, textAlign: 'left' }}>{vista === 'urgencia' ? (i.proveedor || '–') : <span style={{ color: URG[i.urgencia].color }}>{URG[i.urgencia].titulo}</span>}</td>
                    <td style={S.td}>{i.ultimoCosto ? $(i.pedir * i.ultimoCosto) : '–'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
      <div style={S.muted}>Ritmo: el mayor entre los últimos 30 y 90 días. Stock: último conteo + ingresos − ventas − bajas. "Pedir" es lo que falta para cubrir {dias} días a ese ritmo. En temporada de partidos el ritmo puede no repetirse: tomalo como punto de partida.</div>
    </div>
    </div>
  )
}

const S = {
  page: { flex: 1, minHeight: 0, overflowY: 'auto', width: '100%', paddingBottom: 24 },
  // la solapa tiene alto fijo: el scroll lo hace page
  wrap: { padding: 16, display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 1100, margin: '0 auto' },
  filaTit: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' },
  tit: { fontFamily: 'Barlow Condensed, sans-serif', fontWeight: 800, fontSize: 26, color: 'var(--accent-text)' },
  muted: { fontFamily: 'Barlow, sans-serif', fontSize: 13, color: 'var(--muted)', lineHeight: 1.4 },
  error: { fontFamily: 'Barlow, sans-serif', fontSize: 15, color: '#f87171' },
  btn: { fontFamily: 'Barlow Condensed, sans-serif', fontWeight: 700, fontSize: 15, background: 'var(--accent)', color: '#000', border: 'none', borderRadius: 10, padding: '8px 14px', cursor: 'pointer' },
  btnChico: { fontFamily: 'Barlow Condensed, sans-serif', fontWeight: 700, fontSize: 15, background: 'none', color: 'var(--accent-text)', border: '1.5px solid var(--accent)', borderRadius: 10, padding: '8px 14px', cursor: 'pointer' },
  form: { display: 'flex', gap: 10, flexWrap: 'wrap', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 12 },
  campo: { display: 'flex', flexDirection: 'column', gap: 4 },
  lbl: { fontFamily: 'Barlow, sans-serif', fontSize: 13, color: 'var(--muted)' },
  input: { fontFamily: 'Barlow, sans-serif', fontSize: 16, padding: '8px 10px', width: 140, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface2)', color: 'var(--text)' },
  resumen: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 8 },
  chip: { display: 'flex', flexDirection: 'column', gap: 2, background: 'var(--surface)', border: '1px solid var(--border)', borderLeftWidth: 1, borderRadius: 12, padding: '10px 12px', fontFamily: 'Barlow, sans-serif', fontSize: 13, color: 'var(--muted)' },
  aviso: { background: '#fbbf24', color: '#000', borderRadius: 12, padding: '10px 12px', fontFamily: 'Barlow, sans-serif', fontSize: 14, lineHeight: 1.4 },
  toggle: { display: 'flex', gap: 6 },
  toggleBtn: { fontFamily: 'Barlow Condensed, sans-serif', fontWeight: 700, fontSize: 15, background: 'var(--surface)', color: 'var(--muted)', border: '1px solid var(--border)', borderRadius: 20, padding: '6px 14px', cursor: 'pointer' },
  toggleOn: { background: 'var(--accent)', color: '#000', borderColor: 'var(--accent)' },
  grupo: { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 12 },
  grupoTit: { fontFamily: 'Barlow Condensed, sans-serif', fontWeight: 800, fontSize: 18, color: 'var(--text)', marginBottom: 6 },
  tablaWrap: { overflowX: 'auto' },
  tabla: { width: '100%', borderCollapse: 'collapse', minWidth: 640 },
  th: { fontFamily: 'Barlow Condensed, sans-serif', fontWeight: 700, fontSize: 12, letterSpacing: 0.5, color: 'var(--muted)', padding: '6px 8px', borderBottom: '1px solid var(--border)', textTransform: 'uppercase', whiteSpace: 'nowrap' },
  td: { fontFamily: 'Barlow, sans-serif', fontSize: 14, color: 'var(--text)', padding: '6px 8px', borderBottom: '1px solid var(--border)', textAlign: 'right', whiteSpace: 'nowrap' },
  foto: { width: 36, height: 36, objectFit: 'cover', borderRadius: 6, background: 'var(--surface2)', flexShrink: 0 },
  nombre: { whiteSpace: 'normal', minWidth: 160, fontWeight: 600 },
  codigo: { fontSize: 12, color: 'var(--muted)' },
}
