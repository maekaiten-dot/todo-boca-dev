// src/pages/Administracion.jsx
// Administración: cierre de mes (sueldos, alquiler con blue, regalías, servicios de Mamá),
// horas y tarifas, y pagos pendientes. Entra con PIN propio; todo pasa por /api/admin.
import { useState, useEffect, useMemo } from 'react'
import { getSesion, cerrarSesion, ingresar, pedirAdmin, ErrorSesion } from '../api/admin.js'
import { calcularSueldo, parseFecha, ultimoDiaMes, nombreMes } from '../../api/_lib/cierre.js'

const QUIENES = ['Adrián', 'Jorge']
const fmt$ = n => (n < 0 ? '−$' : '$') + Math.abs(Math.round(n || 0)).toLocaleString('es-AR')
const fmtUSD = n => (n < 0 ? '−US$ ' : 'US$ ') + Math.abs(Math.round((n || 0) * 100) / 100).toLocaleString('es-AR')
// Un movimiento en dólares sin tipo de cambio se paga en dólares (ej. reintegro de tarjeta en USD)
const enDolares = m => m.moneda === 'USD' && !(m.tipoCambio > 0)
const horaCorta = ms => new Date(ms).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
const hoyAR = () => { const d = new Date(Date.now() - 3 * 3600000); return { d: d.getUTCDate(), m: d.getUTCMonth() + 1, a: d.getUTCFullYear() } }
const mesClave = (a, m) => `${a}-${String(m).padStart(2, '0')}`
const mesAnterior = mes => { const [a, m] = mes.split('-').map(Number); return m === 1 ? mesClave(a - 1, 12) : mesClave(a, m - 1) }
const mesActual = () => { const h = hoyAR(); return mesClave(h.a, h.m) }
const fechaHoy = () => { const h = hoyAR(); return `${h.d}/${h.m}/${h.a}` }
const capitalizar = s => s.charAt(0).toUpperCase() + s.slice(1)
const NOMBRE_TIPO = { COMUN: 'Común', PARTIDO: 'Partido (×2)', FERIADO: 'Feriado (×2)', 'HOME OFFICE': 'Home office' }

// ── Login ──────────────────────────────────────────────────────────────────
function Login({ onEntrar }) {
  const [pin, setPin] = useState('')
  const [entrando, setEntrando] = useState(false)
  const [error, setError] = useState(null)
  const [faltan, setFaltan] = useState(null)
  async function entrar() {
    if (!pin || entrando) return
    setEntrando(true); setError(null); setFaltan(null)
    try { onEntrar(await ingresar(pin)) }
    catch (e) { setError(e.message); setFaltan(e.configuracion || null); setPin('') }
    finally { setEntrando(false) }
  }
  return (
    <div style={S.loginCard}>
      <div style={S.candado}>🔒</div>
      <div style={S.loginTitulo}>Administración</div>
      <div style={S.ayuda}>Cuentas del local, regalías, alquiler, servicios y ahorros. Solo para Adrián y Jorge, cada uno con su PIN.</div>
      <div style={S.fieldLabel}>TU PIN DE ADMINISTRACIÓN</div>
      <input style={S.pin} type="password" inputMode="numeric" autoComplete="off" value={pin} onChange={e => setPin(e.target.value)} onKeyDown={e => e.key === 'Enter' && entrar()} aria-label="PIN de administración" />
      {error && <div style={S.error}>{error}</div>}
      {faltan && <div style={S.ayuda}>Cuando estén cargadas en Vercel, hacé un Redeploy para que la app las tome.</div>}
      <button style={{ ...S.btn, opacity: pin && !entrando ? 1 : 0.5 }} disabled={!pin || entrando} onClick={entrar}>{entrando ? 'Verificando…' : 'Entrar'}</button>
      <div style={{ ...S.ayuda, fontSize: 12 }}>Es un PIN distinto del de fichadas. La sesión queda abierta 12 horas en este dispositivo.</div>
    </div>
  )
}

// ── Utilidades de UI ───────────────────────────────────────────────────────
function SelectorMes({ mes, onCambiar, max }) {
  const [a, m] = mes.split('-').map(Number)
  const puedeSig = !max || mes < max
  return (
    <div style={S.selMes}>
      <button style={S.flecha} onClick={() => onCambiar(mesAnterior(mes))} aria-label="Mes anterior">‹</button>
      <div style={S.selMesTxt}>{capitalizar(nombreMes(mesClave(a, m)))}</div>
      <button style={{ ...S.flecha, opacity: puedeSig ? 1 : 0.3 }} disabled={!puedeSig} onClick={() => onCambiar(m === 12 ? mesClave(a + 1, 1) : mesClave(a, m + 1))} aria-label="Mes siguiente">›</button>
    </div>
  )
}
const Fila = ({ izq, der, fuerte, sub }) => (
  <div style={{ ...S.filaNum, ...(fuerte ? S.filaFuerte : {}) }}>
    <span>{izq}{sub && <span style={S.sub}> {sub}</span>}</span><span style={{ flexShrink: 0 }}>{der}</span>
  </div>
)

// ── Pendientes ─────────────────────────────────────────────────────────────
function Pendientes({ toast, irA }) {
  const [datos, setDatos] = useState(null)
  const [error, setError] = useState(null)
  const [pagando, setPagando] = useState(null)
  const [fecha, setFecha] = useState(fechaHoy())
  const [verPagados, setVerPagados] = useState(false)
  const [persona, setPersona] = useState(null) // filtro elegido desde el resumen de saldos
  async function cargar() { setError(null); try { setDatos(await pedirAdmin('cuentas')) } catch (e) { setError(e.message) } }
  useEffect(() => { cargar() }, [])

  const grupos = useMemo(() => {
    if (!datos) return []
    const g = {}
    datos.movimientos.filter(m => verPagados || m.estado === 'PENDIENTE').forEach(m => {
      const k = `${m.origen}|${m.cuenta}|${m.estado}`
      ;(g[k] ||= { origen: m.origen, cuenta: m.cuenta, estado: m.estado, movs: [] }).movs.push(m)
    })
    return Object.values(g).map(gr => {
      // Neto: quién le paga a quién dentro de la cuenta
      const [a, b] = gr.cuenta.split(' ↔ ')
      const signo = m => (m.debe === a ? 1 : -1)
      const neto = gr.movs.filter(m => !enDolares(m)).reduce((s, m) => s + signo(m) * m.montoPesos, 0)
      const netoUsd = gr.movs.filter(enDolares).reduce((s, m) => s + signo(m) * m.monto, 0)
      const dir = neto !== 0 ? neto : netoUsd
      return { ...gr, paga: dir >= 0 ? a : b, cobra: dir >= 0 ? b : a, neto: Math.abs(neto), netoUsd: Math.abs(netoUsd) }
    }).sort((x, y) => (x.estado === 'PAGADO') - (y.estado === 'PAGADO') || y.origen.localeCompare(x.origen) || x.cuenta.localeCompare(y.cuenta))
  }, [datos, verPagados])

  async function pagar(gr) {
    try {
      await pedirAdmin('cuentas.pagar', { ids: gr.movs.map(m => m.id), fecha })
      toast(`Marcado como pagado: ${gr.paga} → ${gr.cobra}`); setPagando(null); cargar()
    } catch (e) { toast(e.message, 'error') }
  }

  if (error) return <div style={S.card}><div style={S.error}>{error}</div><button style={S.btnSec} onClick={cargar}>Reintentar</button></div>
  if (!datos) return <div style={S.muted}>Cargando…</div>
  const pend = grupos.filter(g => g.estado === 'PENDIENTE')
  // Resumen por persona: todo lo pendiente entre el local y cada uno, sumando todos los cierres,
  // reintegros y liquidaciones (pesos y dólares por separado). Más el saldo corrido con Mitad de cuadra.
  const saldos = {}
  pend.forEach(gr => {
    const otro = gr.cuenta.split(' ↔ ').find(x => x !== 'Esquina') || gr.cuenta
    const o = (saldos[otro] ||= { persona: otro, ars: 0, usd: 0, n: 0 })
    const signo = gr.paga === 'Esquina' ? 1 : -1 // + = el local le debe
    o.ars += signo * gr.neto; o.usd += signo * gr.netoUsd; o.n++
  })
  const listaSaldos = Object.values(saldos).filter(o => Math.abs(o.ars) >= 1 || Math.abs(o.usd) >= 0.01).sort((a, b) => Math.abs(b.ars) - Math.abs(a.ars))
  const totalLocal = listaSaldos.reduce((t, o) => t + o.ars, 0)
  const totalLocalUsd = listaSaldos.reduce((t, o) => t + o.usd, 0)
  const montoTxt = o => [Math.abs(o.ars) >= 1 && fmt$(Math.abs(o.ars)), Math.abs(o.usd) >= 0.01 && fmtUSD(Math.abs(o.usd))].filter(Boolean).join(' + ')
  const mdc = datos.mdc
  const visibles = grupos.filter(gr => !persona || gr.cuenta.split(' ↔ ').includes(persona))
  return (
    <>
      <div style={S.card}>
        <div style={S.cardTitulo}>Saldos por persona</div>
        {listaSaldos.length === 0 && !(mdc && Math.abs(mdc.saldo) >= 1) && <div style={S.muted}>El local está al día con todos.</div>}
        {listaSaldos.map(o => (
          <button key={o.persona} style={{ ...S.saldoFila, ...(persona === o.persona ? { borderColor: 'var(--accent)' } : {}) }} onClick={() => setPersona(p => p === o.persona ? null : o.persona)}>
            <span style={{ flex: 1, minWidth: 0, textAlign: 'left' }}><strong>{o.persona}</strong><br />
              <span style={S.sub}>{o.ars >= 0 && o.usd >= 0 ? `el local le debe` : `le debe al local`} · {o.n} {o.n === 1 ? 'pago pendiente' : 'pagos pendientes'}</span></span>
            <span style={{ ...S.grupoMonto, fontSize: 20, color: o.ars >= 0 && o.usd >= 0 ? 'var(--accent)' : '#22c55e' }}>{montoTxt(o)}</span>
          </button>
        ))}
        {mdc && Math.abs(mdc.saldo) >= 1 && (
          <button style={S.saldoFila} onClick={() => irA('mdc')}>
            <span style={{ flex: 1, minWidth: 0, textAlign: 'left' }}><strong>Mitad de cuadra</strong><br />
              <span style={S.sub}>{mdc.saldo > 0 ? 'el local le debe' : 'le debe al local'} · cuenta corrida{mdc.sinPrecio ? ` · ${mdc.sinPrecio} sin precio` : ''} →</span></span>
            <span style={{ ...S.grupoMonto, fontSize: 20, color: mdc.saldo > 0 ? 'var(--accent)' : '#22c55e' }}>{fmt$(Math.abs(mdc.saldo))}</span>
          </button>
        )}
        {listaSaldos.length > 0 && (
          <Fila izq="Total que debe pagar el local (sin Mitad de cuadra)" der={[fmt$(totalLocal), Math.abs(totalLocalUsd) >= 0.01 && fmtUSD(totalLocalUsd)].filter(Boolean).join(' + ')} fuerte />
        )}
        {listaSaldos.length > 0 && <div style={S.ayuda}>Tocá una persona para ver solo sus pagos pendientes.</div>}
      </div>
      {persona && <button style={S.btnSec} onClick={() => setPersona(null)}>✕ Mostrando solo {persona} · ver todos</button>}
      <div style={S.ayuda}>Lo que falta pagar de cada cierre. Cuando lo pagás, tocá <strong>Marcar pagado</strong> y poné la fecha real.</div>
      {pend.length === 0 && <div style={S.card}><div style={S.muted}>No hay pagos pendientes.</div></div>}
      {visibles.map(gr => (
        <div key={`${gr.origen}|${gr.cuenta}|${gr.estado}`} style={{ ...S.card, ...(gr.estado === 'PAGADO' ? { opacity: 0.6 } : {}) }}>
          <div style={S.grupoTop}>
            <div style={{ minWidth: 0 }}>
              <div style={S.grupoTitulo}>{gr.paga} → {gr.cobra}</div>
              <div style={S.sub}>{gr.origen.replace(/^CIERRE (\d{4}-\d{2})$/, (_, m) => `Cierre de ${nombreMes(m)}`).replace(/^TARJETA (\d{4}-\d{2})$/, (_, m) => `Reintegro de tarjeta · resumen de ${nombreMes(m)}`)}{gr.estado === 'PAGADO' ? ` · pagado ${gr.movs[0].fechaPago}` : ''}</div>
            </div>
            <div style={{ ...S.grupoMonto, textAlign: 'right' }}>{gr.neto > 0 && <div>{fmt$(gr.neto)}</div>}{gr.netoUsd > 0 && <div>{fmtUSD(gr.netoUsd)}</div>}</div>
          </div>
          {gr.movs.map(m => (
            <Fila key={m.id} izq={m.detalle} sub={m.moneda === 'USD' && !enDolares(m) ? `(US$ ${m.monto.toLocaleString('es-AR')} × ${fmt$(m.tipoCambio)})` : ''} der={`${m.debe === gr.paga ? '' : '−'}${enDolares(m) ? fmtUSD(m.monto) : fmt$(m.montoPesos)}`} />
          ))}
          {gr.estado === 'PENDIENTE' && (pagando === gr ? (
            <div style={S.pagarFila}>
              <input style={{ ...S.input, width: 130 }} value={fecha} onChange={e => setFecha(e.target.value)} aria-label="Fecha de pago" />
              <button style={S.btnOk} onClick={() => pagar(gr)}>Confirmar pago</button>
              <button style={S.btnSec} onClick={() => setPagando(null)}>Cancelar</button>
            </div>
          ) : <button style={S.btnPagar} onClick={() => { setFecha(fechaHoy()); setPagando(gr) }}>Marcar pagado</button>)}
        </div>
      ))}
      <label style={S.check}><input type="checkbox" checked={verPagados} onChange={e => setVerPagados(e.target.checked)} /> Ver también lo ya pagado</label>
    </>
  )
}

// ── Cierre de mes ──────────────────────────────────────────────────────────
function Cierre({ toast, irA }) {
  const [mes, setMes] = useState(mesAnterior(mesActual()))
  const [diaPago, setDiaPago] = useState(null)
  const [p, setP] = useState(null)
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState(null)
  const [blue, setBlue] = useState('')
  const [elegidos, setElegidos] = useState(new Set())
  const [nota, setNota] = useState('')
  const [confirmando, setConfirmando] = useState(false)
  const [guardando, setGuardando] = useState(false)

  async function preparar(m = mes, dia = diaPago) {
    setCargando(true); setError(null); setConfirmando(false)
    try {
      const r = await pedirAdmin('cierre.preparar', { mes: m, diaPago: dia })
      setP(r); setDiaPago(r.diaPago)
      setBlue(r.blue.max ? String(r.blue.max.venta) : '')
      setElegidos(new Set(r.serviciosPendientes.map(s => s.id)))
    } catch (e) { setError(e.message); setP(null) }
    finally { setCargando(false) }
  }
  useEffect(() => { preparar(mes, null) }, [mes])

  const tc = Number(String(blue).replace(/\./g, '').replace(',', '.')) || 0
  const calc = useMemo(() => {
    if (!p) return null
    const alquilerPesos = Math.round(p.alquilerUsd * tc)
    const sueldos = p.sueldos.reduce((s, x) => s + x.total, 0)
    const base = p.ventas.total - alquilerPesos - sueldos
    const porHermano = Math.round(base * p.porcentaje / 100)
    const servicios = p.serviciosPendientes.filter(s => elegidos.has(s.id)).reduce((s, x) => s + x.monto, 0)
    return { alquilerPesos, sueldos, base, porHermano, servicios, neto: alquilerPesos - servicios }
  }, [p, tc, elegidos])

  async function confirmar() {
    setGuardando(true)
    try {
      await pedirAdmin('cierre.confirmar', { mes, diaPago, blue: tc, serviciosIds: [...elegidos], nota })
      toast(`Cierre de ${p.nombre} guardado`); preparar(mes, diaPago)
    } catch (e) { toast(e.message, 'error') }
    finally { setGuardando(false); setConfirmando(false) }
  }

  const problemas = p ? [
    ...p.sueldos.filter(s => s.registros === 0).map(s => `No hay horas de ${s.persona} cargadas en ${p.nombre}.`),
    ...p.sueldos.filter(s => s.faltaTarifa).map(s => `Falta la tarifa de ${s.persona}.`),
    ...(!tc ? ['Falta el dólar blue.'] : []),
  ] : []

  return (
    <>
      <SelectorMes mes={mes} onCambiar={setMes} max={mesAnterior(mesActual())} />
      {cargando && <div style={S.muted}>Calculando {nombreMes(mes)}… (busca ventas, horas y dólar blue)</div>}
      {error && <div style={S.card}><div style={S.error}>{error}</div><button style={S.btnSec} onClick={() => preparar()}>Reintentar</button></div>}
      {p && !cargando && (p.cierreExistente ? (
        <div style={S.card}>
          <div style={S.cardTitulo}>✓ Cierre hecho</div>
          <div style={S.sub}>Guardado el {p.cierreExistente.fechaCierre}{p.cierreExistente.cerradoPor ? ` por ${p.cierreExistente.cerradoPor}` : ''}</div>
          <Fila izq="Ventas del mes" der={fmt$(p.cierreExistente.ventas)} />
          <Fila izq="Alquiler" sub={`(US$ ${p.cierreExistente.alquilerUsd} × ${fmt$(p.cierreExistente.blue)}, pagado el ${p.cierreExistente.diaPago})`} der={`−${fmt$(p.cierreExistente.alquilerPesos)}`} />
          <Fila izq="Sueldo Adrián" der={`−${fmt$(p.cierreExistente.sueldoAdrian)}`} />
          <Fila izq="Sueldo Jorge" der={`−${fmt$(p.cierreExistente.sueldoJorge)}`} />
          <Fila izq="Base de regalías" der={fmt$(p.cierreExistente.base)} fuerte />
          <Fila izq={`Regalías por hermano (${p.cierreExistente.porcentaje}%)`} der={fmt$(p.cierreExistente.porHermano)} fuerte />
          <Fila izq="Servicios de Mamá descontados" der={fmt$(p.cierreExistente.serviciosMama)} />
          <Fila izq="Neto a transferir a Mamá" der={fmt$(p.cierreExistente.netoMama)} fuerte />
          <button style={S.btnSec} onClick={() => irA('pend')}>Ver pagos pendientes</button>
        </div>
      ) : (
        <>
          <div style={S.card}>
            <div style={S.cardTitulo}>1 · Ventas de {p.nombre}</div>
            <Fila izq="Total cobrado (sin anuladas)" sub={`${p.ventas.items} ítems`} der={fmt$(p.ventas.total)} fuerte />
          </div>

          <div style={S.card}>
            <div style={S.cardTitulo}>2 · Sueldos</div>
            {p.sueldos.map(s => (
              <div key={s.persona} style={S.bloque}>
                <Fila izq={s.persona} der={fmt$(s.total)} fuerte />
                {s.lineas.map(l => <Fila key={l.tipo} izq={`· ${NOMBRE_TIPO[l.tipo] || l.tipo}`} sub={`${l.horas} h${l.factor > 1 ? ' ×2' : ''}${l.auto ? ' (automático)' : ''}`} der={fmt$(l.monto)} />)}
                {s.registros === 0 && <div style={S.alerta}>No hay horas cargadas. <button style={S.link} onClick={() => irA('horas')}>Cargar horas</button></div>}
                {s.faltaTarifa && <div style={S.alerta}>Falta la tarifa vigente. <button style={S.link} onClick={() => irA('horas')}>Cargar tarifa</button></div>}
              </div>
            ))}
          </div>

          <div style={S.card}>
            <div style={S.cardTitulo}>3 · Alquiler (pagado en {p.nombrePago})</div>
            <div style={S.ayuda}>Se toma el dólar blue (venta) más alto entre el 1 y el día de pago. ¿Qué día se pagó o se va a pagar?</div>
            <div style={S.dias}>
              {Array.from({ length: p.diaMax }, (_, i) => i + 1).map(d => (
                <button key={d} style={{ ...S.dia, ...(diaPago === d ? S.optBtnActivo : {}) }} onClick={() => { setDiaPago(d); preparar(mes, d) }}>{d}</button>
              ))}
            </div>
            {p.blue.cotizaciones.length > 0 ? (
              <div style={S.blues}>
                {p.blue.cotizaciones.map(c => (
                  <span key={c.fecha} style={{ ...S.blueChip, ...(p.blue.max?.fecha === c.fecha ? S.blueMax : {}) }}>{Number(c.fecha.slice(8))}/{Number(c.fecha.slice(5, 7))}: {fmt$(c.venta)}</span>
                ))}
              </div>
            ) : <div style={S.alerta}>No se pudo obtener el blue de esos días (todavía no pasaron o el servicio no respondió). Cargalo a mano.</div>}
            <div style={S.filaInput}>
              <span style={S.fieldLabel}>DÓLAR A USAR</span>
              <input style={{ ...S.input, width: 120 }} inputMode="decimal" value={blue} onChange={e => setBlue(e.target.value)} aria-label="Dólar blue a usar" />
              {p.blue.max && tc !== p.blue.max.venta && <span style={S.sub}>(cambiado a mano)</span>}
            </div>
            <Fila izq={`US$ ${p.alquilerUsd.toLocaleString('es-AR')} × ${fmt$(tc)}`} der={fmt$(calc.alquilerPesos)} fuerte />
          </div>

          <div style={S.card}>
            <div style={S.cardTitulo}>4 · Regalías</div>
            <Fila izq="Ventas" der={fmt$(p.ventas.total)} />
            <Fila izq="− Alquiler" der={fmt$(calc.alquilerPesos)} />
            <Fila izq="− Sueldos" der={fmt$(calc.sueldos)} />
            <Fila izq="Base" der={fmt$(calc.base)} fuerte />
            <Fila izq={`${p.porcentaje}% para cada hermano (Adrián, Jorge, Kathy, Euge)`} der={fmt$(calc.porHermano)} fuerte />
          </div>

          <div style={S.card}>
            <div style={S.cardTitulo}>5 · Servicios de Mamá a descontar</div>
            {p.serviciosAPagar?.cantidad > 0 && <div style={S.alerta}>Hay {p.serviciosAPagar.cantidad} {p.serviciosAPagar.cantidad === 1 ? 'boleta' : 'boletas'} de Mamá todavía a pagar ({fmt$(p.serviciosAPagar.total)}). Se descuentan recién cuando las marques como pagadas. <button style={S.link} onClick={() => irA('serv')}>Ir a Servicios</button></div>}
            {p.serviciosPendientes.length === 0
              ? <div style={S.ayuda}>No hay boletas de Mamá pagadas pendientes de descontar. <button style={S.link} onClick={() => irA('serv')}>Cargar boletas</button></div>
              : p.serviciosPendientes.map(s => (
                <label key={s.id} style={S.servFila}>
                  <input type="checkbox" checked={elegidos.has(s.id)} onChange={e => setElegidos(prev => { const n = new Set(prev); e.target.checked ? n.add(s.id) : n.delete(s.id); return n })} />
                  <span style={{ flex: 1, minWidth: 0 }}>{s.servicio} · {s.propiedad} <span style={S.sub}>pagado {s.fechaPago}</span></span>
                  <span>{fmt$(s.monto)}</span>
                </label>
              ))}
            <Fila izq="Alquiler" der={fmt$(calc.alquilerPesos)} />
            <Fila izq="− Servicios elegidos" der={fmt$(calc.servicios)} />
            <Fila izq="Neto a transferir a Mamá" der={fmt$(calc.neto)} fuerte />
          </div>

          <div style={S.card}>
            <div style={S.cardTitulo}>6 · Confirmar</div>
            {problemas.map(t => <div key={t} style={S.alerta}>{t}</div>)}
            <input style={S.inputAncho} placeholder="Nota (opcional)" value={nota} maxLength={300} onChange={e => setNota(e.target.value)} />
            {!confirmando
              ? <button style={{ ...S.btn, opacity: problemas.length ? 0.45 : 1 }} disabled={problemas.length > 0} onClick={() => setConfirmando(true)}>Cerrar {p.nombre}</button>
              : (
                <div style={S.confirmBox}>
                  <div style={S.ayuda}>Se van a guardar el cierre y los pagos pendientes: 2 sueldos, 4 regalías de {fmt$(calc.porHermano)}, el alquiler ({fmt$(calc.neto)} netos a Mamá) y {elegidos.size} {elegidos.size === 1 ? 'boleta descontada' : 'boletas descontadas'}. Después no se puede rehacer desde la app.</div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button style={S.btnSec} onClick={() => setConfirmando(false)} disabled={guardando}>Volver</button>
                    <button style={{ ...S.btn, flex: 1, marginTop: 0 }} onClick={confirmar} disabled={guardando}>{guardando ? 'Guardando…' : 'Confirmar cierre'}</button>
                  </div>
                </div>
              )}
          </div>
        </>
      ))}
    </>
  )
}

// ── Horas y tarifas ────────────────────────────────────────────────────────
function Horas({ toast }) {
  const [datos, setDatos] = useState(null)
  const [error, setError] = useState(null)
  const [persona, setPersona] = useState('Adrián')
  const [mes, setMes] = useState(mesActual())
  const [fecha, setFecha] = useState(fechaHoy())
  const [quincena, setQuincena] = useState(1)
  const [horas, setHoras] = useState('')
  const [tipo, setTipo] = useState('COMUN')
  const [nota, setNota] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [nuevaTarifa, setNuevaTarifa] = useState(null)

  async function cargar() { setError(null); try { setDatos(await pedirAdmin('datos')) } catch (e) { setError(e.message) } }
  useEffect(() => { cargar() }, [])

  const esJorge = persona === 'Jorge'
  const [ma, mm] = mes.split('-').map(Number)
  const fin = ultimoDiaMes(mes)
  const delMes = (datos?.horas || []).filter(h => h.persona === persona && h.desde.startsWith(mes)).sort((x, y) => x.desde.localeCompare(y.desde))
  const sueldo = datos ? calcularSueldo({ horas: datos.horas, tarifas: datos.tarifas, persona, mes, homeOffice: datos.config.homeOffice }) : null
  const tarifasP = (datos?.tarifas || []).filter(t => t.persona === persona).sort((x, y) => y.desde.localeCompare(x.desde))

  async function agregar() {
    const desde = esJorge ? `${quincena === 1 ? 1 : 16}/${mm}/${ma}` : fecha
    const hasta = esJorge ? `${quincena === 1 ? 15 : fin}/${mm}/${ma}` : fecha
    if (!esJorge && parseFecha(fecha)?.mes !== mes) { toast(`La fecha tiene que ser de ${nombreMes(mes)}`, 'error'); return }
    setGuardando(true)
    try {
      await pedirAdmin('horas.agregar', { persona, desde, hasta, horas, tipo: esJorge ? 'COMUN' : tipo, nota })
      toast('Horas guardadas'); setHoras(''); setNota(''); cargar()
    } catch (e) { toast(e.message, 'error') }
    finally { setGuardando(false) }
  }
  async function anular(h) {
    if (!window.confirm(`¿Borrar ${h.horas} h del ${h.desdeTxt}?`)) return
    try { await pedirAdmin('horas.anular', { id: h.id }); toast('Registro borrado'); cargar() } catch (e) { toast(e.message, 'error') }
  }
  async function guardarTarifa() {
    try { await pedirAdmin('tarifas.agregar', { persona, ...nuevaTarifa }); toast('Tarifa guardada'); setNuevaTarifa(null); cargar() } catch (e) { toast(e.message, 'error') }
  }

  if (error) return <div style={S.card}><div style={S.error}>{error}</div><button style={S.btnSec} onClick={cargar}>Reintentar</button></div>
  if (!datos) return <div style={S.muted}>Cargando…</div>
  return (
    <>
      <div style={S.grid2}>
        {QUIENES.map(q => <button key={q} style={{ ...S.optBtn, ...(persona === q ? S.optBtnActivo : {}) }} onClick={() => { setPersona(q); setTipo('COMUN') }}>{q}</button>)}
      </div>
      <SelectorMes mes={mes} onCambiar={m => { setMes(m); const [a, b] = m.split('-').map(Number); setFecha(`1/${b}/${a}`) }} max={mesActual()} />

      <div style={S.card}>
        <div style={S.cardTitulo}>Cargar horas</div>
        {esJorge ? (
          <>
            <div style={S.ayuda}>Jorge pasa el total de cada quincena con las horas de partido y feriado ya contadas dobles.</div>
            <div style={S.grid2}>
              {[1, 2].map(q => <button key={q} style={{ ...S.optBtn, ...(quincena === q ? S.optBtnActivo : {}) }} onClick={() => setQuincena(q)}>{q === 1 ? `1ª quincena (1–15)` : `2ª quincena (16–${fin})`}</button>)}
            </div>
          </>
        ) : (
          <>
            <div style={S.filaInput}><span style={S.fieldLabel}>FECHA</span><input style={{ ...S.input, width: 130 }} value={fecha} onChange={e => setFecha(e.target.value)} aria-label="Fecha" /></div>
            <div style={S.tipos}>
              {['COMUN', 'PARTIDO', 'FERIADO', 'HOME OFFICE'].map(t => <button key={t} style={{ ...S.tipoBtn, ...(tipo === t ? S.optBtnActivo : {}) }} onClick={() => setTipo(t)}>{NOMBRE_TIPO[t]}</button>)}
            </div>
            {tipo === 'HOME OFFICE' && <div style={S.ayuda}>Si no cargás nada, se suman solas {datos.config.homeOffice.horas} h de home office por mes. Cargalo solo si un mes fue distinto.</div>}
          </>
        )}
        <div style={S.filaInput}>
          <span style={S.fieldLabel}>HORAS</span>
          <input style={{ ...S.input, width: 90 }} inputMode="decimal" value={horas} onChange={e => setHoras(e.target.value)} onKeyDown={e => e.key === 'Enter' && horas && agregar()} aria-label="Horas" />
          <input style={{ ...S.inputAncho, flex: 1 }} placeholder="Nota (opcional): ej. mitad de cuadra, compras en Once" value={nota} maxLength={200} onChange={e => setNota(e.target.value)} />
        </div>
        <button style={{ ...S.btn, opacity: horas && !guardando ? 1 : 0.45 }} disabled={!horas || guardando} onClick={agregar}>{guardando ? 'Guardando…' : 'Guardar horas'}</button>
      </div>

      <div style={S.card}>
        <div style={S.cardTitulo}>{persona} · {nombreMes(mes)}</div>
        {sueldo.lineas.map(l => <Fila key={l.tipo} izq={NOMBRE_TIPO[l.tipo] || l.tipo} sub={`${l.horas} h${l.auto ? ' (automático)' : ''}`} der={fmt$(l.monto)} />)}
        <Fila izq="Total a cobrar" der={fmt$(sueldo.total)} fuerte />
        {sueldo.faltaTarifa && <div style={S.alerta}>Falta la tarifa vigente para alguna fecha de este mes.</div>}
        {delMes.length > 0 && <div style={S.fieldLabel}>REGISTROS</div>}
        {delMes.map(h => (
          <div key={h.id} style={S.registro}>
            <span style={{ minWidth: 0, flex: 1 }}>{h.desdeTxt === h.hastaTxt || !h.hastaTxt ? h.desdeTxt : `${h.desdeTxt} al ${h.hastaTxt}`} · <strong>{h.horas} h</strong> {h.tipo !== 'COMUN' && <span style={S.badge}>{NOMBRE_TIPO[h.tipo]}</span>}{h.nota && <span style={S.sub}> · {h.nota}</span>}</span>
            <button style={S.borrar} onClick={() => anular(h)} aria-label="Borrar registro">✕</button>
          </div>
        ))}
      </div>

      <div style={S.card}>
        <div style={S.cardTitulo}>Tarifa de {persona}</div>
        {tarifasP.map((t, i) => <Fila key={i} izq={`Desde ${t.desdeTxt}`} sub={i === 0 ? '(vigente)' : ''} der={`${fmt$(t.valor)}/h`} />)}
        {nuevaTarifa ? (
          <div style={S.filaInput}>
            <input style={{ ...S.input, width: 110 }} placeholder="Valor" inputMode="numeric" value={nuevaTarifa.valor} onChange={e => setNuevaTarifa(t => ({ ...t, valor: e.target.value }))} aria-label="Valor de la hora" />
            <span style={S.sub}>desde</span>
            <input style={{ ...S.input, width: 120 }} value={nuevaTarifa.desde} onChange={e => setNuevaTarifa(t => ({ ...t, desde: e.target.value }))} aria-label="Vigente desde" />
            <button style={S.btnOk} onClick={guardarTarifa}>Guardar</button>
            <button style={S.btnSec} onClick={() => setNuevaTarifa(null)}>Cancelar</button>
          </div>
        ) : <button style={S.btnSec} onClick={() => setNuevaTarifa({ valor: '', desde: `1/${hoyAR().m}/${hoyAR().a}` })}>+ Nueva tarifa (aumento)</button>}
        <div style={S.ayuda}>Partido y feriado se pagan al doble de la tarifa común. Los meses ya cerrados no cambian.</div>
      </div>
    </>
  )
}

// ── Servicios ──────────────────────────────────────────────────────────────
// Las boletas se pueden cargar cuando llegan ("A pagar", con vencimiento) y marcarse como pagadas
// después, corrigiendo el monto si se pagó otro (por ejemplo, con recargo por pagar vencida).
const SERVICIOS_TIPOS = ['AySA', 'Edesur', 'Metrogas', 'ABL', 'Internet', 'Otro']
const claveFecha = f => parseFecha(f)?.clave || ''
function Servicios({ toast }) {
  const [datos, setDatos] = useState(null)
  const [error, setError] = useState(null)
  const [f, setF] = useState({ estado: 'A PAGAR', propiedad: '', servicio: 'AySA', monto: '', vencimiento: '', fechaPago: fechaHoy(), aCargoDe: 'Mamá', nota: '' })
  const [guardando, setGuardando] = useState(false)
  const [verTodas, setVerTodas] = useState(false)
  const [pagando, setPagando] = useState(null) // { id, monto, fechaPago }
  async function cargar() { setError(null); try { setDatos(await pedirAdmin('datos')) } catch (e) { setError(e.message) } }
  useEffect(() => { cargar() }, [])
  const propiedades = useMemo(() => [...new Set((datos?.servicios || []).map(s => s.propiedad))].sort(), [datos])
  const hoy = parseFecha(fechaHoy()).clave

  async function agregar() {
    setGuardando(true)
    try { await pedirAdmin('servicios.agregar', f); toast(f.estado === 'A PAGAR' ? 'Boleta guardada como a pagar' : 'Boleta guardada'); setF(x => ({ ...x, monto: '', vencimiento: '', nota: '' })); cargar() }
    catch (e) { toast(e.message, 'error') }
    finally { setGuardando(false) }
  }
  async function pagar() {
    try { await pedirAdmin('servicios.pagar', pagando); toast('Pago registrado'); setPagando(null); cargar() }
    catch (e) { toast(e.message, 'error') }
  }
  async function anular(s) {
    if (!window.confirm(`¿Borrar ${s.servicio} ${s.propiedad} ${fmt$(s.monto)}?`)) return
    try { await pedirAdmin('servicios.anular', { id: s.id }); toast('Boleta borrada'); cargar() } catch (e) { toast(e.message, 'error') }
  }

  if (error) return <div style={S.card}><div style={S.error}>{error}</div><button style={S.btnSec} onClick={cargar}>Reintentar</button></div>
  if (!datos) return <div style={S.muted}>Cargando…</div>
  const aPagar = datos.servicios.filter(s => s.estado === 'A PAGAR')
    .sort((x, y) => (claveFecha(x.vencimiento) || '9999').localeCompare(claveFecha(y.vencimiento) || '9999'))
  const pagadas = datos.servicios.filter(s => s.estado === 'PAGADA' && (verTodas || (s.aCargoDe === 'Mamá' && !s.liquidadoEn)))
    .sort((x, y) => claveFecha(y.fechaPago).localeCompare(claveFecha(x.fechaPago)))
  const totalAPagar = aPagar.reduce((t, s) => t + s.monto, 0)
  const valido = f.propiedad.trim() && f.monto && (f.estado === 'A PAGAR' || f.fechaPago)

  return (
    <>
      <div style={S.card}>
        <div style={S.cardTitulo}>Cargar boleta</div>
        <div style={S.grid2}>
          {[['A PAGAR', 'Todavía no la pagué'], ['PAGADA', 'Ya la pagué']].map(([v, t]) => <button key={v} style={{ ...S.optBtn, ...(f.estado === v ? S.optBtnActivo : {}) }} onClick={() => setF(x => ({ ...x, estado: v }))}>{t}</button>)}
        </div>
        <div style={S.grid2}>
          {['Mamá', 'Esquina'].map(a => <button key={a} style={{ ...S.optBtn, ...(f.aCargoDe === a ? S.optBtnActivo : {}) }} onClick={() => setF(x => ({ ...x, aCargoDe: a }))}>{a === 'Esquina' ? 'Del local' : 'De Mamá'}</button>)}
        </div>
        <div style={S.ayuda}>Las de <strong>Mamá</strong>, una vez pagadas, se descuentan del alquiler en el próximo cierre. Las del <strong>local</strong> quedan registradas como gasto del local.</div>
        <input style={S.inputAncho} list="adm-propiedades" placeholder="Propiedad (ej. Hernandarias, Brandsen 758, Local Esquina)" value={f.propiedad} onChange={e => setF(x => ({ ...x, propiedad: e.target.value }))} />
        <datalist id="adm-propiedades">{propiedades.map(p => <option key={p} value={p} />)}</datalist>
        <div style={S.tipos}>{SERVICIOS_TIPOS.map(t => <button key={t} style={{ ...S.tipoBtn, ...(f.servicio === t ? S.optBtnActivo : {}) }} onClick={() => setF(x => ({ ...x, servicio: t }))}>{t}</button>)}</div>
        <div style={S.filaInput}>
          <span style={S.fieldLabel}>{f.estado === 'A PAGAR' ? 'MONTO DE LA BOLETA' : 'MONTO PAGADO'}</span>
          <input style={{ ...S.input, width: 130 }} inputMode="decimal" value={f.monto} onChange={e => setF(x => ({ ...x, monto: e.target.value }))} aria-label="Monto" />
          {f.estado === 'A PAGAR'
            ? <><span style={S.fieldLabel}>VENCE EL</span><input style={{ ...S.input, width: 130 }} placeholder="dd/mm/aaaa" value={f.vencimiento} onChange={e => setF(x => ({ ...x, vencimiento: e.target.value }))} aria-label="Vencimiento" /></>
            : <><span style={S.fieldLabel}>PAGADO EL</span><input style={{ ...S.input, width: 130 }} value={f.fechaPago} onChange={e => setF(x => ({ ...x, fechaPago: e.target.value }))} aria-label="Fecha de pago" /></>}
        </div>
        <input style={S.inputAncho} placeholder="Nota (opcional)" value={f.nota} maxLength={200} onChange={e => setF(x => ({ ...x, nota: e.target.value }))} />
        <button style={{ ...S.btn, opacity: valido && !guardando ? 1 : 0.45 }} disabled={!valido || guardando} onClick={agregar}>{guardando ? 'Guardando…' : f.estado === 'A PAGAR' ? 'Guardar como a pagar' : 'Guardar boleta pagada'}</button>
      </div>

      <div style={S.card}>
        <div style={S.grupoTop}>
          <div style={S.cardTitulo}>Boletas a pagar</div>
          {aPagar.length > 0 && <div style={S.grupoMonto}>{fmt$(totalAPagar)}</div>}
        </div>
        {aPagar.length === 0 && <div style={S.muted}>No hay boletas a pagar.</div>}
        {aPagar.map(s => {
          const venc = claveFecha(s.vencimiento)
          const vencida = venc && venc < hoy
          return (
            <div key={s.id} style={{ ...S.registro, flexWrap: 'wrap', ...(vencida ? { border: '1px solid rgba(239,68,68,0.6)' } : {}) }}>
              <span style={{ minWidth: 0, flex: 1 }}>{s.servicio} · {s.propiedad} <span style={S.sub}>· {s.aCargoDe === 'Mamá' ? 'Mamá' : 'Local'}</span><br />
                <span style={{ ...S.sub, ...(vencida ? { color: '#ef4444', fontWeight: 700 } : {}) }}>{s.vencimiento ? `${vencida ? 'Venció' : 'Vence'} el ${s.vencimiento}` : 'Sin vencimiento'}</span></span>
              <strong style={{ flexShrink: 0 }}>{fmt$(s.monto)}</strong>
              {pagando?.id === s.id ? (
                <div style={{ ...S.pagarFila, width: '100%' }}>
                  <span style={S.fieldLabel}>PAGADO</span>
                  <input style={{ ...S.input, width: 120 }} inputMode="decimal" value={pagando.monto} onChange={e => setPagando(p => ({ ...p, monto: e.target.value }))} aria-label="Monto pagado" />
                  <span style={S.fieldLabel}>EL</span>
                  <input style={{ ...S.input, width: 120 }} value={pagando.fechaPago} onChange={e => setPagando(p => ({ ...p, fechaPago: e.target.value }))} aria-label="Fecha de pago" />
                  <button style={S.btnOk} onClick={pagar}>Confirmar</button>
                  <button style={S.btnSec} onClick={() => setPagando(null)}>Cancelar</button>
                </div>
              ) : (
                <>
                  <button style={{ ...S.btnPagar, marginTop: 0 }} onClick={() => setPagando({ id: s.id, monto: String(Math.round(s.monto * 100) / 100).replace('.', ','), fechaPago: fechaHoy() })}>Pagué</button>
                  <button style={S.borrar} onClick={() => anular(s)} aria-label="Borrar boleta">✕</button>
                </>
              )}
            </div>
          )
        })}
        {pagando && <div style={S.ayuda}>Si pagaste otro monto (por ejemplo, con recargo por vencida), corregilo antes de confirmar: se guarda el monto real y también el de la boleta.</div>}
      </div>

      <div style={S.card}>
        <div style={S.cardTitulo}>{verTodas ? 'Boletas pagadas' : 'Pagadas de Mamá, a descontar del alquiler'}</div>
        {pagadas.length === 0 && <div style={S.muted}>No hay boletas.</div>}
        {pagadas.map(s => (
          <div key={s.id} style={S.registro}>
            <span style={{ minWidth: 0, flex: 1 }}>{s.servicio} · {s.propiedad} <span style={S.sub}>· pagada {s.fechaPago} · {s.aCargoDe === 'Mamá' ? 'Mamá' : 'Local'}{s.liquidadoEn ? ` · descontada en ${s.liquidadoEn.toLowerCase()}` : ''}</span>
              {s.montoBoleta && Math.round(s.montoBoleta) !== Math.round(s.monto) && <><br /><span style={S.sub}>boleta {fmt$(s.montoBoleta)} → pagado {fmt$(s.monto)}</span></>}</span>
            <strong style={{ flexShrink: 0 }}>{fmt$(s.monto)}</strong>
            {!s.liquidadoEn && <button style={S.borrar} onClick={() => anular(s)} aria-label="Borrar boleta">✕</button>}
          </div>
        ))}
        <label style={S.check}><input type="checkbox" checked={verTodas} onChange={e => setVerTodas(e.target.checked)} /> Ver todas las pagadas (también las del local y las ya descontadas)</label>
      </div>
    </>
  )
}

// ── Tarjeta ────────────────────────────────────────────────────────────────
// Gastos del local pagados con tarjetas propias. Se cargan a mano (en cuotas: una vez, y la app reparte
// cada cuota en su resumen). Cada mes se genera el reintegro del resumen: pesos y dólares por separado.
function Tarjeta({ toast, irA }) {
  const [datos, setDatos] = useState(null)
  const [error, setError] = useState(null)
  const vacio = { tarjeta: '', titular: 'Adrián', fecha: fechaHoy(), detalle: '', moneda: 'ARS', monto: '', cuotas: '1', mesResumen: mesActual(), nota: '' }
  const [f, setF] = useState(vacio)
  const [nuevaTarjeta, setNuevaTarjeta] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [reintegrando, setReintegrando] = useState(null)
  const [verReintegrados, setVerReintegrados] = useState(false)
  async function cargar() {
    setError(null)
    try {
      const r = await pedirAdmin('tarjeta'); setDatos(r)
      setF(x => x.tarjeta || !r.tarjetas.length ? x : { ...x, tarjeta: r.tarjetas[0].tarjeta, titular: r.tarjetas[0].titular })
      if (!r.tarjetas.length) setNuevaTarjeta(true)
    } catch (e) { setError(e.message) }
  }
  useEffect(() => { cargar() }, [])

  async function agregar() {
    setGuardando(true)
    try {
      const r = await pedirAdmin('tarjeta.agregar', f)
      toast(r.filas > 1 ? `Guardado en ${r.filas} cuotas` : 'Consumo guardado')
      setF(x => ({ ...x, detalle: '', monto: '', cuotas: '1', nota: '' })); setNuevaTarjeta(false); cargar()
    } catch (e) { toast(e.message, 'error') }
    finally { setGuardando(false) }
  }
  async function anular(t) {
    if (!window.confirm(`¿Borrar "${t.detalle}"${t.cuota ? ` cuota ${t.cuota}` : ''}?`)) return
    try { await pedirAdmin('tarjeta.anular', { id: t.id }); toast('Consumo borrado'); cargar() } catch (e) { toast(e.message, 'error') }
  }
  async function reintegrar(mes) {
    try { await pedirAdmin('tarjeta.reintegrar', { mesResumen: mes }); toast(`Reintegro de ${nombreMes(mes)} generado: quedó en Pendientes`); setReintegrando(null); cargar() }
    catch (e) { toast(e.message, 'error') }
  }

  if (error) return <div style={S.card}><div style={S.error}>{error}</div><button style={S.btnSec} onClick={cargar}>Reintentar</button></div>
  if (!datos) return <div style={S.muted}>Cargando…</div>
  const actual = mesActual()
  const pendientes = datos.consumos.filter(t => !t.liquidadoEn)
  const porMes = {}
  pendientes.forEach(t => { (porMes[t.mesResumen] ||= []).push(t) })
  const meses = Object.keys(porMes).sort()
  const totales = lista => {
    const out = {}
    lista.forEach(t => { const o = (out[t.titular] ||= { ars: 0, usd: 0 }); o.ars += t.pesos; o.usd += t.dolares })
    return out
  }
  const reintegrados = datos.consumos.filter(t => t.liquidadoEn).sort((x, y) => y.mesResumen.localeCompare(x.mesResumen))
  const n = Number(f.cuotas) || 1
  const valido = f.tarjeta.trim() && f.detalle.trim() && f.monto && n >= 1

  const filaConsumo = t => (
    <div key={t.id} style={S.registro}>
      <span style={{ minWidth: 0, flex: 1 }}>{t.detalle}{t.cuota && <span style={S.badge}> cuota {t.cuota}</span>}<br />
        <span style={S.sub}>{t.tarjeta} ({t.titular}) · {t.fecha}{t.nota ? ` · ${t.nota}` : ''}{t.liquidadoEn ? ` · reintegrado (${t.liquidadoEn.replace('TARJETA ', 'resumen ')})` : ''}</span></span>
      <strong style={{ flexShrink: 0 }}>{t.dolares ? fmtUSD(t.dolares) : fmt$(t.pesos)}</strong>
      {!t.liquidadoEn && <button style={S.borrar} onClick={() => anular(t)} aria-label="Borrar consumo">✕</button>}
    </div>
  )

  return (
    <>
      <div style={S.card}>
        <div style={S.cardTitulo}>Cargar gasto del local con tarjeta</div>
        <div style={S.fieldLabel}>TARJETA</div>
        <div style={S.tipos}>
          {datos.tarjetas.map(t => (
            <button key={`${t.tarjeta}|${t.titular}`} style={{ ...S.tipoBtn, ...(!nuevaTarjeta && f.tarjeta === t.tarjeta && f.titular === t.titular ? S.optBtnActivo : {}) }}
              onClick={() => { setNuevaTarjeta(false); setF(x => ({ ...x, tarjeta: t.tarjeta, titular: t.titular })) }}>{t.tarjeta} · {t.titular}</button>
          ))}
          <button style={{ ...S.tipoBtn, ...(nuevaTarjeta ? S.optBtnActivo : {}) }} onClick={() => { setNuevaTarjeta(true); setF(x => ({ ...x, tarjeta: '' })) }}>+ Otra tarjeta</button>
        </div>
        {nuevaTarjeta && (
          <div style={S.filaInput}>
            <input style={{ ...S.inputAncho, flex: 1, minWidth: 180 }} placeholder="Nombre de la tarjeta (ej. Visa Galicia)" value={f.tarjeta} maxLength={40} onChange={e => setF(x => ({ ...x, tarjeta: e.target.value }))} />
            {QUIENES.map(q => <button key={q} style={{ ...S.tipoBtn, ...(f.titular === q ? S.optBtnActivo : {}) }} onClick={() => setF(x => ({ ...x, titular: q }))}>de {q}</button>)}
          </div>
        )}
        <input style={S.inputAncho} placeholder="Qué se compró (ej. filamento, Internet del local)" value={f.detalle} maxLength={120} onChange={e => setF(x => ({ ...x, detalle: e.target.value }))} />
        <div style={S.filaInput}>
          <span style={S.fieldLabel}>FECHA</span>
          <input style={{ ...S.input, width: 120 }} value={f.fecha} onChange={e => setF(x => ({ ...x, fecha: e.target.value }))} aria-label="Fecha de compra" />
          {['ARS', 'USD'].map(m => <button key={m} style={{ ...S.tipoBtn, ...(f.moneda === m ? S.optBtnActivo : {}) }} onClick={() => setF(x => ({ ...x, moneda: m }))}>{m === 'ARS' ? 'Pesos' : 'Dólares'}</button>)}
        </div>
        <div style={S.filaInput}>
          <span style={S.fieldLabel}>{n > 1 ? 'MONTO DE CADA CUOTA' : 'MONTO'}</span>
          <input style={{ ...S.input, width: 130 }} inputMode="decimal" value={f.monto} onChange={e => setF(x => ({ ...x, monto: e.target.value }))} aria-label="Monto" />
          <span style={S.fieldLabel}>CUOTAS</span>
          <input style={{ ...S.input, width: 70 }} inputMode="numeric" value={f.cuotas} onChange={e => setF(x => ({ ...x, cuotas: e.target.value.replace(/\D/g, '') }))} aria-label="Cuotas" />
        </div>
        <div style={S.filaInput}>
          <span style={S.fieldLabel}>{n > 1 ? 'PRIMERA CUOTA EN EL RESUMEN DE' : 'SALE EN EL RESUMEN DE'}</span>
          <div style={{ flex: 1, minWidth: 220 }}><SelectorMes mes={f.mesResumen} onCambiar={m => setF(x => ({ ...x, mesResumen: m }))} /></div>
        </div>
        {n > 1 && <div style={S.ayuda}>Se van a cargar {n} cuotas: una en cada resumen, de {nombreMes(f.mesResumen)} en adelante.</div>}
        <input style={S.inputAncho} placeholder="Nota (opcional)" value={f.nota} maxLength={200} onChange={e => setF(x => ({ ...x, nota: e.target.value }))} />
        <button style={{ ...S.btn, opacity: valido && !guardando ? 1 : 0.45 }} disabled={!valido || guardando} onClick={agregar}>{guardando ? 'Guardando…' : 'Guardar'}</button>
      </div>

      {meses.length === 0 && <div style={S.card}><div style={S.muted}>No hay gastos con tarjeta pendientes de reintegro.</div></div>}
      {meses.map(mes => {
        const lista = porMes[mes]
        const tot = totales(lista)
        const futuro = mes > actual
        return (
          <div key={mes} style={{ ...S.card, ...(futuro ? { opacity: 0.7 } : {}) }}>
            <div style={S.grupoTop}>
              <div style={{ minWidth: 0 }}>
                <div style={S.cardTitulo}>Resumen de {nombreMes(mes)}</div>
                <div style={S.sub}>{futuro ? 'Cuotas que todavía no llegaron' : 'Pendiente de reintegro'}</div>
              </div>
              <div style={{ ...S.grupoMonto, textAlign: 'right' }}>
                {Object.entries(tot).map(([tit, o]) => <div key={tit} style={{ fontSize: 16 }}>{tit}: {o.ars > 0 && fmt$(o.ars)}{o.ars > 0 && o.usd > 0 && ' + '}{o.usd > 0 && fmtUSD(o.usd)}</div>)}
              </div>
            </div>
            {lista.map(filaConsumo)}
            {!futuro && (reintegrando === mes ? (
              <div style={S.confirmBox}>
                <div style={S.ayuda}>Se genera el pago del local {Object.entries(tot).map(([tit, o]) => `a ${tit}: ${[o.ars > 0 && fmt$(o.ars), o.usd > 0 && fmtUSD(o.usd)].filter(Boolean).join(' y ')}`).join('; ')}. Queda en Pendientes hasta que lo marques como pagado. Estos consumos ya no se pueden borrar.</div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button style={S.btnSec} onClick={() => setReintegrando(null)}>Volver</button>
                  <button style={{ ...S.btnOk, flex: 1 }} onClick={() => reintegrar(mes)}>Confirmar reintegro</button>
                </div>
              </div>
            ) : <button style={S.btnPagar} onClick={() => setReintegrando(mes)}>Generar reintegro de {nombreMes(mes)}</button>)}
          </div>
        )
      })}

      <div style={S.card}>
        <label style={S.check}><input type="checkbox" checked={verReintegrados} onChange={e => setVerReintegrados(e.target.checked)} /> Ver gastos ya reintegrados</label>
        {verReintegrados && (reintegrados.length ? reintegrados.map(filaConsumo) : <div style={S.muted}>Todavía no hay reintegros.</div>)}
        {verReintegrados && reintegrados.length > 0 && <button style={S.link} onClick={() => irA('pend')}>Ver los pagos en Pendientes</button>}
      </div>
    </>
  )
}

// ── Impresiones 3D ─────────────────────────────────────────────────────────
// Ventas de impresiones 3D de Adrián a la Esquina y a Mitad de cuadra (esta última solo la ve Adrián).
// Esquina: se eligen las ventas y se "liquidan" → pago pendiente del local a Adrián.
// Mitad de cuadra: se marcan como cobradas cuando Mamá paga.
function Impresiones3D({ toast, irA }) {
  const [datos, setDatos] = useState(null)
  const [error, setError] = useState(null)
  const [cliente, setCliente] = useState('Esquina')
  const [fecha, setFecha] = useState(fechaHoy())
  const [cant, setCant] = useState({})
  const [filtro, setFiltro] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [sel, setSel] = useState(new Set())
  const [fechaCobro, setFechaCobro] = useState(fechaHoy())
  const [verProductos, setVerProductos] = useState(false)
  const [nuevo, setNuevo] = useState({ producto: '', precio: '', desde: fechaHoy() })
  const [verHistorial, setVerHistorial] = useState(false)
  async function cargar() { setError(null); try { setDatos(await pedirAdmin('3d')) } catch (e) { setError(e.message) } }
  useEffect(() => { cargar() }, [])
  useEffect(() => { setSel(new Set()) }, [cliente])

  async function guardar() {
    setGuardando(true)
    try {
      const items = Object.entries(cant).filter(([, c]) => Number(c) > 0).map(([producto, cantidad]) => ({ producto, cantidad: Number(cantidad) }))
      await pedirAdmin('3d.agregar', { fecha, cliente, items })
      toast(`Venta a ${cliente} guardada`); setCant({}); cargar()
    } catch (e) { toast(e.message, 'error') }
    finally { setGuardando(false) }
  }
  async function liquidar() {
    try { const r = await pedirAdmin('3d.liquidar', { ids: [...sel] }); toast(`Liquidado: ${fmt$(r.total)} quedó en Pendientes`); setSel(new Set()); cargar() } catch (e) { toast(e.message, 'error') }
  }
  async function cobrar() {
    try { await pedirAdmin('3d.cobrar', { ids: [...sel], fecha: fechaCobro }); toast('Marcadas como cobradas'); setSel(new Set()); cargar() } catch (e) { toast(e.message, 'error') }
  }
  async function anular(v) {
    if (!window.confirm(`¿Borrar ${v.cantidad} × ${v.producto} del ${v.fecha}?`)) return
    try { await pedirAdmin('3d.anular', { id: v.id }); toast('Venta borrada'); cargar() } catch (e) { toast(e.message, 'error') }
  }
  async function guardarProducto() {
    try { await pedirAdmin('3d.producto', nuevo); toast('Producto guardado'); setNuevo({ producto: '', precio: '', desde: fechaHoy() }); cargar() } catch (e) { toast(e.message, 'error') }
  }

  if (error) return <div style={S.card}><div style={S.error}>{error}</div><button style={S.btnSec} onClick={cargar}>Reintentar</button></div>
  if (!datos) return <div style={S.muted}>Cargando…</div>
  const clientes = datos.verMdc ? ['Esquina', 'Mitad de cuadra'] : ['Esquina']
  const productos = datos.productos.filter(p => !filtro || p.producto.toLowerCase().includes(filtro.toLowerCase()))
  const totalCarga = datos.productos.reduce((t, p) => t + (Number(cant[p.producto]) || 0) * p.precio, 0)
  const pendientes = datos.ventas.filter(v => v.cliente === cliente && v.estado === 'PENDIENTE').sort((a, b) => (parseFecha(b.fecha)?.clave || '').localeCompare(parseFecha(a.fecha)?.clave || ''))
  const totalSel = pendientes.filter(v => sel.has(v.id)).reduce((t, v) => t + v.total, 0)
  const historial = datos.ventas.filter(v => v.cliente === cliente && v.estado !== 'PENDIENTE').sort((a, b) => (parseFecha(b.fecha)?.clave || '').localeCompare(parseFecha(a.fecha)?.clave || ''))
  const toggle = id => setSel(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })

  return (
    <>
      {clientes.length > 1 && (
        <div style={S.grid2}>{clientes.map(c => <button key={c} style={{ ...S.optBtn, ...(cliente === c ? S.optBtnActivo : {}) }} onClick={() => setCliente(c)}>{c}</button>)}</div>
      )}
      <div style={S.card}>
        <div style={S.cardTitulo}>Cargar venta a {cliente}</div>
        <div style={S.filaInput}>
          <span style={S.fieldLabel}>FECHA</span><input style={{ ...S.input, width: 120 }} value={fecha} onChange={e => setFecha(e.target.value)} aria-label="Fecha de la venta" />
          <input style={{ ...S.inputAncho, flex: 1, minWidth: 160 }} placeholder="Filtrar productos…" value={filtro} onChange={e => setFiltro(e.target.value)} />
        </div>
        <div style={S.prod3dGrid}>
          {productos.map(p => (
            <label key={p.producto} style={{ ...S.prod3d, ...(Number(cant[p.producto]) > 0 ? { borderColor: 'var(--accent)' } : {}) }}>
              <span style={{ minWidth: 0, flex: 1 }}>{p.producto}<br /><span style={S.sub}>{fmt$(p.precio)}</span></span>
              <input style={{ ...S.input, width: 64, fontSize: 16, padding: '6px' }} inputMode="numeric" placeholder="0" value={cant[p.producto] || ''} onChange={e => setCant(c => ({ ...c, [p.producto]: e.target.value.replace(/\D/g, '') }))} aria-label={`Cantidad de ${p.producto}`} />
            </label>
          ))}
        </div>
        <button style={{ ...S.btn, opacity: totalCarga > 0 && !guardando ? 1 : 0.45 }} disabled={!(totalCarga > 0) || guardando} onClick={guardar}>{guardando ? 'Guardando…' : `Guardar venta · ${fmt$(totalCarga)}`}</button>
        <button style={S.link} onClick={() => setVerProductos(v => !v)}>{verProductos ? 'Ocultar' : 'Agregar producto o cambiar un precio'}</button>
        {verProductos && (
          <div style={S.confirmBox}>
            <div style={S.ayuda}>Para un aumento, escribí el nombre igual al del producto y el precio nuevo con la fecha desde la que vale. Las ventas anteriores conservan su precio.</div>
            <input style={S.inputAncho} list="adm-prod3d" placeholder="Producto" value={nuevo.producto} onChange={e => setNuevo(n => ({ ...n, producto: e.target.value }))} />
            <datalist id="adm-prod3d">{datos.productos.map(p => <option key={p.producto} value={p.producto} />)}</datalist>
            <div style={S.filaInput}>
              <span style={S.fieldLabel}>PRECIO</span><input style={{ ...S.input, width: 110 }} inputMode="numeric" value={nuevo.precio} onChange={e => setNuevo(n => ({ ...n, precio: e.target.value }))} aria-label="Precio del producto" />
              <span style={S.fieldLabel}>DESDE</span><input style={{ ...S.input, width: 120 }} value={nuevo.desde} onChange={e => setNuevo(n => ({ ...n, desde: e.target.value }))} aria-label="Vigente desde" />
              <button style={S.btnOk} onClick={guardarProducto}>Guardar</button>
            </div>
          </div>
        )}
      </div>

      <div style={S.card}>
        <div style={S.grupoTop}>
          <div style={S.cardTitulo}>{cliente === 'Esquina' ? 'Sin liquidar' : 'Sin cobrar'}</div>
          <div style={S.grupoMonto}>{fmt$(pendientes.reduce((t, v) => t + v.total, 0))}</div>
        </div>
        {pendientes.length === 0 && <div style={S.muted}>No hay ventas pendientes.</div>}
        {pendientes.length > 0 && <label style={S.check}><input type="checkbox" checked={sel.size === pendientes.length} onChange={e => setSel(e.target.checked ? new Set(pendientes.map(v => v.id)) : new Set())} /> Elegir todas</label>}
        {pendientes.map(v => (
          <label key={v.id} style={S.servFila}>
            <input type="checkbox" checked={sel.has(v.id)} onChange={() => toggle(v.id)} />
            <span style={{ flex: 1, minWidth: 0 }}>{v.cantidad} × {v.producto} <span style={S.sub}>· {v.fecha} · {fmt$(v.precio)} c/u</span></span>
            <strong>{fmt$(v.total)}</strong>
            <button style={S.borrar} onClick={e => { e.preventDefault(); anular(v) }} aria-label="Borrar venta">✕</button>
          </label>
        ))}
        {sel.size > 0 && (cliente === 'Esquina' ? (
          <div style={S.confirmBox}>
            <div style={S.ayuda}>Se crea un pago pendiente del local a Adrián por {fmt$(totalSel)} ({sel.size} {sel.size === 1 ? 'ítem' : 'ítems'}). Lo marcás como pagado en Pendientes cuando te paguen.</div>
            <button style={S.btnOk} onClick={liquidar}>Liquidar {fmt$(totalSel)}</button>
          </div>
        ) : (
          <div style={S.pagarFila}>
            <span style={S.fieldLabel}>COBRADO EL</span><input style={{ ...S.input, width: 120 }} value={fechaCobro} onChange={e => setFechaCobro(e.target.value)} aria-label="Fecha de cobro" />
            <button style={S.btnOk} onClick={cobrar}>Marcar cobradas · {fmt$(totalSel)}</button>
          </div>
        ))}
      </div>

      <div style={S.card}>
        <label style={S.check}><input type="checkbox" checked={verHistorial} onChange={e => setVerHistorial(e.target.checked)} /> Ver ventas {cliente === 'Esquina' ? 'ya liquidadas' : 'ya cobradas'}</label>
        {verHistorial && historial.map(v => (
          <div key={v.id} style={S.registro}>
            <span style={{ flex: 1, minWidth: 0 }}>{v.cantidad} × {v.producto} <span style={S.sub}>· {v.fecha} · {v.estado === 'LIQUIDADA' ? `liquidada el ${v.fechaCobro}` : `cobrada el ${v.fechaCobro}`}</span></span>
            <strong>{fmt$(v.total)}</strong>
          </div>
        ))}
        {verHistorial && cliente === 'Esquina' && historial.length > 0 && <button style={S.link} onClick={() => irA('pend')}>Ver los pagos en Pendientes</button>}
      </div>
    </>
  )
}

// ── Cuenta Esquina ↔ Mitad de cuadra ───────────────────────────────────────
// Saldo corrido: mercadería que la Esquina trajo de Mitad de cuadra (sale de Pagos, proveedor
// "Mitad de cuadra" o "Mamá", lo no pagado) contra lo que Mitad de cuadra se llevó, la cobertura
// de empleadas y los pagos en efectivo o transferencia que se hacen cada tanto.
const TIPOS_MOV_MDC = [
  { id: 'MERCADERIA', label: 'Se llevó mercadería', ayuda: 'Mercadería que Mitad de cuadra se llevó de la Esquina.' },
  { id: 'COBERTURA', label: 'Cobertura', ayuda: 'Días que una empleada de la Esquina trabajó en Mitad de cuadra.' },
  { id: 'PAGO_ESQUINA', label: 'Pagó el local', ayuda: 'El local le pagó a Mitad de cuadra (efectivo o transferencia).' },
  { id: 'PAGO_MDC', label: 'Pagó Mitad de cuadra', ayuda: 'Mitad de cuadra le pagó al local.' },
  { id: 'AJUSTE', label: 'Saldo inicial / ajuste', ayuda: 'Para arrancar con el saldo que traían de la planilla, o corregir una diferencia.' },
]
function MitadDeCuadra({ toast }) {
  const [datos, setDatos] = useState(null)
  const [error, setError] = useState(null)
  const [tipo, setTipo] = useState('MERCADERIA')
  const [f, setF] = useState({ fecha: fechaHoy(), detalle: '', cantidad: '', precio: '', monto: '', medio: 'Efectivo', aFavor: 'Mitad de cuadra' })
  const [guardando, setGuardando] = useState(false)
  async function cargar() { setError(null); try { const r = await pedirAdmin('mdc'); setDatos(r) } catch (e) { setError(e.message) } }
  useEffect(() => { cargar() }, [])
  // al cambiar de tipo se limpian los campos (la cobertura viene precargada con Brenda y el valor por día)
  function elegirTipo(id) {
    setTipo(id)
    setF(x => ({ ...x, cantidad: '', monto: '', detalle: id === 'COBERTURA' ? 'Brenda' : '', precio: id === 'COBERTURA' ? String(datos?.coberturaDia || '') : '' }))
  }

  async function guardar() {
    setGuardando(true)
    try {
      const t = tipo === 'AJUSTE' ? (f.aFavor === 'Mitad de cuadra' ? 'AJUSTE_MDC' : 'AJUSTE_ESQ') : tipo
      await pedirAdmin('mdc.agregar', { ...f, tipo: t })
      toast('Movimiento guardado'); setF(x => ({ ...x, cantidad: '', monto: '', ...(tipo === 'COBERTURA' ? {} : { detalle: '', precio: '' }) })); cargar()
    } catch (e) { toast(e.message, 'error') }
    finally { setGuardando(false) }
  }
  async function anular(m) {
    if (!window.confirm(`¿Borrar "${m.detalle}"?`)) return
    try { await pedirAdmin('mdc.anular', { id: m.id }); toast('Movimiento borrado'); cargar() } catch (e) { toast(e.message, 'error') }
  }

  if (error) return <div style={S.card}><div style={S.error}>{error}</div><button style={S.btnSec} onClick={cargar}>Reintentar</button></div>
  if (!datos) return <div style={S.muted}>Cargando…</div>
  const pend = datos.pagos.filter(p => !p.sinPrecio)
  const sinPrecio = datos.pagos.filter(p => p.sinPrecio)
  const movs = [...datos.movimientos].sort((a, b) => (parseFecha(b.fecha)?.clave || '').localeCompare(parseFecha(a.fecha)?.clave || ''))
  const t = TIPOS_MOV_MDC.find(x => x.id === tipo)
  const conCantidad = tipo === 'MERCADERIA' || tipo === 'COBERTURA'
  const valido = conCantidad ? f.cantidad && f.precio && (tipo !== 'MERCADERIA' || f.detalle.trim()) : f.monto

  return (
    <>
      <div style={S.card}>
        <div style={S.cardTitulo}>Saldo</div>
        <div style={S.saldoGrande}>{Math.abs(datos.saldo) < 1 ? 'Están a mano' : datos.saldo > 0 ? `El local le debe a Mitad de cuadra ${fmt$(datos.saldo)}` : `Mitad de cuadra le debe al local ${fmt$(-datos.saldo)}`}</div>
        <Fila izq="Mercadería traída de Mitad de cuadra, sin pagar (de Pagos)" der={fmt$(datos.deudaMercaderia)} />
        <Fila izq={datos.aFavorMdc >= 0 ? 'Movimientos de esta cuenta, a favor de Mitad de cuadra' : 'Movimientos de esta cuenta, a favor del local'} der={fmt$(Math.abs(datos.aFavorMdc))} />
        {sinPrecio.length > 0 && (
          <div style={S.alerta}>{sinPrecio.length} {sinPrecio.length === 1 ? 'artículo' : 'artículos'} de Mitad de cuadra en Pagos {sinPrecio.length === 1 ? 'no tiene' : 'no tienen'} precio y no {sinPrecio.length === 1 ? 'suma' : 'suman'} al saldo: {sinPrecio.slice(0, 6).map(p => `${p.cantidad} ${p.articulo}`).join(', ')}{sinPrecio.length > 6 ? '…' : ''}. Cuando tengas el precio, cargalo en Pagos.</div>
        )}
      </div>

      <div style={S.card}>
        <div style={S.cardTitulo}>Registrar movimiento</div>
        <div style={S.tipos}>{TIPOS_MOV_MDC.map(x => <button key={x.id} style={{ ...S.tipoBtn, ...(tipo === x.id ? S.optBtnActivo : {}) }} onClick={() => elegirTipo(x.id)}>{x.label}</button>)}</div>
        <div style={S.ayuda}>{t.ayuda}</div>
        <div style={S.filaInput}><span style={S.fieldLabel}>FECHA</span><input style={{ ...S.input, width: 120 }} value={f.fecha} onChange={e => setF(x => ({ ...x, fecha: e.target.value }))} aria-label="Fecha del movimiento" /></div>
        {tipo === 'AJUSTE' && <div style={S.grid2}>{['Mitad de cuadra', 'Esquina'].map(a => <button key={a} style={{ ...S.optBtn, ...(f.aFavor === a ? S.optBtnActivo : {}) }} onClick={() => setF(x => ({ ...x, aFavor: a }))}>{a === 'Mitad de cuadra' ? 'El local le debía' : 'Mitad de cuadra le debía'}</button>)}</div>}
        {(tipo === 'PAGO_ESQUINA' || tipo === 'PAGO_MDC') && <div style={S.tipos}>{['Efectivo', 'Transferencia'].map(m => <button key={m} style={{ ...S.tipoBtn, ...(f.medio === m ? S.optBtnActivo : {}) }} onClick={() => setF(x => ({ ...x, medio: m }))}>{m}</button>)}</div>}
        <input style={S.inputAncho} placeholder={tipo === 'MERCADERIA' ? 'Qué se llevó (ej. remeras algodón)' : tipo === 'COBERTURA' ? 'Quién (ej. Brenda)' : 'Detalle (opcional)'} value={f.detalle} maxLength={120} onChange={e => setF(x => ({ ...x, detalle: e.target.value }))} />
        {conCantidad ? (
          <div style={S.filaInput}>
            <span style={S.fieldLabel}>{tipo === 'COBERTURA' ? 'DÍAS' : 'CANTIDAD'}</span><input style={{ ...S.input, width: 80 }} inputMode="decimal" value={f.cantidad} onChange={e => setF(x => ({ ...x, cantidad: e.target.value }))} aria-label="Cantidad" />
            <span style={S.fieldLabel}>{tipo === 'COBERTURA' ? 'VALOR POR DÍA' : 'PRECIO'}</span><input style={{ ...S.input, width: 120 }} inputMode="decimal" value={f.precio} onChange={e => setF(x => ({ ...x, precio: e.target.value }))} aria-label="Precio" />
          </div>
        ) : (
          <div style={S.filaInput}><span style={S.fieldLabel}>MONTO</span><input style={{ ...S.input, width: 140 }} inputMode="decimal" value={f.monto} onChange={e => setF(x => ({ ...x, monto: e.target.value }))} aria-label="Monto" /></div>
        )}
        <button style={{ ...S.btn, opacity: valido && !guardando ? 1 : 0.45 }} disabled={!valido || guardando} onClick={guardar}>{guardando ? 'Guardando…' : 'Guardar'}</button>
      </div>

      <div style={S.card}>
        <div style={S.cardTitulo}>Movimientos</div>
        {movs.length === 0 && <div style={S.muted}>Todavía no hay movimientos. Si venían con un saldo de la planilla, cargalo como "Saldo inicial / ajuste".</div>}
        {movs.map(m => (
          <div key={m.id} style={S.registro}>
            <span style={{ flex: 1, minWidth: 0 }}>{m.detalle}<br /><span style={S.sub}>{m.fecha} · {m.aFavorDe === 'Mitad de cuadra' ? 'a favor de Mitad de cuadra' : 'a favor del local'}</span></span>
            <strong style={{ flexShrink: 0 }}>{fmt$(m.montoPesos)}</strong>
            <button style={S.borrar} onClick={() => anular(m)} aria-label="Borrar movimiento">✕</button>
          </div>
        ))}
        {pend.length > 0 && <div style={S.fieldLabel}>MERCADERÍA DE PAGOS SIN PAGAR</div>}
        {pend.map(p => (
          <div key={p.id} style={S.registro}>
            <span style={{ flex: 1, minWidth: 0 }}>{p.cantidad} × {p.articulo}<br /><span style={S.sub}>{p.fecha} · a favor de Mitad de cuadra</span></span>
            <strong style={{ flexShrink: 0 }}>{fmt$(p.pendiente)}</strong>
          </div>
        ))}
      </div>
    </>
  )
}

// ── Estado (conexiones y tablas) ───────────────────────────────────────────
function Estado() {
  const [estado, setEstado] = useState(null)
  const [error, setError] = useState(null)
  async function cargar() { setError(null); try { setEstado(await pedirAdmin('estado')) } catch (e) { setError(e.message) } }
  useEffect(() => { cargar() }, [])
  if (error) return <div style={S.card}><div style={S.error}>{error}</div><button style={S.btnSec} onClick={cargar}>Reintentar</button></div>
  if (!estado) return <div style={S.muted}>Conectando con la planilla de Administración…</div>
  return (
    <>
      <div style={S.card}>
        <div style={S.cardTitulo}>Conexiones</div>
        <div style={S.filaTxt}><span style={S.ok}>✓</span><span>Planilla de Administración: <strong>{estado.planilla}</strong></span></div>
        {estado.local.ok
          ? <div style={S.filaTxt}><span style={S.ok}>✓</span><span>Planilla del local: <strong>{estado.local.titulo}</strong> (para leer ventas y pagos)</span></div>
          : <div style={S.filaTxt}><span style={S.mal}>✕</span><span>Planilla del local: {estado.local.error}</span></div>}
      </div>
      <div style={S.card}>
        <div style={S.cardTitulo}>Tablas</div>
        {estado.tablas.map(t => (
          <div key={t.nombre} style={S.registro}>
            <span style={{ minWidth: 0, flex: 1 }}><strong>{t.nombre}</strong>{t.creada && <span style={S.badgeNueva}>NUEVA</span>}<br /><span style={S.sub}>{t.desc}</span></span>
            <strong>{t.filas}</strong>
          </div>
        ))}
      </div>
    </>
  )
}

// ── Página ─────────────────────────────────────────────────────────────────
const SECCIONES = [
  { id: 'pend', label: 'Pendientes' },
  { id: 'cierre', label: 'Cierre de mes' },
  { id: 'horas', label: 'Horas' },
  { id: 'serv', label: 'Servicios' },
  { id: 'tarj', label: 'Tarjeta' },
  { id: '3d', label: 'Impresiones 3D' },
  { id: 'mdc', label: 'Mitad de cuadra' },
  { id: 'estado', label: 'Estado' },
]

export default function Administracion({ perfilNombre = '' }) {
  const [sesion, setSesion] = useState(getSesion())
  const [seccion, setSeccion] = useState('pend')
  const [toastMsg, setToastMsg] = useState(null)
  const [version, setVersion] = useState(0)

  function toast(msg, type = 'success') { setToastMsg({ msg, type }); setTimeout(() => setToastMsg(null), 3500) }
  // Si la sesión vence en cualquier pedido, vuelve al login
  useEffect(() => {
    const t = setInterval(() => { if (sesion && !getSesion()) setSesion(null) }, 2000)
    return () => clearInterval(t)
  }, [sesion])
  function salir() { cerrarSesion(); setSesion(null) }
  const toastSeguro = (msg, type) => { if (!getSesion()) { setSesion(null); return } toast(msg, type) }

  return (
    <div style={S.page}>
      {toastMsg && <div style={{ ...S.toast, ...(toastMsg.type === 'error' ? S.toastError : S.toastOk) }}>{toastMsg.msg}</div>}
      <div style={S.header}>
        <div>
          <div style={S.headerTitle}>ADMINISTRACIÓN</div>
          <div style={S.headerSub}>{sesion ? `Sesión de ${sesion.quien || 'admin'} · hasta el ${horaCorta(sesion.exp)}` : 'Ingresá con el PIN de administración'}</div>
        </div>
        {sesion && (
          <div style={{ display: 'flex', gap: 8 }}>
            <button style={S.refreshBtn} onClick={() => setVersion(v => v + 1)} aria-label="Actualizar">↻</button>
            <button style={S.salirBtn} onClick={salir}>Cerrar sesión</button>
          </div>
        )}
      </div>
      <div style={S.body}>
        {!sesion ? <Login onEntrar={setSesion} /> : (
          <>
            <div style={S.secciones}>
              {SECCIONES.map(s => <button key={s.id} style={{ ...S.secBtn, ...(seccion === s.id ? S.secBtnActivo : {}) }} onClick={() => setSeccion(s.id)}>{s.label}</button>)}
            </div>
            <div key={`${seccion}-${version}`} style={S.contenido}>
              {seccion === 'pend' && <Pendientes toast={toastSeguro} irA={setSeccion} />}
              {seccion === 'cierre' && <Cierre toast={toastSeguro} irA={setSeccion} />}
              {seccion === 'horas' && <Horas toast={toastSeguro} />}
              {seccion === 'serv' && <Servicios toast={toastSeguro} />}
              {seccion === 'tarj' && <Tarjeta toast={toastSeguro} irA={setSeccion} />}
              {seccion === '3d' && <Impresiones3D toast={toastSeguro} irA={setSeccion} />}
              {seccion === 'mdc' && <MitadDeCuadra toast={toastSeguro} />}
              {seccion === 'estado' && <Estado />}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

const S = {
  page: { display: 'flex', flexDirection: 'column', height: '100%', overflowY: 'auto', position: 'relative' },
  toast: { position: 'fixed', top: 16, left: '50%', transform: 'translateX(-50%)', zIndex: 600, padding: '12px 24px', borderRadius: 10, fontFamily: 'Barlow Condensed, sans-serif', fontWeight: 700, fontSize: 17, maxWidth: 'calc(100% - 32px)', boxShadow: '0 4px 20px rgba(0,0,0,0.5)' },
  toastOk: { background: '#22c55e', color: '#000' },
  toastError: { background: '#ef4444', color: '#fff' },
  header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '16px 20px 12px', borderBottom: '2px solid var(--accent)', flexShrink: 0, flexWrap: 'wrap' },
  headerTitle: { fontFamily: 'Barlow Condensed, sans-serif', fontWeight: 800, fontSize: 28, color: 'var(--accent)', letterSpacing: 2 },
  headerSub: { fontFamily: 'Barlow, sans-serif', fontSize: 13, color: 'var(--muted)' },
  refreshBtn: { background: 'var(--surface)', border: '1.5px solid var(--border)', borderRadius: 10, color: 'var(--text)', fontSize: 22, width: 44, height: 44, cursor: 'pointer' },
  salirBtn: { background: 'none', border: '1.5px solid var(--border)', borderRadius: 10, color: 'var(--muted)', fontFamily: 'Barlow, sans-serif', fontSize: 14, padding: '0 14px', cursor: 'pointer' },
  body: { display: 'flex', flexDirection: 'column', gap: 12, padding: '14px 16px 28px', maxWidth: 760, width: '100%', margin: '0 auto', boxSizing: 'border-box' },
  contenido: { display: 'flex', flexDirection: 'column', gap: 12 },
  secciones: { display: 'flex', gap: 6, flexWrap: 'wrap' },
  secBtn: { fontFamily: 'Barlow Condensed, sans-serif', fontWeight: 700, fontSize: 16, padding: '8px 14px', background: 'var(--surface)', border: '1.5px solid var(--border)', borderRadius: 20, color: 'var(--muted)', cursor: 'pointer' },
  secBtnActivo: { borderColor: 'var(--accent)', color: 'var(--accent)', background: 'rgba(245,200,0,0.1)' },
  loginCard: { display: 'flex', flexDirection: 'column', gap: 10, background: 'var(--surface)', border: '1.5px solid var(--border)', borderRadius: 16, padding: 22, maxWidth: 420, width: '100%', margin: '20px auto 0', boxSizing: 'border-box' },
  candado: { fontSize: 34, textAlign: 'center' },
  loginTitulo: { fontFamily: 'Barlow Condensed, sans-serif', fontWeight: 800, fontSize: 26, color: 'var(--text)', textAlign: 'center', letterSpacing: 1 },
  fieldLabel: { fontFamily: 'Barlow Condensed, sans-serif', fontWeight: 700, fontSize: 13, color: 'var(--muted)', letterSpacing: 1.5 },
  grid2: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 },
  optBtn: { padding: '11px 8px', background: 'var(--surface2)', border: '1.5px solid var(--border)', borderRadius: 10, cursor: 'pointer', color: 'var(--muted)', fontFamily: 'Barlow Condensed, sans-serif', fontWeight: 700, fontSize: 16 },
  optBtnActivo: { background: 'rgba(245,200,0,0.12)', border: '1.5px solid var(--accent)', color: 'var(--accent)' },
  pin: { fontFamily: 'Barlow Condensed, sans-serif', fontWeight: 800, fontSize: 26, letterSpacing: 6, textAlign: 'center', padding: '10px', background: 'var(--bg)', border: '1.5px solid var(--border)', borderRadius: 10, color: 'var(--text)', width: '100%', boxSizing: 'border-box' },
  btn: { marginTop: 4, padding: '14px', background: 'var(--accent)', border: 'none', borderRadius: 12, color: '#000', fontFamily: 'Barlow Condensed, sans-serif', fontWeight: 800, fontSize: 18, letterSpacing: 1, cursor: 'pointer' },
  btnSec: { background: 'var(--surface2)', border: '1.5px solid var(--border)', borderRadius: 10, color: 'var(--text)', fontFamily: 'Barlow, sans-serif', fontSize: 14, padding: '9px 16px', cursor: 'pointer', alignSelf: 'flex-start' },
  btnOk: { background: '#22c55e', border: 'none', borderRadius: 10, color: '#000', fontFamily: 'Barlow Condensed, sans-serif', fontWeight: 800, fontSize: 15, padding: '9px 16px', cursor: 'pointer' },
  btnPagar: { alignSelf: 'flex-start', background: 'none', border: '1.5px solid rgba(34,197,94,0.6)', borderRadius: 10, color: '#22c55e', fontFamily: 'Barlow Condensed, sans-serif', fontWeight: 800, fontSize: 15, padding: '8px 16px', cursor: 'pointer', marginTop: 4 },
  link: { background: 'none', border: 'none', color: 'var(--accent)', textDecoration: 'underline', fontFamily: 'Barlow, sans-serif', fontSize: 13, cursor: 'pointer', padding: 0 },
  ayuda: { fontFamily: 'Barlow, sans-serif', fontSize: 13, color: 'var(--muted)', lineHeight: 1.45 },
  error: { fontFamily: 'Barlow, sans-serif', fontSize: 14, color: '#ef4444', lineHeight: 1.4 },
  alerta: { fontFamily: 'Barlow, sans-serif', fontSize: 13, color: '#f59e0b', lineHeight: 1.4 },
  muted: { fontFamily: 'Barlow, sans-serif', fontSize: 14, color: 'var(--muted)', padding: '6px 0' },
  card: { background: 'var(--surface)', border: '1.5px solid var(--border)', borderRadius: 14, padding: 16, display: 'flex', flexDirection: 'column', gap: 8 },
  cardTitulo: { fontFamily: 'Barlow Condensed, sans-serif', fontWeight: 800, fontSize: 17, color: 'var(--accent)', letterSpacing: 1, textTransform: 'uppercase' },
  bloque: { display: 'flex', flexDirection: 'column', gap: 4, paddingBottom: 6, borderBottom: '1px dashed var(--border)' },
  filaNum: { display: 'flex', justifyContent: 'space-between', gap: 12, fontFamily: 'Barlow, sans-serif', fontSize: 14, color: 'var(--text)', lineHeight: 1.35 },
  filaFuerte: { fontFamily: 'Barlow Condensed, sans-serif', fontWeight: 800, fontSize: 18 },
  filaTxt: { display: 'flex', gap: 10, alignItems: 'baseline', fontFamily: 'Barlow, sans-serif', fontSize: 14, color: 'var(--text)', lineHeight: 1.4 },
  sub: { fontFamily: 'Barlow, sans-serif', fontWeight: 400, fontSize: 12, color: 'var(--muted)' },
  ok: { color: '#22c55e', fontWeight: 800 },
  mal: { color: '#ef4444', fontWeight: 800 },
  selMes: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, background: 'var(--surface)', border: '1.5px solid var(--border)', borderRadius: 12, padding: 6 },
  selMesTxt: { fontFamily: 'Barlow Condensed, sans-serif', fontWeight: 800, fontSize: 20, color: 'var(--text)' },
  flecha: { background: 'var(--surface2)', border: 'none', borderRadius: 8, color: 'var(--text)', fontSize: 24, width: 44, height: 40, cursor: 'pointer' },
  dias: { display: 'grid', gridTemplateColumns: 'repeat(10, 1fr)', gap: 4 },
  dia: { padding: '8px 0', background: 'var(--surface2)', border: '1.5px solid var(--border)', borderRadius: 8, color: 'var(--muted)', fontFamily: 'Barlow Condensed, sans-serif', fontWeight: 700, fontSize: 15, cursor: 'pointer' },
  blues: { display: 'flex', flexWrap: 'wrap', gap: 6 },
  blueChip: { fontFamily: 'Barlow, sans-serif', fontSize: 12, color: 'var(--muted)', background: 'var(--surface2)', borderRadius: 6, padding: '3px 8px' },
  blueMax: { color: '#000', background: 'var(--accent)', fontWeight: 700 },
  filaInput: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  input: { fontFamily: 'Barlow Condensed, sans-serif', fontWeight: 700, fontSize: 18, padding: '8px 10px', background: 'var(--bg)', border: '1.5px solid var(--border)', borderRadius: 10, color: 'var(--text)', boxSizing: 'border-box' },
  inputAncho: { fontFamily: 'Barlow, sans-serif', fontSize: 15, padding: '10px 12px', background: 'var(--bg)', border: '1.5px solid var(--border)', borderRadius: 10, color: 'var(--text)', width: '100%', boxSizing: 'border-box' },
  tipos: { display: 'flex', flexWrap: 'wrap', gap: 6 },
  tipoBtn: { padding: '8px 12px', background: 'var(--surface2)', border: '1.5px solid var(--border)', borderRadius: 20, cursor: 'pointer', color: 'var(--muted)', fontFamily: 'Barlow, sans-serif', fontSize: 14 },
  registro: { display: 'flex', alignItems: 'center', gap: 10, fontFamily: 'Barlow, sans-serif', fontSize: 14, color: 'var(--text)', background: 'var(--surface2)', borderRadius: 8, padding: '7px 10px' },
  borrar: { flexShrink: 0, background: 'none', border: 'none', color: 'rgba(239,68,68,0.8)', fontSize: 16, cursor: 'pointer', padding: '0 4px' },
  badge: { fontSize: 11, fontWeight: 700, color: 'var(--accent)', background: 'rgba(245,200,0,0.12)', borderRadius: 4, padding: '1px 6px' },
  badgeNueva: { marginLeft: 8, fontSize: 10, fontWeight: 800, color: '#22c55e', background: 'rgba(34,197,94,0.15)', borderRadius: 4, padding: '1px 5px', letterSpacing: 1 },
  servFila: { display: 'flex', alignItems: 'center', gap: 10, fontFamily: 'Barlow, sans-serif', fontSize: 14, color: 'var(--text)', background: 'var(--surface2)', borderRadius: 8, padding: '7px 10px', cursor: 'pointer' },
  confirmBox: { display: 'flex', flexDirection: 'column', gap: 10, background: 'rgba(245,200,0,0.06)', border: '1.5px dashed var(--accent)', borderRadius: 12, padding: 12 },
  grupoTop: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 },
  grupoTitulo: { fontFamily: 'Barlow Condensed, sans-serif', fontWeight: 800, fontSize: 19, color: 'var(--text)' },
  grupoMonto: { fontFamily: 'Barlow Condensed, sans-serif', fontWeight: 800, fontSize: 22, color: 'var(--accent)', flexShrink: 0 },
  pagarFila: { display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' },
  prod3dGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: 6 },
  prod3d: { display: 'flex', alignItems: 'center', gap: 8, fontFamily: 'Barlow, sans-serif', fontSize: 14, color: 'var(--text)', background: 'var(--surface2)', border: '1.5px solid var(--border)', borderRadius: 10, padding: '6px 8px' },
  saldoFila: { display: 'flex', alignItems: 'center', gap: 12, width: '100%', background: 'var(--surface2)', border: '1.5px solid var(--border)', borderRadius: 10, padding: '10px 12px', cursor: 'pointer', color: 'var(--text)', fontFamily: 'Barlow, sans-serif', fontSize: 15 },
  saldoGrande: { fontFamily: 'Barlow Condensed, sans-serif', fontWeight: 800, fontSize: 24, color: 'var(--accent)', lineHeight: 1.2 },
  check: { display: 'flex', alignItems: 'center', gap: 8, fontFamily: 'Barlow, sans-serif', fontSize: 13, color: 'var(--muted)', cursor: 'pointer' },
}
