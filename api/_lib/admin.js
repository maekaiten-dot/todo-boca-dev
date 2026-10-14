// api/_lib/admin.js
// Administración (finanzas del local, cuentas con la familia, ahorros).
// Vive en una planilla PROPIA ("TODO BOCA – Administración") con una cuenta de servicio PROPIA,
// que la app del local no conoce: la clave que viaja en el navegador (VITE_*) no puede abrirla.
// Todo pasa por /api/admin y exige una sesión abierta con el PIN de administración.
//
// Variables de entorno (Vercel → Settings → Environment Variables):
//   ADMIN_SHEET_ID               ID de la planilla de Administración
//   ADMIN_GOOGLE_CLIENT_EMAIL    email de la cuenta de servicio nueva
//   ADMIN_GOOGLE_PRIVATE_KEY     clave privada de esa cuenta
//   ADMIN_PIN                    PIN para entrar (distinto del de fichadas)
//   ADMIN_SECRET                 texto al azar de 32+ caracteres para firmar las sesiones
// La cuenta nueva también tiene que tener acceso a la planilla del local (VITE_SHEET_ID)
// para leer ventas y pagos.
import { crearSheets } from './google.js'

const enc = new TextEncoder()
const b64url = (buf) => Buffer.from(buf).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
const fromB64url = (s) => Buffer.from(String(s).replace(/-/g, '+').replace(/_/g, '/'), 'base64')
export const esperar = (ms) => new Promise(r => setTimeout(r, ms))

export const SESION_MS = 12 * 3600 * 1000

const VARS = ['ADMIN_SHEET_ID', 'ADMIN_GOOGLE_CLIENT_EMAIL', 'ADMIN_GOOGLE_PRIVATE_KEY', 'ADMIN_PIN', 'ADMIN_SECRET']
export function variablesFaltantes() {
  const env = process.env
  const faltan = VARS.filter(v => !env[v])
  if (env.ADMIN_SECRET && env.ADMIN_SECRET.length < 32) faltan.push('ADMIN_SECRET (mínimo 32 caracteres)')
  if (!env.VITE_SHEET_ID) faltan.push('VITE_SHEET_ID')
  return faltan
}

function cuenta() {
  const env = process.env
  const email = env.ADMIN_GOOGLE_CLIENT_EMAIL
  const key = env.ADMIN_GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n')
  if (!email || !key) throw new Error('Faltan ADMIN_GOOGLE_CLIENT_EMAIL / ADMIN_GOOGLE_PRIVATE_KEY')
  return { email, key }
}

// Planilla de Administración y planilla del local, las dos con la cuenta de servicio de Administración
export const admin = crearSheets(() => {
  if (!process.env.ADMIN_SHEET_ID) throw new Error('Falta ADMIN_SHEET_ID')
  return { sheetId: process.env.ADMIN_SHEET_ID, ...cuenta() }
})
export const local = crearSheets(() => ({ sheetId: process.env.VITE_SHEET_ID, ...cuenta() }))

// ── PIN y sesión ───────────────────────────────────────────────────────────
export async function verificarPin(pin) {
  const esperado = process.env.ADMIN_PIN
  if (!esperado) throw new Error('Falta la variable ADMIN_PIN')
  const a = enc.encode(String(pin || ''))
  const b = enc.encode(esperado)
  let ok = a.length === b.length
  for (let i = 0; i < b.length; i++) ok = ok && a[i] === b[i]
  if (!ok) await esperar(1500) // frena los intentos de adivinar el PIN
  return ok
}

async function hmacKey() {
  const secreto = process.env.ADMIN_SECRET
  if (!secreto || secreto.length < 32) throw new Error('Falta ADMIN_SECRET (mínimo 32 caracteres)')
  return crypto.subtle.importKey('raw', enc.encode(secreto), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify'])
}

export async function crearSesion(quien, ahora = Date.now()) {
  const exp = ahora + SESION_MS
  const payload = b64url(JSON.stringify({ q: String(quien || '').slice(0, 40), exp }))
  const sig = await crypto.subtle.sign('HMAC', await hmacKey(), enc.encode(payload))
  return { token: `${payload}.${b64url(sig)}`, exp }
}

export async function leerSesion(token, ahora = Date.now()) {
  const [payload, sig] = String(token || '').split('.')
  if (!payload || !sig) return null
  const ok = await crypto.subtle.verify('HMAC', await hmacKey(), fromB64url(sig), enc.encode(payload))
  if (!ok) return null
  const datos = JSON.parse(fromB64url(payload).toString('utf8'))
  if (ahora > datos.exp) return null
  return { quien: datos.q, exp: datos.exp }
}

// ── Tablas de la planilla de Administración ───────────────────────────────
// Una fila por cosa que pasa. Los totales y saldos los calcula la app, no la planilla.
export const TABLAS = [
  { nombre: 'PERSONAS', desc: 'Personas y locales entre los que se mueve la plata',
    enc: ['ID', 'NOMBRE', 'TIPO', 'ROL', 'ACTIVO'],
    inicial: [
      ['P01', 'Adrián', 'PERSONA', 'HERMANO SOCIO', 'TRUE'],
      ['P02', 'Jorge', 'PERSONA', 'HERMANO SOCIO', 'TRUE'],
      ['P03', 'Kathy', 'PERSONA', 'HERMANA', 'TRUE'],
      ['P04', 'Euge', 'PERSONA', 'HERMANA', 'TRUE'],
      ['P05', 'Mamá', 'PERSONA', 'FAMILIA', 'TRUE'],
      ['P06', 'Flor', 'PERSONA', 'TARJETA', 'TRUE'],
      ['P07', 'Esquina', 'LOCAL', 'LOCAL PROPIO', 'TRUE'],
      ['P08', 'Mitad de cuadra', 'LOCAL', 'LOCAL DE MAMÁ', 'TRUE'],
    ] },
  { nombre: 'CONFIG', desc: 'Valores generales (alquiler, porcentaje de regalías)',
    enc: ['CLAVE', 'VALOR', 'DESCRIPCION'],
    inicial: [
      ['ALQUILER_USD', '1100', 'Alquiler mensual del local en dólares'],
      ['ALQUILER_DIA_MAX', '10', 'El blue se toma como el más alto entre el día 1 y el día de pago (máximo este día)'],
      ['REGALIAS_PORCENTAJE', '4', 'Porcentaje para cada hermano sobre (ventas − alquiler − sueldos)'],
      ['HOME_OFFICE_HORAS', '12', 'Horas de home office por mes, a tarifa común'],
      ['HOME_OFFICE_PERSONA', 'Adrián', 'Quién cobra el home office'],
    ] },
  { nombre: 'HORAS', desc: 'Horas trabajadas (por día o por quincena). TIPO: COMUN, PARTIDO, FERIADO o HOME OFFICE',
    enc: ['ID', 'PERSONA', 'DESDE', 'HASTA', 'HORAS', 'TIPO', 'LUGAR', 'NOTA', 'CARGADO', 'ANULADO'] },
  { nombre: 'TARIFAS', desc: 'Valor de la hora por persona y tipo, con fecha de vigencia',
    enc: ['PERSONA', 'TIPO', 'VALOR', 'VIGENTE DESDE', 'NOTA'],
    inicial: [
      ['Adrián', 'COMUN', '11000', '1/1/2026', 'Partido y feriado se pagan al doble'],
      ['Jorge', 'COMUN', '11000', '1/1/2026', 'Partido y feriado se pagan al doble'],
    ] },
  { nombre: 'PRODUCTOS 3D', desc: 'Catálogo de impresiones 3D con precio',
    enc: ['ID', 'PRODUCTO', 'PRECIO', 'VIGENTE DESDE', 'ACTIVO'] },
  { nombre: 'VENTAS 3D', desc: 'Impresiones 3D vendidas a cada local',
    enc: ['ID', 'FECHA', 'CLIENTE', 'PRODUCTO', 'CANTIDAD', 'PRECIO UNITARIO', 'TOTAL', 'ESTADO', 'FECHA COBRO', 'NOTA', 'ANULADO'] },
  { nombre: 'PROPIEDADES', desc: 'Direcciones con servicios y a cargo de quién están',
    enc: ['ID', 'NOMBRE', 'A CARGO DE', 'SERVICIOS', 'ACTIVO', 'NOTA'] },
  { nombre: 'SERVICIOS', desc: 'Una fila por boleta de servicio',
    // MONTO = lo que se pagó de verdad (o el de la boleta mientras está A PAGAR); MONTO BOLETA = el que figuraba en la boleta
    enc: ['ID', 'MES', 'PROPIEDAD', 'SERVICIO', 'MONTO', 'VENCIMIENTO', 'PAGADO POR', 'FECHA PAGO', 'A CARGO DE', 'NOTA', 'ANULADO', 'LIQUIDADO EN', 'ESTADO', 'MONTO BOLETA'] },
  { nombre: 'TARJETA', desc: 'Consumos de tarjeta, con a cargo de quién',
    enc: ['ID', 'MES RESUMEN', 'TITULAR', 'FECHA', 'COMPROBANTE', 'DETALLE', 'CUOTA', 'PESOS', 'DOLARES', 'A CARGO DE', 'NOTA'] },
  { nombre: 'CUENTA CORRIENTE', desc: 'Quién le debe a quién: el libro central',
    enc: ['ID', 'FECHA', 'CUENTA', 'DEBE', 'A FAVOR DE', 'CONCEPTO', 'AMBITO', 'DETALLE', 'MONTO', 'MONEDA', 'TIPO CAMBIO', 'MONTO PESOS', 'ESTADO', 'FECHA PAGO', 'ORIGEN', 'NOTA', 'ANULADO'] },
  { nombre: 'CIERRES', desc: 'Un registro por mes con todos los números del cierre',
    enc: ['MES', 'FECHA CIERRE', 'VENTAS', 'DIA PAGO ALQUILER', 'DOLAR BLUE', 'ALQUILER USD', 'ALQUILER PESOS', 'SUELDO ADRIAN', 'SUELDO JORGE', 'BASE REGALIAS', 'PORCENTAJE', 'REGALIA POR HERMANO', 'SERVICIOS MAMA', 'NETO MAMA', 'REINTEGRO TARJETA', 'CERRADO POR', 'NOTA'] },
  { nombre: 'AHORROS', desc: 'Movimientos de ahorros e inversiones del local',
    enc: ['ID', 'FECHA', 'ACTIVO', 'TIPO', 'OPERACION', 'CANTIDAD', 'PRECIO', 'MONEDA', 'MONTO', 'DONDE', 'NOTA', 'ANULADO'] },
]

const col = n => { let s = ''; n++; while (n) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26) } return s }

// Crea las pestañas que falten (con encabezados y datos iniciales), agrega columnas nuevas al final
// de los encabezados existentes, completa claves nuevas de CONFIG y cuenta las filas de cada tabla.
export async function prepararTablas() {
  const out = []
  for (const t of TABLAS) {
    const creada = await admin.asegurarHoja(t.nombre, t.enc)
    if (!creada) {
      const enc = (await admin.sheetsGet(`${t.nombre}!A1:Z1`))[0] || []
      if (enc.length < t.enc.length && enc.every((h, i) => h === t.enc[i])) await admin.sheetsUpdate(`${t.nombre}!A1`, [t.enc])
    }
    const filasA = await admin.sheetsGet(`${t.nombre}!A2:A`)
    let filas = filasA.filter(r => r[0]).length
    if (filas === 0 && t.inicial?.length) {
      await admin.sheetsUpdate(`${t.nombre}!A2:${col(t.enc.length - 1)}${t.inicial.length + 1}`, t.inicial)
      filas = t.inicial.length
    } else if (t.nombre === 'CONFIG') {
      const claves = new Set(filasA.map(r => r[0]))
      const faltan = t.inicial.filter(r => !claves.has(r[0]))
      if (faltan.length) { await admin.sheetsAppend('CONFIG!A1', faltan); filas += faltan.length }
    }
    out.push({ nombre: t.nombre, desc: t.desc, filas, creada })
  }
  return out
}

// Se prepara una vez por instancia del servidor
let _listo = null
export function listo() {
  if (!_listo) _listo = prepararTablas().catch(e => { _listo = null; throw e })
  return _listo
}

// ── Fecha y hora de Argentina, IDs ─────────────────────────────────────────
export function ahoraAR(ms = Date.now()) {
  const d = new Date(ms - 3 * 3600000)
  const p = n => String(n).padStart(2, '0')
  return {
    fecha: `${d.getUTCDate()}/${d.getUTCMonth() + 1}/${d.getUTCFullYear()}`,
    hora: `${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`,
    clave: `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}`,
    compacta: `${String(d.getUTCFullYear()).slice(2)}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}`,
  }
}
export function nuevoId(prefijo, existentes, n = 1) {
  const base = `${prefijo}${ahoraAR().compacta}-`
  const usados = new Set(existentes)
  const ids = []
  let i = 1
  while (ids.length < n) { const id = base + String(i).padStart(3, '0'); if (!usados.has(id)) ids.push(id); i++ }
  return ids
}

// ── Lectura de tablas ──────────────────────────────────────────────────────
import { parseFecha, parsePrecio } from './cierre.js'
const esTrue = v => String(v).toUpperCase() === 'TRUE'
const clave = f => parseFecha(f)?.clave || ''

export async function getConfig() {
  const filas = await admin.sheetsGet('CONFIG!A2:B')
  const c = Object.fromEntries(filas.filter(r => r[0]).map(r => [r[0], r[1] ?? '']))
  return {
    alquilerUsd: parsePrecio(c.ALQUILER_USD) || 1100,
    alquilerDiaMax: Number(c.ALQUILER_DIA_MAX) || 10,
    porcentaje: Number(String(c.REGALIAS_PORCENTAJE || '4').replace(',', '.')) || 4,
    homeOffice: { persona: c.HOME_OFFICE_PERSONA || 'Adrián', horas: Number(String(c.HOME_OFFICE_HORAS ?? '12').replace(',', '.')) || 0 },
  }
}
export async function getPersonas() {
  return (await admin.sheetsGet('PERSONAS!A2:E')).filter(r => r[0] && r[1]).map(r => ({ id: r[0], nombre: r[1], tipo: r[2] || '', rol: r[3] || '', activo: r[4] !== 'FALSE' }))
}
export async function getTarifas() {
  return (await admin.sheetsGet('TARIFAS!A2:E')).filter(r => r[0]).map((r, i) => ({ fila: i + 2, persona: r[0], tipo: r[1] || 'COMUN', valor: parsePrecio(r[2]), desdeTxt: r[3] || '', desde: clave(r[3]), nota: r[4] || '' }))
}
export async function getHoras() {
  return (await admin.sheetsGet('HORAS!A2:J')).map((r, i) => ({
    fila: i + 2, id: r[0], persona: r[1] || '', desdeTxt: r[2] || '', hastaTxt: r[3] || '', desde: clave(r[2]), hasta: clave(r[3] || r[2]),
    horas: Number(String(r[4] || '0').replace(',', '.')) || 0, tipo: r[5] || 'COMUN', lugar: r[6] || '', nota: r[7] || '', cargado: r[8] || '', anulado: esTrue(r[9]),
  })).filter(h => h.id)
}
export async function getServicios() {
  return (await admin.sheetsGet('SERVICIOS!A2:N')).map((r, i) => ({
    fila: i + 2, id: r[0], mes: r[1] || '', propiedad: r[2] || '', servicio: r[3] || '', monto: parsePrecio(r[4]), vencimiento: r[5] || '',
    pagadoPor: r[6] || '', fechaPago: r[7] || '', aCargoDe: r[8] || '', nota: r[9] || '', anulado: esTrue(r[10]), liquidadoEn: r[11] || '',
    // las boletas cargadas antes de existir ESTADO se cargaban ya pagadas
    estado: r[12] || (r[7] ? 'PAGADA' : 'A PAGAR'), montoBoleta: parsePrecio(r[13]) || parsePrecio(r[4]),
  })).filter(s => s.id)
}
export async function getCuenta() {
  return (await admin.sheetsGet('CUENTA CORRIENTE!A2:Q')).map((r, i) => ({
    fila: i + 2, id: r[0], fecha: r[1] || '', cuenta: r[2] || '', debe: r[3] || '', aFavorDe: r[4] || '', concepto: r[5] || '', ambito: r[6] || '',
    detalle: r[7] || '', monto: parsePrecio(r[8]), moneda: r[9] || 'ARS', tipoCambio: parsePrecio(r[10]), montoPesos: parsePrecio(r[11]),
    estado: r[12] || 'PENDIENTE', fechaPago: r[13] || '', origen: r[14] || '', nota: r[15] || '', anulado: esTrue(r[16]),
  })).filter(m => m.id)
}
export async function getCierres() {
  return (await admin.sheetsGet('CIERRES!A2:Q')).map((r, i) => ({
    fila: i + 2, mes: r[0], fechaCierre: r[1] || '', ventas: parsePrecio(r[2]), diaPago: r[3] || '', blue: parsePrecio(r[4]), alquilerUsd: parsePrecio(r[5]),
    alquilerPesos: parsePrecio(r[6]), sueldoAdrian: parsePrecio(r[7]), sueldoJorge: parsePrecio(r[8]), base: parsePrecio(r[9]), porcentaje: Number(r[10]) || 0,
    porHermano: parsePrecio(r[11]), serviciosMama: parsePrecio(r[12]), netoMama: parsePrecio(r[13]), reintegroTarjeta: parsePrecio(r[14]), cerradoPor: r[15] || '', nota: r[16] || '',
  })).filter(c => c.mes)
}
