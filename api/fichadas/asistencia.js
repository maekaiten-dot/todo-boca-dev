// POST /api/fichadas/asistencia  { pin, accion, ... }
//   accion 'datos'             → { empleadas, cambios, fichadas }
//   accion 'guardarHorarios'   { empleadas: [{ idUsuario, nombre, franco, dias: {1..7: '9:30-14:30'} }] }
//   accion 'agregarCambio'     { cambio: { fecha, idUsuario, nombre, tipo, entrada, nota } }
//   accion 'borrarCambio'      { id }
import { sheetsGet, sheetsAppend, sheetsUpdate, sheetsClear, asegurarHoja } from '../_lib/google.js'
import { leerBody, responder, verificarPinAdmin, getFichadas, fechaHoraAR, randomId } from '../_lib/fichadas.js'

const HOJA_HOR = 'HORARIOS'
const ENC_HOR = ['ID_USUARIO', 'NOMBRE', 'FRANCO_HABITUAL', 'LUNES', 'MARTES', 'MIERCOLES', 'JUEVES', 'VIERNES', 'SABADO', 'DOMINGO']
const HOJA_CAM = 'CAMBIOS_HORARIO'
const ENC_CAM = ['ID_CAMBIO', 'FECHA', 'ID_USUARIO', 'NOMBRE', 'TIPO', 'ENTRADA', 'NOTA', 'CARGADO', 'BORRADO']
const TIPOS = new Set(['FRANCO', 'HORARIO', 'OLVIDO', 'AUSENCIA'])
const DIAS_FRANCO = ['', 'LUNES', 'MARTES', 'MIERCOLES', 'JUEVES', 'VIERNES', 'SABADO', 'DOMINGO']

async function getEmpleadas() {
  await asegurarHoja(HOJA_HOR, ENC_HOR)
  return (await sheetsGet(`${HOJA_HOR}!A2:J`)).filter(r => r[0]).map(r => {
    const dias = {}
    for (let i = 1; i <= 7; i++) dias[i] = r[2 + i] || ''
    const f = String(r[2] || '').toUpperCase()
    return { idUsuario: r[0], nombre: r[1] || '', franco: DIAS_FRANCO.indexOf(f) > 0 ? DIAS_FRANCO.indexOf(f) : Number(f) || 0, dias }
  })
}

async function getCambios() {
  await asegurarHoja(HOJA_CAM, ENC_CAM)
  return (await sheetsGet(`${HOJA_CAM}!A2:I`)).map((r, i) => ({
    fila: i + 2, id: r[0] || '', fecha: r[1] || '', idUsuario: r[2] || '', nombre: r[3] || '',
    tipo: r[4] || '', entrada: r[5] || '', nota: r[6] || '', cargado: r[7] || '', borrado: String(r[8]).toUpperCase() === 'TRUE',
  })).filter(c => c.id && !c.borrado)
}

const fechaValida = (s) => /^\d{1,2}\/\d{1,2}\/\d{4}$/.test(String(s || ''))
const horaValida = (s) => /^\d{1,2}:\d{2}$/.test(String(s || ''))
const turnoValido = (s) => s === '' || /^\d{1,2}:\d{2}\s*-\s*\d{1,2}:\d{2}$/.test(String(s))

export default async function handler(req, res) {
  if (req.method !== 'POST') return responder(res, 405, { error: 'Método no permitido' })
  try {
    const body = leerBody(req)
    if (!(await verificarPinAdmin(body.pin))) return responder(res, 401, { error: 'PIN de fichadas incorrecto' })

    if (body.accion === 'guardarHorarios') {
      const lista = Array.isArray(body.empleadas) ? body.empleadas : []
      for (const e of lista) {
        if (!e.idUsuario || !e.nombre) return responder(res, 400, { error: 'Falta la empleada' })
        for (let i = 1; i <= 7; i++) if (!turnoValido(e.dias?.[i] || '')) return responder(res, 400, { error: `Horario inválido para ${e.nombre}: usá el formato 9:30-14:30` })
      }
      await asegurarHoja(HOJA_HOR, ENC_HOR)
      await sheetsClear(`${HOJA_HOR}!A2:J`)
      if (lista.length) await sheetsUpdate(`${HOJA_HOR}!A2`, lista.map(e => [
        String(e.idUsuario), String(e.nombre), DIAS_FRANCO[Number(e.franco)] || '',
        ...[1, 2, 3, 4, 5, 6, 7].map(i => String(e.dias?.[i] || '').replace(/\s/g, '')),
      ]))
    } else if (body.accion === 'agregarCambio') {
      const c = body.cambio || {}
      if (!fechaValida(c.fecha) || !c.idUsuario || !TIPOS.has(c.tipo)) return responder(res, 400, { error: 'Cambio incompleto' })
      if (c.tipo === 'HORARIO' && !horaValida(c.entrada)) return responder(res, 400, { error: 'Indicá la hora de entrada (ej. 12:00)' })
      await asegurarHoja(HOJA_CAM, ENC_CAM)
      const { fecha, hora } = fechaHoraAR()
      await sheetsAppend(`${HOJA_CAM}!A1`, [[`C${randomId(4)}`, c.fecha, String(c.idUsuario), String(c.nombre || ''), c.tipo, c.tipo === 'HORARIO' ? c.entrada : '', String(c.nota || '').slice(0, 200), `${fecha} ${hora}`, 'FALSE']])
    } else if (body.accion === 'borrarCambio') {
      const c = (await getCambios()).find(x => x.id === body.id)
      if (!c) return responder(res, 404, { error: 'No existe ese cambio' })
      await sheetsUpdate(`${HOJA_CAM}!I${c.fila}`, [['TRUE']])
    } else if (body.accion !== 'datos') {
      return responder(res, 400, { error: 'Acción desconocida' })
    }

    const [empleadas, cambios, fichadas] = await Promise.all([getEmpleadas(), getCambios(), getFichadas()])
    responder(res, 200, {
      empleadas,
      cambios: cambios.map(({ fila, borrado, ...c }) => c),
      fichadas: fichadas.filter(f => f.valido).map(f => ({ idUsuario: f.idUsuario, fecha: f.fecha, hora: f.hora, tipo: f.tipo, valido: true })),
      ahora: fechaHoraAR(),
    })
  } catch (e) { console.error(e); responder(res, 500, { error: e.message }) }
}
