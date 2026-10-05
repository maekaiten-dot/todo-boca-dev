// POST /api/fichadas/terminal  { pin, clavePublica, navegador, nombre }
// Vincula una tablet del local como "terminal de fichada". Solo las terminales pueden registrar fichadas.
import { sheetsAppend } from '../_lib/google.js'
import { leerBody, responder, verificarPinAdmin, randomId, fechaHoraAR, HOJA_DISP, getDispositivos } from '../_lib/fichadas.js'
import { clavePublicaValida } from './vincular.js'

export const ID_TERMINAL = 'TERMINAL'

export default async function handler(req, res) {
  if (req.method !== 'POST') return responder(res, 405, { error: 'Método no permitido' })
  try {
    const { pin, clavePublica, navegador = '', nombre = 'Tablet del local' } = leerBody(req)
    if (!(await verificarPinAdmin(pin))) return responder(res, 401, { error: 'PIN de admin incorrecto' })
    if (!clavePublicaValida(clavePublica)) return responder(res, 400, { error: 'Clave de la tablet inválida' })
    await getDispositivos() // crea la pestaña si no existe
    const idDispositivo = randomId(8)
    const { fecha, hora } = fechaHoraAR()
    const jwk = { kty: 'EC', crv: 'P-256', x: clavePublica.x, y: clavePublica.y }
    await sheetsAppend(`${HOJA_DISP}!A1`, [[idDispositivo, ID_TERMINAL, String(nombre).slice(0, 60), JSON.stringify(jwk), `${fecha} ${hora}`, 'TRUE', String(navegador).slice(0, 200), '']])
    responder(res, 200, { idDispositivo })
  } catch (e) { console.error(e); responder(res, 500, { error: e.message }) }
}
