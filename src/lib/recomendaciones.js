// src/lib/recomendaciones.js
// Recomendaciones del índice de eficiencia: reglas fijas (sin IA) que buscan la causa de cada
// componente que está por debajo del promedio y proponen qué hacer. Usan el mes elegido y lo
// comparan con los 3 meses anteriores (para que los costos y precios sean comparables).
const DIAS = ['domingos', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábados']
const UMBRAL = 97 // puntaje debajo del cual un componente se considera flojo

const fmt$ = n => '$' + Math.round(n).toLocaleString('es-AR')
const pct = (x, dec = 0) => `${(x * 100).toLocaleString('es-AR', { maximumFractionDigits: dec, minimumFractionDigits: dec })}%`
const partes = f => String(f || '').replace(/^'/, '').split('/').map(Number)
const mesDe = f => { const [d, m, a] = partes(f); return a && m ? `${a}-${String(m).padStart(2, '0')}` : null }
const diaSemana = f => { const [d, m, a] = partes(f); return a ? new Date(Date.UTC(a, m - 1, d)).getUTCDay() : null }
const mesesAntes = (mes, n) => { const out = []; let [a, m] = mes.split('-').map(Number); for (let i = 0; i < n; i++) { m--; if (!m) { m = 12; a-- } out.push(`${a}-${String(m).padStart(2, '0')}`) } return out }
const monto = v => Number(v.precioTotalFinal) || Number(v.precioTotal) || 0
// Costo confiable: cargado y no más de 1,5 veces lo cobrado (si es mayor, casi seguro está mal cargado,
// por ejemplo $333.333 en vez de $3.333,33)
export const costoValido = v => !!v.costoTotal && Math.abs(v.costoTotal) <= 1.5 * Math.abs(Number(v.precioTotalFinal) || Number(v.precioTotal) || 0)
export const costoSospechoso = v => !!v.costoTotal && !costoValido(v) && (Number(v.precioTotalFinal) || Number(v.precioTotal) || 0) > 0
const lista = (xs, n = 3) => { const a = xs.slice(0, n); return a.length <= 1 ? a.join('') : a.slice(0, -1).join(', ') + ' y ' + a[a.length - 1] }

function porArticulo(filas) {
  const out = {}
  for (const v of filas) {
    if (!v.articulo || !costoValido(v) || !(v.cantidad > 0)) continue
    const a = (out[v.articulo] ||= { id: v.articulo, nombre: v.nombre || v.articulo, venta: 0, costo: 0, u: 0 })
    a.venta += monto(v); a.costo += v.costoTotal; a.u += v.cantidad
  }
  return out
}

// Horas trabajadas por día de la semana en el mes (de las fichadas ENTRADA → SALIDA)
function horasPorDiaSemana(fichadas, mes) {
  const porDia = {}
  for (const f of fichadas) if (f.valido !== false && mesDe(f.fecha) === mes) (porDia[`${f.idUsuario}|${f.fecha}`] ||= []).push(f)
  const min = h => { const [a, b, c] = String(h).split(':').map(Number); return a * 60 + (b || 0) + (c || 0) / 60 }
  const horas = Array(7).fill(0)
  for (const [k, fs] of Object.entries(porDia)) {
    const ds = diaSemana(k.split('|')[1])
    fs.sort((a, b) => min(a.hora) - min(b.hora))
    let e = null
    for (const f of fs) {
      if (f.tipo === 'ENTRADA') e = min(f.hora)
      else if (f.tipo === 'SALIDA' && e != null) { const h = (min(f.hora) - e) / 60; if (h > 0 && h < 16) horas[ds] += h; e = null }
    }
  }
  return horas
}

// Devuelve [{ tipo: 'alerta' | 'idea' | 'bien', titulo, texto, accion }] ordenadas por importancia
export function generarRecomendaciones(ventas, mes, comp, { fichadas = [], comisionDe = () => 0, enCurso = false } = {}) {
  if (!mes || !comp) return []
  const base3 = new Set(mesesAntes(mes, 3))
  const vm = [], vb = []
  for (const v of ventas) { if (v.anulado) continue; const k = mesDe(v.fecha); if (k === mes) vm.push(v); else if (base3.has(k)) vb.push(v) }
  if (!vm.length) return []
  const c = Object.fromEntries(comp.map(x => [x.id, x]))
  const flojo = id => c[id]?.puntaje != null && c[id].puntaje < UMBRAL
  const recs = []
  const ventaMes = vm.reduce((s, v) => s + monto(v), 0)

  // 1) Costos que faltan cargar
  const sinCosto = {}
  let $sinCosto = 0
  for (const v of vm) if (!costoValido(v) && v.cantidad > 0 && monto(v) > 0) { $sinCosto += monto(v); if (!v.costoTotal) { const k = v.nombre || v.articulo; sinCosto[k] = (sinCosto[k] || 0) + monto(v) } }
  const cobertura = ventaMes > 0 ? 1 - $sinCosto / ventaMes : 1
  if (cobertura < 0.95) {
    const top = Object.entries(sinCosto).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([n, $]) => `${n} (${fmt$($)})`)
    recs.push({ tipo: 'alerta', peso: cobertura < 0.8 ? 1000 : 40, titulo: `Falta un costo confiable en el ${pct(1 - cobertura)} de lo vendido`,
      texto: `El margen se calcula sin esas ventas, así que puede estar mal. Lo que más se vendió sin costo: ${lista(top, 5)}.`,
      accion: 'Cargá esos costos en Arts. (botón SIN COSTO).' })
  }

  // 1b) Costos que parecen mal cargados (más caros que el precio de venta)
  const malos = {}
  for (const v of vm) if (costoSospechoso(v) && v.cantidad > 0) {
    const k = v.articulo || v.nombre
    const m = (malos[k] ||= { nombre: v.nombre || k, id: v.articulo, costo: v.costoTotal / v.cantidad, precio: monto(v) / v.cantidad, n: 0 })
    m.n += v.cantidad
  }
  const listaMalos = Object.values(malos).sort((a, b) => b.costo / b.precio - a.costo / a.precio)
  if (listaMalos.length) recs.push({ tipo: 'alerta', peso: 900, titulo: `${listaMalos.length} ${listaMalos.length === 1 ? 'artículo tiene' : 'artículos tienen'} el costo más alto que el precio`,
    texto: `Parece un error de carga (una coma o un cero de más). Mientras tanto no se cuentan en el margen. ${lista(listaMalos.slice(0, 5).map(m => `${m.nombre}${m.id ? ` (${m.id})` : ''}: costo ${fmt$(m.costo)}, precio ${fmt$(m.precio)}`), 5)}${listaMalos.length > 5 ? ` y ${listaMalos.length - 5} más` : ''}.`,
    accion: 'Corregí el costo en Arts. Las ventas ya hechas guardan el costo de ese momento (columnas M y N de DETALLE DE VENTAS): para que el margen pasado quede bien, hay que corregirlas también.' })

  // 2) Margen bruto
  if (flojo('margen')) {
    const am = porArticulo(vm), ab = porArticulo(vb)
    const ventaB = Object.values(ab).reduce((s, a) => s + a.venta, 0), costoB = Object.values(ab).reduce((s, a) => s + a.costo, 0)
    const margenB = ventaB > 0 ? 1 - costoB / ventaB : null
    const ventaMcc = Object.values(am).reduce((s, a) => s + a.venta, 0) || 1
    const causas = []
    let ventaMix = 0, margenMix = 0
    for (const a of Object.values(am)) {
      const b = ab[a.id]; if (!b || b.venta <= 0) continue
      const mm = 1 - a.costo / a.venta, mb = 1 - b.costo / b.venta
      ventaMix += a.venta; margenMix += a.venta * mb
      const perdida = a.venta * (mb - mm)
      if (perdida <= 0 || mb - mm < 0.03) continue
      const pm = a.venta / a.u, pb = b.venta / b.u, cm = a.costo / a.u, cb = b.costo / b.u
      let por
      if (cm > cb * 1.05 && pm / pb < cm / cb - 0.02) por = `el costo pasó de ${fmt$(cb)} a ${fmt$(cm)} y el precio ${pm > pb * 1.01 ? `solo de ${fmt$(pb)} a ${fmt$(pm)}` : `quedó en ${fmt$(pm)}`}`
      else if (pm < pb * 0.97) por = `se vendió a ${fmt$(pm)} por unidad contra ${fmt$(pb)} antes (¿descuentos o promos?)`
      else por = `margen ${pct(mm)} contra ${pct(mb)} antes`
      causas.push({ nombre: a.nombre, perdida, por })
    }
    causas.sort((x, y) => y.perdida - x.perdida)
    // Se separa la baja (contra los 3 meses anteriores) en: cambios de precio o costo de los mismos
    // artículos, qué se vendió (mezcla) y productos nuevos sin historia.
    const vComun = Object.values(am).filter(a => ab[a.id]).reduce((s, a) => s + a.venta, 0)
    const gComun = Object.values(am).filter(a => ab[a.id]).reduce((s, a) => s + a.venta - a.costo, 0)
    const vTodo = Object.values(am).reduce((s, a) => s + a.venta, 0), gTodo = Object.values(am).reduce((s, a) => s + a.venta - a.costo, 0)
    const mActual = vComun ? gComun / vComun : null, mMix = ventaMix ? margenMix / ventaMix : null, mTodo = vTodo ? gTodo / vTodo : null
    const pts = x => `${x > 0 ? '+' : ''}${(x * 100).toLocaleString('es-AR', { maximumFractionDigits: 1 })} puntos`
    const efectos = []
    if (margenB != null && mActual != null && mMix != null) {
      const ePrecio = mActual - mMix, eMezcla = mMix - margenB, eNuevos = mTodo - mActual
      const dePrecio = causas.length && ePrecio < -0.005
        ? `por precio o costo de los mismos artículos, ${pts(ePrecio)}. Los que más pesaron: ${causas.slice(0, 3).map(x => `${x.nombre}: ${x.por} (dejó de ganar ≈ ${fmt$(x.perdida)})`).join('; ')}` : null
      let deMezcla = null
      if (eMezcla < -0.005) {
        const sube = Object.values(am).filter(a => ab[a.id] && 1 - ab[a.id].costo / ab[a.id].venta < margenB)
          .map(a => { const margen = 1 - ab[a.id].costo / ab[a.id].venta, salto = a.venta / ventaMcc - ab[a.id].venta / ventaB; return { nombre: a.nombre, margen, salto, aporte: salto * (margen - margenB) } })
          .filter(x => x.salto > 0).sort((x, y) => x.aporte - y.aporte).slice(0, 3)
        deMezcla = `por lo que se vendió, ${pts(eMezcla)}: se vendió más de productos que dejan poco margen${sube.length ? `, como ${lista(sube.map(x => `${x.nombre} (${pct(x.margen)})`))}` : ''}`
      }
      const deNuevos = Math.abs(eNuevos) >= 0.005 ? `por productos nuevos (sin ventas en los 3 meses anteriores), ${pts(eNuevos)}` : null
      efectos.push(...[[eMezcla, deMezcla], [ePrecio, dePrecio], [eNuevos, deNuevos]].filter(x => x[1]).sort((a, b) => a[0] - b[0]).map(x => x[1]))
    }
    if (efectos.length) recs.push({ tipo: 'alerta', peso: (100 - c.margen.puntaje) * c.margen.peso, titulo: `El margen bajó a ${pct(c.margen.valor, 1)} (tu promedio: ${pct(c.margen.promedio, 1)})`,
      texto: `Contra los 3 meses anteriores (${pct(margenB, 1)}), la diferencia viene ${efectos.join('; ')}.`,
      accion: efectos[0].startsWith('por precio') ? 'Revisá el precio de venta de esos artículos: si subió el costo, conviene actualizarlo.' : 'Empujá los productos que dejan más margen (exhibición, recomendación en caja) y revisá si los de margen bajo tienen el precio al día.' })
  }

  // 3) Ticket promedio y unidades por ticket
  if (flojo('ticket') || flojo('upt')) {
    const tickets = (filas) => { const t = {}; for (const v of filas) if (v.idVenta && v.cantidad > 0 && !/CAMBIO/i.test(v.notas || '')) (t[v.idVenta] ||= []).push(v); return Object.values(t) }
    const tm = tickets(vm), tb = tickets(vb)
    const deUno = ts => ts.length ? ts.filter(t => t.reduce((s, v) => s + v.cantidad, 0) === 1).length / ts.length : 0
    // Lo que se lleva solo más seguido, y con qué se lo lleva la gente cuando compra más de uno
    const todos = [...tb, ...tm]
    const solo = {}, junto = {}
    for (const t of todos) {
      const ids = [...new Set(t.map(v => v.nombre || v.articulo))]
      if (ids.length === 1 && t.reduce((s, v) => s + v.cantidad, 0) === 1) solo[ids[0]] = (solo[ids[0]] || 0) + 1
      if (ids.length >= 2) for (const a of ids) for (const b of ids) if (a !== b) { const m = (junto[a] ||= {}); m[b] = (m[b] || 0) + 1 }
    }
    const ideas = Object.entries(solo).sort((a, b) => b[1] - a[1]).map(([n, k]) => {
      const comp = Object.entries(junto[n] || {}).sort((a, b) => b[1] - a[1])[0]
      return comp && comp[1] >= 3 ? `a quien lleva ${n} (se lo llevaron solo ${k} veces) ofrecele ${comp[0]}, que es lo que más se suma (${comp[1]} veces)` : null
    }).filter(Boolean).slice(0, 2)
    const p1m = deUno(tm), p1b = deUno(tb)
    const quien = flojo('upt') && flojo('ticket') ? 'El ticket promedio y las unidades por ticket están' : flojo('upt') ? 'Las unidades por ticket están' : 'El ticket promedio está'
    recs.push({ tipo: 'idea', peso: ['ticket', 'upt'].reduce((s, id) => s + (flojo(id) ? (100 - c[id].puntaje) * c[id].peso : 0), 0),
      titulo: `${quien} debajo de tu promedio`,
      texto: `El ${pct(p1m)} de los tickets fue de una sola unidad (en los 3 meses anteriores, ${pct(p1b)}).${ideas.length ? ` Ideas según lo que ya compran juntos: ${ideas.join('; ')}.` : ''}`,
      accion: 'Pedile a las empleadas que sugieran el complemento al cobrar, o armá una promo con esos productos.' })
  }

  // 4) Costo de cobro
  if (flojo('cobro')) {
    const resumen = filas => {
      let total = 0, tarj = 0, com = 0, amar = 0, ahorro = 0
      for (const v of filas) {
        const reparto = v.pagos?.length >= 2 ? (() => { const suma = v.pagos.reduce((s, p) => s + p.monto, 0) || 1; return v.pagos.map(p => ({ metodo: p.metodo, monto: monto(v) * p.monto / suma })) })() : [{ metodo: v.metodoPago, monto: monto(v) }]
        for (const p of reparto) {
          total += p.monto
          const k = comisionDe(p.metodo, v.posnet)
          if (k > 0) { tarj += p.monto; com += p.monto * k }
          if (k > 0 && /AMARILLO/i.test(v.posnet || '')) { amar += p.monto; ahorro += p.monto * (k - comisionDe(p.metodo, 'BLANCO')) }
        }
      }
      return { total, tarj, com, amar, ahorro }
    }
    const rm = resumen(vm), rb = resumen(vb)
    const shareM = rm.total ? rm.tarj / rm.total : 0, shareB = rb.total ? rb.tarj / rb.total : 0
    let texto = `Se cobró con tarjeta o QR el ${pct(shareM)} de lo vendido (en los 3 meses anteriores, ${pct(shareB)}) y se fueron ${fmt$(rm.com)} en comisiones.`
    if (rm.ahorro > 1000) texto += ` Por el posnet amarillo pasaron ${fmt$(rm.amar)}: por el blanco esas comisiones habrían sido ${fmt$(rm.ahorro)} menos.`
    recs.push({ tipo: 'idea', peso: (100 - c.cobro.puntaje) * c.cobro.peso, titulo: 'Cobrar está saliendo más caro que lo habitual', texto,
      accion: rm.ahorro > 1000 ? 'Si el tope del monotributo lo permite, conviene usar más el blanco; y ofrecer efectivo o Pix cuando el cliente duda.' : 'Ofrecé efectivo, transferencia o Pix cuando el cliente duda: no tienen comisión.' })
  }

  // 5) Venta por hora trabajada: qué día rinde menos
  if (c.porHora?.valor != null && (c.porHora.puntaje == null || c.porHora.puntaje < UMBRAL)) {
    const horas = horasPorDiaSemana(fichadas, mes)
    const venta = Array(7).fill(0)
    for (const v of vm) { const d = diaSemana(v.fecha); if (d != null) venta[d] += monto(v) }
    const dias = horas.map((h, d) => ({ d, h, porHora: h >= 6 ? venta[d] / h : null })).filter(x => x.porHora != null)
    if (dias.length >= 2) {
      dias.sort((a, b) => a.porHora - b.porHora)
      const peor = dias[0], mejor = dias[dias.length - 1]
      if (peor.porHora < mejor.porHora * 0.6) recs.push({ tipo: 'idea', peso: c.porHora.puntaje != null ? (100 - c.porHora.puntaje) * c.porHora.peso : 20,
        titulo: `Los ${DIAS[peor.d]} rinden poco por hora trabajada`,
        texto: `Los ${DIAS[peor.d]} se trabajaron ${Math.round(peor.h)} h y se vendió ${fmt$(peor.porHora)} por hora; los ${DIAS[mejor.d]}, ${fmt$(mejor.porHora)} por hora.`,
        accion: `Revisá si los ${DIAS[peor.d]} hace falta la misma cantidad de gente u horas, o usá ese día para tareas (conteo, reposición, fotos).` })
    }
  }

  // 6) Lo que viene bien
  const bien = comp.filter(x => x.puntaje != null && x.puntaje >= 105)
  if (bien.length) recs.push({ tipo: 'bien', peso: -1, titulo: 'Lo que viene bien',
    texto: bien.map(x => `${x.nombre}: ${Math.round(x.puntaje - 100)}% mejor que tu promedio`).join(' · ') + '.', accion: '' })

  if (!recs.some(r => r.tipo !== 'bien')) recs.unshift({ tipo: 'bien', peso: 999, titulo: 'Todo en línea con tu promedio', texto: 'Ningún componente está claramente por debajo de lo habitual.', accion: '' })
  recs.sort((a, b) => b.peso - a.peso)
  if (enCurso) recs.forEach(r => { r.enCurso = true })
  return recs
}
