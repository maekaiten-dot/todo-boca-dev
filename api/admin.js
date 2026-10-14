// POST /api/admin  { accion, ... }
// Una sola función para toda la Administración (el plan gratis de Vercel limita la cantidad de funciones).
//   accion 'login'   { pin, quien }  → { token, exp }
//   accion 'estado'  (con sesión)    → { planilla, tablas, local }
// Todas las acciones salvo 'login' necesitan el header  Authorization: Bearer <token>
import { admin, local, variablesFaltantes, verificarPin, crearSesion, leerSesion, prepararTablas } from './_lib/admin.js'

function leerBody(req) {
  if (!req.body) return {}
  if (typeof req.body === 'string') { try { return JSON.parse(req.body) } catch { return {} } }
  return req.body
}
function responder(res, status, data) {
  res.setHeader('Cache-Control', 'no-store')
  res.status(status).json(data)
}

// Traduce los errores de Google a algo que se entienda en la pantalla
function mensajeError(e, planilla) {
  if (e.status === 403) return `La cuenta de servicio de Administración no tiene acceso a la planilla ${planilla}. Compartila con el email de la cuenta (como Editor).`
  if (e.status === 404) return `No se encontró la planilla ${planilla}. Revisá el ID cargado en Vercel.`
  return e.message
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

    if (body.accion === 'estado') {
      let planilla, tablas
      try {
        const meta = await admin.metadatos()
        planilla = meta.properties?.title || ''
        tablas = await prepararTablas()
      } catch (e) { return responder(res, 502, { error: mensajeError(e, 'de Administración') }) }
      let localInfo
      try {
        const meta = await local.metadatos()
        localInfo = { ok: true, titulo: meta.properties?.title || '', hojas: (meta.sheets || []).length }
      } catch (e) { localInfo = { ok: false, error: mensajeError(e, 'del local') } }
      return responder(res, 200, { planilla, tablas, local: localInfo, sesion })
    }

    responder(res, 400, { error: 'Acción desconocida' })
  } catch (e) { console.error(e); responder(res, 500, { error: e.message }) }
}
