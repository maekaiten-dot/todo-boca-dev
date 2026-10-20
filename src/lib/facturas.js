// src/lib/facturas.js
// Interpreta el texto de una factura / remito / ticket de proveedor (leído con OCR o sacado de un PDF)
// y lo convierte en renglones { codigo, descripcion, cantidad, precioUnit, importe, costoUnit }.
// No usa IA: hay una plantilla por proveedor (Casa Yumi, Casa Tradicional, Mate Mundo) y una genérica.
// Cada renglón se controla con sus propias cuentas (cantidad × precio = importe) y el total del
// comprobante; lo que no cierra queda marcado "revisar" para corregirlo a mano.
// Todo es código puro (sin navegador), así se puede probar con texto.

// ── Montos ────────────────────────────────────────────────────────────────────
// Los proveedores imprimen siempre 2 decimales ("10500.00", "1,900.00"). El OCR a veces pierde el
// punto ("1050000"): si no hay separador decimal, los 2 últimos dígitos son los centavos.
export function monto(s, { conCentavos = true } = {}) {
  if (s == null) return null
  let t = String(s).replace(/[Oo]/g, '0').replace(/[^\d.,]/g, '')
  if (!t || !/\d/.test(t)) return null
  const dec = t.match(/[.,](\d{2})$/)
  if (dec) {
    const entero = t.slice(0, -3).replace(/[.,]/g, '')
    return Number((entero || '0') + '.' + dec[1])
  }
  const dig = t.replace(/[.,]/g, '')
  if (!dig) return null
  if (conCentavos) {
    if (dig.length < 3 || !dig.endsWith('00')) return null // "08", "5" → ilegible
    return Number(dig.slice(0, -2))
  }
  return Number(dig)
}
const entero = s => { const t = String(s ?? '').replace(/[Oo]/g, '0').replace(/\D/g, ''); return t ? Number(t) : null }
const cerca = (a, b, tol = 1) => a != null && b != null && Math.abs(a - b) <= Math.max(tol, Math.abs(b) * 0.001)
const redondear = n => Math.round(n * 100) / 100

// "19/10/26", "19/10/2026", "2026-10-19" → "19/10/2026". Si hay varias fechas (por ejemplo "Inicio de
// actividades"), se queda con la más reciente que no sea del futuro.
export function fechaDe(texto, hoyMs = Date.now()) {
  const fechas = []
  for (const m of String(texto).matchAll(/(20\d{2})[-/.](\d{1,2})[-/.](\d{1,2})/g)) fechas.push([Number(m[1]), Number(m[2]), Number(m[3])])
  for (const m of String(texto).matchAll(/(?<!\d)(\d{1,2})[/.-](\d{1,2})[/.-](\d{4}|\d{2})(?!\d)/g)) fechas.push([Number(m[3].length === 2 ? '20' + m[3] : m[3]), Number(m[2]), Number(m[1])])
  const validas = fechas.filter(([a, m, d]) => a >= 2000 && m >= 1 && m <= 12 && d >= 1 && d <= 31)
    .map(([a, m, d]) => ({ a, m, d, ms: Date.UTC(a, m - 1, d) })).filter(f => f.ms <= hoyMs + 86400000)
  if (!validas.length) return ''
  const f = validas.sort((x, y) => y.ms - x.ms)[0]
  return `${f.d}/${f.m}/${f.a}`
}

// ── Proveedores conocidos ─────────────────────────────────────────────────────
// costo: cómo se calcula el costo unitario real a partir del renglón.
//   descuento: Casa Yumi imprime "× 0.80" (20% off) en cada renglón.
//   iva: Mate Mundo hace factura A con IVA 21% aparte (para un monotributista el IVA es costo).
export const PROVEEDORES = {
  yumi: { nombre: 'Casa Yumi', detectar: t => /YUMI/i.test(t) },
  tradicional: { nombre: 'Casa Tradicional', detectar: t => /CASA\s+TRADICIONAL|ARGENTINA\s+REGIONALES/i.test(t) && !/MATE\s*MUNDO/i.test(t) },
  matemundo: { nombre: 'Mate Mundo', cuit: '23310139289', ivaAlCosto: 21, detectar: t => /MATE\s*MUNDO|COLANTONIO|23310139289/i.test(t) },
}
export function detectarProveedor(texto, cuitQr = '') {
  if (cuitQr) { const p = Object.entries(PROVEEDORES).find(([, v]) => v.cuit === String(cuitQr)); if (p) return p[0] }
  return ['matemundo', 'yumi', 'tradicional'].find(k => PROVEEDORES[k].detectar(texto)) || ''
}

const lineasDe = texto => String(texto || '').split(/\r?\n/).map(l => l.replace(/\s+/g, ' ').trim()).filter(Boolean)
// Saca la "basura" que el OCR agrega al final (manchas, bordes): palabras sin letras ni números
// o con signos raros ("<<", "“K<<")
const sacarBasuraFinal = d => { const w = d.split(' '); while (w.length > 1 && (!/[A-Za-zÁÉÍÓÚÑáéíóúñ0-9]/.test(w[w.length - 1]) || /[<>«»“”‘’~^{}\\]/.test(w[w.length - 1]))) w.pop(); return w.join(' ') }
const limpiarDesc = d => sacarBasuraFinal(String(d || '').replace(/[|_—–•]+/g, ' ').replace(/\s+/g, ' ').trim()).replace(/(\s[-:.,($E[\]]{1,3})+$/, '').replace(/[\s\-—:.($]+$/, '').replace(/\s+/g, ' ').trim()
// En los códigos de producto (palabras con guion, "BIL-BJO4-2") el OCR confunde O con 0
const arreglarCodigos = d => d.split(' ').map(w => /-/.test(w) && /\d/.test(w) ? w.replace(/([A-Z])O(?=\d|-|$)/g, '$10').replace(/:/g, '-') : w).join(' ')

function renglon(base) {
  return { codigo: '', descripcion: '', cantidad: null, precioUnit: null, importe: null, factor: 1, estado: 'ok', motivos: [], ...base }
}

// Cierra las cuentas de un renglón: cantidad × precio × factor = importe. Si falta un dato o no cierra,
// intenta deducirlo de los otros dos y lo marca "revisar".
function cerrarCuentas(r, { redondeoPrecio = 100 } = {}) {
  const f = r.factor || 1
  const { cantidad: c, precioUnit: p, importe: i } = r
  if (c && p != null && i != null && cerca(c * p * f, i)) return r
  // Leyó precio e importe pero no cierran: queda para decidir con el total del comprobante
  if (c && p != null && i != null) {
    const pDeImporte = i / (c * f)
    r.alternativas = [{ precioUnit: p, importe: redondear(c * p * f) }]
    if (Math.abs(pDeImporte / redondeoPrecio - Math.round(pDeImporte / redondeoPrecio)) < 0.001) r.alternativas.push({ precioUnit: redondear(pDeImporte), importe: i })
    r.leido = { precioUnit: p, importe: i }
    r.estado = 'revisar'; r.motivos.push(`Leí precio ${p.toLocaleString('es-AR')} e importe ${i.toLocaleString('es-AR')}, y no cierran`)
    return r
  }
  if (c && i != null && p == null) {
    const deducido = i / (c * f)
    if (Number.isFinite(deducido) && Math.abs(deducido / redondeoPrecio - Math.round(deducido / redondeoPrecio)) < 0.001) {
      r.motivos.push('Precio unitario deducido del importe')
      r.precioUnit = redondear(deducido); r.estado = 'revisar'; return r
    }
  }
  if (p != null && i != null && !c) {
    const cant = i / (p * f)
    if (Number.isFinite(cant) && cant > 0 && Math.abs(cant - Math.round(cant)) < 0.001 && Math.round(cant) < 10000) {
      r.motivos.push('Cantidad deducida del subtotal')
      r.cantidad = Math.round(cant); r.estado = 'revisar'; return r
    }
  }
  if (c && p != null && i == null) {
    r.importe = redondear(c * p * f); r.motivos.push('Importe calculado (no se pudo leer)'); r.estado = 'revisar'; return r
  }
  r.estado = 'revisar'
  r.motivos.push(c && p != null && i != null ? 'Las cuentas del renglón no cierran' : 'Faltan datos del renglón')
  return r
}

// ── Casa Yumi (ticket térmico) ────────────────────────────────────────────────
//   7798368423489 BOTINERO BOCA BBOT-BJ01
//   3 X 10500.00 X 0.80 =$ 25200.00
function parsearYumi(texto) {
  const L = lineasDe(texto), renglones = []
  let actual = null
  for (const l of L) {
    const cab = l.match(/^\D{0,3}(\d{11,14})\b[\s\-—–:.]*(.*)$/)
    if (cab && !/^\d{1,3}\s+X/i.test(l)) {
      actual = renglon({ codigo: cab[1], descripcion: arreglarCodigos(limpiarDesc(cab[2])) })
      renglones.push(actual); continue
    }
    const det = l.match(/^\W{0,2}(\d{1,3})?\W{0,2}\s+[Xx×]{1,3}\S*\s+(.*=.*)$/)
    if (det && actual && actual.cantidad == null && actual.importe == null) {
      actual.cantidad = det[1] ? Number(det[1]) : null
      const [izq, der = ''] = det[2].split('=')
      const tokIzq = izq.split(/\s+[Xx×»]+\S*\s*/).map(s => s.trim()).filter(Boolean)
      actual.precioUnit = /[áaé]/i.test(tokIzq[0] || '') ? null : monto(tokIzq[0])
      const d = String(tokIzq[1] || '').replace(/[^\dDOB.,]/g, '').replace(/[DOB]/g, '0').replace(/[.,]/g, '')
      actual._desc = d ? Number('0.' + d.replace(/^0+/, '')) : null
      const nums = der.match(/[\d.,]{3,}/g) || []
      actual.importe = nums.length ? monto(nums[nums.length - 1]) : null
    }
  }
  // Descuento del ticket: el más común entre los renglones (el OCR a veces lee 0.60 o D80)
  const cuenta = {}
  renglones.forEach(r => { if (r._desc > 0 && r._desc <= 1) cuenta[r._desc] = (cuenta[r._desc] || 0) + 1 })
  const desc = Number(Object.entries(cuenta).sort((a, b) => b[1] - a[1])[0]?.[0]) || 1
  renglones.forEach(r => { r.factor = desc; delete r._desc; cerrarCuentas(r) })
  const pago = texto.match(/PAGO\W{0,4}([\d.,]{4,})/i)
  return {
    renglones, fecha: fechaDe(texto), numero: '', total: pago ? monto(pago[1]) : null,
    nota: desc < 1 ? `El ticket tiene ${Math.round((1 - desc) * 100)}% de descuento en cada renglón: el costo es el precio con descuento.` : '',
    costoDe: r => redondear(r.precioUnit * desc),
  }
}

// ── Casa Tradicional (remito en hoja) ─────────────────────────────────────────
//   20 B-CHA10 BOMBI CHATA GRABADO/032 1,900.00 38,000.00
function parsearTradicional(texto) {
  const renglones = []
  for (const l of lineasDe(texto)) {
    const m = l.replace(/\s*\|\s*$/, '').match(/^\D{0,2}(\d{1,4})\s+([A-Z]{1,3}-[A-Z0-9]{2,})\s+(.+?)\s+(\S+)\s+(\S+)$/)
    if (!m) continue
    renglones.push(cerrarCuentas(renglon({ cantidad: Number(m[1]), codigo: m[2], descripcion: limpiarDesc(m[3]), precioUnit: monto(m[4]), importe: monto(m[5]) })))
  }
  const tot = [...texto.matchAll(/(?<![A-Za-z])Total\b[^\d\n]{0,8}([\d.,]{4,})/gi)].pop()
  const nro = texto.match(/\b(1\d{9})\b/)
  return { renglones, fecha: fechaDe(texto), numero: nro ? nro[1] : '', total: tot ? monto(tot[1]) : null, costoDe: r => r.precioUnit }
}

// ── Mate Mundo (factura A con IVA aparte) ─────────────────────────────────────
//   00002400 Mate Colibri P.P. GOLD 18 6900.00 124200.00
function parsearMateMundo(texto) {
  const renglones = []
  for (const l of lineasDe(texto)) {
    const m = l.match(/^(\d{8})\s+(.+?)\s+(\S+)\s+(\S+)\s+(\S+)$/)
    if (!m) continue
    const precio = monto(m[4]), sub = monto(m[5])
    if (precio == null && sub == null) continue
    renglones.push(cerrarCuentas(renglon({ codigo: m[1], descripcion: limpiarDesc(m[2]), cantidad: /^\d{1,4}$/.test(m[3]) ? Number(m[3]) : null, precioUnit: precio, importe: sub })))
  }
  const iva = PROVEEDORES.matemundo.ivaAlCosto
  const totales = [...texto.matchAll(/\$\s?([\d.,]{4,})/g)].map(x => monto(x[1])).filter(Boolean)
  return {
    renglones, fecha: fechaDe(texto.match(/Fecha[^\n]*/i)?.[0] || '') || fechaDe(texto), numero: (texto.match(/(\d{4})\s*[-–]\s*(\d{8})/) || []).slice(1).join('-'),
    total: totales.length ? Math.max(...totales) : null, iva,
    nota: `Factura A: el IVA ${iva}% se suma al costo (para un monotributista no se recupera). Lo podés desmarcar.`,
    costoDe: (r, conIva = true) => redondear(r.precioUnit * (conIva ? 1 + iva / 100 : 1)),
  }
}

// ── Genérica (proveedores sin plantilla) ──────────────────────────────────────
// Busca renglones "cantidad … descripción … precio … importe" o "descripción … cantidad … precio … importe"
// y se queda con los que cierran las cuentas.
function parsearGenerica(texto) {
  const renglones = []
  for (const l of lineasDe(texto)) {
    let m = l.match(/^(\d{1,4})\s+(.{3,}?)\s+([\d.,]{3,})\s+([\d.,]{3,})$/)
    let r = null
    if (m) r = renglon({ cantidad: Number(m[1]), descripcion: limpiarDesc(m[2]), precioUnit: monto(m[3]), importe: monto(m[4]) })
    else if ((m = l.match(/^(.{3,}?)\s+(\d{1,4})\s+([\d.,]{3,})\s+([\d.,]{3,})$/))) r = renglon({ descripcion: limpiarDesc(m[1]), cantidad: Number(m[2]), precioUnit: monto(m[3]), importe: monto(m[4]) })
    if (!r || !/[a-z]{3}/i.test(r.descripcion)) continue
    const cod = r.descripcion.match(/^([A-Z0-9][A-Z0-9-]{3,})\s+(.+)$/)
    if (cod && /\d/.test(cod[1])) { r.codigo = cod[1]; r.descripcion = cod[2] }
    renglones.push(cerrarCuentas(r))
  }
  const tot = [...texto.matchAll(/\bTOTAL\b\W{0,4}([\d.,]{4,})/gi)].pop()
  return { renglones, fecha: fechaDe(texto), numero: '', total: tot ? monto(tot[1]) : null, costoDe: r => r.precioUnit }
}

const PARSERS = { yumi: parsearYumi, tradicional: parsearTradicional, matemundo: parsearMateMundo }

// Interpreta el texto completo. qr: datos del QR de ARCA (si se pudo leer).
export function interpretarFactura(texto, { qr = null, proveedorForzado = '' } = {}) {
  texto = String(texto || '').replace(/[ \t\u00a0]+/g, ' ')
  const clave = proveedorForzado || detectarProveedor(texto, qr?.cuit)
  const r = (PARSERS[clave] || parsearGenerica)(texto)
  const res = {
    proveedorClave: clave, proveedor: clave ? PROVEEDORES[clave].nombre : '',
    fecha: r.fecha, numero: r.numero, total: r.total, nota: r.nota || '', iva: r.iva || 0,
    renglones: r.renglones.map((x, i) => ({ ...x, n: i + 1, costoUnit: x.precioUnit != null ? r.costoDe(x) : null })),
    avisos: [],
  }
  if (qr) {
    if (qr.fecha) res.fecha = fechaDe(qr.fecha) || res.fecha
    if (qr.importe) res.total = Number(qr.importe)
    if (qr.nroCmp) res.numero = `${String(qr.ptoVta || 0).padStart(4, '0')}-${String(qr.nroCmp).padStart(8, '0')}`
    res.qr = qr
  }
  if (qr && qr.importe) res.total = Number(qr.importe)
  // Una fecha de hace más de un año no es la de la factura (suele ser "Inicio de actividades")
  if (res.fecha) { const [d, m, a] = res.fecha.split('/').map(Number); if (Date.now() - Date.UTC(a, m - 1, d) > 400 * 86400000) res.fecha = '' }
  resolverConTotal(res, r.costoDe)
  revisarTotal(res)
  return res
}

// Renglones donde el precio y el importe leídos no cierran: prueba las combinaciones posibles
// (creerle al precio o al importe) y se queda con la que hace coincidir la suma con el total.
function resolverConTotal(res, costoDe) {
  const dudosos = res.renglones.filter(r => r.alternativas?.length)
  if (!dudosos.length) return
  const fijo = res.renglones.filter(r => !r.alternativas?.length).reduce((s, r) => s + (r.importe || 0), 0)
  const factorTotal = res.iva ? 1 + res.iva / 100 : 1
  let mejor = null
  const n = Math.min(dudosos.length, 10)
  const combos = dudosos.slice(0, n).reduce((acc, r) => acc.flatMap(c => r.alternativas.map((_, k) => [...c, k])), [[]])
  for (const combo of combos) {
    const suma = fijo + combo.reduce((s, k, j) => s + dudosos[j].alternativas[k].importe, 0)
    const dif = res.total != null ? Math.abs(suma * factorTotal - res.total) : 0
    if (!mejor || dif < mejor.dif) mejor = { combo, dif }
  }
  dudosos.slice(0, n).forEach((r, j) => {
    const alt = r.alternativas[res.total != null ? mejor.combo[j] : 0]
    r.precioUnit = alt.precioUnit; r.importe = alt.importe
    r.costoUnit = costoDe(r)
    if (res.total != null && mejor.dif < 2) r.motivos.push('Corregido para que cierre con el total; verificalo')
  })
}

// Compara la suma de los renglones con el total del comprobante (con IVA si corresponde)
export function revisarTotal(res, { conIva = true } = {}) {
  res.avisos = []
  const suma = res.renglones.filter(r => r.incluir !== false).reduce((s, r) => s + (r.importe || 0), 0)
  const esperado = res.iva && conIva ? suma * (1 + res.iva / 100) : suma
  res.sumaRenglones = redondear(suma)
  if (!res.renglones.length) res.avisos.push('No encontré renglones de productos. Probá con una foto más derecha y con más luz, o cargalos a mano.')
  else if (res.total != null && !cerca(esperado, res.total, 2)) {
    const dif = res.total - esperado
    res.avisos.push(`La suma de los renglones ($${Math.round(esperado).toLocaleString('es-AR')}) no coincide con el total del comprobante ($${Math.round(res.total).toLocaleString('es-AR')}): ${dif > 0 ? 'faltan' : 'sobran'} $${Math.round(Math.abs(dif)).toLocaleString('es-AR')}. Revisá los renglones marcados.`)
  }
  res.totalCierra = res.renglones.length > 0 && (res.total == null || cerca(esperado, res.total, 2))
  return res
}

// ── QR de ARCA ────────────────────────────────────────────────────────────────
// https://www.afip.gob.ar/fe/qr/?p=<base64 de un JSON con fecha, cuit, ptoVta, tipoCmp, nroCmp, importe…>
export function leerQrArca(texto) {
  const m = String(texto || '').match(/[?&]p=([A-Za-z0-9+/=_-]+)/)
  if (!m) return null
  try {
    const b64 = m[1].replace(/-/g, '+').replace(/_/g, '/')
    const json = typeof atob === 'function' ? decodeURIComponent(escape(atob(b64))) : Buffer.from(b64, 'base64').toString('utf8')
    const d = JSON.parse(json)
    return { fecha: d.fecha || '', cuit: String(d.cuit || ''), ptoVta: d.ptoVta, tipoCmp: d.tipoCmp, nroCmp: d.nroCmp, importe: Number(d.importe) || null, moneda: d.moneda || '' }
  } catch { return null }
}

// ── Match con los artículos ───────────────────────────────────────────────────
export const normalizar = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ñ/g, 'n')
const tokens = s => normalizar(s).split(/[^a-z0-9]+/).filter(t => t.length >= 2)
const trigramas = s => { const t = ` ${normalizar(s).replace(/[^a-z0-9]+/g, ' ').trim()} `; const g = new Set(); for (let i = 0; i < t.length - 2; i++) g.add(t.slice(i, i + 3)); return g }
const dice = (a, b) => { if (!a.size || !b.size) return 0; let n = 0; a.forEach(x => { if (b.has(x)) n++ }); return 2 * n / (a.size + b.size) }
// Códigos de modelo dentro de la descripción ("RIN-BJ03-1"): si los dos tienen y no coinciden, son
// productos distintos aunque el resto del nombre sea igual
const codigosModelo = s => new Set((String(s || '').toUpperCase().match(/\b[A-Z0-9]+-[A-Z0-9-]*\d[A-Z0-9-]*\b/g) || []).map(c => c.replace(/O/g, '0').replace(/-+$/, '')))
export function similitud(a, b) {
  const ta = new Set(tokens(a)), tb = new Set(tokens(b))
  let comunes = 0; ta.forEach(t => { if (tb.has(t)) comunes++ })
  const tok = ta.size && tb.size ? comunes / Math.min(ta.size, tb.size) : 0
  let s = 0.6 * dice(trigramas(a), trigramas(b)) + 0.4 * tok
  const ca = codigosModelo(a), cb = codigosModelo(b)
  if (ca.size && cb.size && ![...ca].some(c => cb.has(c))) s *= 0.4
  return s
}

export const claveCodigo = c => normalizar(c).replace(/o/g, '0').replace(/[^a-z0-9]/g, '')
export const claveDescripcion = d => tokens(d).join(' ')
const hamming1 = (a, b) => { if (a.length !== b.length || a.length < 8) return false; let d = 0; for (let i = 0; i < a.length; i++) if (a[i] !== b[i] && ++d > 1) return false; return d === 1 }

// memoria: [{ proveedor, codigo, descripcion, articuloId }] (lo último cargado gana)
// Devuelve para el renglón: { articuloId, origen: 'memoria' | 'sugerido' | '', sugerencias: [{ art, score }] }
export function buscarArticulo(r, proveedor, articulos, memoria = []) {
  const prov = normalizar(proveedor)
  const mem = memoria.filter(m => normalizar(m.proveedor) === prov)
  const cod = claveCodigo(r.codigo), desc = claveDescripcion(r.descripcion)
  const existe = id => articulos.some(a => a.id === id)
  for (let i = mem.length - 1; i >= 0; i--) {
    const m = mem[i]
    if (!existe(m.articuloId)) continue
    if (cod && claveCodigo(m.codigo) === cod) return { articuloId: m.articuloId, origen: 'memoria', sugerencias: [] }
  }
  for (let i = mem.length - 1; i >= 0; i--) {
    const m = mem[i]
    if (!existe(m.articuloId)) continue
    if (desc && claveDescripcion(m.descripcion) === desc) return { articuloId: m.articuloId, origen: 'memoria', sugerencias: [] }
    if (cod && hamming1(claveCodigo(m.codigo), cod) && similitud(m.descripcion, r.descripcion) > 0.6) return { articuloId: m.articuloId, origen: 'memoria', sugerencias: [] }
  }
  const sugerencias = articulos.map(art => ({ art, score: similitud(r.descripcion, art.nombre) }))
    .filter(x => x.score >= 0.25).sort((a, b) => b.score - a.score).slice(0, 5)
  const mejor = sugerencias[0]
  const claro = mejor && mejor.score >= 0.55 && (!sugerencias[1] || mejor.score - sugerencias[1].score >= 0.08)
  return { articuloId: claro ? mejor.art.id : '', origen: claro ? 'sugerido' : '', sugerencias }
}
