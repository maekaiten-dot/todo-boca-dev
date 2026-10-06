// src/lib/asistencia.js
// Cálculo puro de asistencia: cruza fichadas, horario semanal y cambios cargados
// por el admin, y marca cada día de cada empleada.
//
// Reglas:
// - Un cambio cargado para ese día manda (FRANCO, HORARIO con otra entrada, OLVIDO = trabajó sin fichar, AUSENCIA).
// - Con fichada de ENTRADA: a tiempo si llegó hasta la hora esperada + tolerancia; si no, tarde.
// - Sin fichada en su franco habitual → franco.
// - Sin fichada otro día → falta fichada. Pero si esa semana trabajó en su franco habitual
//   y es el único día sin fichar de la semana, queda como "franco probable" (para confirmar).

export const TOLERANCIA_MIN = 10
export const DIAS = ['', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo']
export const DIAS_CORTOS = ['', 'Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sa', 'Do']
export const TIPOS_CAMBIO = {
  FRANCO: 'Franco',
  HORARIO: 'Cambio de horario',
  OLVIDO: 'Trabajó, se olvidó de fichar',
  AUSENCIA: 'Ausencia',
}

// Horarios formales conocidos, para precargar el editor la primera vez
export const HORARIOS_SUGERIDOS = {
  stefi: { franco: 1, dias: { 1: '9:30-14:30', 2: '9:30-14:30', 3: '9:30-14:30', 4: '9:30-14:30', 5: '9:30-14:30', 6: '9:00-14:00', 7: '9:00-14:00' } },
  brenda: { franco: 2, dias: { 1: '11:00-16:00', 2: '11:00-16:00', 3: '11:00-16:00', 4: '11:00-16:00', 5: '11:00-16:00', 6: '11:00-16:00', 7: '11:00-16:00' } },
}

// ── Fechas (calendario puro, sin zonas horarias) ───────────────────────────
export const parseFecha = (s) => { const [d, m, a] = String(s).split('/').map(Number); return { d, m, a } }
export const fmtFecha = ({ d, m, a }) => `${d}/${m}/${a}`
const aDia = ({ d, m, a }) => Date.UTC(a, m - 1, d) / 86400000          // número de día absoluto
const deDia = (n) => { const x = new Date(n * 86400000); return { d: x.getUTCDate(), m: x.getUTCMonth() + 1, a: x.getUTCFullYear() } }
const diaSemana = (n) => ((new Date(n * 86400000).getUTCDay() + 6) % 7) + 1  // 1 = lunes … 7 = domingo

export const aSegundos = (h) => {
  const [hh = 0, mm = 0, ss = 0] = String(h || '').split(':').map(Number)
  return hh * 3600 + mm * 60 + ss
}
export const fmtHora = (h) => { if (!h) return ''; const [hh, mm] = String(h).split(':'); return `${Number(hh)}:${String(mm).padStart(2, '0')}` }

export function parseTurno(t) {
  const m = String(t || '').trim().match(/^(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})$/)
  return m ? { entrada: m[1], salida: m[2] } : null
}

// ── Cálculo principal ──────────────────────────────────────────────────────
// empleadas: [{ idUsuario, nombre, franco: 1..7, dias: { 1: '9:30-14:30', … } }]
// fichadas:  [{ idUsuario, fecha 'd/m/aaaa', hora 'H:MM:SS', tipo 'ENTRADA'|'SALIDA', valido }]
// cambios:   [{ id, idUsuario, fecha, tipo, entrada, nota }]
// mes: { anio, mes }   hoy: { fecha 'd/m/aaaa', hora 'H:MM:SS' }
export function calcularAsistencia({ empleadas, fichadas, cambios, mes, hoy, tolerancia = TOLERANCIA_MIN }) {
  const primero = aDia({ d: 1, m: mes.mes, a: mes.anio })
  const ultimo = aDia({ d: 1, m: mes.mes === 12 ? 1 : mes.mes + 1, a: mes.mes === 12 ? mes.anio + 1 : mes.anio }) - 1
  const desde = primero - (diaSemana(primero) - 1)  // lunes de la primera semana
  const hasta = ultimo + (7 - diaSemana(ultimo))    // domingo de la última semana
  const hoyN = aDia(parseFecha(hoy.fecha))
  const hoySeg = aSegundos(hoy.hora)

  return empleadas.map(emp => {
    const fichPorDia = new Map()
    for (const f of fichadas) {
      if (!f.valido || f.idUsuario !== emp.idUsuario) continue
      const n = aDia(parseFecha(f.fecha))
      if (n < desde || n > hasta) continue
      if (!fichPorDia.has(n)) fichPorDia.set(n, [])
      fichPorDia.get(n).push(f)
    }
    const cambioPorDia = new Map()
    for (const c of cambios) {
      if (c.idUsuario !== emp.idUsuario) continue
      cambioPorDia.set(aDia(parseFecha(c.fecha)), c) // si hay varios, vale el último cargado
    }

    const dias = []
    for (let n = desde; n <= hasta; n++) {
      const dow = diaSemana(n)
      const lista = (fichPorDia.get(n) || []).slice().sort((a, b) => aSegundos(a.hora) - aSegundos(b.hora))
      const entrada = lista.find(f => f.tipo !== 'SALIDA') || null
      const salidas = lista.filter(f => f.tipo === 'SALIDA')
      const cambio = cambioPorDia.get(n) || null
      const turno = parseTurno(emp.dias?.[dow])
      const esperado = cambio?.tipo === 'HORARIO' && cambio.entrada
        ? { entrada: cambio.entrada, salida: turno?.salida || '' }
        : turno
      const dia = {
        n, fecha: fmtFecha(deDia(n)), dow, enMes: n >= primero && n <= ultimo,
        esperado, entrada: entrada?.hora || '', salida: salidas[salidas.length - 1]?.hora || '',
        cambio, estado: '', minutosTarde: 0, francoHabitual: dow === emp.franco,
      }

      if (entrada) {
        if (esperado) {
          const dif = aSegundos(entrada.hora) - aSegundos(esperado.entrada)
          if (dif > tolerancia * 60) { dia.estado = 'tarde'; dia.minutosTarde = Math.floor(dif / 60) }
          else dia.estado = 'aTiempo'
        } else dia.estado = 'presente'
      } else if (n > hoyN) dia.estado = 'futuro'
      else if (cambio?.tipo === 'OLVIDO') dia.estado = 'olvido'
      else if (cambio?.tipo === 'AUSENCIA') dia.estado = 'ausencia'
      else if (cambio?.tipo === 'FRANCO') dia.estado = 'franco'
      else if (n === hoyN && esperado && hoySeg <= aSegundos(esperado.entrada) + tolerancia * 60) dia.estado = 'pendiente'
      else if (dia.francoHabitual) dia.estado = 'franco'
      else if (!esperado) dia.estado = 'noTrabaja'
      else dia.estado = 'falta'
      dias.push(dia)
    }

    // Franco movido: semana en la que trabajó su franco habitual, sin otro franco, y un solo día sin fichar
    for (let i = 0; i < dias.length; i += 7) {
      const semana = dias.slice(i, i + 7)
      const habitual = semana.find(d => d.francoHabitual)
      const trabajoHabitual = habitual && ['aTiempo', 'tarde', 'presente', 'olvido'].includes(habitual.estado)
      const hayFranco = semana.some(d => d.estado === 'franco')
      const faltas = semana.filter(d => d.estado === 'falta')
      if (trabajoHabitual && !hayFranco && faltas.length === 1) faltas[0].estado = 'francoProbable'
    }

    const delMes = dias.filter(d => d.enMes)
    const cuenta = (...e) => delMes.filter(d => e.includes(d.estado)).length
    const resumen = {
      trabajados: cuenta('aTiempo', 'tarde', 'presente', 'olvido'),
      aTiempo: cuenta('aTiempo', 'presente'),
      tardes: cuenta('tarde'),
      minutosTarde: delMes.reduce((s, d) => s + d.minutosTarde, 0),
      francos: cuenta('franco'),
      olvidos: cuenta('olvido'),
      ausencias: cuenta('ausencia'),
      faltas: cuenta('falta'),
      revisar: cuenta('falta', 'francoProbable'),
    }
    return { ...emp, dias: delMes, resumen }
  })
}

export const ESTADOS = {
  aTiempo: { texto: 'A tiempo', color: '#22c55e' },
  presente: { texto: 'Presente', color: '#22c55e' },
  tarde: { texto: 'Tarde', color: '#f59e0b' },
  franco: { texto: 'Franco', color: '#6a8ccc' },
  francoProbable: { texto: '¿Franco?', color: '#eab308' },
  olvido: { texto: 'Sin fichar (trabajó)', color: '#a78bfa' },
  ausencia: { texto: 'Ausencia', color: '#ef4444' },
  falta: { texto: 'Falta fichada', color: '#ef4444' },
  pendiente: { texto: 'Pendiente', color: '#6a8ccc' },
  noTrabaja: { texto: 'No trabaja', color: '#6a8ccc' },
  futuro: { texto: '', color: '#6a8ccc' },
}
