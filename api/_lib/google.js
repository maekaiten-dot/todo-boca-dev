// api/_lib/google.js
// Acceso a Google Sheets DESDE EL SERVIDOR (funciones de Vercel).
// Las credenciales salen de variables de entorno SIN prefijo VITE_, así nunca
// llegan al navegador. Ver README → "Fichadas".

const SCOPES = ['https://www.googleapis.com/auth/spreadsheets']
let _token = null
let _tokenExp = 0

function cfg() {
  const sheetId = process.env.FICHADAS_SHEET_ID
  const email = process.env.FICHADAS_GOOGLE_CLIENT_EMAIL
  const key = process.env.FICHADAS_GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n')
  if (!sheetId || !email || !key) throw new Error('Faltan variables FICHADAS_SHEET_ID / FICHADAS_GOOGLE_CLIENT_EMAIL / FICHADAS_GOOGLE_PRIVATE_KEY')
  return { sheetId, email, key }
}

const b64url = (buf) => Buffer.from(buf).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')

async function getAccessToken() {
  if (_token && Date.now() < _tokenExp - 60000) return _token
  const { email, key } = cfg()
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
  _token = data.access_token
  _tokenExp = Date.now() + data.expires_in * 1000
  return _token
}

async function api(path, { method = 'GET', body } = {}) {
  const { sheetId } = cfg()
  const token = await getAccessToken()
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

export async function sheetsGet(range) {
  const data = await api(`/values/${encodeURIComponent(range)}`)
  return data.values || []
}

export async function sheetsAppend(range, values) {
  return api(`/values/${encodeURIComponent(range)}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`, { method: 'POST', body: { values } })
}

export async function sheetsUpdate(range, values) {
  return api(`/values/${encodeURIComponent(range)}?valueInputOption=RAW`, { method: 'PUT', body: { values } })
}

// Crea la pestaña con sus encabezados si todavía no existe.
const _hojasOk = new Set()
export async function asegurarHoja(titulo, encabezados) {
  if (_hojasOk.has(titulo)) return
  let filas = null
  try { filas = await sheetsGet(`${titulo}!A1:Z1`) }
  catch (e) {
    if (e.status !== 400) throw e
    await api(':batchUpdate', { method: 'POST', body: { requests: [{ addSheet: { properties: { title: titulo } } }] } })
  }
  if (!filas || filas.length === 0) await sheetsUpdate(`${titulo}!A1`, [encabezados])
  _hojasOk.add(titulo)
}
