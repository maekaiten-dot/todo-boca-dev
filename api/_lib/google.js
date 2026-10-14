// api/_lib/google.js
// Acceso a Google Sheets DESDE EL SERVIDOR (funciones de Vercel).
// Las credenciales salen de variables de entorno SIN prefijo VITE_, así nunca
// llegan al navegador. Ver README → "Fichadas".

const SCOPES = ['https://www.googleapis.com/auth/spreadsheets']

// Si no hay variables FICHADAS_* propias, usa la misma planilla y cuenta de la app (VITE_*).
function cfgFichadas() {
  const env = process.env
  const sheetId = env.FICHADAS_SHEET_ID || env.VITE_SHEET_ID
  const email = env.FICHADAS_GOOGLE_CLIENT_EMAIL || env.VITE_GOOGLE_CLIENT_EMAIL
  const key = (env.FICHADAS_GOOGLE_PRIVATE_KEY || env.VITE_GOOGLE_PRIVATE_KEY)?.replace(/\\n/g, '\n')
  if (!sheetId || !email || !key) throw new Error('Faltan las variables de Google Sheets (VITE_SHEET_ID / VITE_GOOGLE_CLIENT_EMAIL / VITE_GOOGLE_PRIVATE_KEY)')
  return { sheetId, email, key }
}

const b64url = (buf) => Buffer.from(buf).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')

// Tokens de acceso cacheados por cuenta de servicio
const _tokens = new Map()
async function getAccessToken(email, key) {
  const t = _tokens.get(email)
  if (t && Date.now() < t.exp - 60000) return t.token
  const now = Math.floor(Date.now() / 1000)
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const claim = b64url(JSON.stringify({ iss: email, scope: SCOPES.join(' '), aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 }))
  const input = `${header}.${claim}`
  const pem = key.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s/g, '')
  const cryptoKey = await crypto.subtle.importKey('pkcs8', Buffer.from(pem, 'base64'), { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign'])
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', cryptoKey, new TextEncoder().encode(input))
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${input}.${b64url(sig)}`,
  })
  const data = await res.json()
  if (!data.access_token) throw new Error('No se pudo autenticar con Google: ' + JSON.stringify(data))
  _tokens.set(email, { token: data.access_token, exp: Date.now() + data.expires_in * 1000 })
  return data.access_token
}

// Crea un cliente de Sheets para una planilla y cuenta de servicio.
// cfg: función que devuelve { sheetId, email, key } (se evalúa en cada llamada, así los errores
// de configuración aparecen recién cuando se usa).
export function crearSheets(cfg) {
  async function api(path, { method = 'GET', body } = {}) {
    const { sheetId, email, key } = cfg()
    const token = await getAccessToken(email, key)
    const res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${sheetId}${path}`, {
      method,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    })
    if (!res.ok) {
      const err = new Error(`Sheets ${method} ${path}: ${res.status}`)
      err.status = res.status
      throw err
    }
    return res.json()
  }
  const sheetsGet = async (range) => (await api(`/values/${encodeURIComponent(range)}`)).values || []
  const sheetsAppend = (range, values) => api(`/values/${encodeURIComponent(range)}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`, { method: 'POST', body: { values } })
  const sheetsUpdate = (range, values) => api(`/values/${encodeURIComponent(range)}?valueInputOption=RAW`, { method: 'PUT', body: { values } })
  const sheetsClear = (range) => api(`/values/${encodeURIComponent(range)}:clear`, { method: 'POST', body: {} })
  const metadatos = () => api('?fields=properties.title,sheets.properties.title')

  // Crea la pestaña con sus encabezados si todavía no existe. Devuelve true si la creó.
  const hojasOk = new Set()
  async function asegurarHoja(titulo, encabezados) {
    if (hojasOk.has(titulo)) return false
    let filas = null, creada = false
    try { filas = await sheetsGet(`${titulo}!A1:Z1`) }
    catch (e) {
      if (e.status !== 400) throw e
      await api(':batchUpdate', { method: 'POST', body: { requests: [{ addSheet: { properties: { title: titulo } } }] } })
      creada = true
    }
    if (!filas || filas.length === 0) await sheetsUpdate(`${titulo}!A1`, [encabezados])
    hojasOk.add(titulo)
    return creada
  }
  return { api, sheetsGet, sheetsAppend, sheetsUpdate, sheetsClear, asegurarHoja, metadatos }
}

// Cliente por defecto: el de las fichadas (mismas funciones que antes)
const fichadas = crearSheets(cfgFichadas)
export const { sheetsGet, sheetsAppend, sheetsUpdate, sheetsClear, asegurarHoja } = fichadas
