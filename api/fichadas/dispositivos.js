// POST /api/fichadas/dispositivos  { pin }              → lista de celulares y terminales
// POST /api/fichadas/dispositivos  { pin, baja: id }    → da de baja un dispositivo
import { sheetsUpdate } from '../_lib/google.js'
import { leerBody, responder, verificarPinAdmin, getDispositivos, HOJA_DISP } from '../_lib/fichadas.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') return responder(res, 405, { error: 'Método no permitido' })
  try {
    const { pin, baja } = leerBody(req)
    if (!(await verificarPinAdmin(pin))) return responder(res, 401, { error: 'PIN de admin incorrecto' })
    let lista = await getDispositivos()
    if (baja) {
      const d = lista.find(x => x.idDispositivo === baja)
      if (!d) return responder(res, 404, { error: 'No existe ese dispositivo' })
      await sheetsUpdate(`${HOJA_DISP}!F${d.fila}`, [['FALSE']])
      d.activo = false
    }
    lista = lista.map(({ clavePublica, idVinculacion, fila, ...resto }) => resto)
    responder(res, 200, { dispositivos: lista })
  } catch (e) { console.error(e); responder(res, 500, { error: e.message }) }
}
