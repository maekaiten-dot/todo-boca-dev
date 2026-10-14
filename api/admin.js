// POST /api/admin  { accion, ... }
// Una sola función para toda la Administración (el plan gratis de Vercel limita la cantidad de funciones).
// Todas las acciones salvo 'login' necesitan el header  Authorization: Bearer <token>
//   login               { pin, quien }                 → { token, exp }
//   estado                                             → { planilla, tablas, local }
//   datos                                              → { personas, config, tarifas, horas, servicios }
//   horas.agregar       { persona, desde, hasta, horas, tipo, lugar, nota }
//   horas.anular        { id }
//   tarifas.agregar     { persona, valor, desde, nota }
//   servicios.agregar   { propiedad, servicio, monto, estado: 'A PAGAR'|'PAGADA', vencimiento, fechaPago, pagadoPor, aCargoDe, nota }
//   servicios.pagar     { id, monto, fechaPago, pagadoPor }   (el monto real puede ser distinto al de la boleta)
//   servicios.anular    { id }
//   cierre.preparar     { mes: 'aaaa-mm', diaPago }    → todos los números del cierre (no guarda nada)
//   cierre.confirmar    { mes, diaPago, blue, serviciosIds, nota }
//   cuentas                                            → { movimientos, cierres }
//   cuentas.pagar       { ids, fecha }
import {
  admin, local, variablesFaltantes, verificarPin, crearSesion, leerSesion, prepararTablas, listo, ahoraAR, nuevoId,
  getConfig, getPersonas, getTarifas, getHoras, getServicios, getCuenta, getCierres,
} from './_lib/admin.js'
import {
  TIPOS_HORA, parseFecha, fechaAR, mesSiguiente, nombreMes, calcularSueldo, ventasDelMes, blueMaximo, calcularRegalias,
} from './_lib/cierre.js'

function leerBody(req) {
  if (!req.body) return {}
  if (typeof req.body === 'string') { try { return JSON.parse(req.body) } catch { return {} } }
  return req.body
}
function responder(res, status, data) {
  res.setHeader('Cache-Control', 'no-store')
  res.status(status).json(data)
}
class ErrorUsuario extends Error {}
const fallar = msg => { throw new ErrorUsuario(msg) }

// Traduce los errores de Google a algo que se entienda en la pantalla
function mensajeError(e, planilla) {
  if (e.status === 403) return `La cuenta de servicio de Administración no tiene acceso a la planilla ${planilla}. Compartila con el email de la cuenta (como Editor).`
  if (e.status === 404) return `No se encontró la planilla ${planilla}. Revisá el ID cargado en Vercel.`
  return e.message
}

const HERMANOS = ['Adrián', 'Jorge', 'Kathy', 'Euge']
const SOCIOS = ['Adrián', 'Jorge']
const LOCAL = 'Esquina'
const MAMA = 'Mamá'
const esMes = m => /^\d{4}-\d{2}$/.test(String(m || ''))
// Montos en formato argentino ("1.545", "1.545,50") o número; horas aceptan coma o punto decimal
const num = v => { if (typeof v === 'number') return v; const n = Number(String(v ?? '').trim().replace(/\./g, '').replace(',', '.')); return Number.isFinite(n) ? n : NaN }
const numHoras = v => { if (typeof v === 'number') return v; const n = Number(String(v ?? '').trim().replace(',', '.')); return Number.isFinite(n) ? n : NaN }

// ── Dólar blue ─────────────────────────────────────────────────────────────
async function cotizacionBlue(clave) {
  const [a, m, d] = clave.split('-')
  try {
    const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 6000)
    const r = await fetch(`https://api.argentinadatos.com/v1/cotizaciones/dolares/blue/${a}/${m}/${d}`, { signal: ctrl.signal })
    clearTimeout(t)
    if (!r.ok) return null
    const j = await r.json()
    return j && j.venta > 0 ? { fecha: clave, venta: Number(j.venta), compra: Number(j.compra) || null } : null
  } catch { return null }
}
async function bluesDelPeriodo(mesPago, diaPago) {
  const dias = Array.from({ length: diaPago }, (_, i) => `${mesPago}-${String(i + 1).padStart(2, '0')}`)
  const hoy = ahoraAR().clave
  const res = await Promise.all(dias.filter(c => c <= hoy).map(cotizacionBlue))
  return res.filter(Boolean)
}

// ── Cierre ─────────────────────────────────────────────────────────────────
async function prepararCierre({ mes, diaPago }) {
  if (!esMes(mes)) fallar('Mes inválido')
  const [config, tarifas, horas, servicios, cierres, filasVentas] = await Promise.all([
    getConfig(), getTarifas(), getHoras(), getServicios(), getCierres(),
    local.sheetsGet('DETALLE DE VENTAS!A2:U'),
  ])
  const dia = Math.min(Math.max(Number(diaPago) || config.alquilerDiaMax, 1), config.alquilerDiaMax)
  const mesPago = mesSiguiente(mes)
  const ventas = ventasDelMes(filasVentas, mes)
  const sueldos = SOCIOS.map(p => calcularSueldo({ horas, tarifas, persona: p, mes, homeOffice: config.homeOffice }))
  const cotizaciones = await bluesDelPeriodo(mesPago, dia)
  const max = blueMaximo(cotizaciones)
  // solo se descuentan del alquiler las boletas de Mamá ya pagadas
  const pendientes = servicios.filter(s => !s.anulado && !s.liquidadoEn && s.aCargoDe === MAMA && s.estado === 'PAGADA')
  const mamaAPagar = servicios.filter(s => !s.anulado && s.aCargoDe === MAMA && s.estado === 'A PAGAR')
  return {
    mes, nombre: nombreMes(mes), mesPago, nombrePago: nombreMes(mesPago), diaPago: dia, diaMax: config.alquilerDiaMax,
    ventas, sueldos, porcentaje: config.porcentaje, alquilerUsd: config.alquilerUsd,
    blue: { cotizaciones, max }, serviciosPendientes: pendientes,
    serviciosAPagar: { cantidad: mamaAPagar.length, total: mamaAPagar.reduce((s, x) => s + x.monto, 0) },
    cierreExistente: cierres.find(c => c.mes === mes) || null,
  }
}

async function confirmarCierre({ mes, diaPago, blue, serviciosIds = [], nota = '' }, quien) {
  const p = await prepararCierre({ mes, diaPago })
  if (p.cierreExistente) fallar(`El cierre de ${p.nombre} ya está hecho (${p.cierreExistente.fechaCierre}).`)
  const sinTarifa = p.sueldos.filter(s => s.faltaTarifa).map(s => s.persona)
  if (sinTarifa.length) fallar(`Falta la tarifa de ${sinTarifa.join(' y ')} para ${p.nombre}.`)
  const sinHoras = p.sueldos.filter(s => s.registros === 0).map(s => s.persona)
  if (sinHoras.length) fallar(`No hay horas cargadas de ${sinHoras.join(' y ')} en ${p.nombre}.`)
  const tc = num(blue)
  if (!(tc > 0)) fallar('Falta el dólar blue del alquiler.')
  const alquilerPesos = Math.round(p.alquilerUsd * tc)
  const sueldoDe = n => p.sueldos.find(s => s.persona === n).total
  const reg = calcularRegalias({ ventas: p.ventas.total, alquilerPesos, sueldos: SOCIOS.map(sueldoDe), porcentaje: p.porcentaje })
  const elegidos = p.serviciosPendientes.filter(s => serviciosIds.includes(s.id))
  const totalServicios = elegidos.reduce((s, x) => s + x.monto, 0)
  const neto = alquilerPesos - totalServicios
  const { fecha, hora } = ahoraAR()
  const origen = `CIERRE ${mes}`
  const existentes = (await getCuenta()).map(m => m.id)
  const n = 2 + HERMANOS.length + 1 + elegidos.length
  const ids = nuevoId('CC', existentes, n)
  const fila = (cuenta, debe, aFavor, concepto, detalle, monto, moneda = 'ARS', tipoCambio = '', montoPesos = monto, notaFila = '') =>
    [ids.shift(), fecha, cuenta, debe, aFavor, concepto, 'LOCAL', detalle, monto, moneda, tipoCambio, montoPesos, 'PENDIENTE', '', origen, notaFila, 'FALSE']
  const filas = [
    ...SOCIOS.map(s => fila(`${LOCAL} ↔ ${s}`, LOCAL, s, 'SUELDO', `Sueldo ${p.nombre}`, sueldoDe(s))),
    ...HERMANOS.map(h => fila(`${LOCAL} ↔ ${h}`, LOCAL, h, 'REGALIAS', `Regalías ${p.nombre} (${p.porcentaje}%)`, reg.porHermano)),
    fila(`${LOCAL} ↔ ${MAMA}`, LOCAL, MAMA, 'ALQUILER LOCAL', `Alquiler ${p.nombre} (pagado en ${p.nombrePago})`, p.alquilerUsd, 'USD', tc, alquilerPesos,
      `Blue máx. del 1 al ${p.diaPago}/${Number(p.mesPago.slice(5))}. Neto a transferir: $${neto.toLocaleString('es-AR')}`),
    ...elegidos.map(s => fila(`${LOCAL} ↔ ${MAMA}`, MAMA, LOCAL, 'SERVICIOS', `${s.servicio} ${s.propiedad} (descontado del alquiler)`, s.monto)),
  ]
  await admin.sheetsAppend('CUENTA CORRIENTE!A1', filas)
  for (const s of elegidos) await admin.sheetsUpdate(`SERVICIOS!L${s.fila}`, [[origen]])
  await admin.sheetsAppend('CIERRES!A1', [[
    mes, `${fecha} ${hora}`, p.ventas.total, `${p.diaPago}/${Number(p.mesPago.slice(5))}/${p.mesPago.slice(0, 4)}`, tc, p.alquilerUsd, alquilerPesos,
    sueldoDe('Adrián'), sueldoDe('Jorge'), reg.base, p.porcentaje, reg.porHermano, totalServicios, neto, 0, quien || '', String(nota || '').slice(0, 300),
  ]])
  return { ok: true, mes, regalias: reg, alquilerPesos, neto, movimientos: filas.length }
}

// ── Acciones ───────────────────────────────────────────────────────────────
async function ejecutar(accion, body, sesion) {
  if (accion === 'estado') {
    let planilla, tablas
    try {
      const meta = await admin.metadatos()
      planilla = meta.properties?.title || ''
      tablas = await prepararTablas()
    } catch (e) { return [502, { error: mensajeError(e, 'de Administración') }] }
    let localInfo
    try {
      const meta = await local.metadatos()
      localInfo = { ok: true, titulo: meta.properties?.title || '', hojas: (meta.sheets || []).length }
    } catch (e) { localInfo = { ok: false, error: mensajeError(e, 'del local') } }
    return [200, { planilla, tablas, local: localInfo, sesion }]
  }

  try { await listo() } catch (e) { return [502, { error: mensajeError(e, 'de Administración') }] }

  if (accion === 'datos') {
    const [personas, config, tarifas, horas, servicios] = await Promise.all([getPersonas(), getConfig(), getTarifas(), getHoras(), getServicios()])
    return [200, { personas, config, tarifas, horas: horas.filter(h => !h.anulado), servicios: servicios.filter(s => !s.anulado), tipos: Object.keys(TIPOS_HORA) }]
  }

  if (accion === 'horas.agregar') {
    const { persona, desde, hasta, horas, tipo = 'COMUN', lugar = '', nota = '' } = body
    const fd = parseFecha(desde), fh = parseFecha(hasta || desde)
    if (!SOCIOS.includes(persona)) fallar('Elegí de quién son las horas')
    if (!fd || !fh) fallar('Fecha inválida')
    if (fh.clave < fd.clave) fallar('La fecha "hasta" es anterior a "desde"')
    if (fd.mes !== fh.mes) fallar('El período tiene que estar dentro de un mismo mes')
    const h = numHoras(horas)
    if (!(h > 0) || h > 400) fallar('Cantidad de horas inválida')
    if (!(tipo in TIPOS_HORA)) fallar('Tipo de hora inválido')
    const [id] = nuevoId('H', (await getHoras()).map(x => x.id))
    const { fecha, hora } = ahoraAR()
    await admin.sheetsAppend('HORAS!A1', [[id, persona, fechaAR(fd.clave), fechaAR(fh.clave), h, tipo, String(lugar).slice(0, 60), String(nota).slice(0, 200), `${fecha} ${hora} ${sesion.quien || ''}`.trim(), 'FALSE']])
    return [200, { ok: true, id }]
  }
  if (accion === 'horas.anular') {
    const h = (await getHoras()).find(x => x.id === body.id)
    if (!h) fallar('No se encontró ese registro')
    const cierres = await getCierres()
    if (cierres.some(c => c.mes === h.desde.slice(0, 7))) fallar('Ese mes ya está cerrado: no se pueden cambiar sus horas')
    await admin.sheetsUpdate(`HORAS!J${h.fila}`, [['TRUE']])
    return [200, { ok: true }]
  }
  if (accion === 'tarifas.agregar') {
    const { persona, valor, desde, nota = '' } = body
    const fd = parseFecha(desde)
    if (!SOCIOS.includes(persona)) fallar('Elegí la persona')
    if (!fd) fallar('Fecha inválida')
    const v = num(valor)
    if (!(v > 0)) fallar('Valor inválido')
    await admin.sheetsAppend('TARIFAS!A1', [[persona, 'COMUN', v, fechaAR(fd.clave), String(nota).slice(0, 200)]])
    return [200, { ok: true }]
  }
  if (accion === 'servicios.agregar') {
    const { propiedad, servicio, monto, estado = 'PAGADA', vencimiento = '', fechaPago, pagadoPor = sesion.quien || 'Adrián', aCargoDe = MAMA, nota = '' } = body
    if (!String(propiedad || '').trim() || !String(servicio || '').trim()) fallar('Completá propiedad y servicio')
    if (!['A PAGAR', 'PAGADA'].includes(estado)) fallar('Estado inválido')
    const m = num(monto)
    if (!(m > 0)) fallar('Monto inválido')
    const fv = vencimiento ? parseFecha(vencimiento) : null
    if (vencimiento && !fv) fallar('Fecha de vencimiento inválida')
    const fp = estado === 'PAGADA' ? parseFecha(fechaPago) : null
    if (estado === 'PAGADA' && !fp) fallar('Fecha de pago inválida')
    const [id] = nuevoId('S', (await getServicios()).map(x => x.id))
    const mes = (fp || fv || parseFecha(ahoraAR().fecha)).mes
    await admin.sheetsAppend('SERVICIOS!A1', [[id, mes, String(propiedad).trim(), String(servicio).trim(), m, fv ? fechaAR(fv.clave) : '',
      fp ? pagadoPor : '', fp ? fechaAR(fp.clave) : '', aCargoDe, String(nota).slice(0, 200), 'FALSE', '', estado, m]])
    return [200, { ok: true, id }]
  }
  if (accion === 'servicios.pagar') {
    const s = (await getServicios()).find(x => x.id === body.id && !x.anulado)
    if (!s) fallar('No se encontró esa boleta')
    if (s.estado === 'PAGADA') fallar('Esa boleta ya figura como pagada')
    const m = num(body.monto)
    if (!(m > 0)) fallar('Monto pagado inválido')
    const fp = parseFecha(body.fechaPago)
    if (!fp) fallar('Fecha de pago inválida')
    await admin.sheetsUpdate(`SERVICIOS!B${s.fila}`, [[fp.mes]])
    await admin.sheetsUpdate(`SERVICIOS!E${s.fila}`, [[m]])
    await admin.sheetsUpdate(`SERVICIOS!G${s.fila}:H${s.fila}`, [[body.pagadoPor || sesion.quien || 'Adrián', fechaAR(fp.clave)]])
    await admin.sheetsUpdate(`SERVICIOS!M${s.fila}:N${s.fila}`, [['PAGADA', s.montoBoleta || s.monto]])
    return [200, { ok: true }]
  }
  if (accion === 'servicios.anular') {
    const s = (await getServicios()).find(x => x.id === body.id)
    if (!s) fallar('No se encontró esa boleta')
    if (s.liquidadoEn) fallar(`Esa boleta ya se descontó en el ${s.liquidadoEn}`)
    await admin.sheetsUpdate(`SERVICIOS!K${s.fila}`, [['TRUE']])
    return [200, { ok: true }]
  }
  if (accion === 'cierre.preparar') return [200, await prepararCierre(body)]
  if (accion === 'cierre.confirmar') return [200, await confirmarCierre(body, sesion.quien)]
  if (accion === 'cuentas') {
    const [movimientos, cierres] = await Promise.all([getCuenta(), getCierres()])
    return [200, { movimientos: movimientos.filter(m => !m.anulado), cierres }]
  }
  if (accion === 'cuentas.pagar') {
    const ids = Array.isArray(body.ids) ? body.ids : []
    const fp = parseFecha(body.fecha) || parseFecha(ahoraAR().fecha)
    const movs = (await getCuenta()).filter(m => ids.includes(m.id) && m.estado === 'PENDIENTE' && !m.anulado)
    if (!movs.length) fallar('No hay movimientos pendientes para marcar')
    for (const m of movs) await admin.sheetsUpdate(`CUENTA CORRIENTE!M${m.fila}:N${m.fila}`, [['PAGADO', fechaAR(fp.clave)]])
    return [200, { ok: true, marcados: movs.length }]
  }
  return [400, { error: 'Acción desconocida' }]
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return responder(res, 405, { error: 'Método no permitido' })
  const faltan = variablesFaltantes()
  if (faltan.length) return responder(res, 500, { error: `Falta configurar en Vercel: ${faltan.join(', ')}`, configuracion: faltan })
  try {
    const body = leerBody(req)
    if (body.accion === 'login') {
      if (!(await verificarPin(body.pin))) return responder(res, 401, { error: 'PIN incorrecto' })
      return responder(res, 200, await crearSesion(body.quien))
    }
    const token = String(req.headers?.authorization || '').replace(/^Bearer\s+/i, '')
    const sesion = await leerSesion(token)
    if (!sesion) return responder(res, 401, { error: 'La sesión venció. Ingresá el PIN de nuevo.', sesion: false })
    const [status, data] = await ejecutar(body.accion, body, sesion)
    responder(res, status, data)
  } catch (e) {
    if (e instanceof ErrorUsuario) return responder(res, 400, { error: e.message })
    if (e.status === 403 || e.status === 404) return responder(res, 502, { error: mensajeError(e, 'del local') })
    console.error(e); responder(res, 500, { error: e.message })
  }
}
