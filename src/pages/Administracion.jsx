// src/pages/Administracion.jsx
// Administración: cierre de mes (sueldos, alquiler con blue, regalías, servicios de Mamá),
// horas y tarifas, y pagos pendientes. Entra con PIN propio; todo pasa por /api/admin.
import { useState, useEffect, useMemo } from 'react'
import { getSesion, cerrarSesion, ingresar, pedirAdmin, ErrorSesion } from '../api/admin.js'
import { calcularSueldo, parseFecha, ultimoDiaMes, nombreMes } from '../../api/_lib/cierre.js'

const QUIENES = ['Adrián', 'Jorge']
const fmt$ = n => (n < 0 ? '−$' : '$') + Math.abs(Math.round(n || 0)).toLocaleString('es-AR')
const horaCorta = ms => new Date(ms).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
const hoyAR = () => { const d = new Date(Date.now() - 3 * 3600000); return { d: d.getUTCDate(), m: d.getUTCMonth() + 1, a: d.getUTCFullYear() } }
const mesClave = (a, m) => `${a}-${String(m).padStart(2, '0')}`
const mesAnterior = mes => { const [a, m] = mes.split('-').map(Number); return m === 1 ? mesClave(a - 1, 12) : mesClave(a, m - 1) }
const mesActual = () => { const h = hoyAR(); return mesClave(h.a, h.m) }
const fechaHoy = () => { const h = hoyAR(); return `${h.d}/${h.m}/${h.a}` }
const capitalizar = s => s.charAt(0).toUpperCase() + s.slice(1)
const NOMBRE_TIPO = { COMUN: 'Común', PARTIDO: 'Partido (×2)', FERIADO: 'Feriado (×2)', 'HOME OFFICE': 'Home office' }

// ── Login ──────────────────────────────────────────────────────────────────
function Login({ perfilNombre, onEntrar }) {
  const [quien, setQuien] = useState(QUIENES.includes(perfilNombre) ? perfilNombre : 'Adrián')
  const [pin, setPin] = useState('')
  const [entrando, setEntrando] = useState(false)
  const [error, setError] = useState(null)
  const [faltan, setFaltan] = useState(null)
  async function entrar() {
    if (!pin || entrando) return
    setEntrando(true); setError(null); setFaltan(null)
    try { onEntrar(await ingresar(pin, quien)) }
    catch (e) { setError(e.message); setFaltan(e.configuracion || null); setPin('') }
    finally { setEntrando(false) }
  }
  return (
    <div style={S.loginCard}>
      <div style={S.candado}>🔒</div>
      <div style={S.loginTitulo}>Administración</div>
      <div style={S.ayuda}>Cuentas del local, regalías, alquiler, servicios y ahorros. Solo para Adrián y Jorge.</div>
      <div style={S.fieldLabel}>QUIÉN ENTRA</div>
      <div style={S.grid2}>
        {QUIENES.map(q => <button key={q} style={{ ...S.optBtn, ...(quien === q ? S.optBtnActivo : {}) }} onClick={() => setQuien(q)}>{q}</button>)}
      </div>
      <div style={S.fieldLabel}>PIN DE ADMINISTRACIÓN</div>
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
function Pendientes({ toast }) {
  const [datos, setDatos] = useState(null)
  const [error, setError] = useState(null)
  const [pagando, setPagando] = useState(null)
  const [fecha, setFecha] = useState(fechaHoy())
  const [verPagados, setVerPagados] = useState(false)
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
      const neto = gr.movs.reduce((s, m) => s + (m.debe === a ? m.montoPesos : -m.montoPesos), 0)
      return { ...gr, paga: neto >= 0 ? a : b, cobra: neto >= 0 ? b : a, neto: Math.abs(neto) }
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
  return (
    <>
      <div style={S.ayuda}>Lo que falta pagar de cada cierre. Cuando lo pagás, tocá <strong>Marcar pagado</strong> y poné la fecha real.</div>
      {pend.length === 0 && <div style={S.card}><div style={S.muted}>No hay pagos pendientes.</div></div>}
      {grupos.map(gr => (
        <div key={`${gr.origen}|${gr.cuenta}|${gr.estado}`} style={{ ...S.card, ...(gr.estado === 'PAGADO' ? { opacity: 0.6 } : {}) }}>
          <div style={S.grupoTop}>
            <div style={{ minWidth: 0 }}>
              <div style={S.grupoTitulo}>{gr.paga} → {gr.cobra}</div>
              <div style={S.sub}>{gr.origen.replace(/^CIERRE (\d{4}-\d{2})$/, (_, m) => `Cierre de ${nombreMes(m)}`)}{gr.estado === 'PAGADO' ? ` · pagado ${gr.movs[0].fechaPago}` : ''}</div>
            </div>
            <div style={S.grupoMonto}>{fmt$(gr.neto)}</div>
          </div>
          {gr.movs.map(m => (
            <Fila key={m.id} izq={m.detalle} sub={m.moneda === 'USD' ? `(US$ ${m.monto.toLocaleString('es-AR')} × ${fmt$(m.tipoCambio)})` : ''} der={`${m.debe === gr.paga ? '' : '−'}${fmt$(m.montoPesos)}`} />
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
            {p.serviciosPendientes.length === 0
              ? <div style={S.ayuda}>No hay boletas de Mamá pendientes de descontar. <button style={S.link} onClick={() => irA('serv')}>Cargar boletas</button></div>
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
const SERVICIOS_TIPOS = ['AySA', 'Edesur', 'Metrogas', 'ABL', 'Internet', 'Otro']
function Servicios({ toast }) {
  const [datos, setDatos] = useState(null)
  const [error, setError] = useState(null)
  const [f, setF] = useState({ propiedad: '', servicio: 'AySA', monto: '', fechaPago: fechaHoy(), aCargoDe: 'Mamá', nota: '' })
  const [guardando, setGuardando] = useState(false)
  const [verLiquidados, setVerLiquidados] = useState(false)
  async function cargar() { setError(null); try { setDatos(await pedirAdmin('datos')) } catch (e) { setError(e.message) } }
  useEffect(() => { cargar() }, [])
  const propiedades = useMemo(() => [...new Set((datos?.servicios || []).map(s => s.propiedad))].sort(), [datos])

  async function agregar() {
    setGuardando(true)
    try { await pedirAdmin('servicios.agregar', f); toast('Boleta guardada'); setF(x => ({ ...x, monto: '', nota: '' })); cargar() }
    catch (e) { toast(e.message, 'error') }
    finally { setGuardando(false) }
  }
  async function anular(s) {
    if (!window.confirm(`¿Borrar ${s.servicio} ${s.propiedad} ${fmt$(s.monto)}?`)) return
    try { await pedirAdmin('servicios.anular', { id: s.id }); toast('Boleta borrada'); cargar() } catch (e) { toast(e.message, 'error') }
  }

  if (error) return <div style={S.card}><div style={S.error}>{error}</div><button style={S.btnSec} onClick={cargar}>Reintentar</button></div>
  if (!datos) return <div style={S.muted}>Cargando…</div>
  const lista = datos.servicios.filter(s => verLiquidados || !s.liquidadoEn).sort((x, y) => (parseFecha(y.fechaPago)?.clave || '').localeCompare(parseFecha(x.fechaPago)?.clave || ''))
  return (
    <>
      <div style={S.card}>
        <div style={S.cardTitulo}>Cargar boleta pagada</div>
        <div style={S.ayuda}>Las de <strong>Mamá</strong> se descuentan del alquiler en el próximo cierre. Las del <strong>Local</strong> quedan registradas como gasto del local.</div>
        <div style={S.grid2}>
          {['Mamá', 'Esquina'].map(a => <button key={a} style={{ ...S.optBtn, ...(f.aCargoDe === a ? S.optBtnActivo : {}) }} onClick={() => setF(x => ({ ...x, aCargoDe: a }))}>{a === 'Esquina' ? 'Del local' : 'De Mamá'}</button>)}
        </div>
        <input style={S.inputAncho} list="adm-propiedades" placeholder="Propiedad (ej. Hernandarias, Brandsen 758, Local Esquina)" value={f.propiedad} onChange={e => setF(x => ({ ...x, propiedad: e.target.value }))} />
        <datalist id="adm-propiedades">{propiedades.map(p => <option key={p} value={p} />)}</datalist>
        <div style={S.tipos}>{SERVICIOS_TIPOS.map(t => <button key={t} style={{ ...S.tipoBtn, ...(f.servicio === t ? S.optBtnActivo : {}) }} onClick={() => setF(x => ({ ...x, servicio: t }))}>{t}</button>)}</div>
        <div style={S.filaInput}>
          <span style={S.fieldLabel}>MONTO</span><input style={{ ...S.input, width: 120 }} inputMode="decimal" value={f.monto} onChange={e => setF(x => ({ ...x, monto: e.target.value }))} aria-label="Monto" />
          <span style={S.fieldLabel}>PAGADO EL</span><input style={{ ...S.input, width: 120 }} value={f.fechaPago} onChange={e => setF(x => ({ ...x, fechaPago: e.target.value }))} aria-label="Fecha de pago" />
        </div>
        <input style={S.inputAncho} placeholder="Nota (opcional)" value={f.nota} maxLength={200} onChange={e => setF(x => ({ ...x, nota: e.target.value }))} />
        <button style={{ ...S.btn, opacity: f.propiedad && f.monto && !guardando ? 1 : 0.45 }} disabled={!f.propiedad || !f.monto || guardando} onClick={agregar}>{guardando ? 'Guardando…' : 'Guardar boleta'}</button>
      </div>
      <div style={S.card}>
        <div style={S.cardTitulo}>{verLiquidados ? 'Todas las boletas' : 'Pendientes de descontar'}</div>
        {lista.length === 0 && <div style={S.muted}>No hay boletas.</div>}
        {lista.map(s => (
          <div key={s.id} style={S.registro}>
            <span style={{ minWidth: 0, flex: 1 }}>{s.servicio} · {s.propiedad} <span style={S.sub}>· {s.fechaPago} · {s.aCargoDe === 'Mamá' ? 'Mamá' : 'Local'}{s.liquidadoEn ? ` · descontada en ${s.liquidadoEn.toLowerCase()}` : ''}</span></span>
            <strong style={{ flexShrink: 0 }}>{fmt$(s.monto)}</strong>
            {!s.liquidadoEn && <button style={S.borrar} onClick={() => anular(s)} aria-label="Borrar boleta">✕</button>}
          </div>
        ))}
        <label style={S.check}><input type="checkbox" checked={verLiquidados} onChange={e => setVerLiquidados(e.target.checked)} /> Ver también las ya descontadas</label>
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
        {!sesion ? <Login perfilNombre={perfilNombre} onEntrar={setSesion} /> : (
          <>
            <div style={S.secciones}>
              {SECCIONES.map(s => <button key={s.id} style={{ ...S.secBtn, ...(seccion === s.id ? S.secBtnActivo : {}) }} onClick={() => setSeccion(s.id)}>{s.label}</button>)}
            </div>
            <div key={`${seccion}-${version}`} style={S.contenido}>
              {seccion === 'pend' && <Pendientes toast={toastSeguro} />}
              {seccion === 'cierre' && <Cierre toast={toastSeguro} irA={setSeccion} />}
              {seccion === 'horas' && <Horas toast={toastSeguro} />}
              {seccion === 'serv' && <Servicios toast={toastSeguro} />}
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
  check: { display: 'flex', alignItems: 'center', gap: 8, fontFamily: 'Barlow, sans-serif', fontSize: 13, color: 'var(--muted)', cursor: 'pointer' },
}
