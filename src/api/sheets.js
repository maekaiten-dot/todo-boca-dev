// src/api/sheets.js
const SHEET_ID = import.meta.env.VITE_SHEET_ID
const CLIENT_EMAIL = import.meta.env.VITE_GOOGLE_CLIENT_EMAIL
const PRIVATE_KEY = import.meta.env.VITE_GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n')
const SCOPES = ['https://www.googleapis.com/auth/spreadsheets']
let _cachedToken = null
let _tokenExpiry = 0

async function getAccessToken() {
  if (_cachedToken && Date.now() < _tokenExpiry - 60000) return _cachedToken
  const header = { alg: 'RS256', typ: 'JWT' }
  const now = Math.floor(Date.now() / 1000)
  const claim = { iss: CLIENT_EMAIL, scope: SCOPES.join(' '), aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 }
  const encode = (obj) => btoa(JSON.stringify(obj)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
  const headerB64 = encode(header)
  const claimB64 = encode(claim)
  const signingInput = `${headerB64}.${claimB64}`
  const pemBody = PRIVATE_KEY.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\n/g, '')
  const binaryKey = Uint8Array.from(atob(pemBody), (c) => c.charCodeAt(0))
  const cryptoKey = await crypto.subtle.importKey('pkcs8', binaryKey, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign'])
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', cryptoKey, new TextEncoder().encode(signingInput))
  const sigB64 = btoa(String.fromCharCode(...new Uint8Array(signature))).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
  const jwt = `${signingInput}.${sigB64}`
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  })
  const data = await res.json()
  _cachedToken = data.access_token
  _tokenExpiry = Date.now() + data.expires_in * 1000
  return _cachedToken
}

async function sheetsGet(range) {
  const token = await getAccessToken()
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(range)}`
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
  if (!res.ok) throw new Error(`Sheets GET error: ${res.status}`)
  return res.json()
}

async function sheetsAppend(range, values) {
  const token = await getAccessToken()
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(range)}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ values }),
  })
  if (!res.ok) throw new Error(`Sheets APPEND error: ${res.status}`)
  return res.json()
}

async function sheetsUpdate(range, values) {
  const token = await getAccessToken()
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(range)}?valueInputOption=USER_ENTERED`
  const res = await fetch(url, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ values }),
  })
  if (!res.ok) throw new Error(`Sheets UPDATE error: ${res.status}`)
  return res.json()
}

function getArgentinaDate() {
  const now = new Date()
  const locale = now.toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', hour12: false })
  const [fechaPart, horaPart] = locale.split(', ')
  const [dia, mes, anio] = fechaPart.split('/')
  const meses = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre']
  return { fecha: fechaPart, hora: horaPart, mes: meses[parseInt(mes) - 1], anio: parseInt(anio), raw: now }
}

function parsePrecio(v) {
  if (!v && v !== 0) return 0
  return Number(String(v).replace(/[$\s.]/g, '').replace(',', '.')) || 0
}

// ── Imanes ───────────────────────────────────────────────────────────────────
const IMANES_A = new Set(['TB00049','TB00050','TB00051','TB00052','TB00053','TB00054','TB00055','TB00056','TB00058','TB00359','TB01011','TB01043','TB01044','TB01089','TB01090','TB01127'])
const IMANES_B = new Set(['TB00399','TB00433','TB00587','TB00741','TB00805','TB00059'])

// ── Promos temporales (vencen 15/06/2026 23:00 ART) ─────────────────────────
const PROMO_EXPIRY = new Date('2026-06-16T02:00:00.000Z')
const LLAVEROS_PROMO = new Set([
  'TB00156','TB00157','TB00158','TB00159','TB00160','TB00161','TB00162','TB00164',
  'TB00165','TB00166','TB00167','TB00168','TB00169','TB00171','TB00240','TB00487',
  'TB00499','TB00558','TB00779','TB00802','TB00819','TB00836','TB00839','TB00847',
  'TB00855','TB00856','TB00865','TB00871','TB00879','TB01008','TB01012','TB01021',
  'TB01034','TB01039','TB01042','TB01064','TB01072','TB01079','TB01080','TB01081',
])
const REMERAS_PROMO = new Set(['TB00708','TB00714'])
const CHOMBAS_PROMO = new Set(['TB00969','TB00970'])

// ── Combo Alfajores (sin vencimiento): 6 unidades combinadas = $13.000 ──────
const ALFAJORES_PROMO = new Set(['TB01118','TB01117','TB01098'])
const ALFAJORES_PRECIO_GRUPO = 13000
const ALFAJORES_CANT_GRUPO = 6

function _promosActivas() { return Date.now() < PROMO_EXPIRY.getTime() }
function _precioLlaveroPromo(cantTotal) {
  if (cantTotal >= 6) return 4667
  if (cantTotal >= 3) return 5000
  return 6000
}

function calcularDescuentosImanesItems(items) {
  const itemsA = items.filter(i => IMANES_A.has(i.articulo || i.id))
  const itemsB = items.filter(i => IMANES_B.has(i.articulo || i.id))
  const cantA = itemsA.reduce((s, i) => s + i.cantidad, 0)
  const cantB = itemsB.reduce((s, i) => s + i.cantidad, 0)
  const totalPrecioA = itemsA.reduce((s, i) => s + i.precioUnitario * i.cantidad, 0)
  const totalPrecioB = itemsB.reduce((s, i) => s + i.precioUnitario * i.cantidad, 0)
  const dtoTotalA_x3 = cantA >= 3 ? Math.round(totalPrecioA * 0.25) : 0
  const dtoTotalA_x2 = cantA === 2 ? Math.round(totalPrecioA * 0.125) : 0
  const dtoTotalB_x3 = cantB >= 3 ? Math.round(totalPrecioB * 0.333333) : 0
  const dtoTotalB_x2 = cantB === 2 ? Math.round(totalPrecioB * 0.166666) : 0
  return items.map(item => {
    const sku = item.articulo || item.id
    const precioItem = item.precioUnitario * item.cantidad
    let dtoX3 = 0, dtoX2 = 0
    if (IMANES_A.has(sku) && totalPrecioA > 0) {
      const p = precioItem / totalPrecioA
      dtoX3 = cantA >= 3 ? Math.round(dtoTotalA_x3 * p) : 0
      dtoX2 = cantA === 2 ? Math.round(dtoTotalA_x2 * p) : 0
    } else if (IMANES_B.has(sku) && totalPrecioB > 0) {
      const p = precioItem / totalPrecioB
      dtoX3 = cantB >= 3 ? Math.round(dtoTotalB_x3 * p) : 0
      dtoX2 = cantB === 2 ? Math.round(dtoTotalB_x2 * p) : 0
    }
    return {
      dtoIman8000x3: IMANES_A.has(sku) ? dtoX3 : 0,
      dtoIman8000x2: IMANES_A.has(sku) ? dtoX2 : 0,
      dtoIman6000x3: IMANES_B.has(sku) ? dtoX3 : 0,
      dtoIman6000x2: IMANES_B.has(sku) ? dtoX2 : 0,
      descuentoImanes: dtoX3 + dtoX2,
    }
  })
}

function calcularDescuentoPromoItem(item, items) {
  if (!_promosActivas()) return 0
  const sku = item.articulo || item.id
  if (LLAVEROS_PROMO.has(sku)) {
    const cantLlaveros = items.filter(i => LLAVEROS_PROMO.has(i.articulo || i.id)).reduce((s, i) => s + i.cantidad, 0)
    return (item.precioUnitario - _precioLlaveroPromo(cantLlaveros)) * item.cantidad
  }
  if (REMERAS_PROMO.has(sku)) return (item.precioUnitario - 11500) * item.cantidad
  if (CHOMBAS_PROMO.has(sku)) return (item.precioUnitario - 18000) * item.cantidad
  return 0
}

// Reparte el combo en el orden en que los items vienen en el carrito: las primeras
// unidades hasta completar cada grupo de 6 van al precio de combo, el resto queda
// a precio de lista de su propio item. Debe coincidir con el mismo criterio del
// front-end (NuevaVenta.jsx) para que lo cobrado coincida con lo mostrado en pantalla.
function calcularDescuentoAlfajorItem(item, items) {
  const sku = item.articulo || item.id
  if (!ALFAJORES_PROMO.has(sku)) return 0
  const itemsAlf = items.filter(i => ALFAJORES_PROMO.has(i.articulo || i.id))
  const cantTotal = itemsAlf.reduce((s, i) => s + i.cantidad, 0)
  const grupos = Math.floor(cantTotal / ALFAJORES_CANT_GRUPO)
  if (grupos === 0) return 0
  const unidadesEnCombo = grupos * ALFAJORES_CANT_GRUPO
  const precioPorUnidadCombo = ALFAJORES_PRECIO_GRUPO / ALFAJORES_CANT_GRUPO

  let acumulado = 0
  let enComboDeEsteItem = 0
  for (const i of itemsAlf) {
    const skuI = i.articulo || i.id
    const desde = acumulado
    const hasta = acumulado + i.cantidad
    const enCombo = Math.max(0, Math.min(hasta, unidadesEnCombo) - desde)
    if (skuI === sku) enComboDeEsteItem = enCombo
    acumulado = hasta
  }
  return enComboDeEsteItem * (item.precioUnitario - precioPorUnidadCombo)
}

// ── Exports ───────────────────────────────────────────────────────────────────

export async function registrarLog({ accion, detalle, idReferencia = '', empleado = '', resultado = 'OK' }) {
  try {
    const dt = getArgentinaDate()
    const timestamp = new Date().toISOString()
    const row = [`'${timestamp}`, `'${dt.fecha}`, `'${dt.hora}`, empleado, accion, detalle, idReferencia, resultado]
    await sheetsAppend('APP_LOG!A1', [row])
  } catch (e) { console.warn('Error al registrar log:', e) }
}

export async function getArticulos() {
  const data = await sheetsGet('ARTICULOS!A1:Z')
  const rows = data.values || []
  if (rows.length === 0) return []
  const headers = rows[0].map(h => h?.toString().toUpperCase().trim() ?? '')
  const col = (...keys) => {
    for (const key of keys) { const idx = headers.findIndex(h => h === key); if (idx >= 0) return idx }
    for (const key of keys) { const idx = headers.findIndex(h => h.includes(key)); if (idx >= 0) return idx }
    return -1
  }
  const iId = col('ID','ARTICULO','SKU','CODIGO','COD')
  const iNombre = col('NOMBRE','DESCRIPCION','PRODUCTO')
  const iStock = col('STOCK INICIAL','STOCK')
  const iInfo = col('INFO','DETALLE')
  const iDisp = col('DISPONIBILIDAD','DISPONIB','ACTIVO','ESTADO')
  const iFoto = col('FOTO','IMAGEN','IMAGE','IMG','URL')
  const iPrecio = col('PRECIO UNITARIO','PRECIO')
  const iCosto = col('COSTO UNITARIO','COSTO')
  const iReponer = col('CANTIDAD REPONER','REPONER','CANT REPONER')
  const iStockC = col('STOCK CIERRE','CIERRE')
  const iStockA = col('STOCK ACTUAL','ACTUAL')
  const idx = (found, fallback) => found >= 0 ? found : fallback
  const parseNum = v => Number(String(v||'0').replace(/[$\s]/g,'').replace(/\./g,'').replace(',','.')) || 0
  return rows.slice(1)
    .filter(r => r[idx(iId,0)])
    .map(r => ({
      id: r[idx(iId,0)]||'', nombre: r[idx(iNombre,1)]||'',
      stockInicial: parseNum(r[idx(iStock,2)]), info: r[idx(iInfo,3)]||'',
      disponibilidad: r[idx(iDisp,4)]||'', foto: r[idx(iFoto,5)]||'',
      precioUnitario: parseNum(r[idx(iPrecio,6)]), costoUnitario: parseNum(r[idx(iCosto,7)]),
      cantidadReponer: parseNum(r[idx(iReponer,8)]), stockCierre: parseNum(r[idx(iStockC,9)]),
      stockActual: parseNum(r[idx(iStockA,10)]),
    }))
    .filter(a => { const d = a.disponibilidad?.toString().toUpperCase(); return !d||d==='ACTIVO'||d==='SI'||d==='TRUE'||d==='1' })
}

export async function getUsuarios() {
  const data = await sheetsGet('USUARIOS!A2:E')
  const rows = data.values || []
  return rows.filter(r => r[0]&&r[1]).map(r => ({ id:r[0]||'', nombre:r[1]||'', codigo:r[2]||'', tipo:r[3]||'' }))
}

function mapRow(r) {
  return {
    idDetalle:r[0], idVenta:r[1], fecha:r[2], hora:r[3], mes:r[4], anio:r[5],
    articulo:r[6], nombre:r[7], foto:r[8],
    cantidad: Number(r[9])||0,
    precioUnitario: parsePrecio(r[10]),
    precioTotal: parsePrecio(r[11]),
    costoUnitario: parsePrecio(r[12]),
    costoTotal: parsePrecio(r[13]),
    empleado:r[14], metodoPago:r[15],
    descuento: Number(r[16])||0,
    descCarrito:r[17],
    precioTotalFinal: parsePrecio(r[18]),
    notas:r[19],
    anulado: r[20]==='TRUE'||r[20]===true,
    ingresoNeto: parsePrecio(r[21]),
    posnet: r[34] || '',
    correccionPosnet: r[35] || '',
  }
}

export async function getVentasHoy() {
  const data = await sheetsGet('DETALLE DE VENTAS!A2:AJ')
  const rows = data.values || []
  const { fecha } = getArgentinaDate()
  return rows.filter(r => r[2]===fecha).map(mapRow)
}

export async function getHistoricoVentas() {
  // Hasta AJ para incluir el POSNET (amarillo/blanco) y su corrección manual
  const data = await sheetsGet('DETALLE DE VENTAS!A2:AJ')
  const rows = data.values || []
  return rows.filter(r => r[0]).map(mapRow)
}

export async function anularVenta(idVenta, empleado = '') {
  const data = await sheetsGet('DETALLE DE VENTAS!A2:U')
  const rows = data.values || []
  const requests = []
  rows.forEach((r, idx) => { if (r[1]===idVenta) requests.push(sheetsUpdate(`DETALLE DE VENTAS!U${idx+2}`, [['TRUE']])) })
  if (requests.length===0) throw new Error('No se encontraron filas para anular')
  await Promise.all(requests)
  await registrarLog({ accion:'VENTA_ANULADA', detalle:`Venta ${idVenta} anulada (${requests.length} items)`, idReferencia:idVenta, empleado, resultado:'OK' })
  return requests.length
}

export async function generarIdVenta() {
  const data = await sheetsGet('DETALLE DE VENTAS!A2:B')
  const rows = data.values || []
  const { raw } = getArgentinaDate()
  const prefix = `V${String(raw.getFullYear()).slice(2)}${String(raw.getMonth()+1).padStart(2,'0')}${String(raw.getDate()).padStart(2,'0')}`
  const idsHoy = new Set(rows.map(r => r[1]).filter(id => id?.startsWith(prefix)))
  let finalSeq = idsHoy.size + 1
  while (idsHoy.has(`${prefix}-${String(finalSeq).padStart(3,'0')}`)) finalSeq++
  return `${prefix}-${String(finalSeq).padStart(3,'0')}`
}

// ── Columnas extra de DETALLE DE VENTAS ──────────────────────────────────────
// AE: monto descontado por socio del club · AF: monto descontado por la promo 2x1 remeras XXXL
const COL_DTO_SOCIO = 'AE'
const COL_DTO_XXXL = 'AF'
const _columnasListas = new Set()

function numeroDeColumna(letras) {
  return letras.split('').reduce((n, c) => n * 26 + (c.charCodeAt(0) - 64), 0)
}

// Se asegura de que DETALLE DE VENTAS tenga la columna y su encabezado (si la celda está vacía)
async function asegurarColumna(letra, encabezado) {
  if (_columnasListas.has(letra)) return
  const token = await getAccessToken()
  const metaRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}?fields=sheets.properties(sheetId,title,gridProperties.columnCount)`, { headers: { Authorization: `Bearer ${token}` } })
  if (!metaRes.ok) throw new Error(`Sheets META error: ${metaRes.status}`)
  const hoja = ((await metaRes.json()).sheets || []).find(h => h.properties?.title === 'DETALLE DE VENTAS')
  if (!hoja) throw new Error('No se encontró la hoja DETALLE DE VENTAS')
  const columnas = hoja.properties.gridProperties?.columnCount || 0
  const necesarias = numeroDeColumna(letra)
  if (columnas < necesarias) {
    const res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}:batchUpdate`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ requests: [{ appendDimension: { sheetId: hoja.properties.sheetId, dimension: 'COLUMNS', length: necesarias - columnas } }] }),
    })
    if (!res.ok) throw new Error(`Sheets ADD COLUMN error: ${res.status}`)
  }
  const enc = await sheetsGet(`DETALLE DE VENTAS!${letra}1`)
  if (!enc.values?.[0]?.[0]) await sheetsUpdate(`DETALLE DE VENTAS!${letra}1`, [[encabezado]])
  _columnasListas.add(letra)
}

// ── Corrección manual del posnet de una venta ────────────────────────────────
// Cambia AI (POSNET) en todas las filas de la venta y deja constancia en AJ (CORRECCIÓN POSNET):
// "AMARILLO → BLANCO · motivo · quién · fecha hora". Si ya había correcciones, se suman separadas por " | ".
const COL_CORRECCION_POSNET = 'AJ'
export const MOTIVOS_CORRECCION_POSNET = ['Se cobró con el otro posnet', 'El posnet indicado no funcionaba', 'Error al cargar la venta', 'Otro']

export async function corregirPosnetVenta({ idVenta, posnetNuevo, motivo, detalle = '', quien = '' }) {
  if (!POSNETS.includes(posnetNuevo)) throw new Error('POSNET_INVALIDO')
  if (!motivo || (motivo === 'Otro' && !detalle.trim())) throw new Error('FALTA_MOTIVO')
  const data = await sheetsGet('DETALLE DE VENTAS!A2:AJ')
  const rows = data.values || []
  const filas = []
  rows.forEach((r, i) => { if (r[1] === idVenta) filas.push({ fila: i + 2, metodo: r[15] || '', posnet: r[34] || '', nota: r[35] || '' }) })
  if (filas.length === 0) throw new Error('VENTA_NO_ENCONTRADA')
  if (!filas.some(f => POSNET_METODOS.has(f.metodo))) throw new Error('VENTA_SIN_POSNET')
  const anterior = filas[0].posnet || 'SIN DATO'
  if (anterior === posnetNuevo) throw new Error('MISMO_POSNET')
  await asegurarColumna(COL_POSNET, 'POSNET')
  await asegurarColumna(COL_CORRECCION_POSNET, 'CORRECCIÓN POSNET')
  const dt = getArgentinaDate()
  const texto = `${anterior} → ${posnetNuevo} · ${motivo}${detalle.trim() ? ` (${detalle.trim()})` : ''} · ${quien || 'sin nombre'} · ${dt.fecha} ${String(dt.hora).slice(0, 5)}`
  await Promise.all(filas.map(f => sheetsUpdate(`DETALLE DE VENTAS!AI${f.fila}:AJ${f.fila}`, [[posnetNuevo, f.nota ? `${f.nota} | ${texto}` : texto]])))
  await registrarLog({ accion: 'POSNET_CORREGIDO', detalle: `${idVenta} · ${texto}`, idReferencia: idVenta, empleado: quien, resultado: 'OK' })
  return { anterior, posnetNuevo }
}

// ── Promo 2x1 remeras XXXL ───────────────────────────────────────────────────
// Llevando 2 remeras XXXL de esta lista, pagás 1 (cada remera del par sale 50% off).
// Las unidades impares van a precio de lista. La promo termina sola al llegar a 16 unidades vendidas
// o al terminar el 31/12/2026 (hora de Argentina), lo que pase primero.
export const REMERAS_XXXL = new Set([
  'TB00708','TB00714','TB00840','TB00845','TB00882','TB00961','TB00963',
  'TB01010','TB01023','TB01047','TB01113','TB01114','TB01142',
])
export const PROMO_XXXL_TOPE = 16
export const PROMO_XXXL_VENCE = new Date('2027-01-01T03:00:00.000Z') // 31/12/2026 23:59:59 ART

// Reparte la promo entre los items marcados como XXXL (item.xxxl = unidades XXXL de esa línea).
// Se aplica por pares y sin pasar las unidades que le quedan a la promo.
// Devuelve, alineado con items: { unidades, descuento } y el total. Debe usarse igual en carrito y al guardar.
export function calcularPromoXXXL(items, unidadesDisponibles) {
  const marcadas = items.map(i => REMERAS_XXXL.has(i.articulo || i.id) ? Math.max(0, Math.min(i.xxxl || 0, i.cantidad)) : 0)
  const totalMarcadas = marcadas.reduce((s, n) => s + n, 0)
  const paresPosibles = Math.floor(totalMarcadas / 2)
  const paresDisponibles = Math.floor(Math.max(0, unidadesDisponibles) / 2)
  let restantes = Math.min(paresPosibles, paresDisponibles) * 2
  const porItem = items.map((item, idx) => {
    const unidades = Math.min(marcadas[idx], restantes)
    restantes -= unidades
    return { unidades, descuento: unidades * item.precioUnitario * 0.5 }
  })
  const unidadesEnPromo = porItem.reduce((s, x) => s + x.unidades, 0)
  return {
    porItem,
    totalMarcadas,
    unidadesEnPromo,
    descuento: porItem.reduce((s, x) => s + x.descuento, 0),
    sueltas: totalMarcadas - unidadesEnPromo,
  }
}

// Cuántas unidades se vendieron con la promo (ventas no anuladas con monto en AF)
export async function getPromoXXXLEstado() {
  if (Date.now() >= PROMO_XXXL_VENCE.getTime()) return { vendidas: null, disponibles: 0, activa: false, vencida: true }
  const token = await getAccessToken()
  const rangos = ['G2:G', 'K2:K', 'U2:U', `${COL_DTO_XXXL}2:${COL_DTO_XXXL}`].map(r => `ranges=${encodeURIComponent('DETALLE DE VENTAS!' + r)}`).join('&')
  const res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values:batchGet?${rangos}`, { headers: { Authorization: `Bearer ${token}` } })
  if (!res.ok) throw new Error(`Sheets BATCHGET error: ${res.status}`)
  const [art, precio, anulado, dto] = ((await res.json()).valueRanges || []).map(v => v.values || [])
  let vendidas = 0
  for (let i = 0; i < dto.length; i++) {
    const monto = parsePrecio(dto[i]?.[0])
    if (monto <= 0) continue
    if (!REMERAS_XXXL.has(art[i]?.[0])) continue
    if (anulado[i]?.[0] === 'TRUE') continue
    const p = parsePrecio(precio[i]?.[0])
    if (p > 0) vendidas += Math.round(monto / (p * 0.5))
  }
  const disponibles = Math.max(0, PROMO_XXXL_TOPE - vendidas)
  return { vendidas, disponibles, activa: disponibles >= 2, vencida: false }
}

// ── Redondeo para socios que pagan en Efectivo Pesos ─────────────────────────
// Si la venta lleva descuento de socio y se paga en Efectivo Pesos, el total se redondea
// SIEMPRE hacia abajo al múltiplo de $500 (a favor del cliente). Se guarda en AH (REDONDEO).
// (El descuento por pago en efectivo se sacó: la columna AG queda solo con datos viejos.)
export const REDONDEO_METODO = 'Efectivo Pesos'
export const REDONDEO_MULTIPLO = 500
const COL_DTO_EFECTIVO = 'AG'
const COL_REDONDEO = 'AH'

// ── Posnet con el que se cobra (tarjeta y QR) ────────────────────────────────
// Se decide por el bruto MENOS las promos (imanes, alfajores, 2x1 XXXL), antes de socio/efectivo:
// menos de $50.000 → posnet AMARILLO · $50.000 o más → posnet BLANCO. Se guarda en AI (POSNET).
export const POSNET_TOPE = 50000
export const POSNET_METODOS = new Set(['Tarjeta de Crédito', 'Tarjeta de Débito', 'Tarjeta', 'QR'])
export const POSNETS = ['AMARILLO', 'BLANCO']
const COL_POSNET = 'AI'
export function posnetSugerido(brutoMenosPromos) {
  return Math.round(brutoMenosPromos) < POSNET_TOPE ? 'AMARILLO' : 'BLANCO'
}

// ── Moneda extranjera: sin descuentos ────────────────────────────────────────
// Pagando en efectivo con dólares, euros o reales no hay descuento de socio ni de efectivo.
export const METODOS_MONEDA_EXTRANJERA = new Set(['Efectivo Dólares', 'Efectivo Euros', 'Efectivo Reales'])
export function socioPermitido(metodoPago) {
  return !METODOS_MONEDA_EXTRANJERA.has(metodoPago)
}

// montoActual: total con promos y descuento de socio. Usar la MISMA función en carrito y al guardar.
export function calcularRedondeoSocio({ montoActual, metodoPago, socio }) {
  const aplica = !!socio && metodoPago === REDONDEO_METODO && montoActual > 0
  if (!aplica) return { aplica: false, redondeo: 0, antesRedondeo: montoActual, total: montoActual }
  let total = Math.floor((montoActual + 1e-6) / REDONDEO_MULTIPLO) * REDONDEO_MULTIPLO
  // Compras de menos de $500: no se redondea (quedaría en $0)
  if (total <= 0) total = Math.round(montoActual)
  return { aplica: true, redondeo: montoActual - total, antesRedondeo: montoActual, total }
}

export async function registrarVenta({ items, metodoPago, descCarrito = 0, empleado = '', notas = '', descuentoImanes = 0, descuentoPromo = 0, socio = false, descuentoXXXLEsperado = 0, totalEsperado = null, posnet = '' }) {
  // Moneda extranjera: el descuento de socio no corresponde (control final antes de guardar)
  if (socio && !socioPermitido(metodoPago)) throw new Error('SOCIO_NO_APLICA')
  // Promo 2x1 XXXL: se vuelve a verificar contra la planilla justo antes de guardar
  const hayXXXL = items.some(i => REMERAS_XXXL.has(i.articulo || i.id) && (i.xxxl || 0) > 0)
  let promoXXXL = null
  if (hayXXXL) {
    const estado = await getPromoXXXLEstado()
    promoXXXL = calcularPromoXXXL(items, estado.disponibles)
    if (Math.round(promoXXXL.descuento) !== Math.round(descuentoXXXLEsperado)) {
      const err = new Error('PROMO_XXXL_CAMBIO')
      err.estadoPromoXXXL = estado
      throw err
    }
    if (promoXXXL.descuento > 0) await asegurarColumna(COL_DTO_XXXL, 'DTO 2x1 XXXL')
  }
  const conXXXL = promoXXXL?.descuento > 0
  if (socio) await asegurarColumna(COL_DTO_SOCIO, 'DTO SOCIO')
  const posnetVenta = POSNET_METODOS.has(metodoPago) && POSNETS.includes(posnet) ? posnet : ''
  if (posnetVenta) await asegurarColumna(COL_POSNET, 'POSNET')
  const dt = getArgentinaDate()
  const idVenta = await generarIdVenta()
  const dtosPorItem = calcularDescuentosImanesItems(items)
  const existentes = await sheetsGet('DETALLE DE VENTAS!A:A')
  const allRows = existentes.values || []
  let lastDataRow = 1
  allRows.forEach((r, i) => { if (r[0] && String(r[0]).trim()) lastDataRow = i+1 })
  const nextRow = lastDataRow + 1

  // 1) Precio final de cada línea con promos y descuento socio/manual (sin redondear todavía)
  const lineas = items.map((item, idx) => {
    const precioTotal = item.cantidad * item.precioUnitario
    const descuentoItem = item.descuento || 0
    const dto = dtosPorItem[idx]
    const dtoPromoItem = calcularDescuentoPromoItem(item, items)
    const dtoAlfajorItem = calcularDescuentoAlfajorItem(item, items)
    const dtoXXXLItem = conXXXL ? promoXXXL.porItem[idx].descuento : 0
    const baseConDtos = precioTotal - dto.descuentoImanes - dtoPromoItem - dtoAlfajorItem - dtoXXXLItem
    // Las remeras del 2x1 XXXL no se combinan con socio/efectivo: lo que se paga por ellas
    // (la mitad de cada par = dtoXXXLItem) queda fuera de la base de esos descuentos
    const baseDescuentos = baseConDtos - dtoXXXLItem
    let precioTotalFinal
    let dtoSocioItem = 0
    if (descuentoItem > 0) {
      precioTotalFinal = baseConDtos - (baseDescuentos * descuentoItem / 100)
    } else if (descCarrito > 0) {
      const pct = typeof descCarrito === 'string' ? parseFloat(descCarrito.replace('%','')) : descCarrito
      precioTotalFinal = baseConDtos - (baseDescuentos * pct / 100)
      if (socio) dtoSocioItem = baseDescuentos * pct / 100
    } else {
      precioTotalFinal = baseConDtos
    }
    return { item, idx, precioTotal, descuentoItem, dto, dtoXXXLItem, dtoSocioItem, baseConDtos, baseDescuentos, precioTotalFinal, redondeoItem: 0 }
  })

  // 2) Redondeo (socio + Efectivo Pesos): se calcula sobre el total y se reparte entre las líneas
  //    de forma que la suma de PRECIO TOTAL FINAL dé exactamente el total redondeado.
  const redondeoCalc = calcularRedondeoSocio({
    montoActual: lineas.reduce((s, l) => s + l.precioTotalFinal, 0), metodoPago, socio: socio && descCarrito > 0,
  })
  const conRedondeo = redondeoCalc.aplica
  if (conRedondeo) {
    await asegurarColumna(COL_DTO_EFECTIVO, 'DTO EFECTIVO')
    await asegurarColumna(COL_REDONDEO, 'REDONDEO')
    // Se reparte entre las líneas que llevan el descuento de socio (las remeras del 2x1 quedan
    // intactas); si ninguna lleva, entre todas
    const sumaBase = lineas.reduce((s, l) => s + Math.max(0, l.baseDescuentos), 0)
    const peso = l => sumaBase > 0 ? Math.max(0, l.baseDescuentos) : l.precioTotalFinal
    const sumaPesos = lineas.reduce((s, l) => s + peso(l), 0) || 1
    lineas.forEach(l => { l.finalEntero = Math.round(l.precioTotalFinal - redondeoCalc.redondeo * peso(l) / sumaPesos) })
    // Ajuste de pesos sueltos en la línea con más peso para que cierre exacto
    const diferencia = redondeoCalc.total - lineas.reduce((s, l) => s + l.finalEntero, 0)
    if (diferencia !== 0 && lineas.length) lineas.reduce((a, b) => peso(b) > peso(a) ? b : a).finalEntero += diferencia
    lineas.forEach(l => {
      l.redondeoItem = l.precioTotalFinal - l.finalEntero
      l.precioTotalFinal = l.finalEntero
    })
    // Lo que se cobra tiene que coincidir con lo que mostró el carrito
    const totalCalculado = lineas.reduce((s, l) => s + l.precioTotalFinal, 0)
    if (totalEsperado == null || totalCalculado !== Math.round(totalEsperado)) throw new Error('TOTAL_NO_COINCIDE')
  } else if (totalEsperado != null) {
    // El carrito esperaba redondeo y acá no corresponde (cambió el método de pago o el socio)
    throw new Error('TOTAL_NO_COINCIDE')
  }

  // 3) Filas para la planilla. Columnas extra: AE socio · AF 2x1 XXXL · AG (vacía) · AH redondeo
  const ultimaExtra = posnetVenta ? 4 : conRedondeo ? 3 : conXXXL ? 1 : socio ? 0 : -1
  const rows = lineas.map(l => {
    const { item, idx, precioTotal, descuentoItem, dto } = l
    const idDetalle = `${idVenta}-${String(idx+1).padStart(2,'0')}`
    const costoTotal = item.cantidad * item.costoUnitario
    const ingresoNeto = l.precioTotalFinal - costoTotal
    const extras = [
      socio ? Math.round(l.dtoSocioItem) : '',
      conXXXL && l.dtoXXXLItem > 0 ? Math.round(l.dtoXXXLItem) : '',
      '',
      conRedondeo ? Math.round(l.redondeoItem) : '',
      posnetVenta,
    ]
    return [
      idDetalle, idVenta, `'${dt.fecha}`, `'${dt.hora}`, dt.mes, dt.anio,
      item.articulo, item.nombre, item.foto||'',
      item.cantidad, item.precioUnitario, precioTotal,
      item.costoUnitario, costoTotal,
      empleado, metodoPago,
      descuentoItem||'', descCarrito>0?`${descCarrito}%`:'',
      Math.round(l.precioTotalFinal), notas, false,
      Math.round(ingresoNeto),
      dto.descuentoImanes, dto.dtoIman8000x3, dto.dtoIman8000x2, dto.dtoIman6000x3, dto.dtoIman6000x2,
      '', '', '',
      ...extras.slice(0, ultimaExtra + 1),
    ]
  })
  const ultimaCol = ['AD', COL_DTO_SOCIO, COL_DTO_XXXL, COL_DTO_EFECTIVO, COL_REDONDEO, COL_POSNET][ultimaExtra + 1]

  await Promise.all(rows.map((row, idx) =>
    sheetsUpdate(`DETALLE DE VENTAS!A${nextRow+idx}:${ultimaCol}${nextRow+idx}`, [row])
  ))

  const totalVenta = rows.reduce((s, r) => s+(r[18]||0), 0)
  const totalDtoImanes = dtosPorItem.reduce((s, d) => s+d.descuentoImanes, 0)
  const totalDtoAlfajores = items.reduce((s, item) => s + calcularDescuentoAlfajorItem(item, items), 0)
  await registrarLog({
    accion:'VENTA_REGISTRADA',
    detalle:`${items.length} producto(s) · ${metodoPago}${posnetVenta?` · POSNET ${posnetVenta}`:''}${socio?' · SOCIO':''}${conRedondeo?` · REDONDEO $${Math.round(redondeoCalc.redondeo)}`:''}${conXXXL?` · 2x1 XXXL $${Math.round(promoXXXL.descuento)} (${promoXXXL.unidadesEnPromo}u)`:''}${descCarrito>0?` · DTO ${descCarrito}%`:''}${totalDtoImanes>0?` · DTO imanes $${totalDtoImanes}`:''}${descuentoPromo>0?` · DTO promos $${Math.round(descuentoPromo)}`:''}${totalDtoAlfajores>0?` · DTO alfajores $${Math.round(totalDtoAlfajores)}`:''} · Total $${Math.round(totalVenta).toLocaleString('es-AR')}`,
    idReferencia:idVenta, empleado, resultado:'OK',
  })
  return idVenta
}

export async function anularItemVenta(idDetalle, todosLosItems, empleado = '') {
  const data = await sheetsGet('DETALLE DE VENTAS!A2:U')
  const rows = data.values || []
  const requests = []
  let idVenta = ''
  rows.forEach((r, idx) => { if (r[0]===idDetalle) { idVenta=r[1]; requests.push(sheetsUpdate(`DETALLE DE VENTAS!U${idx+2}`, [['TRUE']])) } })
  if (requests.length===0) throw new Error('No se encontró el item')
  await Promise.all(requests)
  await registrarLog({ accion:'ITEM_ANULADO', detalle:`Item ${idDetalle} anulado`, idReferencia:idDetalle, empleado, resultado:'OK' })
  const idVentaFinal = idVenta || todosLosItems[0]?.idVenta
  if (idVentaFinal) {
    const itemsActivos = todosLosItems.filter(i => i.idDetalle!==idDetalle && !i.anulado)
    if (itemsActivos.length===0) {
      const vr = []
      rows.forEach((r, idx) => { if (r[1]===idVentaFinal && r[20]!=='TRUE') vr.push(sheetsUpdate(`DETALLE DE VENTAS!U${idx+2}`, [['TRUE']])) })
      await Promise.all(vr)
      await registrarLog({ accion:'VENTA_ANULADA_AUTO', detalle:`Venta ${idVentaFinal} anulada automáticamente`, idReferencia:idVentaFinal, empleado, resultado:'OK' })
    }
  }
}

// ── Histórico de precios y costos ─────────────────────────────────────────────
// Hoja: HISTORICO DE PRECIOS Y COSTOS
//   A:ID ARTICULO  B:NOMBRE  C:VIGENTE DESDE  D:VIGENTE HASTA  E:PRECIO UNITARIO  F:COSTO UNITARIO
//   G:CAMBIÓ (precio / costo / precio y costo)  H:QUIÉN LO CAMBIÓ
// Intervalos abiertos: la fila con HASTA vacío es el valor vigente. Al cambiar precio o costo desde
// la app, se cierra esa fila (HASTA = fecha y hora del cambio) y se agrega una nueva abierta.
// Los cambios hechos a mano en la planilla ARTICULOS no quedan registrados.
const HOJA_HIST = 'HISTORICO DE PRECIOS Y COSTOS'
const ENCABEZADOS_HIST = ['ID ARTICULO', 'NOMBRE', 'VIGENTE DESDE', 'VIGENTE HASTA', 'PRECIO UNITARIO', 'COSTO UNITARIO', 'CAMBIÓ', 'QUIÉN LO CAMBIÓ']
let _histFormatoOk = false

// Solo verifica que la hoja tenga el formato con VIGENTE DESDE / HASTA. Nunca mueve ni borra filas:
// si el encabezado no coincide, no escribe nada (el error queda en el LOG como ERROR_HISTORICO).
async function asegurarFormatoHistorico() {
  if (_histFormatoOk) return
  const data = await sheetsGet(`${HOJA_HIST}!A1:H1`)
  const header = ((data.values || [])[0] || []).map(h => String(h || '').trim().toUpperCase())
  if (header[0] !== 'ID ARTICULO' || header[2] !== 'VIGENTE DESDE' || header[3] !== 'VIGENTE HASTA' || header[4] !== 'PRECIO UNITARIO' || header[5] !== 'COSTO UNITARIO') {
    throw new Error('HISTORICO_FORMATO_DISTINTO: ' + header.join(' | '))
  }
  _histFormatoOk = true
}

function fechaHoraHist() {
  const dt = getArgentinaDate()
  return `'${dt.fecha} ${String(dt.hora).slice(0, 5)}`
}

async function proximaFilaHist() {
  const data = await sheetsGet(`${HOJA_HIST}!A:A`)
  let ultima = 1
  ;(data.values || []).forEach((r, i) => { if (String(r[0] || '').trim()) ultima = i + 1 })
  return ultima + 1
}

// Registra un cambio de precio y/o costo. No hace nada si los valores no cambiaron.
export async function registrarCambioPrecioCosto({ id, nombre, precioAnterior, costoAnterior, precioNuevo, costoNuevo, quien = '' }) {
  const pA = parsePrecio(precioAnterior), cA = parsePrecio(costoAnterior)
  const pN = parsePrecio(precioNuevo), cN = parsePrecio(costoNuevo)
  const cambioPrecio = pA !== pN, cambioCosto = cA !== cN
  if (!cambioPrecio && !cambioCosto) return false
  const cambio = cambioPrecio && cambioCosto ? 'precio y costo' : cambioPrecio ? 'precio' : 'costo'
  await asegurarFormatoHistorico()
  const ahora = fechaHoraHist()
  const data = await sheetsGet(`${HOJA_HIST}!A2:D`)
  const rows = data.values || []
  let idxAbierta = -1
  rows.forEach((r, i) => { if (r[0] === id && !String(r[3] || '').trim()) idxAbierta = i })
  let fila = await proximaFilaHist()
  if (idxAbierta >= 0) {
    // Cierra el intervalo vigente
    await sheetsUpdate(`${HOJA_HIST}!D${idxAbierta + 2}`, [[ahora]])
    await sheetsUpdate(`${HOJA_HIST}!G${idxAbierta + 2}:H${idxAbierta + 2}`, [[cambio, quien]])
  } else {
    // No había intervalo abierto: se guarda el valor anterior con "desde" desconocido
    await sheetsUpdate(`${HOJA_HIST}!A${fila}:H${fila}`, [[id, nombre, '', ahora, pA, cA, cambio, quien]])
    fila++
  }
  // Nuevo intervalo vigente
  await sheetsUpdate(`${HOJA_HIST}!A${fila}:H${fila}`, [[id, nombre, ahora, '', pN, cN, '', '']])
  await registrarLog({ accion: 'HISTORICO_PRECIO_COSTO', detalle: `${id} · ${cambio}: $${pA.toLocaleString('es-AR')}/$${cA.toLocaleString('es-AR')} → $${pN.toLocaleString('es-AR')}/$${cN.toLocaleString('es-AR')}`, idReferencia: id, empleado: quien, resultado: 'OK' })
  return true
}

// Artículo nuevo: abre su primer intervalo
async function registrarAltaEnHistorico(art, quien = '') {
  await asegurarFormatoHistorico()
  const fila = await proximaFilaHist()
  await sheetsUpdate(`${HOJA_HIST}!A${fila}:H${fila}`, [[art.id, art.nombre, fechaHoraHist(), '', parsePrecio(art.precioUnitario), parsePrecio(art.costoUnitario), '', '']])
}

// El histórico nunca frena el guardado del artículo: si falla, queda anotado en el LOG
// Interruptor del histórico (ARTICULOS ya no tiene fórmulas que lean esta hoja)
const HISTORICO_ACTIVO = true

async function historicoSeguro(fn, id, empleado) {
  if (!HISTORICO_ACTIVO) return
  try { await fn() }
  catch (e) {
    console.error(e)
    try { await registrarLog({ accion: 'ERROR_HISTORICO', detalle: e?.message || 'Error desconocido', idReferencia: id, empleado, resultado: 'ERROR' }) } catch {}
  }
}

export async function getArticulosAdmin() {
  const data = await sheetsGet('ARTICULOS!A1:K')
  const rows = data.values || []
  if (rows.length===0) return []
  return rows.slice(1).map((r, idx) => ({
    rowNum:idx+2, id:r[0]||'', nombre:r[1]||'', stockInicial:r[2]||'0', info:r[3]||'',
    disponibilidad:r[4]||'ACTIVO', foto:r[5]||'', precioUnitario:r[6]||'0',
    costoUnitario:r[7]||'0', cantidadReponer:r[8]||'0', stockCierre:r[9]||'0', stockActual:r[10]||'0',
  })).filter(r => r.id)
}

export async function generarIdArticulo() {
  const data = await sheetsGet('ARTICULOS!A2:A')
  const rows = data.values || []
  const ids = rows.map(r=>r[0]).filter(id=>id&&/^TB\d+$/.test(id)).map(id=>parseInt(id.replace('TB','')))
  const maxId = ids.length>0 ? Math.max(...ids) : 0
  return `TB${String(maxId+1).padStart(5,'0')}`
}

export async function agregarArticulo(art, empleado = '') {
  const data = await sheetsGet('ARTICULOS!A:A')
  const rows = data.values || []
  let lastTBRow = 1
  rows.forEach((r, i) => { if (r[0]&&String(r[0]).trim().startsWith('TB')) lastTBRow=i+1 })
  const nextRow = lastTBRow+1
  const row = [art.id,art.nombre,art.stockInicial||'0',art.info||'',art.disponibilidad||'ACTIVO',art.foto||'',art.precioUnitario||'0',art.costoUnitario||'0',art.cantidadReponer||'0',art.stockCierre||'0',art.stockActual||'0']
  try { await sheetsUpdate(`ARTICULOS!A${nextRow}:K${nextRow}`, [row]) }
  catch (e) { await sheetsAppend('ARTICULOS!A1', [row]) }
  await registrarLog({ accion:'ARTICULO_CREADO', detalle:`${art.id} · ${art.nombre} · $${art.precioUnitario}`, idReferencia:art.id, empleado, resultado:'OK' })
  await historicoSeguro(() => registrarAltaEnHistorico(art, empleado), art.id, empleado)
}

export async function editarArticulo(rowNum, art, empleado = '') {
  // Valores que había en la planilla justo antes del cambio (para el histórico)
  let anterior = null
  try {
    const prev = await sheetsGet(`ARTICULOS!A${rowNum}:H${rowNum}`)
    const r = (prev.values || [])[0] || []
    if (r[0] === art.id) anterior = { precio: r[6], costo: r[7] }
  } catch (e) { console.error(e) }
  const row = [art.id,art.nombre,art.stockInicial||'0',art.info||'',art.disponibilidad||'ACTIVO',art.foto||'',art.precioUnitario||'0',art.costoUnitario||'0',art.cantidadReponer||'0',art.stockCierre||'0',art.stockActual||'0']
  await sheetsUpdate(`ARTICULOS!A${rowNum}:K${rowNum}`, [row])
  await registrarLog({ accion:'ARTICULO_EDITADO', detalle:`${art.id} · ${art.nombre} · $${art.precioUnitario}`, idReferencia:art.id, empleado, resultado:'OK' })
  if (anterior) {
    await historicoSeguro(() => registrarCambioPrecioCosto({
      id: art.id, nombre: art.nombre,
      precioAnterior: anterior.precio, costoAnterior: anterior.costo,
      precioNuevo: art.precioUnitario, costoNuevo: art.costoUnitario, quien: empleado,
    }), art.id, empleado)
  }
}

export async function toggleDisponibilidad(rowNum, artId, nuevaDisp, empleado = '') {
  await sheetsUpdate(`ARTICULOS!E${rowNum}`, [[nuevaDisp]])
  await registrarLog({ accion:'ARTICULO_DISPONIBILIDAD', detalle:`${artId} → ${nuevaDisp}`, idReferencia:artId, empleado, resultado:'OK' })
}

export async function getIngresos() {
  const data = await sheetsGet('INGRESOS!A2:K')
  const rows = data.values || []
  return rows.filter(r=>r[0]).map((r, idx) => ({
    rowNum:idx+2, idIngreso:r[0]||'', fecha:r[1]||'', hora:r[2]||'',
    articuloId:r[3]||'', articuloNombre:r[4]||'', cantidad:Number(r[5])||0,
    costoUnitario:parsePrecio(r[6]), costoTotal:parsePrecio(r[7]),
    proveedor:r[8]||'', empleado:r[9]||'', anulado:r[10]==='TRUE'||r[10]===true,
  }))
}

export async function registrarIngreso({ articuloId, articuloNombre, cantidad, costoUnitario, proveedor, empleado }) {
  const dt = getArgentinaDate()
  const data = await sheetsGet('INGRESOS!A2:A')
  const rows = data.values || []
  const prefix = `I${String(dt.raw.getFullYear()).slice(2)}${String(dt.raw.getMonth()+1).padStart(2,'0')}${String(dt.raw.getDate()).padStart(2,'0')}`
  const hoy = rows.filter(r => r[0]?.startsWith(prefix))
  const idIngreso = `${prefix}-${String(hoy.length+1).padStart(3,'0')}`
  const costoTotal = cantidad * (Number(costoUnitario)||0)
  const row = [idIngreso,`'${dt.fecha}`,`'${dt.hora}`,articuloId,articuloNombre,cantidad,costoUnitario||0,costoTotal,proveedor||'',empleado||'',false]
  await sheetsAppend('INGRESOS!A1', [row])
  await registrarLog({ accion:'INGRESO_REGISTRADO', detalle:`${articuloId} · ${articuloNombre} · x${cantidad}`, idReferencia:idIngreso, empleado, resultado:'OK' })
  return idIngreso
}

export async function anularIngreso(rowNum, idIngreso, empleado = '') {
  await sheetsUpdate(`INGRESOS!K${rowNum}`, [['TRUE']])
  await registrarLog({ accion:'INGRESO_ANULADO', detalle:`Ingreso ${idIngreso} anulado`, idReferencia:idIngreso, empleado, resultado:'OK' })
}

// ── Stock: conteos, bajas y cálculo ──────────────────────────────────────────
// El último CONTEO de cada artículo es su punto de partida (con fecha y hora). Desde ahí:
//   stock = contado + ingresos posteriores − ventas posteriores − bajas posteriores
// Si el artículo nunca se contó: STOCK INICIAL (ARTICULOS) + todos los ingresos − todas las ventas − bajas,
// y se marca como "sin contar" (no confiable).
// Hoja MOVIMIENTOS STOCK:
//   A:ID  B:FECHA  C:HORA  D:TIPO (CONTEO/BAJA)  E:ID ARTICULO  F:NOMBRE  G:CANTIDAD (contada, o unidades dadas de baja)
//   H:STOCK ESPERADO  I:DIFERENCIA  J:COSTO UNITARIO  K:VALOR DIFERENCIA  L:MOTIVO  M:EMPLEADO  N:ANULADO  O:NOTAS
const HOJA_MOV = 'MOVIMIENTOS STOCK'
const ENCABEZADOS_MOV = ['ID', 'FECHA', 'HORA', 'TIPO', 'ID ARTICULO', 'NOMBRE', 'CANTIDAD', 'STOCK ESPERADO', 'DIFERENCIA', 'COSTO UNITARIO', 'VALOR DIFERENCIA', 'MOTIVO', 'EMPLEADO', 'ANULADO', 'NOTAS']
let _hojaMovLista = false

// Frecuencia de conteo según la clase del artículo (ventas de los últimos 90 días, en $):
// A = el 80% de la facturación · B = el 15% siguiente · C = el resto (incluye lo que no se vendió)
export const FRECUENCIA_CONTEO = { A: 14, B: 30, C: 90 }
export const ARTICULOS_POR_DIA = 15
export const MOTIVOS_BAJA = ['Rotura / daño', 'Faltante / robo', 'Uso interno', 'Regalo / canje', 'Otro']

// "5/10/2026" + "14:32:10" → ms (hora de Argentina). También acepta "2026-10-05".
export function fechaHoraAMsAR(fecha, hora) {
  const f = String(fecha || '').trim().replace(/^'/, '')
  let d, m, a
  if (/^\d{4}-\d{1,2}-\d{1,2}/.test(f)) { [a, m, d] = f.slice(0, 10).split('-').map(Number) }
  else { [d, m, a] = f.split(' ')[0].split('/').map(Number) }
  if (!d || !m || !a) return 0
  const hh = String(hora || '').trim() || (f.includes(' ') ? f.split(' ')[1] : '')
  const [h = 0, mi = 0, se = 0] = String(hh || '0:0:0').split(':').map(n => Number(n) || 0)
  return Date.UTC(a, m - 1, d, h + 3, mi, se) // UTC-3
}

async function asegurarHojaMovimientos() {
  if (_hojaMovLista) return
  const token = await getAccessToken()
  const metaRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}?fields=sheets.properties.title`, { headers: { Authorization: `Bearer ${token}` } })
  if (!metaRes.ok) throw new Error(`Sheets META error: ${metaRes.status}`)
  const meta = await metaRes.json()
  if (!(meta.sheets || []).some(s => s.properties?.title === HOJA_MOV)) {
    const res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}:batchUpdate`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ requests: [{ addSheet: { properties: { title: HOJA_MOV } } }] }),
    })
    if (!res.ok) throw new Error(`Sheets ADD SHEET error: ${res.status}`)
    await sheetsUpdate(`${HOJA_MOV}!A1:O1`, [ENCABEZADOS_MOV])
  }
  _hojaMovLista = true
}

function mapMovimiento(r) {
  return {
    id: r[0] || '', fecha: r[1] || '', hora: r[2] || '', tipo: String(r[3] || '').toUpperCase(),
    articuloId: r[4] || '', nombre: r[5] || '', cantidad: Number(r[6]) || 0,
    esperado: r[7] === '' || r[7] == null ? null : Number(r[7]) || 0,
    diferencia: Number(r[8]) || 0, costoUnitario: parsePrecio(r[9]), valorDiferencia: Number(String(r[10] || '0').replace(/[$\s.]/g, '').replace(',', '.')) || 0,
    motivo: r[11] || '', empleado: r[12] || '', anulado: r[13] === 'TRUE' || r[13] === true, notas: r[14] || '',
    ms: fechaHoraAMsAR(r[1], r[2]),
  }
}

async function getMovimientosRows() {
  try { const d = await sheetsGet(`${HOJA_MOV}!A2:O`); return (d.values || []).filter(r => r[0]).map(mapMovimiento) }
  catch (e) { if (String(e.message).includes('400')) return []; throw e }
}

// Lee todo lo necesario para calcular stock (ventas, ingresos y movimientos)
export async function getDatosStock() {
  const [dv, di, movs] = await Promise.all([sheetsGet('DETALLE DE VENTAS!A2:U'), sheetsGet('INGRESOS!A2:K'), getMovimientosRows()])
  const ventas = (dv.values || []).filter(r => r[0] && r[6] && r[20] !== 'TRUE')
    .map(r => ({ id: r[6], cant: Number(r[9]) || 0, ms: fechaHoraAMsAR(r[2], r[3]), total: parsePrecio(r[18]) || parsePrecio(r[11]) }))
  const ingresos = (di.values || []).filter(r => r[0] && r[3] && r[10] !== 'TRUE')
    .map(r => ({ id: r[3], cant: Number(r[5]) || 0, ms: fechaHoraAMsAR(r[1], r[2]) }))
  return { ventas, ingresos, movimientos: movs }
}

// Cálculo puro (sin leer la planilla): devuelve { [id]: { stock, contado, ultimoConteoMs, ultimoConteo } }
export function calcularStockDesdeDatos(articulos, { ventas, ingresos, movimientos }) {
  const ultimoConteo = {}
  movimientos.forEach(m => {
    if (m.anulado || m.tipo !== 'CONTEO') return
    const u = ultimoConteo[m.articuloId]
    if (!u || m.ms >= u.ms) ultimoConteo[m.articuloId] = m
  })
  const out = {}
  articulos.forEach(a => { out[a.id] = { stock: 0, contado: false, ultimoConteoMs: 0, ultimoConteo: null, base: Number(a.stockInicial) || 0 } })
  Object.entries(out).forEach(([id, o]) => { const c = ultimoConteo[id]; if (c) { o.contado = true; o.ultimoConteoMs = c.ms; o.ultimoConteo = c; o.base = c.cantidad } })
  const desde = id => out[id]?.ultimoConteoMs || -Infinity
  ingresos.forEach(x => { const o = out[x.id]; if (o && x.ms > desde(x.id)) o.base += x.cant })
  ventas.forEach(x => { const o = out[x.id]; if (o && x.ms > desde(x.id)) o.base -= x.cant })
  movimientos.forEach(m => { const o = out[m.articuloId]; if (o && !m.anulado && m.tipo === 'BAJA' && m.ms > desde(m.articuloId)) o.base -= m.cantidad })
  Object.values(out).forEach(o => { o.stock = o.base; delete o.base })
  return out
}

// Clase A/B/C por facturación de los últimos 90 días
export function calcularClasesABC(articulos, ventas, ahoraMs = Date.now()) {
  const desde = ahoraMs - 90 * 86400000
  const fact = {}
  ventas.forEach(v => { if (v.ms >= desde) fact[v.id] = (fact[v.id] || 0) + v.total })
  const ids = articulos.map(a => a.id).sort((x, y) => (fact[y] || 0) - (fact[x] || 0))
  const total = ids.reduce((s, id) => s + (fact[id] || 0), 0)
  const clase = {}
  let acum = 0
  ids.forEach(id => {
    const f = fact[id] || 0
    if (f <= 0 || total <= 0) { clase[id] = 'C'; return }
    acum += f
    clase[id] = acum - f < 0.8 * total ? 'A' : acum - f < 0.95 * total ? 'B' : 'C'
  })
  return clase
}

// Lista de conteo del día: los más atrasados según su frecuencia. Estable durante el día:
// se calcula con los conteos de ANTES de hoy, y los contados hoy aparecen como hechos.
export function armarListaConteoDelDia(articulos, estadoStock, clases, ahoraMs = Date.now(), cantidad = ARTICULOS_POR_DIA) {
  const hoyAR = new Date(ahoraMs - 3 * 3600000); hoyAR.setUTCHours(0, 0, 0, 0)
  const inicioHoy = hoyAR.getTime() + 3 * 3600000
  const prioridad = a => {
    const e = estadoStock[a.id] || {}
    const ultimoAntesDeHoy = e.ultimoConteoMs && e.ultimoConteoMs < inicioHoy ? e.ultimoConteoMs : (e.ultimoConteoAnteriorMs || 0)
    if (!ultimoAntesDeHoy) return 1e6 + (e.stock < 0 ? 1 : 0)
    const dias = (inicioHoy - ultimoAntesDeHoy) / 86400000
    return dias / FRECUENCIA_CONTEO[clases[a.id] || 'C'] + (e.stock < 0 ? 0.5 : 0)
  }
  const candidatos = articulos.map(a => ({ a, p: prioridad(a) })).filter(x => x.p >= 1)
  candidatos.sort((x, y) => y.p - x.p || x.a.nombre.localeCompare(y.a.nombre))
  return candidatos.slice(0, cantidad).map(x => ({ ...x.a, contadoHoy: (estadoStock[x.a.id]?.ultimoConteoMs || 0) >= inicioHoy }))
}

// Estado completo para la solapa Conteo
export async function getEstadoStock(articulos) {
  const datos = await getDatosStock()
  const estado = calcularStockDesdeDatos(articulos, datos)
  // Para que la lista del día no cambie al contar: guardamos también el conteo anterior al de hoy
  const conteosPorArt = {}
  datos.movimientos.forEach(m => { if (!m.anulado && m.tipo === 'CONTEO') (conteosPorArt[m.articuloId] ||= []).push(m.ms) })
  Object.entries(conteosPorArt).forEach(([id, lista]) => {
    if (!estado[id]) return
    lista.sort((x, y) => x - y)
    const hoyAR = new Date(Date.now() - 3 * 3600000); hoyAR.setUTCHours(0, 0, 0, 0)
    const inicioHoy = hoyAR.getTime() + 3 * 3600000
    estado[id].ultimoConteoAnteriorMs = [...lista].reverse().find(ms => ms < inicioHoy) || 0
  })
  const clases = calcularClasesABC(articulos, datos.ventas)
  return { estado, clases, movimientos: datos.movimientos }
}

function nuevoIdMovimiento(dt, rows) {
  const prefix = `M${String(dt.raw.getFullYear()).slice(2)}${String(dt.raw.getMonth()+1).padStart(2,'0')}${String(dt.raw.getDate()).padStart(2,'0')}`
  const ids = new Set(rows.map(r => r.id).filter(id => id.startsWith(prefix)))
  let seq = ids.size + 1
  while (ids.has(`${prefix}-${String(seq).padStart(3,'0')}`)) seq++
  return `${prefix}-${String(seq).padStart(3,'0')}`
}

// Conteo de un artículo. Calcula el stock esperado con los datos frescos de la planilla.
// Si no coincide y todavía no se recontó, NO guarda: devuelve { necesitaRecuento: true } para pedir
// que se cuente de nuevo. El segundo conteo se guarda siempre (con el primero en NOTAS).
export async function registrarConteo({ articulo, cantidad, empleado = '', primerConteo = null }) {
  const contado = Math.max(0, Math.round(Number(cantidad) || 0))
  await asegurarHojaMovimientos()
  const datos = await getDatosStock()
  const esperado = calcularStockDesdeDatos([articulo], datos)[articulo.id].stock
  const diferencia = contado - esperado
  if (diferencia !== 0 && primerConteo == null) return { necesitaRecuento: true, guardado: false }
  const dt = getArgentinaDate()
  const id = nuevoIdMovimiento(dt, datos.movimientos)
  const costo = Number(articulo.costoUnitario) || 0
  const notas = primerConteo != null ? `Recontado (1er conteo: ${primerConteo})` : ''
  await sheetsAppend(`${HOJA_MOV}!A1`, [[id, `'${dt.fecha}`, `'${dt.hora}`, 'CONTEO', articulo.id, articulo.nombre, contado, esperado, diferencia, costo, Math.round(diferencia * costo), '', empleado, 'FALSE', notas]])
  await registrarLog({ accion: 'STOCK_CONTEO', detalle: `${articulo.id} · contado ${contado} · esperado ${esperado} · dif ${diferencia}`, idReferencia: id, empleado, resultado: 'OK' })
  return { guardado: true, id, esperado, diferencia }
}

export async function registrarBaja({ articulo, cantidad, motivo, detalle = '', empleado = '' }) {
  const unidades = Math.max(1, Math.round(Number(cantidad) || 0))
  await asegurarHojaMovimientos()
  const movs = await getMovimientosRows()
  const dt = getArgentinaDate()
  const id = nuevoIdMovimiento(dt, movs)
  const costo = Number(articulo.costoUnitario) || 0
  await sheetsAppend(`${HOJA_MOV}!A1`, [[id, `'${dt.fecha}`, `'${dt.hora}`, 'BAJA', articulo.id, articulo.nombre, unidades, '', -unidades, costo, -Math.round(unidades * costo), motivo, empleado, 'FALSE', detalle]])
  await registrarLog({ accion: 'STOCK_BAJA', detalle: `${articulo.id} · ${unidades} u. · ${motivo}${detalle ? ` (${detalle})` : ''}`, idReferencia: id, empleado, resultado: 'OK' })
  return id
}

export async function anularMovimientoStock(id, empleado = '') {
  const data = await sheetsGet(`${HOJA_MOV}!A2:A`)
  const idx = (data.values || []).findIndex(r => r[0] === id)
  if (idx < 0) throw new Error('No se encontró el movimiento')
  await sheetsUpdate(`${HOJA_MOV}!N${idx + 2}`, [['TRUE']])
  await registrarLog({ accion: 'STOCK_MOVIMIENTO_ANULADO', detalle: `Movimiento ${id} anulado`, idReferencia: id, empleado, resultado: 'OK' })
}

export async function calcularStockActual(articuloId, stockInicial) {
  const datos = await getDatosStock()
  return calcularStockDesdeDatos([{ id: articuloId, stockInicial }], datos)[articuloId].stock
}

export async function calcularStockTodos(articulos) {
  const datos = await getDatosStock()
  const estado = calcularStockDesdeDatos(articulos, datos)
  return articulos.map(art => ({ ...art, stockActualCalculado: estado[art.id]?.stock ?? 0, stockContado: !!estado[art.id]?.contado, ultimoConteoMs: estado[art.id]?.ultimoConteoMs || 0 }))
}

export async function getPagos() {
  const data = await sheetsGet('PAGOS!A2:O')
  const rows = data.values || []
  return rows.filter(r=>r[0]).map((r, idx) => ({
    rowNum:idx+2, idPago:r[0]||'', tipo:r[1]||'',
    fechaIngreso:r[2]||'', fechaPago:r[3]||'',
    articuloId:r[4]||'', articuloNombre:r[5]||'',
    cantidad:Number(r[6])||0, costoUnitario:parsePrecio(r[7]),
    // Si COSTO TOTAL quedó vacío o en 0 (pagos cargados con el bug del "$"), se recalcula
    costoTotal:parsePrecio(r[8]) || (Number(r[6])||0) * parsePrecio(r[7]),
    descripcion:r[9]||'', proveedor:r[10]||'', montoPagado:parsePrecio(r[11]),
    pagado:r[12]==='TRUE'||r[12]===true, empleado:r[13]||'', anulado:r[14]==='TRUE'||r[14]===true,
  }))
}

export async function registrarPago({ tipo, fechaIngreso, fechaPago, articuloId, articuloNombre, cantidad, costoUnitario, descripcion, proveedor, montoPagado, pagado, empleado }) {
  const dt = getArgentinaDate()
  const data = await sheetsGet('PAGOS!A2:A')
  const rows = data.values || []
  const prefix = `P${String(dt.raw.getFullYear()).slice(2)}${String(dt.raw.getMonth()+1).padStart(2,'0')}${String(dt.raw.getDate()).padStart(2,'0')}`
  const hoy = rows.filter(r=>r[0]?.startsWith(prefix))
  const idPago = `${prefix}-${String(hoy.length+1).padStart(3,'0')}`
  // Montos como número limpio: acepta "$8.000", "8.000" o "8000"
  const cant = Number(cantidad)||0, cu = parsePrecio(costoUnitario), mp = parsePrecio(montoPagado)
  const costoTotal = cant*cu
  const row = [idPago,tipo||'GASTO',fechaIngreso?`'${fechaIngreso}`:'',fechaPago?`'${fechaPago}`:'',articuloId||'',articuloNombre||'',cant,cu,costoTotal,descripcion||'',proveedor||'',mp,pagado?'TRUE':'FALSE',empleado||'','FALSE']
  await sheetsAppend('PAGOS!A1', [row])
  if (tipo==='MERCADERÍA'&&fechaIngreso&&articuloId) {
    const rowIngreso = [`I${idPago.slice(1)}`,`'${fechaIngreso}`,`'${dt.hora}`,articuloId,articuloNombre,cant,cu,costoTotal,proveedor||'',empleado||'',false]
    await sheetsAppend('INGRESOS!A1', [rowIngreso])
  }
  await registrarLog({ accion:'PAGO_REGISTRADO', detalle:`${tipo} · ${articuloNombre||descripcion} · $${montoPagado}`, idReferencia:idPago, empleado, resultado:'OK' })
  return idPago
}

export async function actualizarPago(rowNum, campos, empleado = '') {
  const cant = Number(campos.cantidad)||0, cu = parsePrecio(campos.costoUnitario), mp = parsePrecio(campos.montoPagado)
  const costoTotal = cant*cu
  const row = [campos.idPago,campos.tipo||'GASTO',campos.fechaIngreso?`'${campos.fechaIngreso}`:'',campos.fechaPago?`'${campos.fechaPago}`:'',campos.articuloId||'',campos.articuloNombre||'',cant,cu,costoTotal,campos.descripcion||'',campos.proveedor||'',mp,campos.pagado?'TRUE':'FALSE',campos.empleado||'',campos.anulado?'TRUE':'FALSE']
  await sheetsUpdate(`PAGOS!A${rowNum}:O${rowNum}`, [row])
  if (campos.tipo==='MERCADERÍA'&&campos.fechaIngreso&&campos.articuloId&&campos.crearIngreso) {
    const costoTotalIng = costoTotal
    const hora = new Date().toLocaleString('es-AR',{timeZone:'America/Argentina/Buenos_Aires',hour12:false}).split(', ')[1]
    const rowIngreso = [`I${campos.idPago.slice(1)}`,`'${campos.fechaIngreso}`,`'${hora}`,campos.articuloId,campos.articuloNombre,cant,cu,costoTotalIng,campos.proveedor||'',empleado||'',false]
    await sheetsAppend('INGRESOS!A1', [rowIngreso])
  }
  await registrarLog({ accion:'PAGO_ACTUALIZADO', detalle:`${campos.idPago} actualizado`, idReferencia:campos.idPago, empleado, resultado:'OK' })
}

export async function anularPago(rowNum, idPago, empleado = '') {
  await sheetsUpdate(`PAGOS!O${rowNum}`, [['TRUE']])
  await registrarLog({ accion:'PAGO_ANULADO', detalle:`Pago ${idPago} anulado`, idReferencia:idPago, empleado, resultado:'OK' })
}

// ── Gastos Fijos ─────────────────────────────────────────────────────────────

export async function getGastosFijos() {
  const data = await sheetsGet('GASTOS FIJOS!A2:F')
  const rows = data.values || []
  return rows
    .filter(r => r[0])
    .map((r, idx) => ({
      rowNum: idx + 2,
      concepto: r[0] || '',
      monto: parsePrecio(r[1]),
      semana: r[2] || '1ra semana',
      pagado: r[3] === 'TRUE' || r[3] === true,
      fechaPago: r[4] || '',
      mesActivo: r[5] || '',
    }))
}

export async function agregarGastoFijo({ concepto, monto, semana }) {
  await sheetsAppend('GASTOS FIJOS!A1', [[concepto, monto, semana, 'FALSE', '', '']])
}

export async function editarGastoFijo(rowNum, { concepto, monto, semana }) {
  // Conserva pagado/fechaPago/mesActivo, solo actualiza concepto/monto/semana
  const data = await sheetsGet(`GASTOS FIJOS!A${rowNum}:F${rowNum}`)
  const row = (data.values || [[]])[0]
  await sheetsUpdate(`GASTOS FIJOS!A${rowNum}:F${rowNum}`, [[
    concepto, monto, semana,
    row[3] || 'FALSE', row[4] || '', row[5] || ''
  ]])
}

export async function eliminarGastoFijo(rowNum) {
  await sheetsUpdate(`GASTOS FIJOS!A${rowNum}:F${rowNum}`, [['', '', '', '', '', '']])
}

export async function togglePagoGastoFijo(rowNum, pagado, mesActivo) {
  const now = new Date()
  const fecha = now.toLocaleDateString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' })
  const data = await sheetsGet(`GASTOS FIJOS!A${rowNum}:F${rowNum}`)
  const row = (data.values || [[]])[0]
  await sheetsUpdate(`GASTOS FIJOS!A${rowNum}:F${rowNum}`, [[
    row[0] || '', row[1] || '', row[2] || '',
    pagado ? 'TRUE' : 'FALSE',
    pagado ? fecha : '',
    mesActivo,
  ]])
}

export async function cerrarMesGastosFijos(gastos, mesNuevo) {
  // 1. Guardar snapshot en GASTOS FIJOS LOG
  const mesAnterior = gastos[0]?.mesActivo || ''
  const filas = gastos.map(g => [
    mesAnterior,
    g.concepto, g.monto, g.semana,
    g.pagado ? 'TRUE' : 'FALSE',
    g.fechaPago || '',
  ])
  if (filas.length > 0) {
    await sheetsAppend('GASTOS FIJOS LOG!A1', filas)
  }

  // 2. Resetear pagados, arrastrar no pagados al mes nuevo
  await Promise.all(gastos.map(g =>
    sheetsUpdate(`GASTOS FIJOS!A${g.rowNum}:F${g.rowNum}`, [[
      g.concepto, g.monto, g.semana,
      'FALSE', '', mesNuevo,
    ]])
  ))
}

// ── Gastos de caja (movimientos de efectivo registrados por los empleados) ──
// Hoja: GASTOS CAJA · A:ID  B:FECHA  C:HORA  D:EMPLEADO  E:TIPO (SALIDA/ENTRADA)
//                     F:CATEGORIA  G:DETALLE  H:MONTO  I:ANULADO  J:REGISTRADO DESDE
const HOJA_GASTOS_CAJA = 'GASTOS CAJA'
const ENCABEZADOS_GASTOS_CAJA = ['ID', 'FECHA', 'HORA', 'EMPLEADO', 'TIPO', 'CATEGORIA', 'DETALLE', 'MONTO', 'ANULADO', 'REGISTRADO DESDE']
let _hojaGastosLista = false

// Crea la hoja GASTOS CAJA con sus encabezados si todavía no existe
async function asegurarHojaGastosCaja() {
  if (_hojaGastosLista) return
  const token = await getAccessToken()
  const metaRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}?fields=sheets.properties.title`, { headers: { Authorization: `Bearer ${token}` } })
  if (!metaRes.ok) throw new Error(`Sheets META error: ${metaRes.status}`)
  const meta = await metaRes.json()
  const existe = (meta.sheets || []).some(s => s.properties?.title === HOJA_GASTOS_CAJA)
  if (!existe) {
    const res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}:batchUpdate`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ requests: [{ addSheet: { properties: { title: HOJA_GASTOS_CAJA } } }] }),
    })
    if (!res.ok) throw new Error(`Sheets ADD SHEET error: ${res.status}`)
    await sheetsUpdate(`${HOJA_GASTOS_CAJA}!A1:J1`, [ENCABEZADOS_GASTOS_CAJA])
  }
  _hojaGastosLista = true
}

function mapGastoCaja(r, idx) {
  return {
    rowNum: idx + 2, id: r[0] || '', fecha: r[1] || '', hora: r[2] || '',
    empleado: r[3] || '', tipo: (r[4] || 'SALIDA').toUpperCase(), categoria: r[5] || '',
    detalle: r[6] || '', monto: parsePrecio(r[7]),
    anulado: r[8] === 'TRUE' || r[8] === true, registradoDesde: r[9] || '',
  }
}

// Movimientos de caja del día (incluye anulados, marcados con anulado=true).
// Si la hoja todavía no existe devuelve [] (se crea al registrar el primer gasto).
export async function getGastosCajaHoy() {
  let data
  try { data = await sheetsGet(`${HOJA_GASTOS_CAJA}!A2:J`) }
  catch (e) { if (String(e.message).includes('400')) return []; throw e }
  const { fecha } = getArgentinaDate()
  return (data.values || []).map(mapGastoCaja).filter(g => g.id && g.fecha === fecha)
}

export async function registrarGastoCaja({ empleado, tipo, categoria, detalle, monto, registradoDesde = '' }) {
  await asegurarHojaGastosCaja()
  const dt = getArgentinaDate()
  const data = await sheetsGet(`${HOJA_GASTOS_CAJA}!A2:A`)
  const prefix = `G${String(dt.raw.getFullYear()).slice(2)}${String(dt.raw.getMonth()+1).padStart(2,'0')}${String(dt.raw.getDate()).padStart(2,'0')}`
  const idsHoy = new Set((data.values || []).map(r => r[0]).filter(id => id?.startsWith(prefix)))
  let seq = idsHoy.size + 1
  while (idsHoy.has(`${prefix}-${String(seq).padStart(3,'0')}`)) seq++
  const id = `${prefix}-${String(seq).padStart(3,'0')}`
  const row = [id, `'${dt.fecha}`, `'${dt.hora}`, empleado, tipo, categoria, detalle || '', Math.round(Number(monto) || 0), 'FALSE', registradoDesde]
  await sheetsAppend(`${HOJA_GASTOS_CAJA}!A1`, [row])
  await registrarLog({ accion: 'GASTO_CAJA_REGISTRADO', detalle: `${tipo} · ${categoria}${detalle ? ` (${detalle})` : ''} · $${Math.round(Number(monto) || 0).toLocaleString('es-AR')}`, idReferencia: id, empleado, resultado: 'OK' })
  return id
}

export async function anularGastoCaja(id, empleado = '') {
  // Busca la fila por ID (no por posición) para no anular otra fila por error
  const data = await sheetsGet(`${HOJA_GASTOS_CAJA}!A2:A`)
  const idx = (data.values || []).findIndex(r => r[0] === id)
  if (idx < 0) throw new Error('No se encontró el movimiento')
  await sheetsUpdate(`${HOJA_GASTOS_CAJA}!I${idx + 2}`, [['TRUE']])
  await registrarLog({ accion: 'GASTO_CAJA_ANULADO', detalle: `Movimiento ${id} anulado`, idReferencia: id, empleado, resultado: 'OK' })
}

// ── Tutoriales (links a instructivos para los empleados) ─────────────────────
// Hoja: TUTORIALES · A:ID  B:FECHA  C:HORA  D:TITULO  E:DESCRIPCION  F:LINK  G:SUBIDO POR  H:ACTIVO
// Los cargan los Admin; los ven todos, del más nuevo al más viejo.
const HOJA_TUTORIALES = 'TUTORIALES'
const ENCABEZADOS_TUTORIALES = ['ID', 'FECHA', 'HORA', 'TITULO', 'DESCRIPCION', 'LINK', 'SUBIDO POR', 'ACTIVO']
let _hojaTutorialesLista = false

async function asegurarHojaTutoriales() {
  if (_hojaTutorialesLista) return
  const token = await getAccessToken()
  const metaRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}?fields=sheets.properties.title`, { headers: { Authorization: `Bearer ${token}` } })
  if (!metaRes.ok) throw new Error(`Sheets META error: ${metaRes.status}`)
  const meta = await metaRes.json()
  const existe = (meta.sheets || []).some(s => s.properties?.title === HOJA_TUTORIALES)
  if (!existe) {
    const res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}:batchUpdate`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ requests: [{ addSheet: { properties: { title: HOJA_TUTORIALES } } }] }),
    })
    if (!res.ok) throw new Error(`Sheets ADD SHEET error: ${res.status}`)
    await sheetsUpdate(`${HOJA_TUTORIALES}!A1:H1`, [ENCABEZADOS_TUTORIALES])
  }
  _hojaTutorialesLista = true
}

// "dd/mm/aaaa" + "hh:mm:ss" → milisegundos (para ordenar por fecha de subida)
function fechaHoraAMs(fecha, hora) {
  const [d, m, a] = String(fecha || '').split('/').map(Number)
  const [hh = 0, mm = 0, ss = 0] = String(hora || '').split(':').map(Number)
  if (!d || !m || !a) return 0
  return new Date(a, m - 1, d, hh, mm, ss).getTime()
}

// Tutoriales activos, del más nuevo al más viejo. Si la hoja no existe todavía devuelve [].
export async function getTutoriales() {
  let data
  try { data = await sheetsGet(`${HOJA_TUTORIALES}!A2:H`) }
  catch (e) { if (String(e.message).includes('400')) return []; throw e }
  return (data.values || [])
    .map(r => ({
      id: r[0] || '', fecha: r[1] || '', hora: r[2] || '', titulo: r[3] || '',
      descripcion: r[4] || '', link: r[5] || '', subidoPor: r[6] || '',
      activo: !(r[7] === 'FALSE' || r[7] === false),
    }))
    .filter(t => t.id && t.link && t.activo)
    .map(t => ({ ...t, ms: fechaHoraAMs(t.fecha, t.hora) }))
    .sort((a, b) => b.ms - a.ms)
}

export async function agregarTutorial({ titulo, descripcion = '', link, subidoPor = '' }) {
  await asegurarHojaTutoriales()
  const dt = getArgentinaDate()
  const data = await sheetsGet(`${HOJA_TUTORIALES}!A2:A`)
  const ids = new Set((data.values || []).map(r => r[0]))
  let seq = ids.size + 1
  while (ids.has(`T${String(seq).padStart(3, '0')}`)) seq++
  const id = `T${String(seq).padStart(3, '0')}`
  await sheetsAppend(`${HOJA_TUTORIALES}!A1`, [[id, `'${dt.fecha}`, `'${dt.hora}`, titulo, descripcion, link, subidoPor, 'TRUE']])
  await registrarLog({ accion: 'TUTORIAL_AGREGADO', detalle: titulo, idReferencia: id, empleado: subidoPor, resultado: 'OK' })
  return id
}

// No se borra la fila: queda en la planilla con ACTIVO = FALSE
export async function quitarTutorial(id, empleado = '') {
  const data = await sheetsGet(`${HOJA_TUTORIALES}!A2:A`)
  const idx = (data.values || []).findIndex(r => r[0] === id)
  if (idx < 0) throw new Error('No se encontró el tutorial')
  await sheetsUpdate(`${HOJA_TUTORIALES}!H${idx + 2}`, [['FALSE']])
  await registrarLog({ accion: 'TUTORIAL_QUITADO', detalle: `Tutorial ${id} quitado`, idReferencia: id, empleado, resultado: 'OK' })
}
