// src/components/EscanearFactura.jsx
// Escaneo de facturas / remitos / tickets de proveedores (solo admins, desde Pagos).
// 1) Foto o PDF → 2) la app lee el texto (sin IA) y arma los renglones → 3) se revisa: artículo de cada
// renglón (con memoria por proveedor), cantidades, costos; los que no existen se crean con la ventana de
// artículo nuevo → 4) se elige pagado / pendiente / pago parcial y se cargan todos los pagos juntos.
import { useState, useRef, useMemo } from 'react'
import { getMemoriaFacturas, guardarMemoriaFacturas, registrarPagosLote, editarArticulo } from '../api/sheets.js'
import { buscarArticulo, revisarTotal, normalizar, similitud, PROVEEDORES, leerQrArca, fechaDe, detectarProveedor } from '../lib/facturas.js'
import ModalArticulo from './ModalArticulo.jsx'
import BarcodeScanner from './BarcodeScanner.jsx'

const fmt$ = n => (n == null || Number.isNaN(n)) ? '—' : '$' + (Math.round(n * 100) / 100).toLocaleString('es-AR', { maximumFractionDigits: 2 })
const num = s => { const t = String(s ?? '').trim().replace(/\$/g, '').replace(/\s/g, ''); if (!t) return null; const n = Number(/,\d{1,2}$/.test(t) ? t.replace(/\./g, '').replace(',', '.') : t.replace(/,/g, '')); return Number.isFinite(n) ? n : null }
const parseArs = v => Number(String(v ?? '0').replace(/[$\s]/g, '').replace(/\./g, '').replace(',', '.')) || 0
const hoyDDMM = () => new Date().toLocaleDateString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' })
const aInput = d => { const [a, b, c] = String(d || '').split('/'); return a && b && c ? `${c}-${b.padStart(2, '0')}-${a.padStart(2, '0')}` : '' }
const deInput = v => { const [y, m, d] = String(v || '').split('-'); return y && m && d ? `${Number(d)}/${Number(m)}/${y}` : '' }

export default function EscanearFactura({ articulos = [], proveedores = [], empleado = '', onCerrar, onGuardado, onArticuloCreado }) {
  const [paso, setPaso] = useState('elegir') // elegir | leyendo | revisar | guardando
  const [estado, setEstado] = useState({ texto: '', progreso: 0 })
  const [error, setError] = useState('')
  const [archivo, setArchivo] = useState(null)
  const [rotacion, setRotacion] = useState(0)
  const [lectura, setLectura] = useState(null) // { resultado, texto, origen, vista }
  const [cab, setCab] = useState({ proveedor: '', fecha: '', numero: '', total: '' })
  const [conIva, setConIva] = useState(true)
  const [renglones, setRenglones] = useState([])
  const [memoria, setMemoria] = useState([])
  const [creando, setCreando] = useState(null) // índice del renglón para el que se crea un artículo
  const [eligiendo, setEligiendo] = useState(null) // índice del renglón en el que se busca artículo
  const [busqueda, setBusqueda] = useState('')
  const [pago, setPago] = useState({ tipo: 'pendiente', monto: '', fechaPago: hoyDDMM(), fechaIngreso: hoyDDMM() })
  const [verTexto, setVerTexto] = useState(false)
  const [confirmarRevisar, setConfirmarRevisar] = useState(false)
  const [arts, setArts] = useState(articulos)
  const [escaneandoQr, setEscaneandoQr] = useState(false)

  // QR de ARCA escaneado con la cámara: trae fecha, número, CUIT del proveedor y total exactos
  function aplicarQr(texto) {
    const qr = leerQrArca(texto)
    if (!qr) return { ok: false, nombre: 'No es el QR de una factura de ARCA' }
    setLectura(l => ({ ...l, resultado: { ...l.resultado, qr } }))
    const clave = detectarProveedor('', qr.cuit)
    setCab(c => ({
      ...c,
      fecha: fechaDe(qr.fecha) || c.fecha,
      numero: qr.nroCmp ? `${String(qr.ptoVta || 0).padStart(4, '0')}-${String(qr.nroCmp).padStart(8, '0')}` : c.numero,
      total: qr.importe ? String(qr.importe) : c.total,
      proveedor: c.proveedor || (clave ? PROVEEDORES[clave].nombre : ''),
    }))
    return { ok: true, nombre: `QR leído: ${fechaDe(qr.fecha)} · total $${Number(qr.importe || 0).toLocaleString('es-AR')}` }
  }
  const inputCamara = useRef(null), inputArchivo = useRef(null)

  const artDe = id => arts.find(a => a.id === id)
  const factorDe = r => (r.factor || 1) * (lectura?.resultado?.iva && conIva ? 1 + lectura.resultado.iva / 100 : 1)
  const costoDe = r => r.precioUnit == null ? null : Math.round(r.precioUnit * factorDe(r) * 100) / 100

  async function leer(file, rot = rotacion) {
    setArchivo(file); setError(''); setPaso('leyendo')
    try {
      const [{ leerFactura }, mem] = await Promise.all([import('../lib/ocr.js'), getMemoriaFacturas().catch(() => [])])
      setMemoria(mem)
      const lec = await leerFactura(file, { rotacion: rot, onEstado: (texto, progreso) => setEstado({ texto, progreso }) })
      setLectura(lec)
      const res = lec.resultado
      setCab({ proveedor: res.proveedor || '', fecha: res.fecha || hoyDDMM(), numero: res.numero || '', total: res.total != null ? String(res.total) : '' })
      setConIva(true)
      setRenglones(asignar(res.renglones, res.proveedor, mem, arts))
      setPaso('revisar')
    } catch (e) {
      console.error(e)
      setError('No se pudo leer el archivo. Probá con otra foto (derecha, con buena luz) o un PDF.')
      setPaso('elegir')
    }
  }

  function asignar(lista, proveedor, mem, articulosLista) {
    return lista.map(r => {
      const m = buscarArticulo(r, proveedor, articulosLista, mem)
      return { ...r, incluir: true, articuloId: m.articuloId, origen: m.origen, sugerencias: m.sugerencias, actualizarCosto: true, editado: false }
    })
  }

  function cambiarProveedor(nombre) {
    setCab(c => ({ ...c, proveedor: nombre }))
    // Con otro proveedor puede haber otra memoria: se reasignan solo los renglones que no eligió a mano
    setRenglones(rs => rs.map(r => {
      if (r.origen === 'manual' || r.origen === 'creado') return r
      const m = buscarArticulo(r, nombre, arts, memoria)
      return { ...r, articuloId: m.articuloId, origen: m.origen, sugerencias: m.sugerencias }
    }))
  }

  function editar(i, campo, valor) {
    setRenglones(rs => rs.map((r, k) => {
      if (k !== i) return r
      const n = { ...r, [campo]: valor, editado: true }
      if (campo === 'cantidad' || campo === 'precioUnit') {
        const c = num(n.cantidad), p = num(n.precioUnit)
        n.cantidad = campo === 'cantidad' ? valor : n.cantidad
        if (c != null && p != null) n.importe = Math.round(c * p * (n.factor || 1) * 100) / 100
      }
      return n
    }))
  }
  const elegirArticulo = (i, id, origen = 'manual') => { setRenglones(rs => rs.map((r, k) => k === i ? { ...r, articuloId: id, origen } : r)); setEligiendo(null); setBusqueda('') }

  // Totales y avisos con lo editado
  const vista = useMemo(() => {
    const rs = renglones.map(r => ({ ...r, cantidad: num(r.cantidad), precioUnit: num(r.precioUnit) }))
    const chequeo = revisarTotal({ renglones: rs.map(r => ({ ...r, importe: r.cantidad != null && r.precioUnit != null ? r.cantidad * r.precioUnit * (r.factor || 1) : r.importe })), total: num(cab.total), iva: lectura?.resultado?.iva || 0 }, { conIva })
    const incluidos = rs.filter(r => r.incluir)
    const totalCosto = incluidos.reduce((s, r) => s + (r.cantidad || 0) * (costoDe(r) || 0), 0)
    return { rs, chequeo, incluidos, totalCosto, sinArticulo: incluidos.filter(r => !r.articuloId).length, aRevisar: incluidos.filter(r => r.estado !== 'ok' && !r.editado).length, incompletos: incluidos.filter(r => !r.cantidad || r.precioUnit == null).length }
  }, [renglones, cab.total, conIva, lectura])

  async function guardar(forzar = false) {
    if (!cab.proveedor.trim()) { setError('Completá el proveedor'); return }
    if (vista.incompletos) { setError('Hay renglones sin cantidad o sin precio'); return }
    const primeroSinArt = renglones.findIndex(r => r.incluir && !r.articuloId)
    if (primeroSinArt >= 0) { setCreando(primeroSinArt); return } // abre la ventana de artículo nuevo
    if (vista.aRevisar && !forzar) { setConfirmarRevisar(true); return }
    setConfirmarRevisar(false); setError(''); setPaso('guardando')
    try {
      const incl = vista.rs.filter(r => r.incluir)
      const lineas = incl.map(r => {
        const art = artDe(r.articuloId), cu = costoDe(r)
        return { articuloId: r.articuloId, articuloNombre: art?.nombre || r.descripcion, cantidad: r.cantidad, costoUnitario: cu, total: r.cantidad * cu }
      })
      const total = lineas.reduce((s, l) => s + l.total, 0)
      const montoParcial = Math.min(total, num(pago.monto) || 0)
      const completo = pago.tipo === 'pagado' || (pago.tipo === 'parcial' && montoParcial >= total - 0.5)
      let repartido = 0
      lineas.forEach((l, k) => {
        if (completo) { l.montoPagado = l.total; l.pagado = true }
        else if (pago.tipo === 'parcial') {
          l.montoPagado = k === lineas.length - 1 ? Math.round((montoParcial - repartido) * 100) / 100 : Math.round(montoParcial * l.total / total * 100) / 100
          repartido += l.montoPagado; l.pagado = false
        } else { l.montoPagado = 0; l.pagado = false }
      })
      const descripcion = `Factura ${cab.proveedor}${cab.numero ? ' Nº ' + cab.numero : ''}${cab.fecha ? ' del ' + cab.fecha : ''}`
      await registrarPagosLote({ renglones: lineas, fechaIngreso: pago.fechaIngreso, fechaPago: completo || pago.tipo === 'parcial' ? pago.fechaPago : '', proveedor: cab.proveedor.trim(), descripcion, empleado, comprobante: cab.numero.trim() })
      // Memoria: lo que no vino de la memoria (o cambió) se guarda para la próxima
      const nuevas = incl.filter(r => r.origen !== 'memoria').map(r => ({ proveedor: cab.proveedor.trim(), codigo: r.codigo || '', descripcion: r.descripcion || '', articuloId: r.articuloId }))
      await guardarMemoriaFacturas(nuevas, empleado).catch(e => console.error(e))
      // Costos de los artículos que cambiaron (si quedó marcado)
      let costosActualizados = 0
      for (const r of incl) {
        const art = artDe(r.articuloId), cu = costoDe(r)
        if (!art?.rowNum || !r.actualizarCosto || !cambioCosto(art, cu)) continue
        await editarArticulo(art.rowNum, { ...art, costoUnitario: String(Math.round(cu)) }, empleado).catch(e => console.error(e))
        costosActualizados++
      }
      onGuardado?.({ cantidad: lineas.length, total, costosActualizados, proveedor: cab.proveedor })
    } catch (e) {
      console.error(e); setError('No se pudo guardar. Revisá la conexión e intentá de nuevo.'); setPaso('revisar')
    }
  }

  const cambioCosto = (art, cu) => art && cu != null && Math.abs(parseArs(art.costoUnitario) - Math.round(cu)) > Math.max(1, Math.round(cu) * 0.005)

  const opcionesBusqueda = useMemo(() => {
    if (eligiendo == null) return []
    const r = renglones[eligiendo]
    if (busqueda.trim()) {
      const q = normalizar(busqueda)
      return arts.filter(a => normalizar(a.nombre).includes(q) || normalizar(a.id).includes(q)).slice(0, 12).map(art => ({ art }))
    }
    return (r?.sugerencias || []).length ? r.sugerencias : arts.map(art => ({ art, score: similitud(r?.descripcion, art.nombre) })).sort((a, b) => b.score - a.score).slice(0, 6)
  }, [eligiendo, busqueda, renglones, arts])

  // ── Pantallas ──
  return (
    <div style={S.overlay}>
      <style>{'@keyframes spin{to{transform:rotate(360deg)}}'}</style>
      <div style={S.modal} role="dialog" aria-label="Escanear factura">
        <div style={S.header}>
          <div style={S.titulo}>📷 ESCANEAR FACTURA</div>
          <button style={S.cerrar} onClick={onCerrar} disabled={paso === 'guardando'} aria-label="Cerrar">✕</button>
        </div>

        {paso === 'elegir' && (
          <div style={S.cuerpo}>
            <div style={S.ayuda}>Sacá una foto a la factura, remito o ticket del proveedor (de frente, con buena luz y el papel estirado), o subí el PDF o el escaneo. La app lee los productos y te los muestra para revisar antes de cargar.</div>
            {error && <div style={S.error}>{error}</div>}
            <div style={S.botonesGrandes}>
              <button style={S.botonGrande} onClick={() => inputCamara.current?.click()}>📷<span>Sacar foto</span></button>
              <button style={S.botonGrande} onClick={() => inputArchivo.current?.click()}>📄<span>Subir foto o PDF</span></button>
            </div>
            <input ref={inputCamara} type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) { setRotacion(0); leer(f, 0) } }} />
            <input ref={inputArchivo} type="file" accept="image/*,application/pdf" style={{ display: 'none' }} aria-label="Archivo de factura" onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) { setRotacion(0); leer(f, 0) } }} />
            <div style={S.tips}>
              <b>Para que lea mejor:</b> PDF que te manda el proveedor &gt; escaneo &gt; foto. En las fotos, que el texto se vea derecho, sin sombras ni reflejos. A los tickets sacales la foto apenas te los dan (el papel térmico se borra).
            </div>
          </div>
        )}

        {(paso === 'leyendo' || paso === 'guardando') && (
          <div style={{ ...S.cuerpo, alignItems: 'center', justifyContent: 'center', minHeight: 260 }}>
            <div style={S.spinner} />
            <div style={S.estado}>{paso === 'guardando' ? 'Cargando los pagos…' : estado.texto || 'Leyendo…'}</div>
            {paso === 'leyendo' && estado.progreso > 0 && <div style={S.barra}><div style={{ ...S.barraFill, width: `${Math.round(estado.progreso * 100)}%` }} /></div>}
            {paso === 'leyendo' && <div style={S.ayudaChica}>La primera vez tarda un poco más (carga el lector).</div>}
          </div>
        )}

        {paso === 'revisar' && lectura && (
          <div style={S.cuerpoScroll}>
            <div style={S.filaTop}>
              {lectura.vista && <img src={lectura.vista} alt="Factura" style={S.vista} onClick={e => e.currentTarget.style.maxHeight = e.currentTarget.style.maxHeight === 'none' ? '' : 'none'} />}
              <div style={{ flex: 1, minWidth: 220 }}>
                <div style={S.origen}>{lectura.origen === 'pdf' ? '📄 Leído del PDF (exacto)' : '📷 Leído de la imagen'}{lectura.resultado.qr ? ' · ✅ QR de ARCA leído' : ''}{lectura.resultado.proveedorClave ? '' : ' · proveedor sin plantilla (lectura general)'}</div>
                <div style={S.grid2}>
                  <label style={S.campo}><span style={S.label}>PROVEEDOR *</span>
                    <input style={S.input} list="proveedores-factura" value={cab.proveedor} onChange={e => cambiarProveedor(e.target.value)} placeholder="Nombre del proveedor" />
                    <datalist id="proveedores-factura">{[...new Set([...Object.values(PROVEEDORES).map(p => p.nombre), ...proveedores])].map(p => <option key={p} value={p} />)}</datalist>
                  </label>
                  <label style={S.campo}><span style={S.label}>FECHA FACTURA</span>
                    <input style={S.input} type="date" value={aInput(cab.fecha)} onChange={e => setCab(c => ({ ...c, fecha: deInput(e.target.value) }))} />
                  </label>
                  <label style={S.campo}><span style={S.label}>NÚMERO</span>
                    <input style={S.input} value={cab.numero} onChange={e => setCab(c => ({ ...c, numero: e.target.value }))} placeholder="Opcional" />
                  </label>
                  <label style={S.campo}><span style={S.label}>TOTAL DEL COMPROBANTE</span>
                    <input style={S.input} inputMode="decimal" value={cab.total} onChange={e => setCab(c => ({ ...c, total: e.target.value }))} placeholder="Para controlar" />
                  </label>
                </div>
                {lectura.resultado.nota && <div style={S.nota}>ℹ️ {lectura.resultado.nota}</div>}
                {lectura.resultado.iva > 0 && (
                  <label style={S.check}><input type="checkbox" checked={conIva} onChange={e => setConIva(e.target.checked)} /> Sumar el IVA {lectura.resultado.iva}% al costo</label>
                )}
                {!lectura.resultado.qr && <button style={S.linkBtn} onClick={() => setEscaneandoQr(true)}>🔳 Escanear el QR de ARCA (si la factura tiene)</button>}
                <button style={S.linkBtn} onClick={() => { const r = (rotacion + 90) % 360; setRotacion(r); leer(archivo, r) }}>↻ Leer de nuevo girando la imagen</button>
                <button style={S.linkBtn} onClick={() => setVerTexto(v => !v)}>{verTexto ? 'Ocultar' : 'Ver'} el texto leído</button>
              </div>
            </div>
            {verTexto && <pre style={S.texto}>{lectura.texto}</pre>}

            {vista.chequeo.avisos.map((a, k) => <div key={k} style={S.aviso}>⚠️ {a}</div>)}
            {!vista.chequeo.avisos.length && vista.rs.length > 0 && num(cab.total) != null && <div style={S.okBox}>✅ La suma de los renglones coincide con el total del comprobante ({fmt$(num(cab.total))}).</div>}
            {vista.sinArticulo > 0 && <div style={S.aviso}>🆕 {vista.sinArticulo === 1 ? 'Hay 1 producto que no está' : `Hay ${vista.sinArticulo} productos que no están`} en tu lista de artículos. Tocá <b>➕ Crear artículo</b> para cargarlo (o elegí uno existente).</div>}

            <div style={S.lista}>
              {renglones.map((r, i) => {
                const art = artDe(r.articuloId), cu = costoDe({ ...r, precioUnit: num(r.precioUnit) })
                const cant = num(r.cantidad)
                const cierra = cant != null && num(r.precioUnit) != null
                return (
                  <div key={i} style={{ ...S.renglon, ...(r.incluir ? {} : { opacity: 0.45 }), ...(r.estado !== 'ok' && !r.editado ? S.renglonRevisar : {}) }} data-renglon={i}>
                    <div style={S.renglonTop}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
                        <input type="checkbox" checked={r.incluir} onChange={e => editar(i, 'incluir', e.target.checked)} aria-label={`Incluir renglón ${i + 1}`} />
                        <span style={{ minWidth: 0 }}>
                          <span style={S.descFactura}>{r.descripcion || '(sin descripción)'}</span>
                          {r.codigo && <span style={S.codigo}> · {r.codigo}</span>}
                        </span>
                      </label>
                      <span style={r.estado === 'ok' || r.editado ? S.badgeOk : S.badgeRevisar}>{r.estado === 'ok' ? '✅ cierra' : r.editado ? '✏️ editado' : '⚠️ revisar'}</span>
                    </div>
                    {r.estado !== 'ok' && !r.editado && r.motivos?.length > 0 && <div style={S.motivo}>{r.motivos.join(' · ')}</div>}
                    <div style={S.numeros}>
                      <label style={S.mini}><span>Cant.</span><input style={S.inputMini} inputMode="numeric" value={r.cantidad ?? ''} onChange={e => editar(i, 'cantidad', e.target.value)} aria-label={`Cantidad renglón ${i + 1}`} /></label>
                      <label style={S.mini}><span>Precio factura</span><input style={S.inputMini} inputMode="decimal" value={r.precioUnit ?? ''} onChange={e => editar(i, 'precioUnit', e.target.value)} aria-label={`Precio renglón ${i + 1}`} /></label>
                      <div style={S.mini}><span>Costo unit.</span><b style={{ color: 'var(--accent)' }}>{fmt$(cu)}</b></div>
                      <div style={S.mini}><span>Total</span><b>{cierra && cu != null ? fmt$(cant * cu) : '—'}</b></div>
                    </div>
                    <div style={S.articulo}>
                      {art ? (
                        <>
                          <span style={S.artChip}>{art.foto ? <img src={art.foto} alt="" style={S.artFoto} onError={e => e.currentTarget.style.display = 'none'} /> : '📦'} <b>{art.nombre}</b> <span style={S.codigo}>{art.id}</span></span>
                          <span style={S.origenChip}>{r.origen === 'memoria' ? '🧠 de memoria' : r.origen === 'sugerido' ? '🔎 sugerido' : r.origen === 'creado' ? '🆕 creado' : '✋ elegido'}</span>
                          <button style={S.linkBtn} onClick={() => { setEligiendo(i); setBusqueda('') }}>Cambiar</button>
                        </>
                      ) : (
                        <>
                          <span style={{ color: '#f59e0b', fontWeight: 700 }}>⚠️ No está en tu lista de artículos</span>
                          <button style={S.crearBtn} onClick={() => setCreando(i)}>➕ Crear artículo</button>
                          <button style={S.linkBtn} onClick={() => { setEligiendo(i); setBusqueda('') }}>🔍 Elegir uno existente</button>
                        </>
                      )}
                    </div>
                    {art && cu != null && cambioCosto(art, cu) && (
                      <label style={S.check}><input type="checkbox" checked={r.actualizarCosto} onChange={e => editar(i, 'actualizarCosto', e.target.checked)} /> Actualizar el costo del artículo: {fmt$(parseArs(art.costoUnitario))} → <b>{fmt$(Math.round(cu))}</b></label>
                    )}
                    {eligiendo === i && (
                      <div style={S.buscador}>
                        <input style={S.input} autoFocus placeholder="Buscar artículo por nombre o código…" value={busqueda} onChange={e => setBusqueda(e.target.value)} />
                        {opcionesBusqueda.map(({ art: a, score }) => (
                          <button key={a.id} style={S.opcion} onClick={() => elegirArticulo(i, a.id)}>
                            <span><b>{a.nombre}</b> <span style={S.codigo}>{a.id}</span></span>
                            <span style={S.codigo}>{score != null ? `${Math.round(score * 100)}% parecido · ` : ''}costo {fmt$(parseArs(a.costoUnitario))}</span>
                          </button>
                        ))}
                        <div style={{ display: 'flex', gap: 8 }}>
                          <button style={S.crearBtn} onClick={() => { setEligiendo(null); setCreando(i) }}>➕ Crear artículo nuevo</button>
                          <button style={S.linkBtn} onClick={() => setEligiendo(null)}>Cancelar</button>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

            <div style={S.pago}>
              <div style={S.label}>PAGO</div>
              <div style={S.opcionesPago}>
                {[['pagado', '✅ Pagado'], ['pendiente', '⏳ Pendiente'], ['parcial', '➗ Pago parcial']].map(([k, t]) => (
                  <button key={k} style={{ ...S.optPago, ...(pago.tipo === k ? S.optPagoActivo : {}) }} onClick={() => setPago(p => ({ ...p, tipo: k }))}>{t}</button>
                ))}
              </div>
              <div style={S.grid2}>
                {pago.tipo === 'parcial' && <label style={S.campo}><span style={S.label}>MONTO PAGADO</span><input style={S.input} inputMode="decimal" value={pago.monto} onChange={e => setPago(p => ({ ...p, monto: e.target.value }))} placeholder={`de ${fmt$(vista.totalCosto)}`} aria-label="Monto pagado" /></label>}
                {pago.tipo !== 'pendiente' && <label style={S.campo}><span style={S.label}>FECHA DE PAGO</span><input style={S.input} type="date" value={aInput(pago.fechaPago)} onChange={e => setPago(p => ({ ...p, fechaPago: deInput(e.target.value) }))} /></label>}
                <label style={S.campo}><span style={S.label}>FECHA DE INGRESO DE LA MERCADERÍA</span><input style={S.input} type="date" value={aInput(pago.fechaIngreso)} onChange={e => setPago(p => ({ ...p, fechaIngreso: deInput(e.target.value) }))} /></label>
              </div>
            </div>

            {error && <div style={S.error}>{error}</div>}
            {confirmarRevisar && (
              <div style={S.aviso}>
                Hay {vista.aRevisar} {vista.aRevisar === 1 ? 'renglón marcado' : 'renglones marcados'} para revisar que no tocaste. ¿Los revisaste contra la factura?
                <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                  <button style={S.crearBtn} onClick={() => guardar(true)}>Sí, cargar igual</button>
                  <button style={S.linkBtn} onClick={() => setConfirmarRevisar(false)}>Volver a revisar</button>
                </div>
              </div>
            )}
          </div>
        )}

        {paso === 'revisar' && (
          <div style={S.footer}>
            <div style={S.resumen}>{vista.incluidos.length} {vista.incluidos.length === 1 ? 'producto' : 'productos'} · <b>{fmt$(vista.totalCosto)}</b></div>
            <button style={S.cancelBtn} onClick={() => setPaso('elegir')}>Otra foto</button>
            <button style={{ ...S.saveBtn, opacity: vista.incluidos.length ? 1 : 0.5 }} disabled={!vista.incluidos.length} onClick={() => guardar(false)}>
              {vista.sinArticulo ? `CREAR ARTÍCULO (${vista.sinArticulo})` : `CARGAR ${vista.incluidos.length} ${vista.incluidos.length === 1 ? 'PRODUCTO' : 'PRODUCTOS'}`}
            </button>
          </div>
        )}
      </div>

      {escaneandoQr && <BarcodeScanner titulo="QR DE LA FACTURA (ARCA)" autoCerrarMs={1200} zIndex={600} onDetected={aplicarQr} onClose={() => setEscaneandoQr(false)} />}

      {creando != null && (
        <ModalArticulo
          inicial={{ nombre: renglones[creando]?.descripcion || '', costoUnitario: String(Math.round(costoDe({ ...renglones[creando], precioUnit: num(renglones[creando]?.precioUnit) }) || 0)), precioUnitario: '0' }}
          empleado={empleado} articulos={arts}
          aviso={`Producto de la factura de ${cab.proveedor || 'el proveedor'}: "${renglones[creando]?.descripcion}". Completá el precio de venta y lo que falte; después se ingresa con esta factura.`}
          onCerrar={() => setCreando(null)}
          onGuardado={form => {
            const nuevo = { ...form, rowNum: null }
            setArts(a => [...a, nuevo]); onArticuloCreado?.(nuevo)
            const i = creando
            setRenglones(rs => rs.map((r, k) => k === i ? { ...r, articuloId: form.id, origen: 'creado' } : r))
            setCreando(null)
          }}
        />
      )}
    </div>
  )
}

const S = {
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,10,0.85)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 400, backdropFilter: 'blur(6px)' },
  modal: { background: 'var(--surface)', borderRadius: '20px 20px 0 0', width: '100%', maxWidth: 980, height: '94dvh', display: 'flex', flexDirection: 'column', overflow: 'hidden' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px 12px', borderBottom: '1px solid var(--border)', flexShrink: 0 },
  titulo: { fontFamily: 'Barlow Condensed, sans-serif', fontWeight: 800, fontSize: 22, color: 'var(--accent)', letterSpacing: 2 },
  cerrar: { background: 'none', border: 'none', color: 'var(--muted)', fontSize: 22, cursor: 'pointer' },
  cuerpo: { flex: 1, display: 'flex', flexDirection: 'column', gap: 14, padding: 20, overflowY: 'auto' },
  cuerpoScroll: { flex: 1, overflowY: 'auto', padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: 10 },
  ayuda: { fontFamily: 'Barlow, sans-serif', fontSize: 15, color: 'var(--text)', lineHeight: 1.4 },
  ayudaChica: { fontFamily: 'Barlow, sans-serif', fontSize: 12, color: 'var(--muted)' },
  tips: { fontFamily: 'Barlow, sans-serif', fontSize: 13, color: 'var(--muted)', background: 'var(--surface2)', borderRadius: 10, padding: '10px 14px', lineHeight: 1.4 },
  botonesGrandes: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 },
  botonGrande: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, padding: '26px 10px', background: 'var(--surface2)', border: '2px solid var(--accent)', borderRadius: 14, color: 'var(--accent)', fontSize: 36, cursor: 'pointer', fontFamily: 'Barlow Condensed, sans-serif', fontWeight: 800 },
  spinner: { width: 44, height: 44, border: '4px solid var(--border)', borderTopColor: 'var(--accent)', borderRadius: '50%', animation: 'spin 0.9s linear infinite' },
  estado: { fontFamily: 'Barlow Condensed, sans-serif', fontSize: 20, color: 'var(--text)', marginTop: 10 },
  barra: { width: 260, height: 8, background: 'var(--surface2)', borderRadius: 4, overflow: 'hidden' },
  barraFill: { height: '100%', background: 'var(--accent)' },
  error: { fontFamily: 'Barlow, sans-serif', fontSize: 14, color: '#ef4444', background: 'rgba(239,68,68,0.1)', borderRadius: 8, padding: '8px 12px' },
  filaTop: { display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'flex-start' },
  vista: { width: 'min(220px, 40vw)', maxHeight: 260, objectFit: 'contain', objectPosition: 'top', borderRadius: 8, border: '1px solid var(--border)', background: '#fff', cursor: 'zoom-in' },
  origen: { fontFamily: 'Barlow, sans-serif', fontSize: 12, color: 'var(--muted)', marginBottom: 6 },
  grid2: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 8 },
  campo: { display: 'flex', flexDirection: 'column', gap: 4 },
  label: { fontFamily: 'Barlow Condensed, sans-serif', fontSize: 12, color: 'var(--accent)', letterSpacing: 1, fontWeight: 700 },
  input: { background: 'var(--surface2)', border: '1.5px solid var(--border)', borderRadius: 8, color: 'var(--text)', fontFamily: 'Barlow, sans-serif', fontSize: 15, padding: '8px 10px', outline: 'none', minWidth: 0 },
  nota: { fontFamily: 'Barlow, sans-serif', fontSize: 13, color: 'var(--text)', background: 'rgba(59,130,246,0.1)', border: '1px solid rgba(59,130,246,0.35)', borderRadius: 8, padding: '6px 10px', marginTop: 8 },
  check: { display: 'flex', alignItems: 'center', gap: 6, fontFamily: 'Barlow, sans-serif', fontSize: 13, color: 'var(--text)', marginTop: 6 },
  linkBtn: { background: 'none', border: 'none', color: '#60a5fa', fontFamily: 'Barlow, sans-serif', fontSize: 13, cursor: 'pointer', padding: '4px 6px', textDecoration: 'underline' },
  texto: { fontFamily: 'monospace', fontSize: 11, color: 'var(--muted)', background: 'var(--bg)', borderRadius: 8, padding: 10, maxHeight: 220, overflow: 'auto', whiteSpace: 'pre-wrap' },
  aviso: { fontFamily: 'Barlow, sans-serif', fontSize: 14, color: 'var(--text)', background: 'rgba(245,158,11,0.12)', border: '1.5px solid #f59e0b', borderRadius: 8, padding: '8px 12px' },
  okBox: { fontFamily: 'Barlow, sans-serif', fontSize: 14, color: 'var(--text)', background: 'rgba(34,197,94,0.1)', border: '1.5px solid #22c55e', borderRadius: 8, padding: '8px 12px' },
  lista: { display: 'flex', flexDirection: 'column', gap: 8 },
  renglon: { background: 'var(--surface2)', border: '1.5px solid var(--border)', borderRadius: 10, padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 6 },
  renglonRevisar: { borderColor: '#f59e0b' },
  renglonTop: { display: 'flex', alignItems: 'center', gap: 8 },
  descFactura: { fontFamily: 'Barlow Condensed, sans-serif', fontWeight: 700, fontSize: 17, color: 'var(--text)' },
  codigo: { fontFamily: 'Barlow, sans-serif', fontSize: 12, color: 'var(--muted)' },
  badgeOk: { fontFamily: 'Barlow Condensed, sans-serif', fontWeight: 700, fontSize: 12, color: '#22c55e', whiteSpace: 'nowrap' },
  badgeRevisar: { fontFamily: 'Barlow Condensed, sans-serif', fontWeight: 700, fontSize: 12, color: '#f59e0b', whiteSpace: 'nowrap' },
  motivo: { fontFamily: 'Barlow, sans-serif', fontSize: 12, color: '#f59e0b' },
  numeros: { display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 8 },
  mini: { display: 'flex', flexDirection: 'column', gap: 2, fontFamily: 'Barlow, sans-serif', fontSize: 11, color: 'var(--muted)' },
  inputMini: { background: 'var(--bg)', border: '1.5px solid var(--border)', borderRadius: 6, color: 'var(--text)', fontFamily: 'Barlow, sans-serif', fontSize: 15, padding: '6px 8px', outline: 'none', minWidth: 0 },
  articulo: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', fontFamily: 'Barlow, sans-serif', fontSize: 14, color: 'var(--text)' },
  artChip: { display: 'inline-flex', alignItems: 'center', gap: 6 },
  artFoto: { width: 28, height: 28, objectFit: 'cover', borderRadius: 4 },
  origenChip: { fontFamily: 'Barlow, sans-serif', fontSize: 11, color: 'var(--muted)', background: 'var(--bg)', borderRadius: 10, padding: '1px 8px' },
  crearBtn: { background: 'var(--accent)', border: 'none', borderRadius: 8, color: '#000', fontFamily: 'Barlow Condensed, sans-serif', fontWeight: 800, fontSize: 14, padding: '6px 12px', cursor: 'pointer' },
  buscador: { display: 'flex', flexDirection: 'column', gap: 6, background: 'var(--bg)', borderRadius: 8, padding: 8 },
  opcion: { display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', textAlign: 'left', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text)', fontFamily: 'Barlow, sans-serif', fontSize: 14, padding: '8px 10px', cursor: 'pointer' },
  pago: { display: 'flex', flexDirection: 'column', gap: 8, background: 'var(--surface2)', borderRadius: 10, padding: '10px 12px', marginTop: 4 },
  opcionesPago: { display: 'flex', gap: 8, flexWrap: 'wrap' },
  optPago: { flex: 1, minWidth: 120, padding: '10px', background: 'var(--bg)', border: '1.5px solid var(--border)', borderRadius: 8, color: 'var(--muted)', fontFamily: 'Barlow Condensed, sans-serif', fontWeight: 800, fontSize: 16, cursor: 'pointer' },
  optPagoActivo: { borderColor: 'var(--accent)', color: 'var(--accent)', background: 'rgba(245,200,0,0.1)' },
  footer: { display: 'flex', alignItems: 'center', gap: 10, padding: '12px 18px calc(12px + env(safe-area-inset-bottom, 0px))', borderTop: '1px solid var(--border)', flexShrink: 0, flexWrap: 'wrap' },
  resumen: { flex: '1 1 160px', fontFamily: 'Barlow, sans-serif', fontSize: 14, color: 'var(--text)' },
  cancelBtn: { padding: '12px 16px', background: 'none', border: '1.5px solid var(--border)', borderRadius: 8, color: 'var(--muted)', fontFamily: 'Barlow, sans-serif', fontSize: 15, cursor: 'pointer' },
  saveBtn: { flex: '1 1 220px', padding: '12px 18px', background: 'var(--accent)', border: 'none', borderRadius: 8, color: '#000', fontFamily: 'Barlow Condensed, sans-serif', fontWeight: 800, fontSize: 17, cursor: 'pointer', letterSpacing: 1 },
}
