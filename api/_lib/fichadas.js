// api/_lib/fichadas.js
// Lógica compartida de las fichadas: tokens de vinculación, firmas de los
// celulares y lectura de las pestañas DISPOSITIVOS y FICHADAS.
import { sheetsGet, asegurarHoja } from './google.js'

export const HOJA_DISP = 'DISPOSITIVOS'
export const HOJA_FICH = 'FICHADAS'
export const ENC_DISP = ['ID_DISPOSITIVO', 'ID_USUARIO', 'NOMBRE', 'CLAVE_PUBLICA', 'FECHA_ALTA', 'ACTIVO', 'NAVEGADOR', 'ID_VINCULACION']
export const ENC_FICH = ['ID_FICHADA', 'ID_USUARIO', 'NOMBRE', 'FECHA', 'HORA', 'TIPO', 'VALIDO', 'MOTIVO', 'ID_DISPOSITIVO', 'TS_QR', 'DESFASE_SEG']

export const QR_PREFIJO = 'TBF1'
export const QR_VENTANA_MS = 30_000        // un QR vale como máximo 30 s
export const DUPLICADO_MS = 10 * 60_000    // dos fichadas válidas en menos de 10 min = la misma
export const VINCULACION_MS = 10 * 60_000  // el QR de vinculación dura 10 min

const enc = new TextEncoder()
export const b64url = (buf) => Buffer.from(buf).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
export const fromB64url = (s) => Buffer.from(String(s).replace(/-/g, '+').replace(/_/g, '/'), 'base64')
export const randomId = (bytes = 8) => Buffer.from(crypto.getRandomValues(new Uint8Array(bytes))).toString('hex')

// ── Respuestas HTTP ────────────────────────────────────────────────────────
export function leerBody(req) {
  if (!req.body) return {}
  if (typeof req.body === 'string') { try { return JSON.parse(req.body) } catch { return {} } }
  return req.body
}
export function responder(res, status, data) {
  res.setHeader('Cache-Control', 'no-store')
  res.status(status).json(data)
}
export const esperar = (ms) => new Promise(r => setTimeout(r, ms))

// ── PIN de admin (solo en el servidor) ─────────────────────────────────────
export async function verificarPinAdmin(pin) {
  const esperado = process.env.FICHADAS_ADMIN_PIN
  if (!esperado) throw new Error('Falta la variable FICHADAS_ADMIN_PIN')
  const a = enc.encode(String(pin || ''))
  const b = enc.encode(esperado)
  let ok = a.length === b.length
  for (let i = 0; i < b.length; i++) ok = ok && a[i] === b[i]
  if (!ok) await esperar(1500) // frena los intentos de adivinar el PIN
  return ok
}

// ── Token de vinculación (HMAC con secreto del servidor) ───────────────────
async function hmacKey() {
  const secreto = process.env.FICHADAS_SECRET
  if (!secreto || secreto.length < 32) throw new Error('Falta FICHADAS_SECRET (mínimo 32 caracteres)')
  return crypto.subtle.importKey('raw', enc.encode(secreto), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify'])
}

export async function crearTokenVinculacion({ idUsuario, nombre }, ahora = Date.now()) {
  const payload = b64url(JSON.stringify({ u: idUsuario, n: nombre, exp: ahora + VINCULACION_MS, jti: randomId(8) }))
  const sig = await crypto.subtle.sign('HMAC', await hmacKey(), enc.encode(payload))
  return `${payload}.${b64url(sig)}`
}

export async function leerTokenVinculacion(token, ahora = Date.now()) {
  const [payload, sig] = String(token || '').split('.')
  if (!payload || !sig) return { error: 'Código de vinculación inválido' }
  const ok = await crypto.subtle.verify('HMAC', await hmacKey(), fromB64url(sig), enc.encode(payload))
  if (!ok) return { error: 'Código de vinculación inválido' }
  const datos = JSON.parse(fromB64url(payload).toString('utf8'))
  if (ahora > datos.exp) return { error: 'El código de vinculación venció. Generá uno nuevo.' }
  return { datos }
}

// ── QR firmado por el celular ──────────────────────────────────────────────
// Formato: TBF1.<idDispositivo>.<timestamp ms>.<firma ECDSA P-256 base64url>
export function parsearQr(texto) {
  const partes = String(texto || '').trim().split('.')
  if (partes.length !== 4 || partes[0] !== QR_PREFIJO) return null
  const [, idDispositivo, ts, firma] = partes
  if (!/^[0-9a-f]{16}$/.test(idDispositivo) || !/^\d{13}$/.test(ts)) return null
  return { idDispositivo, ts: Number(ts), firma, mensaje: `${QR_PREFIJO}.${idDispositivo}.${ts}` }
}

export async function verificarFirma(clavePublicaJwk, mensaje, firma) {
  try {
    const clave = await crypto.subtle.importKey('jwk', clavePublicaJwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify'])
    return await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, clave, fromB64url(firma), enc.encode(mensaje))
  } catch { return false }
}

// ── Lectura de las pestañas ────────────────────────────────────────────────
export async function getDispositivos() {
  await asegurarHoja(HOJA_DISP, ENC_DISP)
  const filas = await sheetsGet(`${HOJA_DISP}!A2:H`)
  return filas.map((r, i) => ({
    fila: i + 2, idDispositivo: r[0] || '', idUsuario: r[1] || '', nombre: r[2] || '',
    clavePublica: r[3] || '', fechaAlta: r[4] || '', activo: String(r[5]).toUpperCase() === 'TRUE',
    navegador: r[6] || '', idVinculacion: r[7] || '',
  }))
}

export async function getFichadas() {
  await asegurarHoja(HOJA_FICH, ENC_FICH)
  const filas = await sheetsGet(`${HOJA_FICH}!A2:K`)
  return filas.map(r => ({
    id: r[0] || '', idUsuario: r[1] || '', nombre: r[2] || '', fecha: r[3] || '', hora: r[4] || '',
    tipo: r[5] || '', valido: String(r[6]).toUpperCase() === 'TRUE', motivo: r[7] || '',
    idDispositivo: r[8] || '', tsQr: Number(r[9]) || 0,
  }))
}

// ── Fecha y hora de Argentina (siempre la del servidor) ────────────────────
export function fechaHoraAR(ms = Date.now()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
    timeZone: 'America/Argentina/Buenos_Aires', year: 'numeric', month: 'numeric', day: 'numeric',
    hour: 'numeric', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date(ms)).map(x => [x.type, x.value]))
  return { fecha: `${Number(p.day)}/${Number(p.month)}/${p.year}`, hora: `${Number(p.hour)}:${p.minute}:${p.second}` }
}
