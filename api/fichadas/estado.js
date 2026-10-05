// POST /api/fichadas/estado  { idDispositivo } → { activo }
// El celular consulta si sigue vinculado (el id es aleatorio y no expone datos).
import { leerBody, responder, getDispositivos } from '../_lib/fichadas.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') return responder(res, 405, { error: 'Método no permitido' })
  try {
    const { idDispositivo } = leerBody(req)
    const d = (await getDispositivos()).find(x => x.idDispositivo === idDispositivo && x.idUsuario !== 'TERMINAL')
    responder(res, 200, { activo: !!d?.activo })
  } catch (e) { console.error(e); responder(res, 500, { error: e.message }) }
}
