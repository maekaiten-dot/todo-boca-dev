// GET /api/fichadas/hora → hora del servidor, para corregir el reloj del celular
import { responder } from '../_lib/fichadas.js'

export default function handler(req, res) {
  responder(res, 200, { ahora: Date.now() })
}
