// POST /api/fichadas/registrar  { qr, terminal: { id, ts, firma } }
// La tablet manda el QR que escaneó del celular, firmado con su propia llave de terminal.
import { sheetsAppend } from '../_lib/google.js'
import {
  leerBody, responder, parsearQr, verificarFirma, getDispositivos, getFichadas, fechaHoraAR, randomId,
  HOJA_FICH, QR_VENTANA_MS, DUPLICADO_MS,
} from '../_lib/fichadas.js'
import { ID_TERMINAL } from './terminal.js'

export async function procesarFichada({ qr, terminal }, { dispositivos, fichadas, ahora }) {
  // 1) La solicitud tiene que venir de una tablet del local vinculada
  const term = dispositivos.find(d => d.idDispositivo === terminal?.id && d.idUsuario === ID_TERMINAL && d.activo)
  if (!term) return { status: 403, error: 'Esta tablet no está habilitada para fichar' }
  const tsTerm = Number(terminal.ts)
  if (!Number.isFinite(tsTerm) || Math.abs(ahora - tsTerm) > QR_VENTANA_MS) return { status: 403, error: 'Solicitud de la tablet vencida. Revisá la hora de la tablet.' }
  const okTerm = await verificarFirma(JSON.parse(term.clavePublica), `TBT1.${term.idDispositivo}.${tsTerm}.${qr}`, terminal.firma)
  if (!okTerm) return { status: 403, error: 'Firma de la tablet inválida' }

  // 2) El QR tiene que ser de un celular vinculado
  const p = parsearQr(qr)
  if (!p) return { status: 400, error: 'Ese QR no es de fichada' }
  const disp = dispositivos.find(d => d.idDispositivo === p.idDispositivo && d.idUsuario !== ID_TERMINAL)
  const base = { idUsuario: disp?.idUsuario || '', nombre: disp?.nombre || '', idDispositivo: p.idDispositivo, tsQr: p.ts, desfase: Math.round((ahora - p.ts) / 1000) }
  const rechazar = (motivo) => ({ status: 200, rechazo: { ...base, motivo }, ok: false, nombre: base.nombre, error: motivo })

  if (!disp) return rechazar('Celular no vinculado')
  if (!disp.activo) return rechazar('Celular dado de baja (se vinculó otro)')
  if (!(await verificarFirma(JSON.parse(disp.clavePublica), p.mensaje, p.firma))) return rechazar('Firma del celular inválida')
  if (Math.abs(ahora - p.ts) > QR_VENTANA_MS) return rechazar('QR vencido (captura de pantalla o reloj del celular)')
  if (fichadas.some(f => f.idDispositivo === p.idDispositivo && f.tsQr >= p.ts)) return rechazar('QR ya usado')

  // 3) Doble escaneo: si ya fichó hace menos de 10 min, no se registra de nuevo
  const { fecha, hora } = fechaHoraAR(ahora)
  const deHoy = fichadas.filter(f => f.valido && f.idUsuario === disp.idUsuario && f.fecha === fecha)
  const ultima = deHoy[deHoy.length - 1]
  if (ultima && ultima.tsQr && ahora - ultima.tsQr < DUPLICADO_MS) {
    return { status: 200, ok: true, duplicada: true, nombre: disp.nombre, tipo: ultima.tipo, hora: ultima.hora }
  }

  const tipo = deHoy.length % 2 === 0 ? 'ENTRADA' : 'SALIDA'
  return { status: 200, ok: true, nombre: disp.nombre, tipo, hora, fila: [`F${randomId(5)}`, disp.idUsuario, disp.nombre, fecha, hora, tipo, 'TRUE', '', p.idDispositivo, String(p.ts), String(base.desfase)] }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return responder(res, 405, { error: 'Método no permitido' })
  try {
    const ahora = Date.now()
    const body = leerBody(req)
    const [dispositivos, fichadas] = await Promise.all([getDispositivos(), getFichadas()])
    const r = await procesarFichada(body, { dispositivos, fichadas, ahora })

    if (r.fila) await sheetsAppend(`${HOJA_FICH}!A1`, [r.fila])
    if (r.rechazo) {
      const { fecha, hora } = fechaHoraAR(ahora)
      const x = r.rechazo
      await sheetsAppend(`${HOJA_FICH}!A1`, [[`F${randomId(5)}`, x.idUsuario, x.nombre, fecha, hora, '', 'FALSE', x.motivo, x.idDispositivo, String(x.tsQr), String(x.desfase)]])
    }
    const { fila, rechazo, status, ...salida } = r
    responder(res, status, salida)
  } catch (e) { console.error(e); responder(res, 500, { error: e.message }) }
}
