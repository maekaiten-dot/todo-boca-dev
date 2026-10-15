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
//   tarjeta                                            → { consumos, tarjetas }
//   tarjeta.agregar     { tarjeta, titular, fecha, detalle, moneda: 'ARS'|'USD', monto, cuotas, mesResumen, nota }
//                       (en cuotas crea una fila por cuota, cada una en su mes de resumen)
//   tarjeta.anular      { id }
//   tarjeta.reintegrar  { mesResumen }  → pagos pendientes del local a cada titular (pesos y dólares por separado)
//   3d                                                 → { productos, ventas }   (lo de Mitad de cuadra, solo Adrián)
//   3d.producto         { producto, precio, desde }    (producto nuevo o aumento)
//   3d.agregar          { fecha, cliente, items: [{ producto, cantidad }], nota }
//   3d.anular           { id }
//   3d.liquidar         { ids }        Esquina: crea el pago pendiente del local a Adrián
//   3d.cobrar           { ids, fecha } Mitad de cuadra: marca cobradas (solo Adrián)
//   mdc                                                → cuenta Esquina ↔ Mitad de cuadra: saldo, mercadería de Pagos y movimientos
//   mdc.agregar         { tipo, fecha, detalle, monto | cantidad+precio, medio }
//   mdc.anular          { id }
//   cuentas                                            → { movimientos, cierres }
//   cuentas.pagar       { ids, fecha }
import {
  admin, local, variablesFaltantes, verificarPin, crearSesion, leerSesion, prepararTablas, listo, ahoraAR, nuevoId,
  getConfig, getPersonas, getTarifas, getHoras, getServicios, getCuenta, getCierres, getTarjeta, getProductos3D, getVentas3D,
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
const MDC = 'Mitad de cuadra'
const PROVEEDORES_MDC = ['mitad de cuadra', 'mamá', 'mama'] // cómo figura Mitad de cuadra en Pagos
const CUENTA_MDC = 'Esquina ↔ Mitad de cuadra'
// Tipos de movimiento de la cuenta con Mitad de cuadra. "a favor de Mitad de cuadra" = el local le debe más
const TIPOS_MDC = {
  MERCADERIA: { concepto: 'MERCADERIA', debe: MDC, aFavor: 'Esquina' },     // Mitad de cuadra se llevó mercadería de la Esquina
  COBERTURA: { concepto: 'COBERTURA', debe: MDC, aFavor: 'Esquina' },       // una empleada de la Esquina trabajó en Mitad de cuadra
  PAGO_ESQUINA: { concepto: 'PAGO', debe: MDC, aFavor: 'Esquina' },         // el local le pagó a Mitad de cuadra
  PAGO_MDC: { concepto: 'PAGO', debe: 'Esquina', aFavor: MDC },             // Mitad de cuadra le pagó al local
  AJUSTE_MDC: { concepto: 'AJUSTE', debe: 'Esquina', aFavor: MDC },         // saldo inicial / ajuste: el local le debía
  AJUSTE_ESQ: { concepto: 'AJUSTE', debe: MDC, aFavor: 'Esquina' },         // saldo inicial / ajuste: Mitad de cuadra le debía
}
const puedeVerMdc = sesion => sesion.quien === 'Adrián'
const SOCIOS = ['Adrián', 'Jorge']
const LOCAL = 'Esquina'
const MAMA = 'Mamá'
const esMes = m => /^\d{4}-\d{2}$/.test(String(m || ''))
// Montos que vienen de la planilla del local (pueden venir como "$8.000" o como número)
const parsePrecioLocal = v => { const s = String(v ?? '').replace(/[^\d,.-]/g, ''); if (!s) return 0; const n = Number(s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : s.replace(/\.(?=\d{3}(\D|$))/g, '')); return Number.isFinite(n) ? n : 0 }
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

// ── Saldo corrido con Mitad de cuadra ──────────────────────────────────────
async function saldoMdc() {
  const [filasPagos, cuenta, config] = await Promise.all([local.sheetsGet('PAGOS!A2:O'), getCuenta(), getConfig()])
  const pagos = filasPagos.filter(r => r[0] && PROVEEDORES_MDC.includes(String(r[10] || '').trim().toLowerCase()) && String(r[14]).toUpperCase() !== 'TRUE').map(r => {
    const cant = Number(r[6]) || 0, cu = parsePrecioLocal(r[7]), total = parsePrecioLocal(r[8]) || cant * cu
    const pagado = String(r[12]).toUpperCase() === 'TRUE', montoPagado = parsePrecioLocal(r[11])
    return { id: r[0], fecha: r[2] || '', articulo: r[5] || r[9] || '', cantidad: cant, costoUnitario: cu, total, pagado, pendiente: pagado ? 0 : Math.max(0, total - montoPagado), sinPrecio: !(total > 0) }
  })
  const movimientos = cuenta.filter(m => !m.anulado && m.cuenta === CUENTA_MDC)
  const deudaMercaderia = pagos.reduce((t, p) => t + p.pendiente, 0)
  const aFavorMdc = movimientos.reduce((t, m) => t + (m.aFavorDe === MDC ? m.montoPesos : -m.montoPesos), 0)
  return {
    saldo: Math.round((deudaMercaderia + aFavorMdc) * 100) / 100, // > 0: el local le debe a Mitad de cuadra
    deudaMercaderia, aFavorMdc, pagos: pagos.filter(p => p.pendiente > 0 || p.sinPrecio), movimientos, coberturaDia: config.coberturaDia,
    sinPrecio: pagos.filter(p => p.sinPrecio).length,
  }
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
  if (accion === 'tarjeta') {
    const consumos = (await getTarjeta()).filter(t => !t.anulado)
    const tarjetas = [...new Map(consumos.map(t => [`${t.tarjeta}|${t.titular}`, { tarjeta: t.tarjeta, titular: t.titular }])).values()].filter(t => t.tarjeta)
    return [200, { consumos, tarjetas }]
  }
  if (accion === 'tarjeta.agregar') {
    const { tarjeta, titular = 'Adrián', fecha, detalle, moneda = 'ARS', monto, cuotas = 1, mesResumen, nota = '' } = body
    if (!String(tarjeta || '').trim()) fallar('Elegí con qué tarjeta se pagó')
    if (!SOCIOS.includes(titular)) fallar('Titular inválido')
    if (!String(detalle || '').trim()) fallar('Poné qué se compró')
    const f = parseFecha(fecha)
    if (!f) fallar('Fecha inválida')
    if (!['ARS', 'USD'].includes(moneda)) fallar('Moneda inválida')
    const m = num(monto)
    if (!(m > 0)) fallar('Monto inválido')
    const n = Math.round(Number(cuotas) || 1)
    if (n < 1 || n > 36) fallar('Cantidad de cuotas inválida')
    if (!esMes(mesResumen)) fallar('Elegí el mes del resumen')
    const ids = nuevoId('T', (await getTarjeta()).map(x => x.id), n)
    let mes = mesResumen
    const filas = []
    for (let k = 1; k <= n; k++) {
      filas.push([ids[k - 1], mes, titular, fechaAR(f.clave), '', String(detalle).trim().slice(0, 120), n > 1 ? `${k}/${n}` : '',
        moneda === 'ARS' ? m : '', moneda === 'USD' ? m : '', 'Local', String(nota).slice(0, 200), String(tarjeta).trim().slice(0, 40), '', 'FALSE'])
      mes = mesSiguiente(mes)
    }
    await admin.sheetsAppend('TARJETA!A1', filas)
    return [200, { ok: true, filas: n }]
  }
  if (accion === 'tarjeta.anular') {
    const t = (await getTarjeta()).find(x => x.id === body.id && !x.anulado)
    if (!t) fallar('No se encontró ese consumo')
    if (t.liquidadoEn) fallar(`Ese consumo ya se reintegró (${t.liquidadoEn})`)
    await admin.sheetsUpdate(`TARJETA!N${t.fila}`, [['TRUE']])
    return [200, { ok: true }]
  }
  if (accion === 'tarjeta.reintegrar') {
    const mes = body.mesResumen
    if (!esMes(mes)) fallar('Mes inválido')
    const delMes = (await getTarjeta()).filter(t => !t.anulado && !t.liquidadoEn && t.mesResumen === mes)
    if (!delMes.length) fallar(`No hay consumos sin reintegrar en el resumen de ${nombreMes(mes)}`)
    const origen = `TARJETA ${mes}`
    const { fecha } = ahoraAR()
    // un movimiento por titular y moneda
    const grupos = {}
    for (const t of delMes) {
      if (t.pesos) (grupos[`${t.titular}|ARS`] ||= { titular: t.titular, moneda: 'ARS', monto: 0, n: 0 }), grupos[`${t.titular}|ARS`].monto += t.pesos, grupos[`${t.titular}|ARS`].n++
      if (t.dolares) (grupos[`${t.titular}|USD`] ||= { titular: t.titular, moneda: 'USD', monto: 0, n: 0 }), grupos[`${t.titular}|USD`].monto += t.dolares, grupos[`${t.titular}|USD`].n++
    }
    const lista = Object.values(grupos)
    const ids = nuevoId('CC', (await getCuenta()).map(x => x.id), lista.length)
    const filas = lista.map((g, i) => [ids[i], fecha, `${LOCAL} ↔ ${g.titular}`, LOCAL, g.titular, 'REINTEGRO TARJETA', 'LOCAL',
      `Tarjeta: resumen de ${nombreMes(mes)} (${g.n} ${g.n === 1 ? 'consumo' : 'consumos'})`, Math.round(g.monto * 100) / 100, g.moneda, '',
      g.moneda === 'ARS' ? Math.round(g.monto * 100) / 100 : '', 'PENDIENTE', '', origen, '', 'FALSE'])
    await admin.sheetsAppend('CUENTA CORRIENTE!A1', filas)
    for (const t of delMes) await admin.sheetsUpdate(`TARJETA!M${t.fila}`, [[origen]])
    return [200, { ok: true, movimientos: filas.length }]
  }
  // ── Impresiones 3D ──
  if (accion === '3d') {
    const [productos, ventas] = await Promise.all([getProductos3D(), getVentas3D()])
    // precio vigente hoy de cada producto (la fila más nueva con fecha <= hoy)
    const hoy = ahoraAR().clave
    const vig = {}
    for (const p of productos.filter(x => x.desde <= hoy).sort((a, b) => a.desde.localeCompare(b.desde))) vig[p.producto.toLowerCase()] = p
    const lista = Object.values(vig).filter(p => p.activo).sort((a, b) => a.producto.localeCompare(b.producto))
    return [200, {
      productos: lista, verMdc: puedeVerMdc(sesion),
      ventas: ventas.filter(v => !v.anulado && (v.cliente !== MDC || puedeVerMdc(sesion))),
    }]
  }
  if (accion === '3d.producto') {
    const nombre = String(body.producto || '').trim()
    const v = num(body.precio)
    const fd = parseFecha(body.desde || ahoraAR().fecha)
    if (!nombre) fallar('Poné el nombre del producto')
    if (!(v > 0)) fallar('Precio inválido')
    if (!fd) fallar('Fecha inválida')
    const [id] = nuevoId('P3D', (await getProductos3D()).map(x => x.id))
    await admin.sheetsAppend('PRODUCTOS 3D!A1', [[id, nombre.slice(0, 80), v, fechaAR(fd.clave), 'TRUE']])
    return [200, { ok: true }]
  }
  if (accion === '3d.agregar') {
    const { fecha, cliente, items = [], nota = '' } = body
    if (!['Esquina', MDC].includes(cliente)) fallar('Elegí a quién le vendiste')
    if (cliente === MDC && !puedeVerMdc(sesion)) fallar('No tenés acceso a las ventas a Mitad de cuadra')
    const fd = parseFecha(fecha)
    if (!fd) fallar('Fecha inválida')
    const productos = await getProductos3D()
    const precioDe = nombre => productos.filter(p => p.producto.toLowerCase() === String(nombre).toLowerCase() && p.desde <= fd.clave)
      .sort((a, b) => b.desde.localeCompare(a.desde))[0]?.precio
    const validos = items.map(it => ({ producto: String(it.producto || '').trim(), cantidad: Number(it.cantidad) || 0 })).filter(it => it.producto && it.cantidad > 0)
    if (!validos.length) fallar('Cargá al menos una cantidad')
    const sinPrecio = validos.filter(it => !(precioDe(it.producto) > 0)).map(it => it.producto)
    if (sinPrecio.length) fallar(`No hay precio vigente para: ${sinPrecio.join(', ')}`)
    const ids = nuevoId('V3D', (await getVentas3D()).map(x => x.id), validos.length)
    await admin.sheetsAppend('VENTAS 3D!A1', validos.map((it, i) => {
      const pr = precioDe(it.producto)
      return [ids[i], fechaAR(fd.clave), cliente, it.producto, it.cantidad, pr, Math.round(pr * it.cantidad * 100) / 100, 'PENDIENTE', '', String(nota).slice(0, 200), 'FALSE', '']
    }))
    return [200, { ok: true, items: validos.length }]
  }
  if (accion === '3d.anular') {
    const v = (await getVentas3D()).find(x => x.id === body.id && !x.anulado)
    if (!v || (v.cliente === MDC && !puedeVerMdc(sesion))) fallar('No se encontró esa venta')
    if (v.estado !== 'PENDIENTE') fallar('Esa venta ya se liquidó o se cobró')
    await admin.sheetsUpdate(`VENTAS 3D!K${v.fila}`, [['TRUE']])
    return [200, { ok: true }]
  }
  if (accion === '3d.liquidar') {
    const ids = Array.isArray(body.ids) ? body.ids : []
    const sel = (await getVentas3D()).filter(v => ids.includes(v.id) && !v.anulado && v.estado === 'PENDIENTE' && v.cliente === 'Esquina')
    if (!sel.length) fallar('Elegí ventas a la Esquina pendientes')
    const total = Math.round(sel.reduce((t, v) => t + v.total, 0) * 100) / 100
    const { fecha } = ahoraAR()
    const [idCC] = nuevoId('CC', (await getCuenta()).map(x => x.id))
    const origen = `3D ${idCC}`
    const fechas = sel.map(v => parseFecha(v.fecha)?.clave).filter(Boolean).sort()
    const rango = fechas.length ? `${fechaAR(fechas[0])}${fechas[0] !== fechas[fechas.length - 1] ? ` al ${fechaAR(fechas[fechas.length - 1])}` : ''}` : ''
    await admin.sheetsAppend('CUENTA CORRIENTE!A1', [[idCC, fecha, `${LOCAL} ↔ Adrián`, LOCAL, 'Adrián', 'IMPRESIONES 3D', 'LOCAL',
      `Impresiones 3D (${sel.length} ${sel.length === 1 ? 'ítem' : 'ítems'}${rango ? `, ${rango}` : ''})`, total, 'ARS', '', total, 'PENDIENTE', '', origen, '', 'FALSE']])
    for (const v of sel) await admin.sheetsUpdate(`VENTAS 3D!H${v.fila}:I${v.fila}`, [['LIQUIDADA', fecha]]), await admin.sheetsUpdate(`VENTAS 3D!L${v.fila}`, [[origen]])
    return [200, { ok: true, total }]
  }
  if (accion === '3d.cobrar') {
    if (!puedeVerMdc(sesion)) fallar('No tenés acceso a las ventas a Mitad de cuadra')
    const ids = Array.isArray(body.ids) ? body.ids : []
    const fp = parseFecha(body.fecha) || parseFecha(ahoraAR().fecha)
    const sel = (await getVentas3D()).filter(v => ids.includes(v.id) && !v.anulado && v.estado === 'PENDIENTE' && v.cliente === MDC)
    if (!sel.length) fallar('Elegí ventas a Mitad de cuadra pendientes')
    for (const v of sel) await admin.sheetsUpdate(`VENTAS 3D!H${v.fila}:I${v.fila}`, [['COBRADA', fechaAR(fp.clave)]])
    return [200, { ok: true }]
  }

  // ── Cuenta Esquina ↔ Mitad de cuadra ──
  if (accion === 'mdc') return [200, await saldoMdc()]
  if (accion === 'mdc.agregar') {
    const t = TIPOS_MDC[body.tipo]
    if (!t) fallar('Tipo de movimiento inválido')
    const fd = parseFecha(body.fecha)
    if (!fd) fallar('Fecha inválida')
    let monto, detalle = String(body.detalle || '').trim()
    if (body.tipo === 'MERCADERIA' || body.tipo === 'COBERTURA') {
      const cant = numHoras(body.cantidad), pr = num(body.precio)
      if (!(cant > 0) || !(pr > 0)) fallar('Completá cantidad y precio')
      monto = Math.round(cant * pr * 100) / 100
      detalle = body.tipo === 'COBERTURA' ? `${detalle || 'Brenda'} en Mitad de cuadra: ${cant} ${cant === 1 ? 'día' : 'días'} × $${pr.toLocaleString('es-AR')}` : `${detalle}: ${cant} × $${pr.toLocaleString('es-AR')}`
      if (body.tipo === 'MERCADERIA' && !String(body.detalle || '').trim()) fallar('Poné qué mercadería se llevó')
    } else {
      monto = num(body.monto)
      if (!(monto > 0)) fallar('Monto inválido')
      const medio = body.medio ? ` (${body.medio})` : ''
      detalle = body.tipo === 'PAGO_ESQUINA' ? `El local le pagó a Mitad de cuadra${medio}${detalle ? ` · ${detalle}` : ''}`
        : body.tipo === 'PAGO_MDC' ? `Mitad de cuadra le pagó al local${medio}${detalle ? ` · ${detalle}` : ''}`
        : `Ajuste de saldo${detalle ? ` · ${detalle}` : ''}`
    }
    const [id] = nuevoId('CC', (await getCuenta()).map(x => x.id))
    await admin.sheetsAppend('CUENTA CORRIENTE!A1', [[id, fechaAR(fd.clave), CUENTA_MDC, t.debe, t.aFavor, t.concepto, 'LOCAL', detalle.slice(0, 200), monto, 'ARS', '', monto, 'REGISTRADO', '', `MDC ${sesion.quien || ''}`.trim(), '', 'FALSE']])
    return [200, { ok: true }]
  }
  if (accion === 'mdc.anular') {
    const m = (await getCuenta()).find(x => x.id === body.id && x.cuenta === CUENTA_MDC && !x.anulado)
    if (!m) fallar('No se encontró ese movimiento')
    await admin.sheetsUpdate(`CUENTA CORRIENTE!Q${m.fila}`, [['TRUE']])
    return [200, { ok: true }]
  }

  if (accion === 'cuentas') {
    const [movimientos, cierres, mdc] = await Promise.all([getCuenta(), getCierres(), saldoMdc().catch(() => null)])
    // la cuenta con Mitad de cuadra es un saldo corrido (se ve en su sección), no pagos pendientes;
    // acá solo va su saldo para el resumen por persona
    return [200, { movimientos: movimientos.filter(m => !m.anulado && m.estado !== 'REGISTRADO'), cierres, mdc: mdc && { saldo: mdc.saldo, sinPrecio: mdc.sinPrecio } }]
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
      const quien = await verificarPin(body.pin)
      if (!quien) return responder(res, 401, { error: 'PIN incorrecto' })
      return responder(res, 200, { ...(await crearSesion(quien)), quien })
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
