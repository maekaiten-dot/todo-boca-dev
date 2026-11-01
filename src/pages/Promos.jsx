// src/pages/Promos.jsx
// Solapa Promos (solo Admin): armar promos por cantidad, combinación o kit; pausarlas o terminarlas;
// ver quién armó cada una y qué se cambió; y medir si funcionan (semanas con promo contra las
// mismas semanas anteriores, comparado con cómo se movió el resto del local).
import { useEffect, useMemo, useState } from 'react'
import { guardarPromo, cambiarEstadoPromo, getHistoricoVentas } from '../api/sheets.js'
import { TIPOS_PROMO, PROMOS_FIJAS, promoVigente } from '../lib/promos.js'
import { parseMonto } from '../lib/montos.js'

const $ = n => '$' + Math.round(Number(n) || 0).toLocaleString('es-AR')
const pct = x => x == null || !isFinite(x) ? '–' : `${Math.round(x * 100)}%`
const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
const hoyTexto = () => new Date().toLocaleDateString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' })
const diaDe = f => { const p = String(f || '').replace(/^'/, '').split(' ')[0].split('/').map(Number); return p[2] ? Math.floor(Date.UTC(p[2], p[1] - 1, p[0]) / 86400000) : null }
const textoDeDia = d => { const f = new Date(d * 86400000); return `${f.getUTCDate()}/${f.getUTCMonth() + 1}/${f.getUTCFullYear()}` }
const aInput = t => { const d = diaDe(t); if (d == null) return ''; const f = new Date(d * 86400000); return f.toISOString().slice(0, 10) }
const deInput = v => { if (!v) return ''; const [a, m, d] = v.split('-').map(Number); return `${d}/${m}/${a}` }
const VACIA = { tipo: 'CANTIDAD', nombre: '', articulosA: [], articulosB: [], cantidad: '3', precio: '', porcentaje: '20', desde: '', hasta: '' }

// ── Medición ─────────────────────────────────────────────────────────────────
export function medirPromo(p, ventas, hoy) {
  const d0 = diaDe(p.desde); if (d0 == null) return { error: 'La promo no tiene fecha de inicio' }
  const fin = Math.min(diaDe(p.hasta) ?? hoy, hoy)
  if (d0 > hoy) return { error: 'Todavía no empezó' }
  const L = fin - d0 + 1, semanas = L / 7
  const S = new Set([...p.articulosA, ...p.articulosB]), A = new Set(p.articulosA), B = new Set(p.articulosB)
  const per = (a, b) => {
    const tk = {}; let ganS = 0, ganR = 0, uS = 0, dto = 0
    for (const v of ventas) {
      if (v.anulado) continue
      const d = diaDe(v.fecha); if (d == null || d < a || d > b) continue
      const fin = v.precioTotalFinal || v.precioTotal || 0
      const costo = v.costoTotal > 0 && v.costoTotal < fin * 1.5 ? v.costoTotal : 0
      if (S.has(v.articulo)) { ganS += fin - costo; if (v.cantidad > 0) uS += v.cantidad } else ganR += fin - costo
      const m = String(v.promos || '').split('|').map(x => x.trim()).find(x => x.startsWith(p.id + ':'))
      if (m) dto += Number(m.split(':')[1]) || 0
      if (v.idVenta && v.cantidad > 0 && !/CAMBIO/i.test(v.notas || '')) {
        const t = (tk[v.idVenta] ||= { a: 0, b: 0 })
        if (A.has(v.articulo)) t.a += v.cantidad
        if (B.has(v.articulo)) t.b += v.cantidad
      }
    }
    const conA = Object.values(tk).filter(t => t.a > 0)
    const meta = p.tipo === 'CANTIDAD' ? conA.filter(t => t.a >= p.cantidad).length : conA.filter(t => t.b > 0).length
    const sem = (b - a + 1) / 7
    return { carritosA: conA.length, meta: conA.length ? meta / conA.length : null, uSem: uS / sem, ganS: ganS / sem, ganR: ganR / sem, dto: dto / sem }
  }
  const durante = per(d0, fin), antes = per(d0 - L, d0 - 1)
  const crecS = antes.ganS > 0 ? durante.ganS / antes.ganS - 1 : null
  const crecR = antes.ganR > 0 ? durante.ganR / antes.ganR - 1 : null
  const efecto = crecS != null && crecR != null ? crecS - crecR : null
  let veredicto, tono
  if (L < 14) { veredicto = `Faltan datos: lleva ${L} ${L === 1 ? 'día' : 'días'}, esperá al menos 2 semanas`; tono = 'muted' }
  else if (efecto == null) { veredicto = 'Sin ventas antes para comparar'; tono = 'muted' }
  else if (efecto > 0.05) { veredicto = 'Conviene seguir'; tono = 'ok' }
  else if (efecto < -0.05) { veredicto = 'Pierde plata: la ganancia de esos artículos creció menos que el resto del local'; tono = 'mal' }
  else { veredicto = 'No movió nada: se movió igual que el resto del local'; tono = 'muted' }
  return { L, semanas, antes, durante, crecS, crecR, efecto, veredicto, tono, desdeAntes: textoDeDia(d0 - L), hastaAntes: textoDeDia(d0 - 1), hastaDurante: textoDeDia(fin) }
}

// ── Selector de artículos ────────────────────────────────────────────────────
function SelectorArticulos({ etiqueta, articulos, elegidos, onCambio }) {
  const [busq, setBusq] = useState(''), [precio, setPrecio] = useState('')
  const porId = useMemo(() => Object.fromEntries(articulos.map(a => [a.id, a])), [articulos])
  const coinciden = useMemo(() => {
    const q = norm(busq).trim(), pr = parseMonto(precio)
    if (!q && !pr) return []
    return articulos.filter(a => (!q || norm(`${a.nombre} ${a.id} ${a.grupo || ''}`).includes(q)) && (!pr || Math.round(parseMonto(a.precioUnitario)) === Math.round(pr)))
  }, [busq, precio, articulos])
  const agregar = ids => onCambio([...new Set([...elegidos, ...ids])])
  const nuevos = coinciden.filter(a => !elegidos.includes(a.id))
  return (
    <div style={S.campo}>
      <label style={S.label}>{etiqueta}</label>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <input style={{ ...S.input, flex: 2, minWidth: 160 }} placeholder="Nombre, código o grupo (ej: llavero)" value={busq} onChange={e => setBusq(e.target.value)} aria-label={`Buscar ${etiqueta}`} />
        <input style={{ ...S.input, flex: 1, minWidth: 100 }} placeholder="Precio (ej: 6000)" inputMode="numeric" value={precio} onChange={e => setPrecio(e.target.value)} aria-label={`Precio ${etiqueta}`} />
      </div>
      {coinciden.length > 0 && (
        <div style={S.resultados}>
          {nuevos.length > 1 && <button style={S.btnChico} onClick={() => agregar(nuevos.map(a => a.id))}>+ Agregar los {nuevos.length} que coinciden</button>}
          {coinciden.slice(0, 30).map(a => (
            <button key={a.id} style={{ ...S.resultado, ...(elegidos.includes(a.id) ? { opacity: 0.45 } : {}) }} onClick={() => agregar([a.id])} disabled={elegidos.includes(a.id)}>
              <span>{a.nombre}</span><span style={S.mutedChico}>{a.id} · {$(parseMonto(a.precioUnitario))}</span>
            </button>
          ))}
          {coinciden.length > 30 && <div style={S.mutedChico}>…y {coinciden.length - 30} más: afiná la búsqueda o usá “Agregar los que coinciden”.</div>}
        </div>
      )}
      {elegidos.length > 0 && (
        <div style={S.chips}>
          {elegidos.map(id => (
            <span key={id} style={S.chip}>{porId[id]?.nombre || id} · {$(parseMonto(porId[id]?.precioUnitario))}
              <button style={S.chipX} onClick={() => onCambio(elegidos.filter(x => x !== id))} aria-label={`Quitar ${porId[id]?.nombre || id}`}>✕</button></span>
          ))}
          <button style={S.btnLink} onClick={() => onCambio([])}>Quitar todos</button>
        </div>
      )}
    </div>
  )
}

// ── Formulario ───────────────────────────────────────────────────────────────
function FormPromo({ inicial, articulos, perfilNombre, onCerrar, onGuardada }) {
  const [f, setF] = useState(() => inicial ? { ...inicial, cantidad: String(inicial.cantidad || ''), precio: String(inicial.precio || ''), porcentaje: String(inicial.porcentaje || '') } : { ...VACIA, desde: hoyTexto() })
  const [error, setError] = useState(''), [guardando, setGuardando] = useState(false)
  const porId = useMemo(() => Object.fromEntries(articulos.map(a => [a.id, a])), [articulos])
  const prom = ids => {
    const l = ids.map(id => porId[id]).filter(Boolean)
    const p = l.map(a => parseMonto(a.precioUnitario)).filter(x => x > 0), c = l.map(a => parseMonto(a.costoUnitario)).filter(x => x > 0)
    return { p: p.length ? p.reduce((s, x) => s + x, 0) / p.length : 0, c: c.length ? c.reduce((s, x) => s + x, 0) / c.length : 0 }
  }
  // Margen con la promo (promedio de los artículos elegidos)
  const margen = (() => {
    const a = prom(f.articulosA), b = prom(f.articulosB), n = Number(f.cantidad) || 0, precio = parseMonto(f.precio), por = Number(f.porcentaje) || 0
    if (f.tipo === 'CANTIDAD' && a.p && a.c && n >= 2 && precio) return { sin: 1 - a.c / a.p, con: 1 - (a.c * n) / precio, dto: a.p * n - precio, texto: `${n} a ${$(precio)} (${$(precio / n)} c/u en vez de ${$(a.p)})` }
    if (f.tipo === 'COMBINACION' && b.p && b.c && por) return { sin: 1 - b.c / b.p, con: 1 - b.c / (b.p * (1 - por / 100)), dto: b.p * por / 100, texto: `el segundo a ${$(b.p * (1 - por / 100))} en vez de ${$(b.p)}` }
    if (f.tipo === 'KIT' && a.p && b.p && a.c && b.c && precio) return { sin: 1 - (a.c + b.c) / (a.p + b.p), con: 1 - (a.c + b.c) / precio, dto: a.p + b.p - precio, texto: `los dos a ${$(precio)} en vez de ${$(a.p + b.p)}` }
    return null
  })()
  async function guardar() {
    const n = Number(f.cantidad) || 0, precio = parseMonto(f.precio), por = Number(f.porcentaje) || 0
    if (!f.nombre.trim()) return setError('Ponele un nombre a la promo')
    if (!f.articulosA.length) return setError(f.tipo === 'CANTIDAD' ? 'Elegí los artículos de la promo' : 'Elegí los artículos que activan la promo')
    if (f.tipo !== 'CANTIDAD' && !f.articulosB.length) return setError('Elegí los artículos que llevan el descuento')
    if (f.tipo === 'CANTIDAD' && (n < 2 || !precio)) return setError('Poné cuántos llevan (2 o más) y cuánto pagan')
    if (f.tipo === 'COMBINACION' && !(por > 0 && por < 100)) return setError('El descuento tiene que ser entre 1% y 99%')
    if (f.tipo === 'KIT' && !precio) return setError('Poné el precio del kit')
    if (!f.desde) return setError('Poné desde cuándo vale')
    if (f.hasta && diaDe(f.hasta) < diaDe(f.desde)) return setError('La fecha de fin es anterior a la de inicio')
    if (margen && margen.dto <= 0) return setError('Con ese precio no hay descuento: revisalo')
    setGuardando(true); setError('')
    try {
      await guardarPromo({ ...f, cantidad: f.tipo === 'CANTIDAD' ? n : '', precio: f.tipo === 'COMBINACION' ? '' : precio, porcentaje: f.tipo === 'COMBINACION' ? por : '', articulosB: f.tipo === 'CANTIDAD' ? [] : f.articulosB }, perfilNombre)
      onGuardada()
    } catch (e) { console.error(e); setError('No se pudo guardar. Probá de nuevo.') }
    finally { setGuardando(false) }
  }
  return (
    <div style={S.card} aria-label="Formulario de promo">
      <div style={S.cardTit}>{inicial ? `Editar ${inicial.id}` : 'Nueva promo'}</div>
      <div style={S.seg}>
        {Object.entries(TIPOS_PROMO).map(([k, l]) => <button key={k} style={{ ...S.segBtn, ...(f.tipo === k ? S.segBtnOn : {}) }} onClick={() => setF(x => ({ ...x, tipo: k }))} aria-pressed={f.tipo === k}>{l}</button>)}
      </div>
      <div style={S.ayuda}>
        {f.tipo === 'CANTIDAD' && 'Llevando la cantidad de artículos elegidos (se pueden mezclar entre ellos), pagan el precio de la promo. Se repite: si la promo es de 3, con 6 entran dos veces.'}
        {f.tipo === 'COMBINACION' && 'Por cada artículo del primer grupo, uno del segundo grupo lleva el descuento. Ej: llevando un buzo, la remera con 20%.'}
        {f.tipo === 'KIT' && 'Un artículo del primer grupo más uno del segundo, a un precio cerrado. Ej: mate + bombilla a $30.000.'}
      </div>
      <div style={S.campo}><label style={S.label}>Nombre (se ve en el ticket)</label>
        <input style={S.input} value={f.nombre} onChange={e => setF(x => ({ ...x, nombre: e.target.value }))} placeholder={f.tipo === 'CANTIDAD' ? '3 llaveros de $6.000 a $15.000' : f.tipo === 'COMBINACION' ? 'Buzo + remera: 20% en la remera' : 'Kit mate + bombilla'} aria-label="Nombre de la promo" /></div>
      <SelectorArticulos etiqueta={f.tipo === 'CANTIDAD' ? 'Artículos de la promo' : f.tipo === 'COMBINACION' ? 'Llevando alguno de estos…' : 'Primer artículo del kit (alguno de estos)'} articulos={articulos} elegidos={f.articulosA} onCambio={v => setF(x => ({ ...x, articulosA: v }))} />
      {f.tipo !== 'CANTIDAD' && <SelectorArticulos etiqueta={f.tipo === 'COMBINACION' ? '…uno de estos lleva el descuento' : 'Segundo artículo del kit (alguno de estos)'} articulos={articulos} elegidos={f.articulosB} onCambio={v => setF(x => ({ ...x, articulosB: v }))} />}
      <div style={S.fila}>
        {f.tipo === 'CANTIDAD' && <div style={S.campo}><label style={S.label}>Llevando</label><input style={S.input} inputMode="numeric" value={f.cantidad} onChange={e => setF(x => ({ ...x, cantidad: e.target.value.replace(/\D/g, '') }))} aria-label="Cantidad" /></div>}
        {f.tipo !== 'COMBINACION' && <div style={S.campo}><label style={S.label}>{f.tipo === 'KIT' ? 'Precio del kit' : 'Pagan'}</label><input style={S.input} inputMode="numeric" value={f.precio} onChange={e => setF(x => ({ ...x, precio: e.target.value }))} placeholder="15000" aria-label="Precio de la promo" /></div>}
        {f.tipo === 'COMBINACION' && <div style={S.campo}><label style={S.label}>Descuento %</label><input style={S.input} inputMode="numeric" value={f.porcentaje} onChange={e => setF(x => ({ ...x, porcentaje: e.target.value.replace(/\D/g, '') }))} aria-label="Porcentaje" /></div>}
        <div style={S.campo}><label style={S.label}>Desde</label><input style={S.input} type="date" value={aInput(f.desde)} onChange={e => setF(x => ({ ...x, desde: deInput(e.target.value) }))} aria-label="Desde" /></div>
        <div style={S.campo}><label style={S.label}>Hasta (opcional)</label><input style={S.input} type="date" value={aInput(f.hasta)} onChange={e => setF(x => ({ ...x, hasta: deInput(e.target.value) }))} aria-label="Hasta" /></div>
      </div>
      {margen && (
        <div style={S.margen}>
          {margen.texto} · margen <b>{pct(margen.sin)}</b> → <b style={{ color: margen.con < 0.3 ? '#f59e0b' : '#22c55e' }}>{pct(margen.con)}</b> · descuento de {$(margen.dto)} cada vez que se aplica
        </div>
      )}
      {error && <div style={S.error}>{error}</div>}
      <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
        <button style={S.btnSec} onClick={onCerrar} disabled={guardando}>Cancelar</button>
        <button style={S.btnPri} onClick={guardar} disabled={guardando}>{guardando ? 'Guardando…' : inicial ? 'Guardar cambios' : 'Crear promo'}</button>
      </div>
    </div>
  )
}

// ── Medición (tarjeta) ───────────────────────────────────────────────────────
function Medicion({ p, ventas, cargando }) {
  if (cargando) return <div style={S.mutedChico}>Cargando ventas para medir…</div>
  const hoyAR = diaDe(hoyTexto())
  const m = medirPromo(p, ventas, hoyAR)
  if (m.error) return <div style={S.mutedChico}>{m.error}</div>
  const metaTxt = p.tipo === 'CANTIDAD' ? `Carritos con estos artículos que llevan ${p.cantidad} o más` : 'Carritos con el primer artículo que llevan también el segundo'
  const caja = (titulo, a, b, fmt, mejor = true) => (
    <div style={S.metrica}>
      <div style={S.metricaTit}>{titulo}</div>
      <div style={S.metricaVal}>{fmt(a)} → <span style={{ color: b > a === mejor ? '#22c55e' : b < a === mejor ? '#f59e0b' : 'var(--text)' }}>{fmt(b)}</span></div>
    </div>
  )
  return (
    <div>
      <div style={S.mutedChico}>Con promo: {p.desde} al {m.hastaDurante} ({m.L} {m.L === 1 ? 'día' : 'días'}) · antes: {m.desdeAntes} al {m.hastaAntes}</div>
      <div style={S.metricas}>
        {caja(metaTxt, m.antes.meta, m.durante.meta, pct)}
        {caja('Unidades por semana (estos artículos)', m.antes.uSem, m.durante.uSem, x => (Math.round(x * 10) / 10).toLocaleString('es-AR'))}
        {caja('Ganancia por semana (estos artículos)', m.antes.ganS, m.durante.ganS, $)}
        <div style={S.metrica}><div style={S.metricaTit}>Descuento dado por semana</div><div style={S.metricaVal}>{$(m.durante.dto)}</div></div>
      </div>
      <div style={{ ...S.veredicto, color: m.tono === 'ok' ? '#22c55e' : m.tono === 'mal' ? '#ef4444' : 'var(--muted)' }}>{m.veredicto}</div>
      {m.efecto != null && <div style={S.mutedChico}>Ganancia de estos artículos {m.crecS >= 0 ? '+' : ''}{pct(m.crecS)} · resto del local {m.crecR >= 0 ? '+' : ''}{pct(m.crecR)} en el mismo período → efecto de la promo {m.efecto >= 0 ? '+' : ''}{pct(m.efecto)}</div>}
    </div>
  )
}

// ── Página ───────────────────────────────────────────────────────────────────
export default function Promos({ promos = [], articulos = [], perfilNombre = '', onCambio }) {
  const [form, setForm] = useState(null)          // null | 'nueva' | promo
  const [abierta, setAbierta] = useState(null)
  const [ventas, setVentas] = useState([]), [cargandoV, setCargandoV] = useState(true)
  const [ocupado, setOcupado] = useState(''), [toast, setToast] = useState('')
  const leerVentas = () => getHistoricoVentas().then(setVentas).catch(console.error).finally(() => setCargandoV(false))
  useEffect(() => { leerVentas() }, [])
  const porId = useMemo(() => Object.fromEntries(articulos.map(a => [a.id, a])), [articulos])
  const config = promos.filter(p => p.tipo !== 'FIJA')
  const orden = { ACTIVA: 0, PAUSADA: 1, TERMINADA: 2 }
  const lista = [...config].sort((a, b) => (orden[a.estado] ?? 3) - (orden[b.estado] ?? 3) || b.id.localeCompare(a.id))
  const avisar = t => { setToast(t); setTimeout(() => setToast(''), 3000) }
  async function estado(p, nuevo, nombre = '') {
    setOcupado(p.id)
    try { await cambiarEstadoPromo(p.id, nuevo, perfilNombre, nombre || p.nombre); await onCambio?.(); avisar('Listo') }
    catch (e) { console.error(e); avisar('No se pudo cambiar. Probá de nuevo.') }
    finally { setOcupado('') }
  }
  const estadoTxt = p => {
    if (p.estado === 'PAUSADA') return ['Pausada', S.badgeMuted]
    if (p.estado === 'TERMINADA') return ['Terminada', S.badgeMuted]
    if (promoVigente(p)) return ['Activa', S.badgeOk]
    return diaDe(p.desde) > diaDe(hoyTexto()) ? ['Programada', S.badgeAmarillo] : ['Vencida', S.badgeMuted]
  }
  const resumenArts = ids => { const n = ids.map(id => porId[id]?.nombre || id); return n.length <= 3 ? n.join(', ') : `${n.slice(0, 3).join(', ')} y ${n.length - 3} más` }
  return (
    <div style={S.page}>
      <div style={S.header}>
        <div><div style={S.titulo}>PROMOS</div><div style={S.sub}>Se aplican solas en caja al cargar el carrito</div></div>
        {!form && <button style={S.btnPri} onClick={() => setForm('nueva')}>+ Nueva promo</button>}
      </div>
      <div style={S.cuerpo}>
        {form && <FormPromo inicial={form === 'nueva' ? null : form} articulos={articulos} perfilNombre={perfilNombre} onCerrar={() => setForm(null)} onGuardada={async () => { setForm(null); await onCambio?.(); avisar('Promo guardada') }} />}

        {lista.length === 0 && !form && <div style={S.vacio}>Todavía no hay promos armadas. Tocá “Nueva promo” para crear la primera.</div>}
        {lista.map(p => {
          const [txt, est] = estadoTxt(p), ab = abierta === p.id
          return (
            <div key={p.id} style={S.card}>
              <div style={S.filaTit}>
                <div style={{ minWidth: 0 }}>
                  <div style={S.nombre}>{p.nombre}</div>
                  <div style={S.mutedChico}>{p.id} · {TIPOS_PROMO[p.tipo] || p.tipo} · desde {p.desde || '–'}{p.hasta ? ` hasta ${p.hasta}` : ' (sin fecha de fin)'}</div>
                  <div style={S.armada}>Armada por <b>{p.creadaPor || '–'}</b>{p.creadaEl ? ` el ${p.creadaEl}` : ''}</div>
                </div>
                <span style={{ ...S.badge, ...est }}>{txt}</span>
              </div>
              <div style={S.mutedChico}>
                {p.tipo === 'CANTIDAD' && <>Llevando {p.cantidad} de: {resumenArts(p.articulosA)} → pagan {$(p.precio)}</>}
                {p.tipo === 'COMBINACION' && <>Con {resumenArts(p.articulosA)} → {p.porcentaje}% en {resumenArts(p.articulosB)}</>}
                {p.tipo === 'KIT' && <>{resumenArts(p.articulosA)} + {resumenArts(p.articulosB)} → {$(p.precio)}</>}
              </div>
              <div style={S.acciones}>
                <button style={S.btnChico} onClick={() => { if (!ab) leerVentas(); setAbierta(ab ? null : p.id) }} aria-expanded={ab}>{ab ? 'Ocultar' : '📊 Ver si funciona'}</button>
                {p.estado !== 'TERMINADA' && <button style={S.btnChico} onClick={() => setForm(p)}>✏️ Editar</button>}
                {p.estado === 'ACTIVA' && <button style={S.btnChico} disabled={ocupado === p.id} onClick={() => estado(p, 'PAUSADA')}>⏸ Pausar</button>}
                {p.estado === 'PAUSADA' && <button style={S.btnChico} disabled={ocupado === p.id} onClick={() => estado(p, 'ACTIVA')}>▶ Reactivar</button>}
                {p.estado !== 'TERMINADA' && <button style={S.btnChico} disabled={ocupado === p.id} onClick={() => { if (confirm(`¿Terminar la promo "${p.nombre}"? Deja de aplicarse y queda en la lista para consultar.`)) estado(p, 'TERMINADA') }}>⏹ Terminar</button>}
              </div>
              {ab && (
                <div style={S.detalle}>
                  <Medicion p={p} ventas={ventas} cargando={cargandoV} />
                  {p.historial && <div style={S.historial}><b>Historial:</b> {p.historial.split(' | ').map((h, i) => <div key={i}>{h}</div>)}</div>}
                </div>
              )}
            </div>
          )
        })}

        <div style={S.seccion}>Promos fijas de la app</div>
        {PROMOS_FIJAS.map(fj => {
          const fila = promos.find(p => p.id === fj.id), pausada = fila?.estado === 'PAUSADA'
          return (
            <div key={fj.id} style={S.card}>
              <div style={S.filaTit}>
                <div><div style={S.nombre}>{fj.nombre}</div><div style={S.mutedChico}>{fj.detalle}</div>
                  {fila && <div style={S.armada}>Último cambio: {fila.historial.split(' | ').pop()}</div>}</div>
                <span style={{ ...S.badge, ...(pausada ? S.badgeMuted : S.badgeOk) }}>{pausada ? 'Pausada' : 'Activa'}</span>
              </div>
              <div style={S.acciones}>
                <button style={S.btnChico} disabled={ocupado === fj.id} onClick={() => estado({ id: fj.id, nombre: fj.nombre }, pausada ? 'ACTIVA' : 'PAUSADA', fj.nombre)}>{pausada ? '▶ Reactivar' : '⏸ Pausar'}</button>
              </div>
            </div>
          )
        })}
        <div style={S.mutedChico}>El 2x1 de remeras XXXL sigue con su tope y fecha propios (se maneja desde Vender).</div>
      </div>
      {toast && <div style={S.toast}>{toast}</div>}
    </div>
  )
}

const S = {
  page: { display: 'flex', flexDirection: 'column', height: '100%', overflowY: 'auto', paddingBottom: 24 },
  header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '16px 20px 12px', borderBottom: '2px solid var(--accent)', flexShrink: 0 },
  titulo: { fontFamily: 'Barlow Condensed, sans-serif', fontWeight: 800, fontSize: 28, color: 'var(--accent)', letterSpacing: 2 },
  sub: { fontFamily: 'Barlow, sans-serif', fontSize: 12, color: 'var(--muted)' },
  cuerpo: { display: 'flex', flexDirection: 'column', gap: 12, padding: '14px 20px' },
  card: { background: 'var(--surface)', border: '1.5px solid var(--border)', borderRadius: 12, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 8 },
  cardTit: { fontFamily: 'Barlow Condensed, sans-serif', fontWeight: 800, fontSize: 20, color: 'var(--accent)', letterSpacing: 1 },
  filaTit: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 },
  nombre: { fontFamily: 'Barlow, sans-serif', fontWeight: 600, fontSize: 16, color: 'var(--text)' },
  armada: { fontFamily: 'Barlow, sans-serif', fontSize: 12, color: '#60a5fa', marginTop: 2 },
  mutedChico: { fontFamily: 'Barlow, sans-serif', fontSize: 12, color: 'var(--muted)', lineHeight: 1.45 },
  badge: { fontFamily: 'Barlow Condensed, sans-serif', fontWeight: 700, fontSize: 13, padding: '3px 10px', borderRadius: 999, whiteSpace: 'nowrap' },
  badgeOk: { background: 'rgba(34,197,94,0.15)', color: '#22c55e' },
  badgeMuted: { background: 'rgba(106,140,204,0.15)', color: 'var(--muted)' },
  badgeAmarillo: { background: 'rgba(245,200,0,0.15)', color: 'var(--accent)' },
  acciones: { display: 'flex', gap: 8, flexWrap: 'wrap' },
  btnChico: { fontFamily: 'Barlow, sans-serif', fontSize: 13, background: 'var(--surface2)', border: '1.5px solid var(--border)', borderRadius: 8, color: 'var(--text)', padding: '6px 12px', cursor: 'pointer' },
  btnPri: { fontFamily: 'Barlow Condensed, sans-serif', fontWeight: 800, fontSize: 16, background: 'var(--accent)', border: 'none', borderRadius: 8, color: '#000', padding: '10px 16px', cursor: 'pointer', letterSpacing: 0.5 },
  btnSec: { fontFamily: 'Barlow, sans-serif', fontSize: 14, background: 'none', border: '1.5px solid var(--border)', borderRadius: 8, color: 'var(--muted)', padding: '10px 16px', cursor: 'pointer' },
  btnLink: { fontFamily: 'Barlow, sans-serif', fontSize: 12, background: 'none', border: 'none', color: '#60a5fa', cursor: 'pointer', padding: 4 },
  detalle: { borderTop: '1px dashed var(--border)', paddingTop: 10, display: 'flex', flexDirection: 'column', gap: 8 },
  metricas: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 8, marginTop: 6 },
  metrica: { background: 'var(--surface2)', borderRadius: 8, padding: '8px 10px' },
  metricaTit: { fontFamily: 'Barlow, sans-serif', fontSize: 11, color: 'var(--muted)', lineHeight: 1.3 },
  metricaVal: { fontFamily: 'Barlow Condensed, sans-serif', fontWeight: 700, fontSize: 19, color: 'var(--text)', marginTop: 2 },
  veredicto: { fontFamily: 'Barlow, sans-serif', fontWeight: 600, fontSize: 14 },
  historial: { fontFamily: 'Barlow, sans-serif', fontSize: 12, color: 'var(--muted)', lineHeight: 1.5 },
  seccion: { fontFamily: 'Barlow Condensed, sans-serif', fontWeight: 800, fontSize: 18, color: 'var(--accent)', letterSpacing: 1.5, marginTop: 8 },
  vacio: { fontFamily: 'Barlow, sans-serif', fontSize: 14, color: 'var(--muted)', padding: '8px 0' },
  seg: { display: 'flex', border: '1.5px solid var(--border)', borderRadius: 10, overflow: 'hidden', alignSelf: 'flex-start' },
  segBtn: { fontFamily: 'Barlow Condensed, sans-serif', fontWeight: 700, fontSize: 15, border: 'none', background: 'transparent', color: 'var(--muted)', padding: '8px 14px', cursor: 'pointer' },
  segBtnOn: { background: 'var(--accent)', color: '#000' },
  ayuda: { fontFamily: 'Barlow, sans-serif', fontSize: 12, color: 'var(--muted)', lineHeight: 1.45 },
  campo: { display: 'flex', flexDirection: 'column', gap: 5, flex: 1, minWidth: 120 },
  fila: { display: 'flex', gap: 10, flexWrap: 'wrap' },
  label: { fontFamily: 'Barlow Condensed, sans-serif', fontSize: 13, color: 'var(--accent)', letterSpacing: 1, fontWeight: 700, textTransform: 'uppercase' },
  input: { background: 'var(--surface2)', border: '1.5px solid var(--border)', borderRadius: 8, color: 'var(--text)', fontFamily: 'Barlow, sans-serif', fontSize: 15, padding: '9px 11px', outline: 'none', minWidth: 0, width: '100%', boxSizing: 'border-box' },
  resultados: { display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 240, overflowY: 'auto', background: 'var(--surface2)', borderRadius: 8, padding: 6 },
  resultado: { display: 'flex', justifyContent: 'space-between', gap: 10, background: 'none', border: 'none', borderBottom: '1px solid var(--border)', color: 'var(--text)', fontFamily: 'Barlow, sans-serif', fontSize: 13, padding: '6px 4px', cursor: 'pointer', textAlign: 'left' },
  chips: { display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' },
  chip: { display: 'inline-flex', alignItems: 'center', gap: 4, fontFamily: 'Barlow, sans-serif', fontSize: 12, background: 'rgba(245,200,0,0.1)', border: '1px solid rgba(245,200,0,0.4)', color: 'var(--text)', borderRadius: 999, padding: '3px 4px 3px 10px' },
  chipX: { background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: 12, padding: '0 4px' },
  margen: { fontFamily: 'Barlow, sans-serif', fontSize: 13, color: 'var(--text)', background: 'var(--surface2)', border: '1.5px dashed var(--border)', borderRadius: 8, padding: '8px 12px' },
  error: { fontFamily: 'Barlow, sans-serif', fontSize: 13, color: '#ef4444' },
  toast: { position: 'fixed', bottom: 80, left: '50%', transform: 'translateX(-50%)', background: 'var(--surface2)', border: '1.5px solid var(--accent)', color: 'var(--text)', borderRadius: 10, padding: '10px 18px', fontFamily: 'Barlow, sans-serif', fontSize: 14, zIndex: 600 },
}
