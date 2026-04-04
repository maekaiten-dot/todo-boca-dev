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

  // Import private key
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
  // locale = "1/4/2026, 13:38:44"
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
// Lógica copiada de la lógica de AppSheet existente
// Imanes serie TB00049–TB00359 y TB00399–TB00805

function isIman(skuOrNombre) {
  // Detecta si es un imán por SKU o nombre
  if (!skuOrNombre) return false
  const s = String(skuOrNombre).toUpperCase()
  return s.includes('IMAN') || s.includes('IMÁN') || s.includes('MAGNET')
}

function calcularDescuentoImanes(items) {
  // items: array de { articulo, nombre, cantidad, precioUnitario }
  // Retorna { dtoIman8000x3, dtoIman8000x2, dtoIman6000x3, dtoIman6000x2, totalDescuentoImanes }

  const imanes8000 = items.filter(i => isIman(i.nombre) && i.precioUnitario >= 8000)
  const imanes6000 = items.filter(i => isIman(i.nombre) && i.precioUnitario >= 6000 && i.precioUnitario < 8000)

  const cant8000 = imanes8000.reduce((s, i) => s + i.cantidad, 0)
  const cant6000 = imanes6000.reduce((s, i) => s + i.cantidad, 0)

  // x3 = cada grupo de 3 tiene descuento, x2 = cada grupo de 2
  const grupos8000x3 = Math.floor(cant8000 / 3)
  const grupos8000x2 = Math.floor((cant8000 % 3) / 2)
  const grupos6000x3 = Math.floor(cant6000 / 3)
  const grupos6000x2 = Math.floor((cant6000 % 3) / 2)

  const dtoIman8000x3 = grupos8000x3 * 3 * 8000 * 0 // placeholder, reemplazar con lógica real
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

// ── API pública ──────────────────────────────────────────────────────────────

/**
 * Trae todos los artículos de la hoja ARTICULOS
 * Retorna array de objetos mapeados a columnas reales
 */
export async function getArticulos() {
  // Leemos desde la fila 1 (headers incluidos) para mapear por nombre de columna
  const data = await sheetsGet('ARTICULOS!A1:Z')
  const rows = data.values || []
  if (rows.length === 0) return []

  // Fila 0 = headers, normalizados a mayúsculas sin espacios extremos
  const headers = rows[0].map(h => h?.toString().toUpperCase().trim() ?? '')

  // Encuentra el índice de la primera columna cuyo header contiene alguna de las palabras clave
  const col = (...keys) => {
    for (const key of keys) {
      const idx = headers.findIndex(h => h === key)
      if (idx >= 0) return idx
    }
    // Si no hay match exacto, intenta match parcial
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

  // Fallback a los índices hardcodeados originales si algún header no se encontró
  const idx = (found, fallback) => found >= 0 ? found : fallback

  const parseNum = v => Number(String(v || '0').replace(/[$\s]/g, '').replace(/\./g, '').replace(',', '.')) || 0

  return rows.slice(1) // saltear fila de headers
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

/**
 * Trae los usuarios de la hoja USUARIOS
 */
export async function getUsuarios() {
  const data = await sheetsGet('USUARIOS!A2:E')
  const rows = data.values || []
  return rows
    .filter(r => r[0] && r[1])
    .map(r => ({
      id: r[0] || '',
      nombre: r[1] || '',
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

/**
 * Trae las ventas del día actual de DETALLE DE VENTAS (incluye anuladas)
 */
export async function getVentasHoy() {
  const data = await sheetsGet('DETALLE DE VENTAS!A2:AD')
  const rows = data.values || []
  const { fecha } = getArgentinaDate()
  return rows
    .filter(r => r[2] === fecha)
    .map(mapRow)
}

/**
 * Trae todo el historial de ventas
 */
export async function getHistoricoVentas() {
  const data = await sheetsGet('DETALLE DE VENTAS!A2:AD')
  const rows = data.values || []
  return rows.filter(r => r[0]).map(mapRow)
}

/**
 * Anula todas las filas de un ID_VENTA marcando ANULADO = TRUE
 */
export async function anularVenta(idVenta) {
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
  return requests.length
}

/**
 * Genera un nuevo ID de venta basado en fecha + secuencia
 */
export async function generarIdVenta() {
  const data = await sheetsGet('DETALLE DE VENTAS!B2:B')
  const rows = data.values || []
  const { raw } = getArgentinaDate()
  const prefix = `V${String(raw.getFullYear()).slice(2)}${String(raw.getMonth()+1).padStart(2,'0')}${String(raw.getDate()).padStart(2,'0')}`
  const hoy = rows.filter(r => r[0]?.startsWith(prefix))
  const seq = hoy.length + 1
  return `${prefix}-${String(seq).padStart(3, '0')}`
}

/**
 * Registra una venta completa (carrito) en DETALLE DE VENTAS
 * items: [{ articulo, nombre, foto, cantidad, precioUnitario, costoUnitario, descuento }]
 * metodoPago: string
 * descCarrito: number (% descuento sobre total)
 * empleado: string
 * notas: string
 */
export async function registrarVenta({ items, metodoPago, descCarrito = 0, empleado = '', notas = '' }) {
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
      idDetalle,                    // A: ID_DETALLE DE VENTA
      idVenta,                      // B: ID_VENTA
      `'${dt.fecha}`,               // C: FECHA (apostrofe fuerza texto)
      `'${dt.hora}`,                // D: HORA (apostrofe fuerza texto)
      dt.mes,                       // E: MES
      dt.anio,                      // F: AÑO
      item.articulo,                // G: ARTICULO (ID)
      item.nombre,                  // H: NOMBRE
      item.foto || '',              // I: FOTO_ART
      item.cantidad,                // J: CANTIDAD
      item.precioUnitario,          // K: PRECIO UNITARIO
      precioTotal,                  // L: PRECIO TOTAL
      item.costoUnitario,           // M: COSTO UNITARIO
      costoTotal,                   // N: COSTO TOTAL
      empleado,                     // O: EMPLEADO
      metodoPago,                   // P: MÉTODO DE PAGO
      descuentoItem,                // Q: DESCUENTO
      descCarrito > 0 ? `${descCarrito}%` : '', // R: DESC_CARRITO
      precioTotalFinal,             // S: PRECIO TOTAL FINAL
      notas,                        // T: NOTAS
      false,                        // U: ANULADO
      ingresoNeto,                  // V: INGRESO NETO TOTAL
      dtoIman8000x3,                // W: DESCUENTO IMANES
      dtoIman8000x3,                // X: DTO IMAN 8000 x3
      dtoIman8000x2,                // Y: DTO IMAN 8000 x2
      dtoIman6000x3,                // Z: DTO IMAN 6000 x3
      dtoIman6000x2,                // AA: DTO IMAN 6000 x2
      '',                           // AB: MM 35 dias Ventas Totales (formula)
      '',                           // AC: MM 35 dias Ventas Tarjeta + QR (formula)
      '',                           // AD: Factor Tarj + QR / Tot (formula)
    ]
  })

  await sheetsAppend('DETALLE DE VENTAS!A:AD', rows)
  return idVenta
}

/**
 * Anula un item individual por ID_DETALLE
 * Si todos los items del ID_VENTA quedan anulados, anula también la venta entera
 */
export async function anularItemVenta(idDetalle, todosLosItems) {
  const data = await sheetsGet('DETALLE DE VENTAS!A2:U')
  const rows = data.values || []

  // Encontrar fila del idDetalle a anular
  const requests = []
  rows.forEach((r, idx) => {
    if (r[0] === idDetalle) {
      const rowNum = idx + 2
      requests.push(sheetsUpdate(`DETALLE DE VENTAS!U${rowNum}`, [['TRUE']]))
    }
  })

  if (requests.length === 0) throw new Error('No se encontró el item')
  await Promise.all(requests)

  // Verificar si todos los items de esa venta quedaron anulados
  const idVenta = todosLosItems[0]?.idVenta
  if (idVenta) {
    const itemsActivos = todosLosItems.filter(i => i.idDetalle !== idDetalle && !i.anulado)
    if (itemsActivos.length === 0) {
      // Anular toda la venta
      const ventaRequests = []
      rows.forEach((r, idx) => {
        if (r[1] === idVenta && r[20] !== 'TRUE') {
          ventaRequests.push(sheetsUpdate(`DETALLE DE VENTAS!U${idx + 2}`, [['TRUE']]))
        }
      })
      await Promise.all(ventaRequests)
    }
  }
}
