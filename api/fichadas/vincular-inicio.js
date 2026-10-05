// POST /api/fichadas/vincular-inicio  { pin, idUsuario, nombre }
// El admin genera un código de un solo uso (10 min) para vincular el celular de una empleada.
import { leerBody, responder, verificarPinAdmin, crearTokenVinculacion } from '../_lib/fichadas.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') return responder(res, 405, { error: 'Método no permitido' })
  try {
    const { pin, idUsuario, nombre } = leerBody(req)
    if (!(await verificarPinAdmin(pin))) return responder(res, 401, { error: 'PIN de admin incorrecto' })
    if (!idUsuario || !nombre) return responder(res, 400, { error: 'Falta la empleada' })
    const token = await crearTokenVinculacion({ idUsuario: String(idUsuario), nombre: String(nombre) })
    responder(res, 200, { token })
  } catch (e) { console.error(e); responder(res, 500, { error: e.message }) }
}
