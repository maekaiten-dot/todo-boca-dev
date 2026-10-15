// src/api/admin.js
// Cliente de /api/admin. La planilla de Administración NO se lee desde el navegador:
// todo pasa por el servidor, que pide una sesión abierta con el PIN de administración.
const CLAVE_SESION = 'tb_admin_sesion'

export function getSesion() {
  try {
    const s = JSON.parse(localStorage.getItem(CLAVE_SESION) || 'null')
    return s && s.token && s.exp > Date.now() ? s : null
  } catch { return null }
}
export function cerrarSesion() { try { localStorage.removeItem(CLAVE_SESION) } catch {} }

export class ErrorSesion extends Error {}

async function llamar(accion, datos = {}, token) {
  const res = await fetch('/api/admin', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify({ accion, ...datos }),
  })
  let data = {}
  try { data = await res.json() } catch { /* respuesta vacía */ }
  if (res.status === 401 && accion !== 'login') { cerrarSesion(); throw new ErrorSesion(data.error || 'La sesión venció') }
  if (!res.ok) { const e = new Error(data.error || `Error ${res.status}`); e.configuracion = data.configuracion; throw e }
  return data
}

// El PIN identifica a la persona (cada administrador tiene el suyo)
export async function ingresar(pin) {
  const s = await llamar('login', { pin })
  const sesion = { token: s.token, exp: s.exp, quien: s.quien }
  try { localStorage.setItem(CLAVE_SESION, JSON.stringify(sesion)) } catch {}
  return sesion
}

// Acción con sesión (la mayoría)
export function pedirAdmin(accion, datos) {
  const s = getSesion()
  if (!s) return Promise.reject(new ErrorSesion('Ingresá el PIN de administración'))
  return llamar(accion, datos, s.token)
}
