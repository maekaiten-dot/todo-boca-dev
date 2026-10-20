// src/lib/ocr.js
// Lectura de facturas en el navegador, sin IA y sin enviar la imagen a ningún servicio:
//  - PDF con texto (generado por computadora): se saca el texto directo, sin OCR.
//  - Foto o PDF escaneado: se retoca la imagen (gris, fondo parejo, más contraste) y se lee con
//    Tesseract (reconocedor de texto gratuito; los archivos están en /public/ocr, no depende de internet).
//  - QR de ARCA (facturas electrónicas): se lee con jsQR y trae fecha, CUIT, número e importe exactos.
import jsQR from 'jsqr'
import { interpretarFactura, leerQrArca } from './facturas.js'

let _worker = null
async function workerOCR(onProgreso) {
  if (_worker) return _worker
  const { createWorker } = await import('tesseract.js')
  _worker = await createWorker('spa', 1, {
    workerPath: '/ocr/worker.min.js', corePath: '/ocr', langPath: '/ocr/lang', gzip: true,
    logger: m => { if (m.status === 'recognizing text') onProgreso?.(m.progress) },
  })
  await _worker.setParameters({ tessedit_pageseg_mode: '6', preserve_interword_spaces: '1' })
  return _worker
}

// ── Archivo → imagen(es) o texto ──────────────────────────────────────────────
async function cargarImagen(file) {
  const url = URL.createObjectURL(file)
  try {
    const img = new Image()
    await new Promise((ok, mal) => { img.onload = ok; img.onerror = () => mal(new Error('No se pudo abrir la imagen')); img.src = url })
    const c = document.createElement('canvas')
    c.width = img.naturalWidth; c.height = img.naturalHeight
    c.getContext('2d').drawImage(img, 0, 0)
    return c
  } finally { URL.revokeObjectURL(url) }
}

async function cargarPdf(file) {
  const pdfjs = await import('pdfjs-dist')
  pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString()
  const doc = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise
  let texto = ''
  const paginas = []
  for (let n = 1; n <= Math.min(doc.numPages, 5); n++) {
    const page = await doc.getPage(n)
    const tc = await page.getTextContent()
    // Arma renglones agrupando por altura (y) y ordenando por x
    const items = tc.items.filter(i => i.str?.trim()).map(i => ({ s: i.str, x: i.transform[4], y: Math.round(i.transform[5]), w: i.width }))
    const filas = []
    items.sort((a, b) => b.y - a.y || a.x - b.x).forEach(it => {
      const f = filas.find(f => Math.abs(f.y - it.y) <= 3)
      if (f) f.items.push(it); else filas.push({ y: it.y, items: [it] })
    })
    texto += filas.map(f => f.items.sort((a, b) => a.x - b.x).map(i => i.s.trim()).join(' ')).join('\n') + '\n'
    const vp = page.getViewport({ scale: 2.5 })
    const c = document.createElement('canvas'); c.width = vp.width; c.height = vp.height
    await page.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise
    paginas.push(c)
  }
  return { texto, paginas }
}

// ── Retoque de la imagen ──────────────────────────────────────────────────────
function rotar(canvas, grados) {
  if (!grados) return canvas
  const c = document.createElement('canvas')
  const g = ((grados % 360) + 360) % 360
  c.width = g % 180 ? canvas.height : canvas.width; c.height = g % 180 ? canvas.width : canvas.height
  const ctx = c.getContext('2d')
  ctx.translate(c.width / 2, c.height / 2); ctx.rotate(g * Math.PI / 180); ctx.drawImage(canvas, -canvas.width / 2, -canvas.height / 2)
  return c
}

function escalar(canvas, lado) {
  const f = lado / Math.max(canvas.width, canvas.height)
  const c = document.createElement('canvas'); c.width = Math.round(canvas.width * f); c.height = Math.round(canvas.height * f)
  const ctx = c.getContext('2d'); ctx.imageSmoothingQuality = 'high'; ctx.drawImage(canvas, 0, 0, c.width, c.height)
  return c
}

function gris(canvas) {
  const ctx = canvas.getContext('2d'), d = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const px = d.data
  for (let i = 0; i < px.length; i += 4) { const v = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2]; px[i] = px[i + 1] = px[i + 2] = v }
  ctx.putImageData(d, 0, 0)
  return canvas
}

// Blanco y negro con "fondo parejo": se resta el fondo (sombras, doblez, papel amarillento) y se
// aumenta el contraste. Es lo que mejoró la lectura del ticket y del remito en las pruebas.
function blancoYNegro(canvasGris) {
  const w = canvasGris.width, h = canvasGris.height
  const chico = document.createElement('canvas'); chico.width = Math.max(1, Math.round(w / 24)); chico.height = Math.max(1, Math.round(h / 24))
  const cc = chico.getContext('2d'); cc.imageSmoothingQuality = 'high'; cc.drawImage(canvasGris, 0, 0, chico.width, chico.height)
  const fondo = document.createElement('canvas'); fondo.width = w; fondo.height = h
  const fc = fondo.getContext('2d'); fc.imageSmoothingEnabled = true; fc.imageSmoothingQuality = 'high'; fc.drawImage(chico, 0, 0, w, h)
  const img = canvasGris.getContext('2d').getImageData(0, 0, w, h), bg = fc.getImageData(0, 0, w, h).data, px = img.data
  const vals = new Uint8ClampedArray(w * h)
  for (let i = 0, j = 0; i < px.length; i += 4, j++) vals[j] = 255 - Math.max(0, bg[i] - px[i])
  // Autocontraste (1% de corte) y umbral
  const hist = new Uint32Array(256); vals.forEach(v => hist[v]++)
  let lo = 0, hi = 255, acc = 0; const corte = vals.length * 0.01
  for (; lo < 255 && (acc += hist[lo]) < corte; lo++);
  acc = 0; for (; hi > 0 && (acc += hist[hi]) < corte; hi--);
  const rango = Math.max(1, hi - lo)
  for (let i = 0, j = 0; i < px.length; i += 4, j++) {
    const v = ((vals[j] - lo) * 255) / rango > 170 ? 255 : 0
    px[i] = px[i + 1] = px[i + 2] = v; px[i + 3] = 255
  }
  const out = document.createElement('canvas'); out.width = w; out.height = h
  out.getContext('2d').putImageData(img, 0, 0)
  return out
}

// ¿El texto está de costado? Compara cuánto "rayado" hay por filas y por columnas (los renglones de
// texto hacen que las filas alternen mucho entre tinta y blanco).
function textoVertical(canvasBN) {
  const c = escalar(canvasBN, 600), d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data
  const filas = new Float64Array(c.height), cols = new Float64Array(c.width)
  for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) { const v = d[(y * c.width + x) * 4] < 128 ? 1 : 0; filas[y] += v; cols[x] += v }
  const varianza = a => { const m = a.reduce((s, v) => s + v, 0) / a.length; return a.reduce((s, v) => s + (v - m) ** 2, 0) / a.length }
  const vf = varianza(Array.from(filas).map(v => v / c.width)), vc = varianza(Array.from(cols).map(v => v / c.height))
  return vc > vf * 1.4
}

function leerQR(canvas) {
  for (const lado of [1600, 2400, 1000]) {
    const c = escalar(canvas, Math.min(lado, Math.max(canvas.width, canvas.height)))
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height)
    const r = jsQR(d.data, c.width, c.height, { inversionAttempts: 'attemptBoth' })
    if (r?.data) return r.data
  }
  return ''
}

const puntaje = r => r.renglones.filter(x => x.estado === 'ok').length + (r.totalCierra ? 3 : 0) + r.renglones.length * 0.2

// Lee el archivo y devuelve { resultado, texto, origen: 'pdf' | 'ocr', vista: dataURL } .
// onEstado(texto, progreso 0..1) informa en qué paso está.
export async function leerFactura(file, { onEstado = () => {}, rotacion = 0, proveedorForzado = '' } = {}) {
  let imagenes = [], qrTexto = ''
  if (file.type === 'application/pdf' || /\.pdf$/i.test(file.name)) {
    onEstado('Abriendo el PDF…', 0)
    const pdf = await cargarPdf(file)
    for (const p of pdf.paginas) { qrTexto = qrTexto || leerQR(p) }
    const qr = leerQrArca(qrTexto)
    if (pdf.texto.replace(/\s/g, '').length > 80) {
      const resultado = interpretarFactura(pdf.texto, { qr, proveedorForzado })
      if (resultado.renglones.length) return { resultado, texto: pdf.texto, origen: 'pdf', vista: pdf.paginas[0]?.toDataURL('image/jpeg', 0.7) }
    }
    imagenes = pdf.paginas // PDF escaneado: sin texto, se lee como imagen
  } else {
    imagenes = [await cargarImagen(file)]
  }
  onEstado('Buscando el QR de ARCA…', 0)
  qrTexto = qrTexto || leerQR(imagenes[0])
  const qr = leerQrArca(qrTexto)

  onEstado('Preparando el lector…', 0)
  const worker = await workerOCR(p => onEstado('Leyendo el texto…', p))
  let mejor = null
  for (const [k, original] of imagenes.entries()) {
    // Tamaño de trabajo: el lado más largo entre 2400 y 3200 px
    const lado = Math.max(2400, Math.min(3200, Math.max(original.width, original.height) * 1.6))
    let base = rotar(original, rotacion)
    let bn = blancoYNegro(gris(escalar(base, lado)))
    const girar = !rotacion && textoVertical(bn)
    const intentos = girar ? [90, 270] : [0]
    for (const g of intentos) {
      const imgBN = g ? rotar(bn, g) : bn
      onEstado(`Leyendo el texto${imagenes.length > 1 ? ` (página ${k + 1})` : ''}…`, 0)
      const a = await worker.recognize(imgBN)
      let candidato = { texto: a.data.text, conf: a.data.confidence, giro: g }
      candidato.resultado = interpretarFactura(candidato.texto, { qr, proveedorForzado })
      // Segunda lectura con la imagen en gris (sin blanco y negro) si la primera no cerró las cuentas
      if (!candidato.resultado.totalCierra || candidato.resultado.renglones.some(r => r.estado !== 'ok')) {
        onEstado('Haciendo una segunda lectura…', 0)
        const imgGris = gris(escalar(rotar(base, g), Math.max(original.width, original.height)))
        const b = await worker.recognize(imgGris)
        const r2 = interpretarFactura(b.data.text, { qr, proveedorForzado })
        if (puntaje(r2) > puntaje(candidato.resultado)) candidato = { texto: b.data.text, conf: b.data.confidence, giro: g, resultado: r2 }
      }
      if (!mejor || puntaje(candidato.resultado) > puntaje(mejor.resultado) || (puntaje(candidato.resultado) === puntaje(mejor.resultado) && candidato.conf > mejor.conf)) mejor = { ...candidato, pagina: k }
      if (girar && mejor.resultado.renglones.length && mejor.conf > 60) break
    }
  }
  const vista = escalar(rotar(imagenes[mejor.pagina], (rotacion + mejor.giro) % 360), 1400).toDataURL('image/jpeg', 0.75)
  return { resultado: mejor.resultado, texto: mejor.texto, origen: 'ocr', vista }
}
