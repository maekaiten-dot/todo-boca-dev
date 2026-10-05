// src/api/fichadas.js
// Lado navegador de las fichadas: llaves no exportables guardadas en el
// dispositivo (IndexedDB) y llamadas a las funciones /api/fichadas/*.

const DB_NOMBRE = 'tb_fichadas'
const STORE = 'llaves'
export const CLAVE_CELULAR = 'celular'
export const CLAVE_TERMINAL = 'terminal'
export const QR_ROTACION_MS = 10_000

// ── IndexedDB mínimo ───────────────────────────────────────────────────────
function abrirDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NOMBRE, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(STORE)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}
async function dbOp(modo, fn) {
  const db = await abrirDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, modo)
    const req = fn(tx.objectStore(STORE))
    tx.oncomplete = () => resolve(req?.result)
    tx.onerror = () => reject(tx.error)
  })
}
export const leerLlave = (nombre) => dbOp('readonly', s => s.get(nombre)).catch(() => null)
const guardarLlave = (nombre, valor) => dbOp('readwrite', s => s.put(valor, nombre))
export const borrarLlave = (nombre) => dbOp('readwrite', s => s.delete(nombre))

// ── Criptografía ───────────────────────────────────────────────────────────
const b64url = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')

// La llave privada se crea con extractable:false: el navegador la usa para
// firmar pero no deja leerla ni copiarla a otro teléfono.
async function crearParDeLlaves() {
  const par = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign', 'verify'])
  const jwk = await crypto.subtle.exportKey('jwk', par.publicKey)
  return { privateKey: par.privateKey, clavePublica: { kty: jwk.kty, crv: jwk.crv, x: jwk.x, y: jwk.y } }
}
async function firmar(privateKey, texto) {
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, privateKey, new TextEncoder().encode(texto))
  return b64url(sig)
}

// ── Reloj corregido con la hora del servidor ───────────────────────────────
let _desfase = 0
export async function sincronizarHora() {
  try {
    const t0 = Date.now()
    const { ahora } = await llamar('/api/fichadas/hora', null, 'GET')
    const t1 = Date.now()
    _desfase = ahora - (t0 + t1) / 2
  } catch { /* sin conexión: se usa el reloj del dispositivo */ }
  return _desfase
}
export const ahoraServidor = () => Math.round(Date.now() + _desfase)

// ── HTTP ───────────────────────────────────────────────────────────────────
async function llamar(url, body, method = 'POST') {
  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })
  let data = {}
  try { data = await res.json() } catch { /* respuesta vacía */ }
  if (!res.ok && !('ok' in data)) throw new Error(data.error || `Error ${res.status}`)
  return data
}

// ── Celular de la empleada ─────────────────────────────────────────────────
export async function vincularCelular(token) {
  const { privateKey, clavePublica } = await crearParDeLlaves()
  const r = await llamar('/api/fichadas/vincular', { token, clavePublica, navegador: navigator.userAgent })
  const datos = { privateKey, idDispositivo: r.idDispositivo, idUsuario: r.idUsuario, nombre: r.nombre, vinculado: new Date().toISOString() }
  await guardarLlave(CLAVE_CELULAR, datos)
  return datos
}

export async function generarQrFichada(llave) {
  const ts = ahoraServidor()
  const mensaje = `TBF1.${llave.idDispositivo}.${ts}`
  return `${mensaje}.${await firmar(llave.privateKey, mensaje)}`
}

// ── Tablet del local (terminal) ────────────────────────────────────────────
export async function vincularTerminal(pin, nombre) {
  const { privateKey, clavePublica } = await crearParDeLlaves()
  const r = await llamar('/api/fichadas/terminal', { pin, clavePublica, nombre, navegador: navigator.userAgent })
  const datos = { privateKey, idDispositivo: r.idDispositivo, nombre, vinculado: new Date().toISOString() }
  await guardarLlave(CLAVE_TERMINAL, datos)
  return datos
}

export async function registrarFichada(qr) {
  const term = await leerLlave(CLAVE_TERMINAL)
  if (!term) return { ok: false, error: 'Esta tablet no está habilitada para fichar' }
  await sincronizarHora()
  const ts = ahoraServidor()
  const firma = await firmar(term.privateKey, `TBT1.${term.idDispositivo}.${ts}.${qr}`)
  try { return await llamar('/api/fichadas/registrar', { qr, terminal: { id: term.idDispositivo, ts, firma } }) }
  catch (e) { return { ok: false, error: e.message } }
}

// ── Admin ──────────────────────────────────────────────────────────────────
export const iniciarVinculacion = (pin, idUsuario, nombre) => llamar('/api/fichadas/vincular-inicio', { pin, idUsuario, nombre })
export const listarDispositivos = (pin) => llamar('/api/fichadas/dispositivos', { pin })
export const darDeBajaDispositivo = (pin, id) => llamar('/api/fichadas/dispositivos', { pin, baja: id })

// ¿Sigue activo este celular? Devuelve null si no se pudo consultar (sin internet).
export async function estadoCelular(idDispositivo) {
  try { return (await llamar('/api/fichadas/estado', { idDispositivo })).activo }
  catch { return null }
}

// En iPhone, el ícono de la pantalla de inicio tiene datos separados de Safari:
// hay que vincular desde el ícono, no desde Safari.
export const esIphone = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
export const esIconoInicio = () => window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true

// Pide al navegador que no borre estos datos por falta de espacio (Chrome lo concede
// a los sitios agregados a la pantalla de inicio o de uso frecuente).
export async function pedirAlmacenamientoPersistente() {
  try { if (navigator.storage?.persist && !(await navigator.storage.persisted())) await navigator.storage.persist() }
  catch { /* no soportado */ }
}
