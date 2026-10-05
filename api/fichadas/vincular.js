// POST /api/fichadas/vincular  { token, clavePublica, navegador }
// El celular de la empleada registra su clave pública. Da de baja el celular anterior.
import { sheetsAppend, sheetsUpdate } from '../_lib/google.js'
import { leerBody, responder, leerTokenVinculacion, getDispositivos, randomId, fechaHoraAR, HOJA_DISP } from '../_lib/fichadas.js'

export function clavePublicaValida(jwk) {
  return jwk && jwk.kty === 'EC' && jwk.crv === 'P-256' && typeof jwk.x === 'string' && typeof jwk.y === 'string' && !jwk.d
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return responder(res, 405, { error: 'Método no permitido' })
  try {
    const { token, clavePublica, navegador = '' } = leerBody(req)
    const { datos, error } = await leerTokenVinculacion(token)
    if (error) return responder(res, 400, { error })
    if (!clavePublicaValida(clavePublica)) return responder(res, 400, { error: 'Clave del celular inválida' })

    const dispositivos = await getDispositivos()
    if (dispositivos.some(d => d.idVinculacion === datos.jti)) return responder(res, 400, { error: 'Este código de vinculación ya se usó. Generá uno nuevo.' })

    // Un solo celular activo por empleada
    for (const d of dispositivos.filter(d => d.activo && d.idUsuario === datos.u)) {
      await sheetsUpdate(`${HOJA_DISP}!F${d.fila}`, [['FALSE']])
    }
    const idDispositivo = randomId(8)
    const { fecha, hora } = fechaHoraAR()
    const jwk = { kty: 'EC', crv: 'P-256', x: clavePublica.x, y: clavePublica.y }
    await sheetsAppend(`${HOJA_DISP}!A1`, [[idDispositivo, datos.u, datos.n, JSON.stringify(jwk), `${fecha} ${hora}`, 'TRUE', String(navegador).slice(0, 200), datos.jti]])
    responder(res, 200, { idDispositivo, idUsuario: datos.u, nombre: datos.n })
  } catch (e) { console.error(e); responder(res, 500, { error: e.message }) }
}
