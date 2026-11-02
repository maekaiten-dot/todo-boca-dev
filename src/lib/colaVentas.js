// src/lib/colaVentas.js
// Cola de ventas del MODO PARTIDO: al cerrar la venta, el carrito se libera enseguida y la venta
// queda en esta cola, que se guarda en la planilla en segundo plano y en orden.
//  · La cola vive en el dispositivo (localStorage): si se corta internet o se recarga la página,
//    las ventas no se pierden y se guardan cuando vuelve la conexión.
//  · Cada venta lleva una clave única (uid): si se guardó pero no llegó la respuesta, al reintentar
//    no se carga dos veces.
//  · Si una venta no se puede guardar por un problema que no es de conexión, queda marcada con el
//    error para que un admin la revise (no se descarta sola).
import { registrarVenta, registrarLog, nuevoUid } from '../api/sheets.js'

const CLAVE = 'tb_cola_ventas_v1'
const ERRORES_DE_DATOS = new Set(['PROMO_XXXL_CAMBIO', 'TOTAL_NO_COINCIDE', 'CAMBIO_SALDO_A_FAVOR', 'PAGOS_MONTO', 'PAGOS_INVALIDOS', 'FECHA_INVALIDA', 'SOCIO_NO_APLICA'])
const ESPERAS = [2000, 5000, 10000, 20000]   // entre reintentos (como mucho 20 s)

let cola = leer()
let guardando = false
let ultimoGuardado = null        // { idVenta, uid }
let proximoIntento = null
const oyentes = new Set()

function leer() {
  try { return JSON.parse(localStorage.getItem(CLAVE) || '[]') } catch { return [] }
}
function escribir() {
  try { localStorage.setItem(CLAVE, JSON.stringify(cola)) } catch (e) { console.warn('No se pudo guardar la cola', e) }
}
function avisar() {
  const e = estadoCola()
  oyentes.forEach(f => { try { f(e) } catch {} })
}

export function estadoCola() {
  return {
    pendientes: cola.filter(v => !v.error).length,
    conError: cola.filter(v => v.error).map(v => ({ uid: v.uid, error: v.error, resumen: v.resumen, creada: v.creada })),
    guardando, ultimoGuardado,
    sinConexion: cola.some(v => !v.error && v.intentos > 0),
  }
}
export function escucharCola(f) { oyentes.add(f); f(estadoCola()); return () => oyentes.delete(f) }

// params: lo mismo que recibe registrarVenta. resumen: texto corto para mostrar si hay un problema.
export function encolarVenta(params, resumen = '') {
  const ahora = new Date().toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', hour12: false })
  const [fecha, hora] = ahora.split(', ')
  const v = { uid: nuevoUid(), params: { ...params, momento: { fecha, hora } }, resumen, creada: `${fecha} ${hora.slice(0, 5)}`, intentos: 0, error: '' }
  v.params.uid = v.uid
  cola = [...leer().filter(x => x.uid !== v.uid), v]
  escribir(); avisar()
  procesarCola()
  return v.uid
}

export function reintentarVenta(uid) {
  cola = leer().map(v => v.uid === uid ? { ...v, error: '', intentos: 0 } : v)
  escribir(); avisar(); procesarCola()
}
export function descartarVenta(uid, quien = '') {
  const v = leer().find(x => x.uid === uid)
  cola = leer().filter(x => x.uid !== uid)
  escribir(); avisar()
  if (v) registrarLog({ accion: 'VENTA_COLA_DESCARTADA', detalle: `${v.resumen} · cobrada ${v.creada} · error: ${v.error}`, empleado: quien, resultado: 'ERROR' })
}

// Guarda de a una, en orden. En el mismo dispositivo, una sola pestaña guarda a la vez.
export function procesarCola() {
  if (guardando) return
  const correr = async () => {
    guardando = true; avisar()
    try {
      for (;;) {
        cola = leer()
        const v = cola.find(x => !x.error)
        if (!v) break
        try {
          const idVenta = await registrarVenta(v.params)
          cola = leer().filter(x => x.uid !== v.uid)
          ultimoGuardado = { idVenta, uid: v.uid }
          escribir(); avisar()
        } catch (e) {
          const msg = e?.message || 'Error desconocido'
          cola = leer().map(x => x.uid === v.uid ? { ...x, intentos: x.intentos + 1, ...(ERRORES_DE_DATOS.has(msg) ? { error: msg } : {}) } : x)
          escribir(); avisar()
          if (ERRORES_DE_DATOS.has(msg)) {
            registrarLog({ accion: 'VENTA_COLA_ERROR', detalle: `${v.resumen} · ${msg}`, resultado: 'ERROR' })
            continue
          }
          // Conexión: se espera un rato y se vuelve a probar
          const n = cola.find(x => x.uid === v.uid)?.intentos || 1
          clearTimeout(proximoIntento)
          proximoIntento = setTimeout(procesarCola, ESPERAS[Math.min(n - 1, ESPERAS.length - 1)])
          break
        }
      }
    } finally { guardando = false; avisar() }
  }
  if (globalThis.navigator?.locks?.request) navigator.locks.request('tb-cola-ventas', { ifAvailable: true }, lock => lock ? correr() : null)
  else correr()
}

// Al volver la conexión o al volver a la app, se sigue
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => procesarCola())
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') procesarCola() })
  window.addEventListener('storage', e => { if (e.key === CLAVE) { cola = leer(); avisar() } })
}
