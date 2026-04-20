// src/api/sheets.js
// Toda la comunicación con Google Sheets pasa por acá

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

// ── Descuentos de imanes ─────────────────────────────────────────────────────
// Grupos según las fórmulas del sheet:
// Grupo A (8000): TB00049-TB00058, TB00359, TB01011, TB01043, TB01044 → descuento 25% x3, 12.5% x2
// Grupo B (6000): TB00399, TB00433, TB00587, TB00741, TB00805, TB00059 → descuento 33.33% x3, 16.66% x2

const IMANES_A = new Set(['TB00049','TB00050','TB00051','TB00052','TB00053','TB00054','TB00055','TB00056','TB00058','TB00359','TB01011','TB01043','TB01044'])
const IMANES_B = new Set(['TB00399','TB00433','TB00587','TB00741','TB00805','TB00059'])

/**
 * Calcula los descuentos de imanes por item, alineado con las fórmulas del sheet.
 * Devuelve dtoIman8000x3, dtoIman8000x2, dtoIman6000x3, dtoIman6000x2 POR ITEM.
 * El descuento se distribuye proporcionalmente al precio de cada item dentro del grupo.
 */
function calcularDescuentosImanesItems(items) {
  // Totales del carrito por grupo
  const itemsA = items.filter(i => IMANES_A.has(i.articulo || i.id))
  const itemsB = items.filter(i => IMANES_B.has(i.articulo || i.id))
  const cantA = itemsA.reduce((s, i) => s + i.cantidad, 0)
  const cantB = itemsB.reduce((s, i) => s + i.cantidad, 0)
  const totalPrecioA = itemsA.reduce((s, i) => s + i.precioUnitario * i.cantidad, 0)
  const totalPrecioB = itemsB.reduce((s, i) => s + i.precioUnitario * i.cantidad, 0)

  // Descuento total del grupo A
  const dtoTotalA_x3 = cantA >= 3 ? Math.round(totalPrecioA * 0.25) : 0
  const dtoTotalA_x2 = cantA === 2 ? Math.round(totalPrecioA * 0.125) : 0
  // Descuento total del grupo B
  const dtoTotalB_x3 = cantB >= 3 ? Math.round(totalPrecioB * 0.333333) : 0
  const dtoTotalB_x2 = cantB === 2 ? Math.round(totalPrecioB * 0.166666) : 0

  // Distribuir proporcionalmente a cada item
  return items.map(item => {
    const sku = item.articulo || item.id
    const precioItem = item.precioUnitario * item.cantidad

    let dtoX3 = 0, dtoX2 = 0

    if (IMANES_A.has(sku) && totalPrecioA > 0) {
      const proporcion = precioItem / totalPrecioA
      dtoX3 = cantA >= 3 ? Math.round(dtoTotalA_x3 * proporcion) : 0
      dtoX2 = cantA === 2 ? Math.round(dtoTotalA_x2 * proporcion) : 0
    } else if (IMANES_B.has(sku) && totalPrecioB > 0) {
      const proporcion = precioItem / totalPrecioB
      dtoX3 = cantB >= 3 ? Math.round(dtoTotalB_x3 * proporcion) : 0
      dtoX2 = cantB === 2 ? Math.round(dtoTotalB_x2 * proporcion) : 0
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

export async function registrarLog({ accion, detalle, idReferencia = '', empleado = '', resultado = 'OK' }) {
  try {
    const dt = getArgentinaDate()
    const timestamp = new Date().toISOString()
    const row = [
      `'${timestamp}`, `'${dt.fecha}`, `'${dt.hora}`,
      empleado, accion, detalle, idReferencia, resultado,
    ]
    await sheetsAppend('APP_LOG!A1', [row])
  } catch (e) {
    console.warn('Error al registrar log:', e)
  }
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
  const iId = col('ID', 'ARTICULO', 'SKU', 'CODIGO', 'COD')
  const iNombre = col('NOMBRE', 'DESCRIPCION', 'PRODUCTO')
  const iStock = col('STOCK INICIAL', 'STOCK')
  const iInfo = col('INFO', 'DETALLE')
  const iDisp = col('DISPONIBILIDAD', 'DISPONIB', 'ACTIVO', 'ESTADO')
  const iFoto = col('FOTO', 'IMAGEN', 'IMAGE', 'IMG', 'URL')
  const iPrecio = col('PRECIO UNITARIO', 'PRECIO')
  const iCosto = col('COSTO UNITARIO', 'COSTO')
  const iReponer = col('CANTIDAD REPONER', 'REPONER', 'CANT REPONER')
  const iStockC = col('STOCK CIERRE', 'CIERRE')
  const iStockA = col('STOCK ACTUAL', 'ACTUAL')
  const idx = (found, fallback) => found >= 0 ? found : fallback
  const parseNum = v => Number(String(v || '0').replace(/[$\s]/g, '').replace(/\./g, '').replace(',', '.')) || 0
  return rows.slice(1)
    .filter(r => r[idx(iId, 0)])
    .map(r => ({
      id: r[idx(iId, 0)] || '', nombre: r[idx(iNombre, 1)] || '',
      stockInicial: parseNum(r[idx(iStock, 2)]), info: r[idx(iInfo, 3)] || '',
      disponibilidad: r[idx(iDisp, 4)] || '', foto: r[idx(iFoto, 5)] || '',
      precioUnitario: parseNum(r[idx(iPrecio, 6)]), costoUnitario: parseNum(r[idx(iCosto, 7)]),
      cantidadReponer: parseNum(r[idx(iReponer, 8)]), stockCierre: parseNum(r[idx(iStockC, 9)]),
      stockActual: parseNum(r[idx(iStockA, 10)]),
    }))
    .filter(a => {
      const d = a.disponibilidad?.toString().toUpperCase()
      return !d || d === 'ACTIVO' || d === 'SI' || d === 'TRUE' || d === '1'
    })
}

export async function getUsuarios() {
  const data = await sheetsGet('USUARIOS!A2:E')
  const rows = data.values || []
  return rows.filter(r => r[0] && r[1]).map(r => ({ id: r[0]||'', nombre: r[1]||'', codigo: r[2]||'', tipo: r[3]||'' }))
}

function parsePrecio(v) {
  if (!v && v !== 0) return 0
  return Number(String(v).replace(/[$\s.]/g, '').replace(',', '.')) || 0
}

function mapRow(r) {
  return {
    idDetalle: r[0], idVenta: r[1], fecha: r[2], hora: r[3], mes: r[4], anio: r[5],
    articulo: r[6], nombre: r[7], foto: r[8],
    cantidad: Number(r[9]) || 0,
    precioUnitario: parsePrecio(r[10]),
    precioTotal: parsePrecio(r[11]),
    costoUnitario: parsePrecio(r[12]),
    costoTotal: parsePrecio(r[13]),
    empleado: r[14], metodoPago: r[15],
    descuento: Number(r[16]) || 0,
    descCarrito: r[17],
    precioTotalFinal: parsePrecio(r[18]),
    notas: r[19],
    anulado: r[20] === 'TRUE' || r[20] === true,
    ingresoNeto: parsePrecio(r[21]),
  }
}

export async function getVentasHoy() {
  const data = await sheetsGet('DETALLE DE VENTAS!A2:AD')
  const rows = data.values || []
  const { fecha } = getArgentinaDate()
  return rows.filter(r => r[2] === fecha).map(mapRow)
}

export async function getHistoricoVentas() {
  const data = await sheetsGet('DETALLE DE VENTAS!A2:AD')
  const rows = data.values || []
  return rows.filter(r => r[0]).map(mapRow)
}

export async function anularVenta(idVenta, empleado = '') {
  const data = await sheetsGet('DETALLE DE VENTAS!A2:U')
  const rows = data.values || []
  const requests = []
  rows.forEach((r, idx) => {
    if (r[1] === idVenta) requests.push(sheetsUpdate(`DETALLE DE VENTAS!U${idx + 2}`, [['TRUE']]))
  })
  if (requests.length === 0) throw new Error('No se encontraron filas para anular')
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
  while (idsHoy.has(`${prefix}-${String(finalSeq).padStart(3, '0')}`)) finalSeq++
  return `${prefix}-${String(finalSeq).padStart(3, '0')}`
}

export async function registrarVenta({ items, metodoPago, descCarrito = 0, empleado = '', notas = '', descuentoImanes = 0 }) {
  const dt = getArgentinaDate()
  const idVenta = await generarIdVenta()

  // Calcular descuentos de imanes por item
  const dtosPorItem = calcularDescuentosImanesItems(items)

  // Encontrar última fila con datos en DETALLE DE VENTAS
  const existentes = await sheetsGet('DETALLE DE VENTAS!A:A')
  const allRows = existentes.values || []
  let lastDataRow = 1
  allRows.forEach((r, i) => {
    if (r[0] && String(r[0]).trim()) lastDataRow = i + 1
  })
  const nextRow = lastDataRow + 1

  const rows = items.map((item, idx) => {
    const rowNum = nextRow + idx
    const idDetalle = `${idVenta}-${String(idx + 1).padStart(2, '0')}`
    const precioTotal = item.cantidad * item.precioUnitario
    const costoTotal = item.cantidad * item.costoUnitario
    const descuentoItem = item.descuento || 0
    const dto = dtosPorItem[idx]

    // Fórmula S: (precioTotal - descuentoImanes) - descuento%
    // Alineado con: =IF(ISBLANK(L);""；(L - W) - IF(OR(Q>0,R>0); ...))
    const baseConIman = precioTotal - dto.descuentoImanes
    let precioTotalFinal
    if (descuentoItem > 0) {
      precioTotalFinal = baseConIman - (baseConIman * descuentoItem / 100)
    } else if (descCarrito > 0) {
      // descCarrito viene como número (ej: 10 = 10%)
      const pctCarrito = typeof descCarrito === 'string'
        ? parseFloat(descCarrito.replace('%', ''))
        : descCarrito
      precioTotalFinal = baseConIman - (baseConIman * pctCarrito / 100)
    } else {
      precioTotalFinal = baseConIman
    }

    const ingresoNeto = precioTotalFinal - costoTotal

    return [
      idDetalle,                                                // A (1)
      idVenta,                                                  // B (2)
      `'${dt.fecha}`,                                           // C (3)
      `'${dt.hora}`,                                            // D (4)
      dt.mes,                                                   // E (5)
      dt.anio,                                                  // F (6)
      item.articulo,                                            // G (7)
      item.nombre,                                              // H (8)
      item.foto || '',                                          // I (9)
      item.cantidad,                                            // J (10)
      item.precioUnitario,                                      // K (11)
      precioTotal,                                              // L (12)
      item.costoUnitario,                                       // M (13)
      costoTotal,                                               // N (14)
      empleado,                                                 // O (15)
      metodoPago,                                               // P (16)
      descuentoItem || '',                                      // Q (17)
      descCarrito > 0 ? `${descCarrito}%` : '',                 // R (18)
      Math.round(precioTotalFinal),                             // S (19) PRECIO TOTAL FINAL
      notas,                                                    // T (20)
      false,                                                    // U (21) ANULADO
      Math.round(ingresoNeto),                                  // V (22) INGRESO NETO TOTAL
      dto.descuentoImanes,                                      // W (23) DESCUENTO IMANES
      dto.dtoIman8000x3,                                        // X (24)
      dto.dtoIman8000x2,                                        // Y (25)
      dto.dtoIman6000x3,                                        // Z (26)
      dto.dtoIman6000x2,                                        // AA (27)
      '',                                                       // AB (28)
      '',                                                       // AC (29)
      '',                                                       // AD (30)
    ]
  })

  // Escribir cada fila en su posición exacta
  await Promise.all(rows.map((row, idx) =>
    sheetsUpdate(`DETALLE DE VENTAS!A${nextRow + idx}:AD${nextRow + idx}`, [row])
  ))

  const totalVenta = rows.reduce((s, r) => s + (r[18] || 0), 0)
  const totalDtoImanes = dtosPorItem.reduce((s, d) => s + d.descuentoImanes, 0)

  await registrarLog({
    accion: 'VENTA_REGISTRADA',
    detalle: `${items.length} producto(s) · ${metodoPago}${descCarrito > 0 ? ` · DTO ${descCarrito}%` : ''}${totalDtoImanes > 0 ? ` · DTO imanes $${totalDtoImanes}` : ''} · Total $${Math.round(totalVenta).toLocaleString('es-AR')}`,
    idReferencia: idVenta,
    empleado,
    resultado: 'OK',
  })

  return idVenta
}

export async function anularItemVenta(idDetalle, todosLosItems, empleado = '') {
  const data = await sheetsGet('DETALLE DE VENTAS!A2:U')
  const rows = data.values || []
  const requests = []
  let idVenta = ''
  rows.forEach((r, idx) => {
    if (r[0] === idDetalle) { idVenta = r[1]; requests.push(sheetsUpdate(`DETALLE DE VENTAS!U${idx + 2}`, [['TRUE']])) }
  })
  if (requests.length === 0) throw new Error('No se encontró el item')
  await Promise.all(requests)
  await registrarLog({ accion:'ITEM_ANULADO', detalle:`Item ${idDetalle} anulado`, idReferencia:idDetalle, empleado, resultado:'OK' })
  const idVentaFinal = idVenta || todosLosItems[0]?.idVenta
  if (idVentaFinal) {
    const itemsActivos = todosLosItems.filter(i => i.idDetalle !== idDetalle && !i.anulado)
    if (itemsActivos.length === 0) {
      const ventaRequests = []
      rows.forEach((r, idx) => { if (r[1] === idVentaFinal && r[20] !== 'TRUE') ventaRequests.push(sheetsUpdate(`DETALLE DE VENTAS!U${idx + 2}`, [['TRUE']])) })
      await Promise.all(ventaRequests)
      await registrarLog({ accion:'VENTA_ANULADA_AUTO', detalle:`Venta ${idVentaFinal} anulada automáticamente`, idReferencia:idVentaFinal, empleado, resultado:'OK' })
    }
  }
}

export async function getArticulosAdmin() {
  const data = await sheetsGet('ARTICULOS!A1:K')
  const rows = data.values || []
  if (rows.length === 0) return []
  return rows.slice(1)
    .map((r, idx) => ({
      rowNum: idx + 2,
      id: r[0]||'', nombre: r[1]||'', stockInicial: r[2]||'0', info: r[3]||'',
      disponibilidad: r[4]||'ACTIVO', foto: r[5]||'',
      precioUnitario: r[6]||'0', costoUnitario: r[7]||'0',
      cantidadReponer: r[8]||'0', stockCierre: r[9]||'0', stockActual: r[10]||'0',
    }))
    .filter(r => r.id)
}

export async function generarIdArticulo() {
  const data = await sheetsGet('ARTICULOS!A2:A')
  const rows = data.values || []
  const ids = rows.map(r => r[0]).filter(id => id && /^TB\d+$/.test(id)).map(id => parseInt(id.replace('TB', '')))
  const maxId = ids.length > 0 ? Math.max(...ids) : 0
  return `TB${String(maxId + 1).padStart(5, '0')}`
}

export async function agregarArticulo(art, empleado = '') {
  const data = await sheetsGet('ARTICULOS!A:A')
  const rows = data.values || []
  let lastTBRow = 1
  rows.forEach((r, i) => { if (r[0] && String(r[0]).trim().startsWith('TB')) lastTBRow = i + 1 })
  const nextRow = lastTBRow + 1
  const row = [art.id, art.nombre, art.stockInicial||'0', art.info||'', art.disponibilidad||'ACTIVO', art.foto||'', art.precioUnitario||'0', art.costoUnitario||'0', art.cantidadReponer||'0', art.stockCierre||'0', art.stockActual||'0']
  try {
    await sheetsUpdate(`ARTICULOS!A${nextRow}:K${nextRow}`, [row])
  } catch (e) {
    await sheetsAppend('ARTICULOS!A1', [row])
  }
  await registrarLog({ accion:'ARTICULO_CREADO', detalle:`${art.id} · ${art.nombre} · $${art.precioUnitario}`, idReferencia:art.id, empleado, resultado:'OK' })
}

export async function editarArticulo(rowNum, art, empleado = '') {
  const row = [art.id, art.nombre, art.stockInicial||'0', art.info||'', art.disponibilidad||'ACTIVO', art.foto||'', art.precioUnitario||'0', art.costoUnitario||'0', art.cantidadReponer||'0', art.stockCierre||'0', art.stockActual||'0']
  await sheetsUpdate(`ARTICULOS!A${rowNum}:K${rowNum}`, [row])
  await registrarLog({ accion:'ARTICULO_EDITADO', detalle:`${art.id} · ${art.nombre} · $${art.precioUnitario}`, idReferencia:art.id, empleado, resultado:'OK' })
}

export async function toggleDisponibilidad(rowNum, artId, nuevaDisp, empleado = '') {
  await sheetsUpdate(`ARTICULOS!E${rowNum}`, [[nuevaDisp]])
  await registrarLog({ accion:'ARTICULO_DISPONIBILIDAD', detalle:`${artId} → ${nuevaDisp}`, idReferencia:artId, empleado, resultado:'OK' })
}

export async function getIngresos() {
  const data = await sheetsGet('INGRESOS!A2:K')
  const rows = data.values || []
  return rows.filter(r => r[0]).map((r, idx) => ({
    rowNum: idx+2, idIngreso: r[0]||'', fecha: r[1]||'', hora: r[2]||'',
    articuloId: r[3]||'', articuloNombre: r[4]||'', cantidad: Number(r[5])||0,
    costoUnitario: parsePrecio(r[6]), costoTotal: parsePrecio(r[7]),
    proveedor: r[8]||'', empleado: r[9]||'', anulado: r[10]==='TRUE'||r[10]===true,
  }))
}

export async function registrarIngreso({ articuloId, articuloNombre, cantidad, costoUnitario, proveedor, empleado }) {
  const dt = getArgentinaDate()
  const data = await sheetsGet('INGRESOS!A2:A')
  const rows = data.values || []
  const prefix = `I${String(dt.raw.getFullYear()).slice(2)}${String(dt.raw.getMonth()+1).padStart(2,'0')}${String(dt.raw.getDate()).padStart(2,'0')}`
  const hoy = rows.filter(r => r[0]?.startsWith(prefix))
  const idIngreso = `${prefix}-${String(hoy.length + 1).padStart(3, '0')}`
  const costoTotal = cantidad * (Number(costoUnitario) || 0)
  const row = [idIngreso, `'${dt.fecha}`, `'${dt.hora}`, articuloId, articuloNombre, cantidad, costoUnitario||0, costoTotal, proveedor||'', empleado||'', false]
  await sheetsAppend('INGRESOS!A1', [row])
  await registrarLog({ accion:'INGRESO_REGISTRADO', detalle:`${articuloId} · ${articuloNombre} · x${cantidad}`, idReferencia:idIngreso, empleado, resultado:'OK' })
  return idIngreso
}

export async function anularIngreso(rowNum, idIngreso, empleado = '') {
  await sheetsUpdate(`INGRESOS!K${rowNum}`, [['TRUE']])
  await registrarLog({ accion:'INGRESO_ANULADO', detalle:`Ingreso ${idIngreso} anulado`, idReferencia:idIngreso, empleado, resultado:'OK' })
}

export async function calcularStockActual(articuloId, stockInicial) {
  const [dataIngresos, dataVentas] = await Promise.all([sheetsGet('INGRESOS!A2:K'), sheetsGet('DETALLE DE VENTAS!A2:U')])
  const ingresos = (dataIngresos.values||[]).filter(r => r[3]===articuloId && r[10]!=='TRUE').reduce((s,r) => s+(Number(r[5])||0), 0)
  const ventas = (dataVentas.values||[]).filter(r => r[6]===articuloId && r[20]!=='TRUE').reduce((s,r) => s+(Number(r[9])||0), 0)
  return (Number(stockInicial)||0) + ingresos - ventas
}

export async function calcularStockTodos(articulos) {
  const [dataIngresos, dataVentas] = await Promise.all([sheetsGet('INGRESOS!A2:K'), sheetsGet('DETALLE DE VENTAS!A2:U')])
  const ingresosPorArt = {}
  ;(dataIngresos.values||[]).filter(r => r[0] && r[10]!=='TRUE').forEach(r => { const id=r[3]; if(id) ingresosPorArt[id]=(ingresosPorArt[id]||0)+(Number(r[5])||0) })
  const ventasPorArt = {}
  ;(dataVentas.values||[]).filter(r => r[0] && r[20]!=='TRUE').forEach(r => { const id=r[6]; if(id) ventasPorArt[id]=(ventasPorArt[id]||0)+(Number(r[9])||0) })
  return articulos.map(art => ({ ...art, stockActualCalculado: (Number(art.stockInicial)||0)+(ingresosPorArt[art.id]||0)-(ventasPorArt[art.id]||0) }))
}

export async function getPagos() {
  const data = await sheetsGet('PAGOS!A2:O')
  const rows = data.values || []
  return rows.filter(r => r[0]).map((r, idx) => ({
    rowNum: idx+2, idPago: r[0]||'', tipo: r[1]||'',
    fechaIngreso: r[2]||'', fechaPago: r[3]||'',
    articuloId: r[4]||'', articuloNombre: r[5]||'',
    cantidad: Number(r[6])||0, costoUnitario: parsePrecio(r[7]), costoTotal: parsePrecio(r[8]),
    descripcion: r[9]||'', proveedor: r[10]||'', montoPagado: parsePrecio(r[11]),
    pagado: r[12]==='TRUE'||r[12]===true, empleado: r[13]||'', anulado: r[14]==='TRUE'||r[14]===true,
  }))
}

export async function registrarPago({ tipo, fechaIngreso, fechaPago, articuloId, articuloNombre, cantidad, costoUnitario, descripcion, proveedor, montoPagado, pagado, empleado }) {
  const dt = getArgentinaDate()
  const data = await sheetsGet('PAGOS!A2:A')
  const rows = data.values || []
  const prefix = `P${String(dt.raw.getFullYear()).slice(2)}${String(dt.raw.getMonth()+1).padStart(2,'0')}${String(dt.raw.getDate()).padStart(2,'0')}`
  const hoy = rows.filter(r => r[0]?.startsWith(prefix))
  const idPago = `${prefix}-${String(hoy.length + 1).padStart(3, '0')}`
  const costoTotal = (Number(cantidad)||0) * (Number(costoUnitario)||0)
  const row = [idPago, tipo||'GASTO', fechaIngreso?`'${fechaIngreso}`:'', fechaPago?`'${fechaPago}`:'', articuloId||'', articuloNombre||'', cantidad||0, costoUnitario||0, costoTotal, descripcion||'', proveedor||'', montoPagado||0, pagado?'TRUE':'FALSE', empleado||'', 'FALSE']
  await sheetsAppend('PAGOS!A1', [row])
  if (tipo === 'MERCADERÍA' && fechaIngreso && articuloId) {
    const rowIngreso = [`I${idPago.slice(1)}`, `'${fechaIngreso}`, `'${dt.hora}`, articuloId, articuloNombre, cantidad||0, costoUnitario||0, costoTotal, proveedor||'', empleado||'', false]
    await sheetsAppend('INGRESOS!A1', [rowIngreso])
  }
  await registrarLog({ accion:'PAGO_REGISTRADO', detalle:`${tipo} · ${articuloNombre||descripcion} · $${montoPagado}`, idReferencia:idPago, empleado, resultado:'OK' })
  return idPago
}

export async function actualizarPago(rowNum, campos, empleado = '') {
  const costoTotal = (Number(campos.cantidad)||0) * (Number(campos.costoUnitario)||0)
  const row = [campos.idPago, campos.tipo||'GASTO', campos.fechaIngreso?`'${campos.fechaIngreso}`:'', campos.fechaPago?`'${campos.fechaPago}`:'', campos.articuloId||'', campos.articuloNombre||'', campos.cantidad||0, campos.costoUnitario||0, costoTotal, campos.descripcion||'', campos.proveedor||'', campos.montoPagado||0, campos.pagado?'TRUE':'FALSE', campos.empleado||'', campos.anulado?'TRUE':'FALSE']
  await sheetsUpdate(`PAGOS!A${rowNum}:O${rowNum}`, [row])
  if (campos.tipo === 'MERCADERÍA' && campos.fechaIngreso && campos.articuloId && campos.crearIngreso) {
    const costoTotalIng = (Number(campos.cantidad)||0) * (Number(campos.costoUnitario)||0)
    const hora = new Date().toLocaleString('es-AR', { timeZone:'America/Argentina/Buenos_Aires', hour12:false }).split(', ')[1]
    const rowIngreso = [`I${campos.idPago.slice(1)}`, `'${campos.fechaIngreso}`, `'${hora}`, campos.articuloId, campos.articuloNombre, campos.cantidad||0, campos.costoUnitario||0, costoTotalIng, campos.proveedor||'', empleado||'', false]
    await sheetsAppend('INGRESOS!A1', [rowIngreso])
  }
  await registrarLog({ accion:'PAGO_ACTUALIZADO', detalle:`${campos.idPago} actualizado`, idReferencia:campos.idPago, empleado, resultado:'OK' })
}

export async function anularPago(rowNum, idPago, empleado = '') {
  await sheetsUpdate(`PAGOS!O${rowNum}`, [['TRUE']])
  await registrarLog({ accion:'PAGO_ANULADO', detalle:`Pago ${idPago} anulado`, idReferencia:idPago, empleado, resultado:'OK' })
}
