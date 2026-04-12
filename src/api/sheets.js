// src/api/sheets.js
// Toda la comunicación con Google Sheets pasa por acá

const SHEET_ID = import.meta.env.VITE_SHEET_ID
const CLIENT_EMAIL = import.meta.env.VITE_GOOGLE_CLIENT_EMAIL
const PRIVATE_KEY = import.meta.env.VITE_GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n')

const SCOPES = ['https://www.googleapis.com/auth/spreadsheets']

// ── JWT / Token ──────────────────────────────────────────────────────────────

let _cachedToken = null
let _tokenExpiry = 0

async function getAccessToken() {
  if (_cachedToken && Date.now() < _tokenExpiry - 60000) return _cachedToken

  const header = { alg: 'RS256', typ: 'JWT' }
  const now = Math.floor(Date.now() / 1000)
  const claim = {
    iss: CLIENT_EMAIL,
    scope: SCOPES.join(' '),
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  }

  const encode = (obj) =>
    btoa(JSON.stringify(obj)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')

  const headerB64 = encode(header)
  const claimB64 = encode(claim)
  const signingInput = `${headerB64}.${claimB64}`

  const pemBody = PRIVATE_KEY.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\n/g, '')
  const binaryKey = Uint8Array.from(atob(pemBody), (c) => c.charCodeAt(0))

  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8',
    binaryKey,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  )

  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    cryptoKey,
    new TextEncoder().encode(signingInput)
  )

  const sigB64 = btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')

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

// ── Helpers ──────────────────────────────────────────────────────────────────

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

async function sheetsBatchGet(ranges) {
  const token = await getAccessToken()
  const params = ranges.map(r => `ranges=${encodeURIComponent(r)}`).join('&')
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values:batchGet?${params}`
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
  if (!res.ok) throw new Error(`Sheets BATCH GET error: ${res.status}`)
  return res.json()
}

// ── Date/Time helpers ────────────────────────────────────────────────────────

function getArgentinaDate() {
  const now = new Date()
  const locale = now.toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', hour12: false })
  const [fechaPart, horaPart] = locale.split(', ')
  const [dia, mes, anio] = fechaPart.split('/')
  const meses = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre']
  return {
    fecha: fechaPart,
    hora: horaPart,
    mes: meses[parseInt(mes) - 1],
    anio: parseInt(anio),
    raw: now,
  }
}

// ── Descuentos de imanes ─────────────────────────────────────────────────────

function isIman(skuOrNombre) {
  if (!skuOrNombre) return false
  const s = String(skuOrNombre).toUpperCase()
  return s.includes('IMAN') || s.includes('IMÁN') || s.includes('MAGNET')
}

function calcularDescuentoImanes(items) {
  const imanes8000 = items.filter(i => isIman(i.nombre) && i.precioUnitario >= 8000)
  const imanes6000 = items.filter(i => isIman(i.nombre) && i.precioUnitario >= 6000 && i.precioUnitario < 8000)

  const cant8000 = imanes8000.reduce((s, i) => s + i.cantidad, 0)
  const cant6000 = imanes6000.reduce((s, i) => s + i.cantidad, 0)

  const grupos8000x3 = Math.floor(cant8000 / 3)
  const grupos8000x2 = Math.floor((cant8000 % 3) / 2)
  const grupos6000x3 = Math.floor(cant6000 / 3)
  const grupos6000x2 = Math.floor((cant6000 % 3) / 2)

  const dtoIman8000x3 = grupos8000x3 * 3 * 8000 * 0
  const dtoIman8000x2 = grupos8000x2 * 2 * 8000 * 0
  const dtoIman6000x3 = grupos6000x3 * 3 * 6000 * 0
  const dtoIman6000x2 = grupos6000x2 * 2 * 6000 * 0

  return {
    dtoIman8000x3,
    dtoIman8000x2,
    dtoIman6000x3,
    dtoIman6000x2,
    totalDescuentoImanes: dtoIman8000x3 + dtoIman8000x2 + dtoIman6000x3 + dtoIman6000x2,
  }
}

// ── Log de actividad ─────────────────────────────────────────────────────────

/**
 * Registra un evento en la pestaña APP_LOG
 * accion: string corto (ej: 'VENTA_REGISTRADA', 'VENTA_ANULADA', 'LOGIN', 'ERROR')
 * detalle: string descriptivo
 * idReferencia: ID de venta u otro objeto relacionado (opcional)
 * empleado: nombre del empleado (opcional)
 * resultado: 'OK' | 'ERROR' | string
 */
export async function registrarLog({ accion, detalle, idReferencia = '', empleado = '', resultado = 'OK' }) {
  try {
    const dt = getArgentinaDate()
    const timestamp = new Date().toISOString()
    const row = [
      `'${timestamp}`,      // A: TIMESTAMP ISO
      `'${dt.fecha}`,       // B: FECHA
      `'${dt.hora}`,        // C: HORA
      empleado,             // D: EMPLEADO
      accion,               // E: ACCION
      detalle,              // F: DETALLE
      idReferencia,         // G: ID_REFERENCIA
      resultado,            // H: RESULTADO
    ]
    await sheetsAppend('APP_LOG!A:H', [row])
  } catch (e) {
    // El log nunca debe romper la app — falla silenciosamente
    console.warn('Error al registrar log:', e)
  }
}

// ── API pública ──────────────────────────────────────────────────────────────

export async function getArticulos() {
  const data = await sheetsGet('ARTICULOS!A1:Z')
  const rows = data.values || []
  if (rows.length === 0) return []

  const headers = rows[0].map(h => h?.toString().toUpperCase().trim() ?? '')

  const col = (...keys) => {
    for (const key of keys) {
      const idx = headers.findIndex(h => h === key)
      if (idx >= 0) return idx
    }
    for (const key of keys) {
      const idx = headers.findIndex(h => h.includes(key))
      if (idx >= 0) return idx
    }
    return -1
  }

  const iId       = col('ID', 'ARTICULO', 'SKU', 'CODIGO', 'COD')
  const iNombre   = col('NOMBRE', 'DESCRIPCION', 'PRODUCTO')
  const iStock    = col('STOCK INICIAL', 'STOCK')
  const iInfo     = col('INFO', 'DETALLE')
  const iDisp     = col('DISPONIBILIDAD', 'DISPONIB', 'ACTIVO', 'ESTADO')
  const iFoto     = col('FOTO', 'IMAGEN', 'IMAGE', 'IMG', 'URL')
  const iPrecio   = col('PRECIO UNITARIO', 'PRECIO')
  const iCosto    = col('COSTO UNITARIO', 'COSTO')
  const iReponer  = col('CANTIDAD REPONER', 'REPONER', 'CANT REPONER')
  const iStockC   = col('STOCK CIERRE', 'CIERRE')
  const iStockA   = col('STOCK ACTUAL', 'ACTUAL')

  const idx = (found, fallback) => found >= 0 ? found : fallback
  const parseNum = v => Number(String(v || '0').replace(/[$\s]/g, '').replace(/\./g, '').replace(',', '.')) || 0

  return rows.slice(1)
    .filter(r => r[idx(iId, 0)])
    .map(r => ({
      id:             r[idx(iId, 0)]     || '',
      nombre:         r[idx(iNombre, 1)] || '',
      stockInicial:   parseNum(r[idx(iStock, 2)]),
      info:           r[idx(iInfo, 3)]   || '',
      disponibilidad: r[idx(iDisp, 4)]   || '',
      foto:           r[idx(iFoto, 5)]   || '',
      precioUnitario: parseNum(r[idx(iPrecio, 6)]),
      costoUnitario:  parseNum(r[idx(iCosto, 7)]),
      cantidadReponer:parseNum(r[idx(iReponer, 8)]),
      stockCierre:    parseNum(r[idx(iStockC, 9)]),
      stockActual:    parseNum(r[idx(iStockA, 10)]),
    }))
    .filter(a => {
      const d = a.disponibilidad?.toString().toUpperCase()
      return d === 'ACTIVO' || d === 'SI' || d === 'TRUE' || d === '1'
    })
}

export async function getUsuarios() {
  const data = await sheetsGet('USUARIOS!A2:E')
  const rows = data.values || []
  return rows
    .filter(r => r[0] && r[1])
    .map(r => ({
      id: r[0] || '',
      nombre: r[1] || '',
      codigo: r[2] || '',
      tipo: r[3] || '',
    }))
}

function parsePrecio(v) {
  if (!v && v !== 0) return 0
  return Number(String(v).replace(/[$\s.]/g, '').replace(',', '.')) || 0
}

function mapRow(r) {
  return {
    idDetalle: r[0],
    idVenta: r[1],
    fecha: r[2],
    hora: r[3],
    mes: r[4],
    anio: r[5],
    articulo: r[6],
    nombre: r[7],
    foto: r[8],
    cantidad: Number(r[9]) || 0,
    precioUnitario: parsePrecio(r[10]),
    precioTotal: parsePrecio(r[11]),
    costoUnitario: parsePrecio(r[12]),
    costoTotal: parsePrecio(r[13]),
    empleado: r[14],
    metodoPago: r[15],
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
  return rows
    .filter(r => r[2] === fecha)
    .map(mapRow)
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
    if (r[1] === idVenta) {
      const rowNum = idx + 2
      requests.push(sheetsUpdate(`DETALLE DE VENTAS!U${rowNum}`, [['TRUE']]))
    }
  })
  if (requests.length === 0) throw new Error('No se encontraron filas para anular')
  await Promise.all(requests)
  await registrarLog({
    accion: 'VENTA_ANULADA',
    detalle: `Venta ${idVenta} anulada completamente (${requests.length} items)`,
    idReferencia: idVenta,
    empleado,
    resultado: 'OK',
  })
  return requests.length
}

export async function generarIdVenta() {
  const data = await sheetsGet('DETALLE DE VENTAS!B2:B')
  const rows = data.values || []
  const { raw } = getArgentinaDate()
  const prefix = `V${String(raw.getFullYear()).slice(2)}${String(raw.getMonth()+1).padStart(2,'0')}${String(raw.getDate()).padStart(2,'0')}`
  const hoy = rows.filter(r => r[0]?.startsWith(prefix))
  const seq = hoy.length + 1
  return `${prefix}-${String(seq).padStart(3, '0')}`
}

export async function registrarVenta({ items, metodoPago, descCarrito = 0, empleado = '', notas = '', descuentoImanes = 0 }) {
  const dt = getArgentinaDate()
  const idVenta = await generarIdVenta()
  const { totalDescuentoImanes, dtoIman8000x3, dtoIman8000x2, dtoIman6000x3, dtoIman6000x2 } =
    calcularDescuentoImanes(items)

  const rows = items.map((item, idx) => {
    const idDetalle = `${idVenta}-${String(idx + 1).padStart(2, '0')}`
    const precioTotal = item.cantidad * item.precioUnitario
    const costoTotal = item.cantidad * item.costoUnitario
    const descuentoItem = item.descuento || 0
    const precioTotalFinal = precioTotal * (1 - descuentoItem / 100) * (1 - descCarrito / 100)
    const ingresoNeto = precioTotalFinal - costoTotal

    return [
      idDetalle,
      idVenta,
      `'${dt.fecha}`,
      `'${dt.hora}`,
      dt.mes,
      dt.anio,
      item.articulo,
      item.nombre,
      item.foto || '',
      item.cantidad,
      item.precioUnitario,
      precioTotal,
      item.costoUnitario,
      costoTotal,
      empleado,
      metodoPago,
      descuentoItem,
      descCarrito > 0 ? `${descCarrito}%` : '',
      precioTotalFinal,
      notas,
      false,
      ingresoNeto,
      dtoIman8000x3,
      dtoIman8000x3,
      dtoIman8000x2,
      dtoIman6000x3,
      dtoIman6000x2,
      '',
      '',
      '',
    ]
  })

  await sheetsAppend('DETALLE DE VENTAS!A:AD', rows)

  const totalVenta = items.reduce((s, i) => {
    const pf = i.cantidad * i.precioUnitario * (1 - (i.descuento||0)/100) * (1 - descCarrito/100)
    return s + pf
  }, 0)

  await registrarLog({
    accion: 'VENTA_REGISTRADA',
    detalle: `${items.length} producto(s) · ${metodoPago}${descCarrito > 0 ? ` · DTO ${descCarrito}%` : ''}${descuentoImanes > 0 ? ` · DTO imanes $${descuentoImanes}` : ''} · Total $${Math.round(totalVenta).toLocaleString('es-AR')}`,
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
    if (r[0] === idDetalle) {
      idVenta = r[1]
      const rowNum = idx + 2
      requests.push(sheetsUpdate(`DETALLE DE VENTAS!U${rowNum}`, [['TRUE']]))
    }
  })

  if (requests.length === 0) throw new Error('No se encontró el item')
  await Promise.all(requests)

  await registrarLog({
    accion: 'ITEM_ANULADO',
    detalle: `Item ${idDetalle} anulado de venta ${idVenta || todosLosItems[0]?.idVenta}`,
    idReferencia: idDetalle,
    empleado,
    resultado: 'OK',
  })

  const idVentaFinal = idVenta || todosLosItems[0]?.idVenta
  if (idVentaFinal) {
    const itemsActivos = todosLosItems.filter(i => i.idDetalle !== idDetalle && !i.anulado)
    if (itemsActivos.length === 0) {
      const ventaRequests = []
      rows.forEach((r, idx) => {
        if (r[1] === idVentaFinal && r[20] !== 'TRUE') {
          ventaRequests.push(sheetsUpdate(`DETALLE DE VENTAS!U${idx + 2}`, [['TRUE']]))
        }
      })
      await Promise.all(ventaRequests)
      await registrarLog({
        accion: 'VENTA_ANULADA_AUTO',
        detalle: `Venta ${idVentaFinal} anulada automáticamente (todos los items anulados)`,
        idReferencia: idVentaFinal,
        empleado,
        resultado: 'OK',
      })
    }
  }
}

// ── Artículos CRUD ────────────────────────────────────────────────────────────

/**
 * Trae todos los artículos SIN filtrar por disponibilidad (para el ABM)
 */
export async function getArticulosAdmin() {
  const data = await sheetsGet('ARTICULOS!A1:K')
  const rows = data.values || []
  if (rows.length === 0) return []
  return rows.slice(1)
    .map((r, idx) => ({
      rowNum: idx + 2, // fila real en el sheet (1-indexed, +1 por header)
      id:              r[0] || '',
      nombre:          r[1] || '',
      stockInicial:    r[2] || '0',
      info:            r[3] || '',
      disponibilidad:  r[4] || 'ACTIVO',
      foto:            r[5] || '',
      precioUnitario:  r[6] || '0',
      costoUnitario:   r[7] || '0',
      cantidadReponer: r[8] || '0',
      stockCierre:     r[9] || '0',
      stockActual:     r[10] || '0',
    }))
    .filter(r => r.id)
}

/**
 * Genera el próximo ID de artículo (TB + número siguiente)
 */
export async function generarIdArticulo() {
  const data = await sheetsGet('ARTICULOS!A2:A')
  const rows = data.values || []
  const ids = rows
    .map(r => r[0])
    .filter(id => id && /^TB\d+$/.test(id))
    .map(id => parseInt(id.replace('TB', '')))
  const maxId = ids.length > 0 ? Math.max(...ids) : 0
  return `TB${String(maxId + 1).padStart(5, '0')}`
}

/**
 * Agrega un artículo nuevo al sheet
 */
export async function agregarArticulo(art, empleado = '') {
  const row = [
    art.id,
    art.nombre,
    art.stockInicial || '0',
    art.info || '',
    art.disponibilidad || 'ACTIVO',
    art.foto || '',
    art.precioUnitario || '0',
    art.costoUnitario || '0',
    art.cantidadReponer || '0',
    art.stockCierre || '0',
    art.stockActual || '0',
  ]
  await sheetsAppend('ARTICULOS!A:K', [row])
  await registrarLog({
    accion: 'ARTICULO_CREADO',
    detalle: `${art.id} · ${art.nombre} · $${art.precioUnitario}`,
    idReferencia: art.id,
    empleado,
    resultado: 'OK',
  })
}

/**
 * Edita un artículo existente por número de fila
 */
export async function editarArticulo(rowNum, art, empleado = '') {
  const row = [
    art.id,
    art.nombre,
    art.stockInicial || '0',
    art.info || '',
    art.disponibilidad || 'ACTIVO',
    art.foto || '',
    art.precioUnitario || '0',
    art.costoUnitario || '0',
    art.cantidadReponer || '0',
    art.stockCierre || '0',
    art.stockActual || '0',
  ]
  await sheetsUpdate(`ARTICULOS!A${rowNum}:K${rowNum}`, [row])
  await registrarLog({
    accion: 'ARTICULO_EDITADO',
    detalle: `${art.id} · ${art.nombre} · $${art.precioUnitario}`,
    idReferencia: art.id,
    empleado,
    resultado: 'OK',
  })
}

/**
 * Cambia la disponibilidad de un artículo
 */
export async function toggleDisponibilidad(rowNum, artId, nuevaDisp, empleado = '') {
  await sheetsUpdate(`ARTICULOS!E${rowNum}`, [[nuevaDisp]])
  await registrarLog({
    accion: 'ARTICULO_DISPONIBILIDAD',
    detalle: `${artId} → ${nuevaDisp}`,
    idReferencia: artId,
    empleado,
    resultado: 'OK',
  })
}

// ── Ingresos de mercadería ────────────────────────────────────────────────────

export async function getIngresos() {
  const data = await sheetsGet('INGRESOS!A2:K')
  const rows = data.values || []
  return rows
    .filter(r => r[0])
    .map((r, idx) => ({
      rowNum:        idx + 2,
      idIngreso:     r[0]  || '',
      fecha:         r[1]  || '',
      hora:          r[2]  || '',
      articuloId:    r[3]  || '',
      articuloNombre:r[4]  || '',
      cantidad:      Number(r[5]) || 0,
      costoUnitario: parsePrecio(r[6]),
      costoTotal:    parsePrecio(r[7]),
      proveedor:     r[8]  || '',
      empleado:      r[9]  || '',
      anulado:       r[10] === 'TRUE' || r[10] === true,
    }))
}

export async function registrarIngreso({ articuloId, articuloNombre, cantidad, costoUnitario, proveedor, empleado }) {
  const dt = getArgentinaDate()

  // Generar ID ingreso
  const data = await sheetsGet('INGRESOS!A2:A')
  const rows = data.values || []
  const prefix = `I${String(dt.raw.getFullYear()).slice(2)}${String(dt.raw.getMonth()+1).padStart(2,'0')}${String(dt.raw.getDate()).padStart(2,'0')}`
  const hoy = rows.filter(r => r[0]?.startsWith(prefix))
  const idIngreso = `${prefix}-${String(hoy.length + 1).padStart(3, '0')}`

  const costoTotal = cantidad * (Number(costoUnitario) || 0)

  const row = [
    idIngreso,
    `'${dt.fecha}`,
    `'${dt.hora}`,
    articuloId,
    articuloNombre,
    cantidad,
    costoUnitario || 0,
    costoTotal,
    proveedor || '',
    empleado || '',
    false,
  ]

  await sheetsAppend('INGRESOS!A:K', [row])

  await registrarLog({
    accion: 'INGRESO_REGISTRADO',
    detalle: `${articuloId} · ${articuloNombre} · x${cantidad} · Proveedor: ${proveedor}`,
    idReferencia: idIngreso,
    empleado,
    resultado: 'OK',
  })

  return idIngreso
}

export async function anularIngreso(rowNum, idIngreso, empleado = '') {
  await sheetsUpdate(`INGRESOS!K${rowNum}`, [['TRUE']])
  await registrarLog({
    accion: 'INGRESO_ANULADO',
    detalle: `Ingreso ${idIngreso} anulado`,
    idReferencia: idIngreso,
    empleado,
    resultado: 'OK',
  })
}

/**
 * Calcula el stock actual de un artículo:
 * STOCK ACTUAL = STOCK INICIAL + ingresos no anulados - ventas no anuladas
 */
export async function calcularStockActual(articuloId, stockInicial) {
  const [dataIngresos, dataVentas] = await Promise.all([
    sheetsGet('INGRESOS!A2:K'),
    sheetsGet('DETALLE DE VENTAS!A2:U'),
  ])

  const ingresos = (dataIngresos.values || [])
    .filter(r => r[3] === articuloId && r[10] !== 'TRUE')
    .reduce((s, r) => s + (Number(r[5]) || 0), 0)

  const ventas = (dataVentas.values || [])
    .filter(r => r[6] === articuloId && r[20] !== 'TRUE')
    .reduce((s, r) => s + (Number(r[9]) || 0), 0)

  return (Number(stockInicial) || 0) + ingresos - ventas
}

/**
 * Calcula el stock de todos los artículos de una vez (más eficiente)
 */
export async function calcularStockTodos(articulos) {
  const [dataIngresos, dataVentas] = await Promise.all([
    sheetsGet('INGRESOS!A2:K'),
    sheetsGet('DETALLE DE VENTAS!A2:U'),
  ])

  const ingresosPorArt = {}
  ;(dataIngresos.values || [])
    .filter(r => r[0] && r[10] !== 'TRUE')
    .forEach(r => {
      const id = r[3]
      if (id) ingresosPorArt[id] = (ingresosPorArt[id] || 0) + (Number(r[5]) || 0)
    })

  const ventasPorArt = {}
  ;(dataVentas.values || [])
    .filter(r => r[0] && r[20] !== 'TRUE')
    .forEach(r => {
      const id = r[6]
      if (id) ventasPorArt[id] = (ventasPorArt[id] || 0) + (Number(r[9]) || 0)
    })

  return articulos.map(art => ({
    ...art,
    stockActualCalculado: (Number(art.stockInicial) || 0) + (ingresosPorArt[art.id] || 0) - (ventasPorArt[art.id] || 0),
  }))
}

// ── Pagos ────────────────────────────────────────────────────────────────────

export async function getPagos() {
  const data = await sheetsGet('PAGOS!A2:O')
  const rows = data.values || []
  return rows
    .filter(r => r[0])
    .map((r, idx) => ({
      rowNum:         idx + 2,
      idPago:         r[0]  || '',
      tipo:           r[1]  || '',        // MERCADERÍA | GASTO
      fechaIngreso:   r[2]  || '',
      fechaPago:      r[3]  || '',
      articuloId:     r[4]  || '',
      articuloNombre: r[5]  || '',
      cantidad:       Number(r[6]) || 0,
      costoUnitario:  parsePrecio(r[7]),
      costoTotal:     parsePrecio(r[8]),
      descripcion:    r[9]  || '',
      proveedor:      r[10] || '',
      montoPagado:    parsePrecio(r[11]),
      pagado:         r[12] === 'TRUE' || r[12] === true,
      empleado:       r[13] || '',
      anulado:        r[14] === 'TRUE' || r[14] === true,
    }))
}

export async function registrarPago({
  tipo, fechaIngreso, fechaPago,
  articuloId, articuloNombre, cantidad, costoUnitario,
  descripcion, proveedor, montoPagado, pagado, empleado
}) {
  const dt = getArgentinaDate()

  // Generar ID pago
  const data = await sheetsGet('PAGOS!A2:A')
  const rows = data.values || []
  const prefix = `P${String(dt.raw.getFullYear()).slice(2)}${String(dt.raw.getMonth()+1).padStart(2,'0')}${String(dt.raw.getDate()).padStart(2,'0')}`
  const hoy = rows.filter(r => r[0]?.startsWith(prefix))
  const idPago = `${prefix}-${String(hoy.length + 1).padStart(3, '0')}`

  const costoTotal = (Number(cantidad) || 0) * (Number(costoUnitario) || 0)

  const row = [
    idPago,
    tipo || 'GASTO',
    fechaIngreso ? `'${fechaIngreso}` : '',
    fechaPago    ? `'${fechaPago}`    : '',
    articuloId     || '',
    articuloNombre || '',
    cantidad       || 0,
    costoUnitario  || 0,
    costoTotal,
    descripcion    || '',
    proveedor      || '',
    montoPagado    || 0,
    pagado ? 'TRUE' : 'FALSE',
    empleado       || '',
    'FALSE',
  ]

  await sheetsAppend('PAGOS!A:O', [row])

  // Si es MERCADERÍA con fecha de ingreso → crear en INGRESOS automáticamente
  if (tipo === 'MERCADERÍA' && fechaIngreso && articuloId) {
    const dtIngreso = fechaIngreso
    const dataIng = await sheetsGet('INGRESOS!A2:A')
    const rowsIng = dataIng.values || []
    const prefixI = `I${idPago.slice(1)}` // mismo sufijo que el pago
    const idIngreso = `${prefixI}`

    const rowIngreso = [
      idIngreso,
      `'${fechaIngreso}`,
      `'${dt.hora}`,
      articuloId,
      articuloNombre,
      cantidad || 0,
      costoUnitario || 0,
      costoTotal,
      proveedor || '',
      empleado || '',
      false,
    ]
    await sheetsAppend('INGRESOS!A:K', [rowIngreso])
  }

  await registrarLog({
    accion: 'PAGO_REGISTRADO',
    detalle: `${tipo} · ${articuloNombre || descripcion} · $${montoPagado}`,
    idReferencia: idPago,
    empleado,
    resultado: 'OK',
  })

  return idPago
}

export async function actualizarPago(rowNum, campos, empleado = '') {
  // campos: objeto con los valores a actualizar (fila completa)
  const costoTotal = (Number(campos.cantidad) || 0) * (Number(campos.costoUnitario) || 0)
  const row = [
    campos.idPago,
    campos.tipo || 'GASTO',
    campos.fechaIngreso ? `'${campos.fechaIngreso}` : '',
    campos.fechaPago    ? `'${campos.fechaPago}`    : '',
    campos.articuloId     || '',
    campos.articuloNombre || '',
    campos.cantidad       || 0,
    campos.costoUnitario  || 0,
    costoTotal,
    campos.descripcion    || '',
    campos.proveedor      || '',
    campos.montoPagado    || 0,
    campos.pagado ? 'TRUE' : 'FALSE',
    campos.empleado       || '',
    campos.anulado ? 'TRUE' : 'FALSE',
  ]
  await sheetsUpdate(`PAGOS!A${rowNum}:O${rowNum}`, [row])

  // Si se actualizó a mercadería recibida y antes no tenía ingreso → crear en INGRESOS
  if (campos.tipo === 'MERCADERÍA' && campos.fechaIngreso && campos.articuloId && campos.crearIngreso) {
    const costoTotalIng = (Number(campos.cantidad) || 0) * (Number(campos.costoUnitario) || 0)
    const rowIngreso = [
      `I${campos.idPago.slice(1)}`,
      `'${campos.fechaIngreso}`,
      `'${new Date().toLocaleString('es-AR', { timeZone:'America/Argentina/Buenos_Aires', hour12:false }).split(', ')[1]}`,
      campos.articuloId,
      campos.articuloNombre,
      campos.cantidad || 0,
      campos.costoUnitario || 0,
      costoTotalIng,
      campos.proveedor || '',
      empleado || '',
      false,
    ]
    await sheetsAppend('INGRESOS!A:K', [rowIngreso])
  }

  await registrarLog({
    accion: 'PAGO_ACTUALIZADO',
    detalle: `${campos.idPago} actualizado`,
    idReferencia: campos.idPago,
    empleado,
    resultado: 'OK',
  })
}

export async function anularPago(rowNum, idPago, empleado = '') {
  await sheetsUpdate(`PAGOS!O${rowNum}`, [['TRUE']])
  await registrarLog({
    accion: 'PAGO_ANULADO',
    detalle: `Pago ${idPago} anulado`,
    idReferencia: idPago,
    empleado,
    resultado: 'OK',
  })
}
