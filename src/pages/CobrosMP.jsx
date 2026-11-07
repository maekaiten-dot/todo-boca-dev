// src/pages/CobrosMP.jsx
// Solapa "Mercado Pago" (solo Admin): cobros del Point amarillo y del QR de la cuenta de Jorge, que
// trae la planilla "Jorge Mercado Pago" (la actualiza un Apps Script todos los días a las 7). La app
// solo la lee. Muestra lo cobrado, lo que descuenta Mercado Pago, lo que falta liberar y el control
// día por día contra las ventas cargadas en la app.
import { useEffect, useMemo, useState } from 'react'
import { getCobrosMP, getVentasDesde, getTarjetasMP, CUENTA_APP } from '../api/sheets.js'
import { partesApp, cruzarPorDia, nombreMedio, partirFechaMP } from '../lib/cruceMP.js'

const $ = n => (Math.round(n || 0) < 0 ? '−$' : '$') + Math.abs(Math.round(n || 0)).toLocaleString('es-AR')
const pct = x => x == null || !isFinite(x) ? '–' : (x * 100).toLocaleString('es-AR', { maximumFractionDigits: 1 }) + '%'
// Tarifa de crédito en un pago configurada en la cuenta (4,19% + IVA), para marcar los cobros que pagan más
const PCT_CRED_ESPERADO = 0.0419 * 1.21
const MARCAS = { visa: 'Visa', master: 'Mastercard', amex: 'Amex', naranja: 'Naranja', cabal: 'Cabal', argencard: 'Argencard', diners: 'Diners', cencosud: 'Cencosud', tarshop: 'Tarjeta Shopping', nativa: 'Nativa', cmr: 'CMR', elo: 'Elo', hipercard: 'Hipercard' }
const nombreMarca = m => MARCAS[String(m || '').toLowerCase()] || (m ? String(m).charAt(0).toUpperCase() + String(m).slice(1) : '¿?')
// "2026-11-03 16:47" → "2026-11-13 16:47" = 10 días
function diasEntreFechas(a, b) {
  const t = f => { const [d] = String(f || '').split(' '); const [y, m, dd] = d.split('-').map(Number); return y ? Date.UTC(y, m - 1, dd) : null }
  const x = t(a), y = t(b)
  return x == null || y == null ? null : Math.round((y - x) / 86400000)
}
// Origen de la tarjeta según la hoja "Tarjetas MP": el país del BIN si está; si no, el banco
// emisor. Mercado Pago pone "Otro" o el nombre de la marca cuando no reconoce el banco.
const EMISOR_GENERICO = /^(otro|otros|visa|mastercard|master|amex|american express|emisor \d+)$/i
function origenTarjeta(t) {
  if (!t) return 'sin dato'
  const p = t.pais.toLowerCase()
  if (p.startsWith('argentina')) return 'Argentina'
  if (p) return 'Exterior · ' + t.pais.split(' · ')[0]
  if (!t.banco || EMISOR_GENERICO.test(t.banco.trim())) return 'Banco no identificado'
  return 'Banco argentino'
}
const textoPlazo = d => d == null ? '–' : d === 0 ? 'al instante' : d === 1 ? '1 día' : `${d} días`
const diaCorto = iso => { const [a, m, d] = String(iso).split('-'); return `${Number(d)}/${Number(m)}` }
const NOMBRE_DIA = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb']
const diaSemana = iso => NOMBRE_DIA[new Date(iso + 'T12:00:00').getDay()]

function hoyISO(offset = 0) {
  const [d, m, a] = new Date(Date.now() - offset * 86400000).toLocaleDateString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' }).split('/').map(Number)
  return `${a}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}
const PERIODOS = [
  { v: 'hoy', label: 'Hoy' }, { v: 'ayer', label: 'Ayer' }, { v: '7', label: '7 días' },
  { v: 'mes', label: 'Este mes' }, { v: 'mesAnt', label: 'Mes pasado' },
]
function rangoDe(p) {
  const hoy = hoyISO()
  if (p === 'hoy') return [hoy, hoy]
  if (p === 'ayer') { const a = hoyISO(1); return [a, a] }
  if (p === '7') return [hoyISO(6), hoy]
  const [a, m] = hoy.split('-').map(Number)
  if (p === 'mes') return [`${a}-${String(m).padStart(2, '0')}-01`, hoy]
  const pa = m === 1 ? a - 1 : a, pm = m === 1 ? 12 : m - 1
  const ult = new Date(pa, pm, 0).getDate()
  return [`${pa}-${String(pm).padStart(2, '0')}-01`, `${pa}-${String(pm).padStart(2, '0')}-${ult}`]
}
function diasEntre(desde, hasta) {
  const out = new Set()
  for (let t = new Date(desde + 'T12:00:00'); t <= new Date(hasta + 'T12:00:00'); t = new Date(t.getTime() + 86400000)) {
    out.add(`${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`)
  }
  return out
}

export default function CobrosMP() {
  const [cobros, setCobros] = useState([])
  const [tarjetas, setTarjetas] = useState({})
  const [ventas, setVentas] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [periodo, setPeriodo] = useState('7')
  const [abierto, setAbierto] = useState(null) // día desplegado en el control

  useEffect(() => { cargar() }, [])
  async function cargar() {
    setLoading(true); setError(null)
    try {
      // Ventas desde el 1 del mes pasado (alcanza para todos los períodos)
      const [desde] = rangoDe('mesAnt')
      const [c, v] = await Promise.all([getCobrosMP(), getVentasDesde(desde)])
      setCobros(c); setVentas(v)
      getTarjetasMP().then(setTarjetas).catch(() => {})
    } catch (e) {
      console.error(e)
      setError(e?.message === 'MP_SIN_ACCESO' ? 'MP_SIN_ACCESO' : 'No se pudieron leer los cobros. Revisá la conexión y probá de nuevo.')
    } finally { setLoading(false) }
  }

  const [desde, hasta] = rangoDe(periodo)
  const delPeriodo = useMemo(() => cobros.filter(c => { const d = partirFechaMP(c.fecha).dia; return d >= desde && d <= hasta }), [cobros, desde, hasta])
  const tot = useMemo(() => {
    const t = { n: delPeriodo.length, bruto: 0, comision: 0, financiacion: 0, impuestos: 0, neto: 0 }
    for (const c of delPeriodo) { t.bruto += c.bruto; t.comision += c.comision + c.financiacion; t.financiacion += c.financiacion; t.impuestos += c.descuentos - c.comision - c.financiacion; t.neto += c.neto }
    return t
  }, [delPeriodo])
  const porMedio = useMemo(() => {
    const m = {}
    for (const c of delPeriodo) {
      const k = nombreMedio(c)
      const x = (m[k] ||= { medio: k, n: 0, bruto: 0, comision: 0, financiacion: 0, impuestos: 0, neto: 0, nCuotas: 0 })
      x.n++; x.bruto += c.bruto; x.comision += c.comision; x.financiacion += c.financiacion
      x.impuestos += c.descuentos - c.comision - c.financiacion; x.neto += c.neto
      if (c.cuotas > 1) x.nCuotas++
    }
    return Object.values(m).sort((a, b) => b.bruto - a.bruto)
  }, [delPeriodo])
  // Crédito según la cantidad de cuotas: muestra si el costo de más viene de las cuotas
  const porCuotas = useMemo(() => {
    const m = {}
    for (const c of delPeriodo) {
      if (c.tipoMedio !== 'credit_card') continue
      const k = `${c.canal === 'POINT' ? 'Point' : 'QR'}|${c.cuotas}`
      const x = (m[k] ||= { canal: c.canal === 'POINT' ? 'Point' : 'QR', cuotas: c.cuotas, n: 0, bruto: 0, comision: 0, financiacion: 0 })
      x.n++; x.bruto += c.bruto; x.comision += c.comision; x.financiacion += c.financiacion
    }
    return Object.values(m).sort((a, b) => a.canal.localeCompare(b.canal) || a.cuotas - b.cuotas)
  }, [delPeriodo])
  // Crédito por marca y plazo de acreditación, y cobro por cobro: para ver qué cobros pagan más
  const creditos = useMemo(() => delPeriodo
    .filter(c => c.tipoMedio === 'credit_card')
    .map(c => ({ ...c, marca: nombreMarca(c.medio), tarjeta: tarjetas[String(c.id)] || null, origen: origenTarjeta(tarjetas[String(c.id)]), plazo: diasEntreFechas(c.fecha, c.fechaLiberacion), pctCom: c.bruto ? (c.comision + c.financiacion) / c.bruto : null }))
    .sort((a, b) => String(b.fecha).localeCompare(String(a.fecha))), [delPeriodo, tarjetas])
  const porMarca = useMemo(() => {
    const m = {}
    for (const c of creditos) {
      const k = `${c.canal}|${c.marca}|${c.plazo ?? '?'}|${c.origen}`
      const x = (m[k] ||= { canal: c.canal === 'POINT' ? 'Point' : 'QR', marca: c.marca, plazo: c.plazo, origen: c.origen, n: 0, bruto: 0, comision: 0, min: Infinity, max: -Infinity })
      x.n++; x.bruto += c.bruto; x.comision += c.comision + c.financiacion
      if (c.pctCom != null) { x.min = Math.min(x.min, c.pctCom); x.max = Math.max(x.max, c.pctCom) }
    }
    return Object.values(m).sort((a, b) => b.bruto - a.bruto)
  }, [creditos])
  const [verTodosCred, setVerTodosCred] = useState(false)
  const hayTarjetas = Object.keys(tarjetas).length > 0
  // Plata por liberarse: todos los cobros pendientes, sin importar el período
  const porLiberar = useMemo(() => {
    const pend = cobros.filter(c => !c.liberado)
    const porDia = {}
    pend.forEach(c => { const d = partirFechaMP(c.fechaLiberacion).dia || '¿?'; (porDia[d] ||= { dia: d, n: 0, neto: 0 }); porDia[d].n++; porDia[d].neto += c.neto })
    return { total: pend.reduce((s, c) => s + c.neto, 0), n: pend.length, dias: Object.values(porDia).sort((a, b) => a.dia.localeCompare(b.dia)) }
  }, [cobros])
  const cruce = useMemo(() => cruzarPorDia(cobros, partesApp(ventas), diasEntre(desde, hasta)), [cobros, ventas, desde, hasta])
  // Totales del control en el período elegido
  const resCruce = useMemo(() => {
    const r = { mal: 0, malMonto: 0, mpSin: 0, mpSinMonto: 0, appSin: 0, appSinMonto: 0, partes: 0, dias: cruce.length, diasOk: 0 }
    for (const d of cruce) {
      r.mal += d.errores.length; r.malMonto += d.errores.reduce((s, e) => s + e.venta.monto, 0)
      for (const k of ['POINT', 'INSTORE']) {
        r.mpSin += d[k].sinParejaMP.length; r.mpSinMonto += d[k].sinParejaMP.reduce((s, c) => s + c.bruto, 0)
        r.appSin += d[k].sinParejaApp.length; r.appSinMonto += d[k].sinParejaApp.reduce((s, p) => s + p.monto, 0)
      }
      r.partes += d.combinados.length
      if (d.ok) r.diasOk++
    }
    return r
  }, [cruce])
  const [soloRevisar, setSoloRevisar] = useState(false)
  const ultimo = cobros.reduce((m, c) => c.fecha > m ? c.fecha : m, '')

  if (loading) return <div style={S.centro}><div style={S.cargando}>Leyendo cobros de Mercado Pago…</div></div>
  if (error === 'MP_SIN_ACCESO') return (
    <div style={S.centro}>
      <div style={{ ...S.cardTit, marginBottom: 8 }}>La app no puede leer la planilla “Jorge Mercado Pago”</div>
      <div style={S.nota}>Abrí la planilla → Compartir → agregá esta cuenta como <b>Lector</b>:</div>
      <div style={S.cuenta}>{CUENTA_APP || '(la cuenta de servicio de la app)'}</div>
      <button style={S.btn} onClick={cargar}>Probar de nuevo</button>
    </div>
  )
  if (error) return <div style={S.centro}><div style={S.nota}>{error}</div><button style={S.btn} onClick={cargar}>Reintentar</button></div>

  return (
    <div style={S.page}>
      <div style={S.header}>
        <div>
          <div style={S.titulo}>MERCADO PAGO</div>
          <div style={S.sub}>Point amarillo y QR de la cuenta de Jorge · último cobro en la planilla: {ultimo ? `${diaCorto(ultimo.slice(0, 10))} ${ultimo.slice(11, 16)}` : '–'} · se actualiza todos los días a las 7</div>
        </div>
        <button style={S.refresh} onClick={cargar} aria-label="Volver a leer">↻</button>
      </div>

      <div style={S.cuerpo}>
        <div style={S.seg} role="group" aria-label="Período">
          {PERIODOS.map((p, i) => <button key={p.v} style={{ ...S.segBtn, ...(i ? S.segSep : {}), ...(periodo === p.v ? S.segActivo : {}) }} onClick={() => { setPeriodo(p.v); setAbierto(null) }} aria-pressed={periodo === p.v}>{p.label}</button>)}
        </div>

        <div style={S.cards}>
          <div style={S.card}><div style={S.cardLbl}>Cobrado</div><div style={S.cardBig}>{$(tot.bruto)}</div><div style={S.cardSub}>{tot.n} {tot.n === 1 ? 'cobro' : 'cobros'}</div></div>
          <div style={S.card}><div style={S.cardLbl}>Descuenta Mercado Pago</div><div style={{ ...S.cardBig, color: '#f87171' }}>{$(tot.comision + tot.impuestos)}</div><div style={S.cardSub}>{pct(tot.bruto ? (tot.comision + tot.impuestos) / tot.bruto : null)} · comisión {$(tot.comision - tot.financiacion)}{tot.financiacion > 0.5 ? <> · cuotas {$(tot.financiacion)}</> : null} · impuestos y retenciones {$(tot.impuestos)}</div></div>
          <div style={S.card}><div style={S.cardLbl}>Neto</div><div style={{ ...S.cardBig, color: '#22c55e' }}>{$(tot.neto)}</div><div style={S.cardSub}>lo que queda de lo cobrado</div></div>
          <div style={S.card}><div style={S.cardLbl}>Falta liberar (todo)</div><div style={S.cardBig}>{$(porLiberar.total)}</div><div style={S.cardSub}>{porLiberar.n} cobros · {porLiberar.dias.slice(0, 3).map(d => `${diaCorto(d.dia)}: ${$(d.neto)}`).join(' · ')}{porLiberar.dias.length > 3 ? ' …' : ''}</div></div>
        </div>

        <div style={S.bloque}>
          <div style={S.cardTit}>Control contra las ventas de la app</div>
          <div style={S.nota}>Point (tarjeta) contra las ventas con tarjeta del posnet amarillo; QR contra las ventas con QR del posnet amarillo. Cada cobro se empareja con una venta del mismo día y el mismo monto. Si el monto y la hora coinciden pero la venta quedó cargada con otro medio (QR en vez de tarjeta, transferencia, débito en vez de crédito, posnet blanco…), se marca como <b>error de registro del medio de pago</b>, para corregirlo en Historial. Tocá un día para ver el detalle. Las ventas del posnet blanco son de otra cuenta y no entran.</div>
          <div style={S.resCruce}>
            <div style={{ ...S.resItem, borderColor: resCruce.mal ? 'rgba(248,113,113,0.6)' : 'var(--border)' }}>
              <div style={{ ...S.resN, color: resCruce.mal ? '#f87171' : '#22c55e' }}>{resCruce.mal}</div>
              <div style={S.resLbl}>con el medio de pago mal cargado{resCruce.mal ? ` · ${$(resCruce.malMonto)}` : ''}<br /><span style={S.resSub}>se corrigen en Historial</span></div>
            </div>
            <div style={{ ...S.resItem, borderColor: resCruce.mpSin ? 'rgba(245,158,11,0.6)' : 'var(--border)' }}>
              <div style={{ ...S.resN, color: resCruce.mpSin ? '#f59e0b' : '#22c55e' }}>{resCruce.mpSin}</div>
              <div style={S.resLbl}>cobros de Mercado Pago sin venta en la app{resCruce.mpSin ? ` · ${$(resCruce.mpSinMonto)}` : ''}<br /><span style={S.resSub}>¿ventas sin cargar?</span></div>
            </div>
            <div style={{ ...S.resItem, borderColor: resCruce.appSin ? 'rgba(245,158,11,0.6)' : 'var(--border)' }}>
              <div style={{ ...S.resN, color: resCruce.appSin ? '#f59e0b' : '#22c55e' }}>{resCruce.appSin}</div>
              <div style={S.resLbl}>ventas de la app sin cobro en Mercado Pago{resCruce.appSin ? ` · ${$(resCruce.appSinMonto)}` : ''}<br /><span style={S.resSub}>¿otro posnet o efectivo?</span></div>
            </div>
            <div style={S.resItem}>
              <div style={{ ...S.resN, color: 'var(--text)' }}>{resCruce.diasOk}/{resCruce.dias}</div>
              <div style={S.resLbl}>días que coinciden{resCruce.partes ? ` · ${resCruce.partes} pagos en partes (están bien)` : ''}</div>
            </div>
          </div>
          {resCruce.dias > resCruce.diasOk && (
            <label style={S.check}><input type="checkbox" checked={soloRevisar} onChange={e => setSoloRevisar(e.target.checked)} /> Mostrar solo los días para revisar</label>
          )}
          <div style={S.tablaWrap}>
            <table style={S.tabla}>
              <thead><tr>
                <th style={{ ...S.th, textAlign: 'left' }}>Día</th>
                <th style={S.th}>Point MP</th><th style={S.th}>App tarjeta 🟡</th><th style={S.th}>Dif.</th>
                <th style={S.th}>QR MP</th><th style={S.th}>App QR</th><th style={S.th}>Dif.</th>
                <th style={{ ...S.th, textAlign: 'left' }}>Estado</th>
              </tr></thead>
              <tbody>
                {cruce.filter(d => !soloRevisar || !d.ok).map(d => {
                  const estado = [d.errores.length ? `${d.errores.length} con el medio de pago mal cargado` : '', d.sinPareja ? `${d.sinPareja} sin pareja` : ''].filter(Boolean).join(' · ')
                  return [
                    <tr key={d.dia} onClick={() => setAbierto(a => a === d.dia ? null : d.dia)} style={{ cursor: 'pointer', ...(abierto === d.dia ? { background: 'rgba(96,165,250,0.08)' } : {}) }} aria-expanded={abierto === d.dia}>
                      <td style={{ ...S.td, textAlign: 'left' }}><span style={{ color: 'var(--muted)', marginRight: 6 }}>{abierto === d.dia ? '▾' : '▸'}</span>{diaSemana(d.dia)} {diaCorto(d.dia)}</td>
                      <td style={S.td}>{$(d.POINT.totMP)}</td><td style={S.td}>{$(d.POINT.totApp)}</td><td style={{ ...S.td, ...colorDif(d.POINT.dif) }}>{d.POINT.dif ? $(d.POINT.dif) : '✓'}</td>
                      <td style={S.td}>{$(d.INSTORE.totMP)}</td><td style={S.td}>{$(d.INSTORE.totApp)}</td><td style={{ ...S.td, ...colorDif(d.INSTORE.dif) }}>{d.INSTORE.dif ? $(d.INSTORE.dif) : '✓'}</td>
                      <td style={{ ...S.td, textAlign: 'left', color: d.ok ? '#22c55e' : '#f59e0b', fontWeight: 600 }}>{d.ok ? '✓ coincide' : `⚠ ${estado}`}</td>
                    </tr>,
                    abierto === d.dia && <tr key={d.dia + '-det'}><td colSpan={8} style={{ padding: '6px 8px 14px', borderBottom: '1px solid var(--border)' }}><DetalleDia d={d} /></td></tr>,
                  ]
                })}
                {!cruce.length && <tr><td colSpan={8} style={{ ...S.td, textAlign: 'left' }}>Sin cobros ni ventas con tarjeta o QR en este período.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>

        <div style={S.bloque}>
          <div style={S.cardTit}>Por medio de pago</div>
          <div style={S.tablaWrap}>
            <table style={S.tabla}>
              <thead><tr>{['Medio', 'Cobros', 'Cobrado', 'Comisión', '% comisión', 'Financiación', 'Impuestos', 'Neto', '% descontado'].map((h, i) => <th key={h} style={{ ...S.th, textAlign: i ? 'right' : 'left' }}>{h}</th>)}</tr></thead>
              <tbody>
                {porMedio.map(m => (
                  <tr key={m.medio}>
                    <td style={{ ...S.td, textAlign: 'left' }}>{m.medio}{m.nCuotas > 0 && <span style={{ color: 'var(--muted)', fontSize: 12 }}> · {m.nCuotas} en cuotas</span>}</td>
                    <td style={S.td}>{m.n}</td><td style={S.td}>{$(m.bruto)}</td>
                    <td style={S.td}>{$(m.comision)}</td><td style={S.td}>{pct(m.bruto ? m.comision / m.bruto : null)}</td>
                    <td style={{ ...S.td, ...(m.financiacion > 0.5 ? { color: '#f87171', fontWeight: 700 } : {}) }}>{$(m.financiacion)}</td>
                    <td style={S.td}>{$(m.impuestos)}</td><td style={S.td}>{$(m.neto)}</td>
                    <td style={{ ...S.td, fontWeight: 700 }}>{pct(m.bruto ? (m.comision + m.financiacion + m.impuestos) / m.bruto : null)}</td>
                  </tr>
                ))}
                {!porMedio.length && <tr><td colSpan={9} style={{ ...S.td, textAlign: 'left' }}>Sin cobros en este período.</td></tr>}
              </tbody>
            </table>
          </div>
          <div style={{ ...S.nota, marginTop: 8 }}>Comisión: lo que cobra Mercado Pago por el medio (con IVA). Financiación: lo que le cuesta a la cuenta que el cliente pague en cuotas. Impuestos: retenciones e impuestos.</div>
        </div>

        {porCuotas.length > 0 && (
          <div style={S.bloque}>
            <div style={S.cardTit}>Crédito: en un pago y en cuotas</div>
            <div style={S.tablaWrap}>
              <table style={S.tabla}>
                <thead><tr>{['Cobro', 'Cobros', 'Cobrado', 'Comisión', '% comisión', 'Financiación', '% financiación', '% total'].map((h, i) => <th key={h} style={{ ...S.th, textAlign: i ? 'right' : 'left' }}>{h}</th>)}</tr></thead>
                <tbody>
                  {porCuotas.map(q => (
                    <tr key={q.canal + q.cuotas}>
                      <td style={{ ...S.td, textAlign: 'left' }}>{q.canal} · {q.cuotas === 1 ? 'un pago' : `${q.cuotas} cuotas`}</td>
                      <td style={S.td}>{q.n}</td><td style={S.td}>{$(q.bruto)}</td>
                      <td style={S.td}>{$(q.comision)}</td><td style={S.td}>{pct(q.bruto ? q.comision / q.bruto : null)}</td>
                      <td style={S.td}>{$(q.financiacion)}</td><td style={S.td}>{pct(q.bruto ? q.financiacion / q.bruto : null)}</td>
                      <td style={{ ...S.td, fontWeight: 700 }}>{pct(q.bruto ? (q.comision + q.financiacion) / q.bruto : null)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{ ...S.nota, marginTop: 8 }}>Sin impuestos. Según la configuración de la cuenta (6/11/2026), el crédito en un pago con el Point debería costar 4,19% + IVA (5,07%) con acreditación en 10 días. Si las cuotas tienen financiación, la paga la cuenta: se puede cambiar en Mercado Pago → Costos y cuotas → Cuotas y acreditación.</div>
          </div>
        )}

        {creditos.length > 0 && (
          <div style={S.bloque}>
            <div style={S.cardTit}>Crédito: por marca y plazo</div>
            <div style={S.tablaWrap}>
              <table style={S.tabla}>
                <thead><tr>{['Cobro', 'Marca', ...(hayTarjetas ? ['Tarjeta'] : []), 'Acredita en', 'Cobros', 'Cobrado', 'Comisión', '% comisión', 'Mín – máx'].map((h, i) => <th key={h} style={{ ...S.th, textAlign: i > (hayTarjetas ? 3 : 2) ? 'right' : 'left' }}>{h}</th>)}</tr></thead>
                <tbody>
                  {porMarca.map(x => {
                    const p = x.bruto ? x.comision / x.bruto : null
                    return (
                      <tr key={x.canal + x.marca + x.plazo + x.origen}>
                        <td style={{ ...S.td, textAlign: 'left' }}>{x.canal}</td><td style={{ ...S.td, textAlign: 'left' }}>{x.marca}</td>
                        {hayTarjetas && <td style={{ ...S.td, textAlign: 'left' }}>{x.origen}</td>}
                        <td style={{ ...S.td, textAlign: 'left' }}>{textoPlazo(x.plazo)}</td>
                        <td style={S.td}>{x.n}</td><td style={S.td}>{$(x.bruto)}</td><td style={S.td}>{$(x.comision)}</td>
                        <td style={{ ...S.td, fontWeight: 700, ...(p > PCT_CRED_ESPERADO + 0.005 ? { color: '#f87171' } : {}) }}>{pct(p)}</td>
                        <td style={S.td}>{x.min === Infinity ? '–' : x.min === x.max ? pct(x.min) : `${pct(x.min)} – ${pct(x.max)}`}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            <div style={{ ...S.cardTit, fontSize: 16, marginTop: 16 }}>Cobro por cobro</div>
            <div style={S.tablaWrap}>
              <table style={S.tabla}>
                <thead><tr>{['Fecha', 'Cobro', 'Marca', ...(hayTarjetas ? ['Tarjeta'] : []), 'Acredita en', 'Cuotas', 'Monto', 'Comisión', '%'].map((h, i) => <th key={h} style={{ ...S.th, textAlign: i > (hayTarjetas ? 4 : 3) ? 'right' : 'left' }}>{h}</th>)}</tr></thead>
                <tbody>
                  {(verTodosCred ? creditos : creditos.slice(0, 30)).map(c => {
                    const caro = c.pctCom > PCT_CRED_ESPERADO + 0.005
                    return (
                      <tr key={c.id}>
                        <td style={{ ...S.td, textAlign: 'left' }}>{diaCorto(String(c.fecha).slice(0, 10))} {String(c.fecha).slice(11, 16)}</td>
                        <td style={{ ...S.td, textAlign: 'left' }}>{c.canal === 'POINT' ? 'Point' : 'QR'}</td>
                        <td style={{ ...S.td, textAlign: 'left' }}>{c.marca}</td>
                        {hayTarjetas && <td style={{ ...S.td, textAlign: 'left' }} title={c.tarjeta?.detalleCargos || ''}>{c.tarjeta ? [c.tarjeta.pais || '¿país?', c.tarjeta.banco, c.tarjeta.lectura].filter(Boolean).join(' · ') : '–'}</td>}
                        <td style={{ ...S.td, textAlign: 'left' }}>{textoPlazo(c.plazo)}</td>
                        <td style={S.td}>{c.cuotas}</td><td style={S.td}>{$(c.bruto)}</td><td style={S.td}>{$(c.comision + c.financiacion)}</td>
                        <td style={{ ...S.td, fontWeight: 700, ...(caro ? { color: '#f87171' } : { color: '#4ade80' }) }}>{pct(c.pctCom)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            {creditos.length > 30 && (
              <button style={S.verTodos} onClick={() => setVerTodosCred(v => !v)}>{verTodosCred ? 'Ver menos' : `Ver los ${creditos.length} cobros`}</button>
            )}
            <div style={{ ...S.nota, marginTop: 8 }}>Comisión con IVA, sin impuestos. En verde, los cobros que pagaron la tarifa configurada (4,19% + IVA = 5,07%) o menos; en rojo, los que pagaron más. "Acredita en": días entre el cobro y la fecha en que Mercado Pago libera la plata.</div>
          </div>
        )}
      </div>
    </div>
  )
}

function DetalleDia({ d }) {
  const bloque = (titulo, k) => {
    const x = d[k]
    if (!x.mp.length && !x.app.length) return null
    return (
      <div style={{ marginBottom: 10 }}>
        <div style={S.detTit}>{titulo}</div>
        {x.sinParejaMP.length > 0 && <div style={S.detAviso}>Cobrado en Mercado Pago sin venta en la app ({x.sinParejaMP.length}):</div>}
        {x.sinParejaMP.map(c => <div key={c.id} style={S.detLinea}>⚠ {c.hora} · <b>{$(c.bruto)}</b> · {nombreMedio(c)} · cobro {c.id}</div>)}
        {x.sinParejaApp.length > 0 && <div style={S.detAviso}>Vendido en la app sin cobro en Mercado Pago ({x.sinParejaApp.length}):</div>}
        {x.sinParejaApp.map(p => <div key={p.idVenta + p.metodo} style={S.detLinea}>⚠ {p.hora} · <b>{$(p.monto)}</b> · {p.metodo} · {p.idVenta}{p.empleado ? ` · ${p.empleado}` : ''}</div>)}
        <details style={{ marginTop: 4 }}>
          <summary style={S.detSum}>Ver los {x.mp.length} cobros y {x.app.length} ventas</summary>
          {x.mp.map(c => <div key={c.id} style={S.detLinea}>{c.pareja ? '✓' : '⚠'} {c.hora} · {$(c.bruto)} · {nombreMedio(c)}{c.pareja ? ` → ${c.pareja.idVenta} (${c.pareja.hora})${d.errores.some(e => e.cobro.id === c.id) ? ' · medio mal cargado' : ''}` : ' · sin venta en la app'}</div>)}
        </details>
      </div>
    )
  }
  return (
    <div>
      {d.errores.length > 0 && (
        <div style={S.errBox}>
          <div style={S.errTit}>✏️ Error de registro del medio de pago ({d.errores.length})</div>
          <div style={S.nota}>Estas ventas SÍ se cobraron, pero en la app quedaron cargadas con otro medio de pago. No falta plata: hay que corregirlas en <b>Historial → tocar la venta → ✏️ Editar o anular venta</b>, cambiar el medio de pago y elegir el motivo “Método de pago mal”.</div>
          {d.errores.map(e => (
            <div key={e.cobro.id} style={S.errLinea}>
              <b>{e.venta.idVenta}</b> ({e.venta.hora}{e.venta.empleado ? ` · ${e.venta.empleado}` : ''}) · <b>{$(e.venta.monto)}</b>: está cargada como <b style={{ color: '#f87171' }}>{e.cargada}</b>, pero se cobró con <b style={{ color: '#22c55e' }}>{nombreMedio(e.cobro)}</b> a las {e.cobro.hora}{e.cobro.medio && e.cobro.tipoMedio !== 'account_money' ? ` (${e.cobro.medio})` : ''}.
              <div style={S.errCorregir}>→ Corregir a: {e.correcto}{e.correcto !== 'QR' ? ', posnet amarillo' : ''}</div>
            </div>
          ))}
        </div>
      )}
      {d.combinados.length > 0 && (
        <div style={{ marginBottom: 10 }}>
          <div style={S.detTit}>Pagos en partes (están bien)</div>
          {d.combinados.map((k, i) => (
            <div key={i} style={{ ...S.detLinea, color: '#22c55e' }}>✓ {k.ventas.length === 1
              ? <>{k.ventas[0].idVenta} ({k.ventas[0].hora}) · {$(k.ventas[0].monto)} se pagó en {k.cobros.length} cobros: {k.cobros.map(c => `${$(c.bruto)} (${c.hora})`).join(' + ')}</>
              : <>un cobro de {$(k.cobros[0].bruto)} ({k.cobros[0].hora}) pagó {k.ventas.length} ventas: {k.ventas.map(p => `${p.idVenta} ${$(p.monto)}`).join(' + ')}</>}</div>
          ))}
        </div>
      )}
      {bloque('Point (tarjeta)', 'POINT')}
      {bloque('QR', 'INSTORE')}
      {d.ok && <div style={{ ...S.detLinea, color: '#22c55e' }}>Todo coincide: cada cobro tiene su venta en la app.</div>}
      {d.sinPareja > 0 && <div style={S.nota}>Si un cobro no tiene venta: puede ser una venta sin cargar, cargada con otro medio (efectivo, transferencia) o en el posnet blanco. Si una venta no tiene cobro: puede que se haya cobrado por el posnet blanco o en efectivo y quedó mal el medio.</div>}
    </div>
  )
}

const colorDif = dif => !dif ? { color: '#22c55e' } : { color: '#f59e0b', fontWeight: 700 }

const S = {
  verTodos: { marginTop: 8, padding: '6px 14px', background: 'none', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--muted)', fontFamily: 'Barlow, sans-serif', fontSize: 13, cursor: 'pointer' },
  page: { display: 'flex', flexDirection: 'column', height: '100%', overflowY: 'auto', paddingBottom: 24 },
  header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '16px 20px 12px', borderBottom: '2px solid var(--accent)', flexShrink: 0 },
  titulo: { fontFamily: 'Barlow Condensed, sans-serif', fontWeight: 800, fontSize: 28, color: 'var(--accent-text)', letterSpacing: 2 },
  sub: { fontFamily: 'Barlow, sans-serif', fontSize: 12, color: 'var(--muted)' },
  refresh: { background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 10, color: 'var(--text)', fontSize: 20, width: 42, height: 42, cursor: 'pointer', flexShrink: 0 },
  cuerpo: { display: 'flex', flexDirection: 'column', gap: 14, padding: '14px 20px' },
  seg: { display: 'inline-flex', flexWrap: 'wrap', alignSelf: 'flex-start', border: '1.5px solid var(--border)', borderRadius: 10, overflow: 'hidden' },
  segBtn: { fontFamily: 'Barlow Condensed, sans-serif', fontWeight: 700, fontSize: 15, letterSpacing: 0.5, padding: '8px 14px', background: 'transparent', color: 'var(--muted)', border: 'none', cursor: 'pointer' },
  segSep: { borderLeft: '1.5px solid var(--border)' },
  segActivo: { background: 'rgba(245,200,0,0.14)', color: 'var(--accent-text)' },
  cards: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 12 },
  card: { background: 'var(--surface)', border: '1.5px solid var(--border)', borderRadius: 12, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 3 },
  cardLbl: { fontFamily: 'Barlow Condensed, sans-serif', fontWeight: 700, fontSize: 13, letterSpacing: 1, textTransform: 'uppercase', color: 'var(--muted)' },
  cardBig: { fontFamily: 'Barlow Condensed, sans-serif', fontWeight: 800, fontSize: 28, color: 'var(--text)' },
  cardSub: { fontFamily: 'Barlow, sans-serif', fontSize: 12, color: 'var(--muted)', lineHeight: 1.4 },
  bloque: { background: 'var(--surface)', border: '1.5px solid var(--border)', borderRadius: 12, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 8 },
  cardTit: { fontFamily: 'Barlow Condensed, sans-serif', fontWeight: 800, fontSize: 20, color: 'var(--accent-text)', letterSpacing: 1 },
  nota: { fontFamily: 'Barlow, sans-serif', fontSize: 12, color: 'var(--muted)', lineHeight: 1.5 },
  tablaWrap: { overflowX: 'auto', WebkitOverflowScrolling: 'touch' },
  tabla: { width: '100%', minWidth: 720, borderCollapse: 'collapse' },
  th: { fontFamily: 'Barlow Condensed, sans-serif', fontWeight: 700, fontSize: 12, color: 'var(--muted)', letterSpacing: 1, textTransform: 'uppercase', padding: '8px', borderBottom: '1.5px solid var(--border)', whiteSpace: 'nowrap', textAlign: 'right' },
  td: { fontFamily: 'Barlow, sans-serif', fontSize: 14, color: 'var(--text)', padding: '8px', borderBottom: '1px solid var(--border)', textAlign: 'right', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' },
  detTit: { fontFamily: 'Barlow Condensed, sans-serif', fontWeight: 800, fontSize: 15, letterSpacing: 1, color: 'var(--text)', marginBottom: 2 },
  detAviso: { fontFamily: 'Barlow, sans-serif', fontSize: 13, color: '#f59e0b', fontWeight: 600, marginTop: 4 },
  detLinea: { fontFamily: 'Barlow, sans-serif', fontSize: 13, color: 'var(--text)', padding: '2px 0', whiteSpace: 'normal' },
  resCruce: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10 },
  resItem: { display: 'flex', alignItems: 'center', gap: 10, background: 'var(--bg)', border: '1.5px solid var(--border)', borderRadius: 10, padding: '8px 12px' },
  resN: { fontFamily: 'Barlow Condensed, sans-serif', fontWeight: 800, fontSize: 30, minWidth: 34, textAlign: 'center' },
  resLbl: { fontFamily: 'Barlow, sans-serif', fontSize: 13, color: 'var(--text)', lineHeight: 1.3 },
  resSub: { fontSize: 11, color: 'var(--muted)' },
  check: { fontFamily: 'Barlow, sans-serif', fontSize: 13, color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' },
  errBox: { background: 'rgba(248,113,113,0.08)', border: '1.5px solid rgba(248,113,113,0.5)', borderRadius: 10, padding: '10px 12px', marginBottom: 12, display: 'flex', flexDirection: 'column', gap: 6 },
  errTit: { fontFamily: 'Barlow Condensed, sans-serif', fontWeight: 800, fontSize: 16, letterSpacing: 0.5, color: '#f87171' },
  errLinea: { fontFamily: 'Barlow, sans-serif', fontSize: 14, color: 'var(--text)', lineHeight: 1.4, whiteSpace: 'normal' },
  errCorregir: { fontFamily: 'Barlow, sans-serif', fontSize: 13, color: '#22c55e', fontWeight: 600 },
  detSum: { fontFamily: 'Barlow, sans-serif', fontSize: 12, color: 'var(--muted)', cursor: 'pointer' },
  centro: { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, height: '100%', padding: 24, textAlign: 'center' },
  cargando: { fontFamily: 'Barlow, sans-serif', fontSize: 15, color: 'var(--muted)' },
  cuenta: { fontFamily: 'monospace', fontSize: 14, background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px', color: 'var(--text)', userSelect: 'all', wordBreak: 'break-all' },
  btn: { fontFamily: 'Barlow Condensed, sans-serif', fontWeight: 700, fontSize: 16, background: 'var(--accent)', color: '#000', border: 'none', borderRadius: 10, padding: '10px 18px', cursor: 'pointer' },
}
