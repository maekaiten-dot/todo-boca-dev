// src/pages/Pagos.jsx
import { useState, useEffect } from 'react'
import { parseMonto } from '../lib/montos.js'
import { getPagos, registrarPago, actualizarPago, anularPago, getArticulosAdmin, idCanonico, generarIdCompra, claveCompra, editarArticulo } from '../api/sheets.js'
import CompraModal, { armarCompras, textoRenglones } from '../components/CompraModal.jsx'
import PagosPorMes from '../components/PagosPorMes.jsx'
import BarcodeScanner from '../components/BarcodeScanner.jsx'
import EscanearFactura from '../components/EscanearFactura.jsx'

// ── Helpers de estado ─────────────────────────────────────────────────────────
function getEstado(p) {
  if (p.anulado) return 'ANULADO'
  if (p.tipo === 'GASTO') return 'GASTO'
  if (p.tipo === 'MERCADERÍA') {
    if (p.fechaIngreso && p.pagado)  return 'COMPLETO'
    if (p.fechaIngreso && !p.pagado) return 'PENDIENTE_PAGO'
    if (!p.fechaIngreso && p.pagado) return 'PENDIENTE_MERCADERIA'
  }
  return 'GASTO'
}

const ESTADO_CONFIG = {
  COMPLETO:              { color:'#22c55e', bg:'rgba(34,197,94,0.12)',   label:'Recibido y pagado' },
  PENDIENTE_PAGO:        { color:'#f59e0b', bg:'rgba(245,158,11,0.12)',  label:'Recibido, pago pendiente' },
  PENDIENTE_MERCADERIA:  { color:'#3b82f6', bg:'rgba(59,130,246,0.12)',  label:'Pagado, mercadería pendiente' },
  GASTO:                 { color:'#a78bfa', bg:'rgba(167,139,250,0.12)', label:'Gasto independiente' },
  ANULADO:               { color:'#ef4444', bg:'rgba(239,68,68,0.12)',   label:'Anulado' },
}

const FORM_VACIO = {
  tipo: 'MERCADERÍA',
  fechaIngreso: '', fechaPago: '',
  articuloId: '', articuloNombre: '', articuloFoto: '',
  cantidad: '1', costoUnitario: '0',
  descripcion: '', proveedor: '',
  montoPagado: '0', pagado: false,
  empleado: '',
  compraSel: 'NUEVA', comprobante: '',
  actualizarCosto: true, precioNuevo: '', cambiarPrecio: false,
}

// "$8.000", "8.000" o "8000" → 8000

function hoy() {
  return new Date().toLocaleDateString('es-AR', { timeZone:'America/Argentina/Buenos_Aires' })
}

// Convierte DD/MM/YYYY → YYYY-MM-DD para input type="date"
function toInputDate(ddmmyyyy) {
  if (!ddmmyyyy) return ''
  const [d, m, y] = ddmmyyyy.split('/')
  if (!d || !m || !y) return ''
  return `${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`
}

// Convierte YYYY-MM-DD → DD/MM/YYYY para guardar en sheet
function fromInputDate(yyyymmdd) {
  if (!yyyymmdd) return ''
  const [y, m, d] = yyyymmdd.split('-')
  return `${d}/${m}/${y}`
}

export default function Pagos({ empleado = '', empleadoFijo = null, usuarios = [] }) {
  const [pagos, setPagos] = useState([])
  const [articulos, setArticulos] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [busqueda, setBusqueda] = useState('')
  const [filtroEstado, setFiltroEstado] = useState('TODOS')
  const [modalAbierto, setModalAbierto] = useState(false)
  const [editando, setEditando] = useState(null)
  const [form, setForm] = useState({...FORM_VACIO, empleado})
  const [artBusqueda, setArtBusqueda] = useState('')
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState(null)
  const [escaneando, setEscaneando] = useState(false)
  const [confirmAnular, setConfirmAnular] = useState(null)
  const [anulando, setAnulando] = useState(false)
  const [scannerAbierto, setScannerAbierto] = useState(false)
  const [articulosMostrar, setArticulosMostrar] = useState(false)
  const [vista, setVista] = useState('renglones') // renglones | compras
  const [compraAbierta, setCompraAbierta] = useState(null) // clave de la compra

  useEffect(() => { cargar() }, [])
  useEffect(() => { setForm(f => ({...f, empleado})) }, [empleado])

  async function cargar() {
    setLoading(true)
    setError(null)
    try {
      const [pgs, arts] = await Promise.all([getPagos(), getArticulosAdmin()])
      // Lo último que se cargó o modificó primero
      setPagos(pgs.sort((a, b) => b.modificadoMs - a.modificadoMs || b.rowNum - a.rowNum))
      setArticulos(arts.filter(a => a.disponibilidad?.toUpperCase() === 'ACTIVO'))
    } catch (e) {
      setError('No se pudo cargar.')
    } finally {
      setLoading(false)
    }
  }

  function abrirNuevo() {
    setForm({...FORM_VACIO, empleado, fechaPago: hoy()})
    setEditando(null)
    setArtBusqueda('')
    setModalAbierto(true)
  }

  // Nuevo gasto (flete, envío…) asociado a una compra
  function abrirGastoDeCompra(c) {
    setForm({ ...FORM_VACIO, tipo: 'GASTO', empleado, fechaPago: hoy(), descripcion: 'Flete', compraSel: c.compra, comprobante: c.comprobante || '', costoUnitario: '', cantidad: '1' })
    setEditando(null)
    setArtBusqueda('')
    setModalAbierto(true)
  }

  function abrirEditar(p) {
    setEditando(p)
    setForm({
      tipo: p.tipo, fechaIngreso: p.fechaIngreso, fechaPago: p.fechaPago,
      articuloId: p.articuloId, articuloNombre: p.articuloNombre,
      articuloFoto: articulos.find(a => a.id === p.articuloId)?.foto || '',
      cantidad: String(p.cantidad), costoUnitario: String(p.costoUnitario),
      descripcion: p.descripcion, proveedor: p.proveedor,
      montoPagado: String(p.montoPagado), pagado: p.pagado,
      empleado: p.empleado || empleado,
      compraSel: p.compra || '', comprobante: p.comprobante || '',
      actualizarCosto: true, precioNuevo: '', cambiarPrecio: false,
    })
    setArtBusqueda('')
    setModalAbierto(true)
  }

  function seleccionarArticulo(art) {
    setForm(f => ({...f, articuloId: art.id, articuloNombre: art.nombre, articuloFoto: art.foto, costoUnitario: String(parseMonto(art.costoUnitario))}))
    setArtBusqueda('')
  }

  // otro: true → después de guardar deja el formulario listo para otro producto de la misma compra
  async function guardar(otro = false) {
    if (form.tipo === 'MERCADERÍA' && !form.articuloId) { showToast('Seleccioná un artículo', 'error'); return }
    if (form.tipo === 'GASTO' && !form.descripcion.trim()) { showToast('Ingresá una descripción', 'error'); return }
    setSaving(true)
    try {
      const esMerc = form.tipo === 'MERCADERÍA'
      // Un gasto puede ir asociado a una compra ya cargada (flete, envío): suma al total de esa compra
      const compra = !esMerc ? (form.compraSel && form.compraSel !== 'NUEVA' ? form.compraSel : '') : form.compraSel === 'NUEVA' ? await generarIdCompra() : form.compraSel
      if (!esMerc && compra && !(parseMonto(form.costoUnitario) > 0)) { showToast('Poné el importe del gasto', 'error'); setSaving(false); return }
      const comprobante = esMerc || compra ? form.comprobante.trim() : ''
      const datosGasto = !esMerc ? (compra ? { cantidad: '1' } : { cantidad: '0', costoUnitario: '0' }) : {}
      // Costo y precio del artículo (si se pidió actualizarlos)
      const cambiosArt = []
      if (esMerc && artSel && (cambiaCosto && form.actualizarCosto || precioNuevoOk)) {
        const nuevo = { ...artSel }
        if (cambiaCosto && form.actualizarCosto) { nuevo.costoUnitario = String(cuForm); cambiosArt.push(`costo $${cuForm.toLocaleString('es-AR')}`) }
        if (precioNuevoOk) { nuevo.precioUnitario = String(precioNuevoNum); cambiosArt.push(`precio $${precioNuevoNum.toLocaleString('es-AR')}`) }
        await editarArticulo(artSel.rowNum, nuevo, form.empleado || empleado)
      }
      const notaArt = cambiosArt.length ? ` · artículo actualizado (${cambiosArt.join(', ')})` : ''
      if (editando) {
        const notaIngreso = await actualizarPago(editando.rowNum, {
          ...form, ...datosGasto, compra, comprobante, compraAnterior: editando.compra || '', comprobanteAnterior: editando.comprobante || '',
          idPago: editando.idPago, anulado: editando.anulado,
        }, form.empleado)
        showToast(`Pago actualizado${notaIngreso || ''}${notaArt}`, 'success', notaIngreso || notaArt ? 6000 : 3000)
      } else {
        await registrarPago({ ...form, ...datosGasto, compra, comprobante })
        showToast(`${otro ? `Guardado en ${compra}: cargá el siguiente producto` : `Pago registrado${compra ? ` · compra ${compra}` : ''}`}${notaArt}`, 'success', notaArt ? 6000 : 3000)
      }
      if (otro && !editando) {
        setForm(f => ({ ...FORM_VACIO, tipo: 'MERCADERÍA', empleado: f.empleado, proveedor: f.proveedor, fechaIngreso: f.fechaIngreso, fechaPago: f.fechaPago, compraSel: compra, comprobante: f.comprobante }))
        setArtBusqueda('')
      } else setModalAbierto(false)
      await cargar()
    } catch (e) {
      showToast('Error al guardar', 'error')
    } finally {
      setSaving(false)
    }
  }

  async function confirmarAnulacion() {
    setAnulando(true)
    try {
      const nota = await anularPago(confirmAnular.rowNum, confirmAnular.idPago, empleado)
      showToast(`Pago anulado${nota || ''}`, 'success', nota ? 6000 : 3000)
      setConfirmAnular(null)
      await cargar()
    } catch (e) {
      showToast('Error al anular', 'error')
    } finally {
      setAnulando(false)
    }
  }

  function handleScan(codigo) {
    const cod = idCanonico(codigo.trim())
    const art = articulos.find(a => a.id === cod) || articulos.find(a => a.id === codigo.trim())
    if (art) {
      seleccionarArticulo(art)
      setScannerAbierto(false)
      return { ok: true, nombre: art.nombre }
    }
    return { ok: false, nombre: `No encontrado: ${codigo}` }
  }

  function showToast(msg, type, ms = 3000) {
    setToast({ msg, type })
    setTimeout(() => setToast(null), ms)
  }

  const normalizr = str => str.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')

  // Orden de la tabla: por defecto, última modificación primero. Tocar el título de una columna
  // ordena por esa columna; tocarlo de nuevo invierte el orden.
  const [orden, setOrden] = useState({ col: 'modificado', dir: 'desc' })
  const fechaNum = f => { const [d, m, a] = String(f || '').split(' ')[0].split('/').map(Number); return d && m && a ? a * 10000 + m * 100 + d : 0 }
  const COLUMNAS = [
    { id: 'idPago', label: 'ID', valor: p => p.idPago },
    { id: 'compra', label: 'Compra', valor: p => p.compra || '' },
    { id: 'tipo', label: 'Tipo', valor: p => p.tipo },
    { id: 'nombre', label: 'Descripción / Artículo', valor: p => normalizr(p.articuloNombre || p.descripcion) },
    { id: 'fechaIngreso', label: 'F. Ingreso', valor: p => fechaNum(p.fechaIngreso), num: true },
    { id: 'fechaPago', label: 'F. Pago', valor: p => fechaNum(p.fechaPago), num: true },
    { id: 'cantidad', label: 'Cant.', valor: p => p.cantidad || 0, num: true },
    { id: 'costoTotal', label: 'Costo total', valor: p => p.costoTotal || 0, num: true },
    { id: 'montoPagado', label: 'Monto pagado', valor: p => p.montoPagado || 0, num: true },
    { id: 'proveedor', label: 'Proveedor', valor: p => normalizr(p.proveedor) },
    { id: 'empleado', label: 'Empleado', valor: p => normalizr(p.empleado) },
    { id: 'modificado', label: 'Modificado', valor: p => p.modificadoMs || 0, num: true },
  ]
  function ordenarPor(col) {
    const c = COLUMNAS.find(x => x.id === col)
    setOrden(o => o.col === col ? { col, dir: o.dir === 'asc' ? 'desc' : 'asc' } : { col, dir: c?.num ? 'desc' : 'asc' })
  }
  const colOrden = COLUMNAS.find(x => x.id === orden.col) || COLUMNAS[COLUMNAS.length - 1]
  const comparar = (a, b) => {
    const va = colOrden.valor(a), vb = colOrden.valor(b)
    const r = colOrden.num ? va - vb : String(va).localeCompare(String(vb), 'es', { numeric: true })
    // Desempate: lo modificado más recientemente primero
    return (orden.dir === 'asc' ? r : -r) || (b.modificadoMs - a.modificadoMs)
  }
  const thOrden = col => {
    const c = COLUMNAS.find(x => x.id === col), activa = orden.col === col
    return (
      <th style={{ ...S.th, ...S.thOrden, ...(activa ? { color: 'var(--accent)' } : {}) }} onClick={() => ordenarPor(col)} title="Tocá para ordenar" aria-sort={activa ? (orden.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
        {c.label}<span style={{ marginLeft: 4, opacity: activa ? 1 : 0.3 }}>{activa ? (orden.dir === 'asc' ? '▲' : '▼') : '↕'}</span>
      </th>
    )
  }

  const pagosFiltrados = pagos
    .filter(p => filtroEstado === 'TODOS' || getEstado(p) === filtroEstado)
    .filter(p => {
      if (!busqueda.trim()) return true
      const q = normalizr(busqueda)
      return normalizr(p.articuloNombre).includes(q) || normalizr(p.descripcion).includes(q) ||
        normalizr(p.proveedor).includes(q) || normalizr(p.idPago).includes(q) ||
        normalizr(p.compra || '').includes(q) || normalizr(p.comprobante || '').includes(q)
    })
    .sort(comparar)

  // Compras (renglones de mercadería agrupados por número de compra, o proveedor + fecha si son viejos)
  const compras = armarCompras(pagos, claveCompra)
  const compraDe = clave => compras.find(c => c.clave === clave)
  const comprasFiltradas = compras
    .filter(c => {
      if (filtroEstado === 'TODOS') return true
      if (filtroEstado === 'PENDIENTE_PAGO') return c.saldo > 0
      if (filtroEstado === 'COMPLETO') return c.saldo <= 0
      return false
    })
    .filter(c => {
      if (!busqueda.trim()) return true
      const q = normalizr(busqueda)
      return [c.compra, c.comprobante, c.proveedor, ...c.renglones.map(r => r.articuloNombre)].some(x => normalizr(x || '').includes(q))
    })
    .sort((a, b) => b.ultimaMs - a.ultimaMs)
  // Compras recientes para sumar el pago que se está cargando (mismo proveedor si ya se escribió)
  const fechaMs = f => { const [d, m, a] = String(f || '').split('/').map(Number); return d && m && a ? Date.UTC(a, m - 1, d) : 0 }
  const comprasParaSumar = compras
    .filter(c => c.compra && (Date.now() - Math.max(fechaMs(c.fechaIngreso), c.ultimaMs)) < 15 * 86400000)
    .filter(c => !form.proveedor.trim() || normalizr(c.proveedor).includes(normalizr(form.proveedor.trim())) || c.compra === form.compraSel)
    .sort((a, b) => b.ultimaMs - a.ultimaMs).slice(0, 6)
  // Para un gasto (el flete suele ser de otro proveedor): las compras recientes de cualquier proveedor
  const comprasRecientes = compras
    .filter(c => c.compra && ((Date.now() - Math.max(fechaMs(c.fechaIngreso), c.ultimaMs)) < 30 * 86400000 || c.compra === form.compraSel))
    .sort((a, b) => b.ultimaMs - a.ultimaMs).slice(0, 8)
  function elegirCompra(c) {
    if (!c) { setForm(f => ({ ...f, compraSel: 'NUEVA' })); return }
    setForm(f => ({ ...f, compraSel: c.compra, proveedor: f.proveedor || c.proveedor, fechaIngreso: f.fechaIngreso || c.fechaIngreso, comprobante: c.comprobante || f.comprobante }))
  }

  // Últimos 10 artículos usados en pagos (por articuloId único, orden reciente)
  const ultimosUsados = (() => {
    const vistos = new Set()
    const result = []
    for (const p of pagos) {
      if (p.articuloId && !vistos.has(p.articuloId)) {
        const art = articulos.find(a => a.id === p.articuloId)
        if (art) { vistos.add(p.articuloId); result.push(art) }
      }
      if (result.length >= 10) break
    }
    return result
  })()

  const articulosFiltrados = (articulosMostrar || artBusqueda.trim())
    ? artBusqueda.trim()
      ? articulos.filter(a => {
          const q = normalizr(artBusqueda)
          return normalizr(a.nombre).includes(q) || normalizr(a.id).includes(q)
        })
      : ultimosUsados
    : []

  const costoTotal = (Number(form.cantidad) || 0) * parseMonto(form.costoUnitario)
  // Gasto asociado a una compra (flete…): "Importe" es lo que cuesta, "Monto pagado" lo que ya se pagó
  const gastoDeCompra = form.tipo === 'GASTO' && !!form.compraSel && form.compraSel !== 'NUEVA'
  const montoTotalForm = form.tipo === 'MERCADERÍA' ? costoTotal : gastoDeCompra ? parseMonto(form.costoUnitario) : 0
  // Costo y precio del artículo elegido, para ofrecer actualizarlos
  const artSel = form.tipo === 'MERCADERÍA' && form.articuloId ? articulos.find(a => a.id === form.articuloId) : null
  const cuForm = Math.round(parseMonto(form.costoUnitario) * 100) / 100
  const cuArt = artSel ? parseMonto(artSel.costoUnitario) : 0
  const precioArt = artSel ? parseMonto(artSel.precioUnitario) : 0
  const cambiaCosto = !!artSel && cuForm > 0 && Math.abs(cuForm - cuArt) >= 1
  const precioNuevoNum = Math.round(parseMonto(form.precioNuevo))
  const precioNuevoOk = !!artSel && form.cambiarPrecio && precioNuevoNum > 0 && precioNuevoNum !== Math.round(precioArt)
  const margen = (precio, costo) => precio > 0 && costo > 0 ? `${Math.round((precio - costo) / precio * 100)}%` : '–'

  // Totales resumen
  const totalPagado = pagos.filter(p => !p.anulado && p.pagado).reduce((s, p) => s + p.montoPagado, 0)
  const totalPendiente = pagos.filter(p => !p.anulado && !p.pagado && p.tipo === 'MERCADERÍA').reduce((s, p) => s + p.costoTotal, 0)

  if (loading) return <div style={S.center}><div style={S.loadingText}>Cargando pagos...</div></div>
  if (error) return (
    <div style={S.center}>
      <div style={S.errorText}>{error}</div>
      <button style={S.retryBtn} onClick={cargar}>Reintentar</button>
    </div>
  )

  return (
    <div style={S.page}>
      {toast && (
        <div style={{...S.toast, ...(toast.type==='error' ? S.toastError : S.toastSuccess)}}>
          {toast.msg}
        </div>
      )}

      <div style={S.header}>
        <div style={S.headerTitle}>PAGOS</div>
        <div style={{display:'flex', gap:8}}>
          <button style={S.refreshBtn} onClick={cargar}>↻</button>
          <button style={{...S.newBtn, background:'none', border:'1.5px solid var(--accent)', color:'var(--accent)'}} onClick={() => setEscaneando(true)}>📷 Escanear factura</button>
          <button style={S.newBtn} onClick={abrirNuevo}>+ Nuevo</button>
        </div>
      </div>

      {escaneando && (
        <EscanearFactura
          articulos={articulos}
          proveedores={[...new Set(pagos.map(p => p.proveedor).filter(Boolean))]}
          empleado={empleadoFijo || empleado}
          onCerrar={() => setEscaneando(false)}
          onGuardado={async r => {
            setEscaneando(false)
            showToast(`Factura de ${r.proveedor} cargada: ${r.cantidad} ${r.cantidad === 1 ? 'producto' : 'productos'}${r.costosActualizados ? ` · ${r.costosActualizados} costo(s) actualizado(s)` : ''}`, 'success')
            await cargar()
          }}
        />
      )}

      {/* Resumen */}
      <div style={S.resumenRow}>
        <div style={S.resumenCard}>
          <div style={S.resumenValue}>${Math.round(totalPagado).toLocaleString('es-AR')}</div>
          <div style={S.resumenLabel}>Total pagado</div>
        </div>
        <div style={S.resumenCard}>
          <div style={{...S.resumenValue, color:'#f59e0b'}}>${Math.round(totalPendiente).toLocaleString('es-AR')}</div>
          <div style={S.resumenLabel}>Deuda pendiente</div>
        </div>
      </div>

      {/* Referencias de colores */}
      <div style={S.referencias}>
        <div style={S.refTitle}>REFERENCIAS</div>
        <div style={S.refGrid}>
          {Object.entries(ESTADO_CONFIG).map(([key, cfg]) => (
            <div key={key} style={S.refItem}>
              <div style={{...S.refDot, background: cfg.color}} />
              <span style={S.refLabel}>{cfg.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Filtros */}
      <div style={S.filtrosRow}>
        <div style={S.searchWrap}>
          <span style={S.searchIcon}>⌕</span>
          <input style={S.searchInput} value={busqueda} onChange={e => setBusqueda(e.target.value)} placeholder="Buscar artículo, proveedor, ID..." />
          {busqueda && <button style={S.clearBtn} onClick={() => setBusqueda('')}>✕</button>}
        </div>
        <div style={S.filtroTabs}>
          {['TODOS', 'COMPLETO', 'PENDIENTE_PAGO', 'PENDIENTE_MERCADERIA', 'GASTO'].map(f => (
            <button key={f} style={{...S.filtroTab, ...(filtroEstado===f ? S.filtroTabActive : {})}} onClick={() => setFiltroEstado(f)}>
              {f === 'TODOS' ? 'Todos' :
               f === 'COMPLETO' ? '🟢' :
               f === 'PENDIENTE_PAGO' ? '🟡' :
               f === 'PENDIENTE_MERCADERIA' ? '🔵' : '⚪'}
            </button>
          ))}
        </div>
      </div>

      <div style={S.vistaRow}>
        {[['renglones', 'Renglones'], ['compras', `Compras (${compras.length})`], ['meses', '📅 Por mes']].map(([v, l]) => (
          <button key={v} style={{...S.filtroTab, ...(vista === v ? S.filtroTabActive : {})}} onClick={() => setVista(v)} aria-pressed={vista === v}>{l}</button>
        ))}
      </div>

      {vista === 'meses' && <PagosPorMes pagos={pagos} />}

      {vista === 'compras' && (
        <div style={S.tableWrap}>
          {comprasFiltradas.length === 0 ? <div style={S.emptyText}>Sin compras</div> : (
            <table style={S.table}>
              <thead><tr>
                <th style={S.th}></th><th style={S.th}>Compra</th><th style={S.th}>Proveedor</th><th style={S.th}>F. Ingreso</th>
                <th style={S.th}>Productos</th><th style={S.th}>Total</th><th style={S.th}>Pagado</th><th style={S.th}>Falta</th><th style={S.th}></th>
              </tr></thead>
              <tbody>
                {comprasFiltradas.map(c => (
                  <tr key={c.clave} style={S.tr} data-compra={c.compra || c.clave}>
                    <td style={{...S.td, padding:'0 0 0 4px'}}><div style={{width:4, height:36, borderRadius:2, background: c.saldo > 0 ? '#f59e0b' : '#22c55e'}} /></td>
                    <td style={{...S.td, ...S.tdId}}>{c.compra || <span style={{color:'var(--muted)'}}>sin número</span>}{c.comprobante && <div style={{fontSize:11, color:'var(--muted)'}}>Nº {c.comprobante}</div>}</td>
                    <td style={S.td}>{c.proveedor || '—'}</td>
                    <td style={S.td}>{c.fechaIngreso || '—'}</td>
                    <td style={{...S.td, ...S.tdNombre}}>{textoRenglones(c)} · <span style={{color:'var(--muted)'}}>{c.renglones.slice(0, 3).map(r => r.articuloNombre || r.descripcion).join(', ')}{c.renglones.length > 3 ? '…' : ''}</span></td>
                    <td style={S.td}>${Math.round(c.total).toLocaleString('es-AR')}</td>
                    <td style={{...S.td, color:'#22c55e'}}>${Math.round(c.pagado).toLocaleString('es-AR')}</td>
                    <td style={{...S.td, fontWeight:700, color: c.saldo > 0 ? '#f59e0b' : 'var(--muted)'}}>{c.saldo > 0 ? `$${Math.round(c.saldo).toLocaleString('es-AR')}` : '✓'}</td>
                    <td style={S.td}><button style={c.saldo > 0 ? S.pagarBtn : {...S.editBtn, color:'var(--text)', fontFamily:'Barlow Condensed, sans-serif', fontWeight:700, padding:'5px 12px'}} onClick={() => setCompraAbierta(c.clave)}>{c.saldo > 0 ? 'Pagar' : 'Ver'}</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Tabla */}
      {vista === 'renglones' && <div style={S.tableWrap}>
        {pagosFiltrados.length === 0 ? (
          <div style={S.emptyText}>Sin registros</div>
        ) : (
          <table style={S.table}>
            <thead>
              <tr>
                <th style={S.th}></th>
                {thOrden('idPago')}
                {thOrden('compra')}
                {thOrden('tipo')}
                {thOrden('nombre')}
                {thOrden('fechaIngreso')}
                {thOrden('fechaPago')}
                {thOrden('cantidad')}
                {thOrden('costoTotal')}
                {thOrden('montoPagado')}
                {thOrden('proveedor')}
                {thOrden('empleado')}
                {thOrden('modificado')}
                <th style={S.th}></th>
              </tr>
            </thead>
            <tbody>
              {pagosFiltrados.map(p => {
                const estado = getEstado(p)
                const cfg = ESTADO_CONFIG[estado]
                const art = articulos.find(a => a.id === p.articuloId)
                return (
                  <tr key={p.rowNum} style={{...S.tr, ...(p.anulado ? S.trAnulado : {})}}>
                    <td style={{...S.td, padding:'0 0 0 4px'}}>
                      <div style={{width:4, height:36, borderRadius:2, background: cfg.color}} />
                    </td>
                    <td style={{...S.td, ...S.tdId}}>{p.idPago}</td>
                    <td style={{...S.td, whiteSpace:'nowrap'}}>
                      {(p.tipo === 'MERCADERÍA' || p.compra) && !p.anulado
                        ? <button style={S.compraLink} onClick={() => setCompraAbierta(claveCompra(p))} title="Ver la compra">{p.compra || 'ver compra'}</button>
                        : <span style={{color:'var(--muted)'}}>—</span>}
                      {p.comprobante && <div style={{fontSize:11, color:'var(--muted)'}}>Nº {p.comprobante}</div>}
                    </td>
                    <td style={S.td}>
                      <span style={{...S.badge, background: cfg.bg, color: cfg.color}}>
                        {p.tipo === 'MERCADERÍA' ? 'MERC.' : 'GASTO'}
                      </span>
                    </td>
                    <td style={{...S.td, ...S.tdNombre}}>
                      <div style={{display:'flex', alignItems:'center', gap:8}}>
                        {art?.foto && <img src={art.foto} alt="" style={S.miniThumb} onError={e => e.currentTarget.style.display='none'} />}
                        <span>{p.articuloNombre || p.descripcion}</span>
                      </div>
                    </td>
                    <td style={S.td}>{p.fechaIngreso || <span style={{color:'var(--muted)'}}>—</span>}</td>
                    <td style={S.td}>{p.fechaPago || <span style={{color:'var(--muted)'}}>—</span>}</td>
                    <td style={{...S.td, textAlign:'center'}}>{p.cantidad || '—'}</td>
                    <td style={S.td}>${(p.costoTotal||0).toLocaleString('es-AR')}</td>
                    <td style={{...S.td, fontWeight:700, color:'var(--accent)'}}>${(p.montoPagado||0).toLocaleString('es-AR')}</td>
                    <td style={{...S.td, color:'var(--muted)'}}>{p.proveedor}</td>
                    <td style={{...S.td, color:'var(--muted)'}}>{p.empleado}</td>
                    <td style={{...S.td, color:'var(--muted)', whiteSpace:'nowrap', fontSize:12}} title={p.modificado ? `Modificado ${p.modificado}` : 'Fecha de carga (según el ID)'}>
                      {p.modificado ? p.modificado.replace(/^(\d{1,2}\/\d{1,2})\/\d{4}\s+(\d{1,2}:\d{2}).*$/, '$1 $2') : (p.modificadoMs ? new Date(p.modificadoMs - 3 * 3600000).toISOString().slice(0, 10).split('-').reverse().slice(0, 2).join('/') : '—')}
                    </td>
                    <td style={S.td}>
                      <div style={{display:'flex', gap:6}}>
                        {!p.anulado && <button style={S.editBtn} onClick={() => abrirEditar(p)}>✏️</button>}
                        {!p.anulado && <button style={S.anularBtn} onClick={() => setConfirmAnular(p)}>Anular</button>}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>}

      {compraAbierta && compraDe(compraAbierta) && (
        <CompraModal compra={compraDe(compraAbierta)} empleado={empleadoFijo || empleado}
          onCerrar={() => setCompraAbierta(null)}
          onCambio={async msg => { showToast(msg, 'success'); setCompraAbierta(null); await cargar() }}
          onSumarGasto={c => { setCompraAbierta(null); abrirGastoDeCompra(c) }} />
      )}

      {/* Modal */}
      {modalAbierto && (
        <div style={S.overlay} onClick={() => !saving && setModalAbierto(false)}>
          <div style={S.modal} onClick={e => e.stopPropagation()}>
            <div style={S.modalHeader}>
              <div style={S.modalTitle}>{editando ? 'EDITAR PAGO' : 'NUEVO PAGO'}</div>
              <button style={S.closeBtn} onClick={() => setModalAbierto(false)}>✕</button>
            </div>

            <div style={S.formScroll}>

              {/* Tipo */}
              <div style={S.fieldGroup}>
                <label style={S.label}>TIPO</label>
                <div style={S.tipoBtns}>
                  {['MERCADERÍA', 'GASTO'].map(t => (
                    <button key={t} style={{...S.tipoBtn, ...(form.tipo===t ? S.tipoBtnActive : {})}} onClick={() => setForm(f => ({...f, tipo:t, compraSel: t === 'GASTO' ? (f.compraSel === 'NUEVA' ? '' : f.compraSel) : (f.compraSel || (editando ? '' : 'NUEVA'))}))}>
                      {t === 'MERCADERÍA' ? '📦 Mercadería' : '💸 Gasto'}
                    </button>
                  ))}
                </div>
              </div>

              {/* Artículo (solo MERCADERÍA) */}
              {form.tipo === 'MERCADERÍA' && (
                <div style={S.fieldGroup}>
                  <label style={S.label}>ARTÍCULO *</label>
                  {form.articuloId ? (
                    <div style={S.artSeleccionado}>
                      {form.articuloFoto && <img src={form.articuloFoto} alt="" style={S.artFoto} onError={e => e.currentTarget.style.display='none'} />}
                      <div style={{flex:1}}>
                        <div style={{fontFamily:'Barlow, sans-serif', fontSize:15, color:'var(--text)'}}>{form.articuloNombre}</div>
                        <div style={{fontFamily:'Barlow Condensed, sans-serif', fontSize:13, color:'var(--muted)'}}>{form.articuloId}</div>
                      </div>
                      <button style={S.cambiarBtn} onClick={() => setForm(f => ({...f, articuloId:'', articuloNombre:'', articuloFoto:''}))}>Cambiar</button>
                    </div>
                  ) : (
                    <div style={{position:'relative'}}>
                      <div style={S.artSearchWrap}>
                        <input style={S.artSearchInput} value={artBusqueda} onChange={e => setArtBusqueda(e.target.value)} onFocus={() => setArticulosMostrar(true)} onBlur={() => setTimeout(() => setArticulosMostrar(false), 200)} placeholder="Buscar artículo..." />
                        <button style={S.artScanBtn} onClick={() => setScannerAbierto(true)} title="Escanear código">
                          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M3 5v14"/><path d="M6 5v14"/><path d="M9 5v14"/><path d="M12 5v14"/>
                            <path d="M15 5v14"/><path d="M18 5v14"/><path d="M21 5v14"/>
                            <rect x="1" y="3" width="22" height="18" rx="2" strokeWidth="1.5"/>
                          </svg>
                        </button>
                      </div>
                      {articulosFiltrados.length > 0 && (
                        <div style={S.artDropdown}>
                          {articulosFiltrados.map(a => (
                            <button key={a.id} style={S.artDropdownItem} onClick={() => seleccionarArticulo(a)}>
                              {a.foto && <img src={a.foto} alt="" style={S.artDropdownFoto} onError={e => e.currentTarget.style.display='none'} />}
                              <div>
                                <div style={{fontFamily:'Barlow, sans-serif', fontSize:14, color:'var(--text)'}}>{a.nombre}</div>
                                <div style={{fontFamily:'Barlow Condensed, sans-serif', fontSize:12, color:'var(--muted)'}}>{a.id}</div>
                              </div>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Descripción (solo GASTO) */}
              {form.tipo === 'GASTO' && (
                <div style={S.fieldGroup}>
                  <label style={S.label}>DESCRIPCIÓN *</label>
                  <input style={S.input} value={form.descripcion} onChange={e => setForm(f => ({...f, descripcion: e.target.value}))} placeholder="Alquiler, panadería, etc." />
                </div>
              )}

              {/* Fechas */}
              <div style={S.fieldRow}>
                {form.tipo === 'MERCADERÍA' && (
                  <div style={S.fieldGroup}>
                    <label style={S.label}>FECHA INGRESO MERCADERÍA</label>
                    <input
                      style={S.inputDate}
                      type="date"
                      value={toInputDate(form.fechaIngreso)}
                      onChange={e => setForm(f => ({...f, fechaIngreso: fromInputDate(e.target.value)}))}
                    />
                  </div>
                )}
                <div style={S.fieldGroup}>
                  <label style={S.label}>FECHA PAGO</label>
                  <input
                    style={S.inputDate}
                    type="date"
                    value={toInputDate(form.fechaPago)}
                    onChange={e => setForm(f => ({...f, fechaPago: fromInputDate(e.target.value)}))}
                  />
                </div>
              </div>

              {/* Cantidad y costo (solo MERCADERÍA) */}
              {form.tipo === 'MERCADERÍA' && (
                <div style={S.fieldRow}>
                  <div style={S.fieldGroup}>
                    <label style={S.label}>CANTIDAD</label>
                    <div style={S.qtyWrap}>
                      <button style={S.qtyBtn} onClick={() => setForm(f => ({...f, cantidad: String(Math.max(1, Number(f.cantidad)-1))}))}>−</button>
                      <input style={S.qtyInput} type="text" inputMode="numeric" value={form.cantidad} onChange={e => setForm(f => ({...f, cantidad: e.target.value}))} />
                      <button style={S.qtyBtn} onClick={() => setForm(f => ({...f, cantidad: String(Number(f.cantidad)+1)}))}>+</button>
                    </div>
                  </div>
                  <div style={S.fieldGroup}>
                    <label style={S.label}>COSTO UNITARIO</label>
                    <input style={S.input} type="text" inputMode="numeric" value={form.costoUnitario} onChange={e => setForm(f => ({...f, costoUnitario: e.target.value}))} />
                  </div>
                </div>
              )}

              {/* Costo total calculado */}
              {form.tipo === 'MERCADERÍA' && costoTotal > 0 && (
                <div style={S.costoTotalWrap}>
                  <span style={{fontFamily:'Barlow Condensed, sans-serif', fontSize:14, color:'var(--muted)'}}>COSTO TOTAL</span>
                  <span style={{fontFamily:'Barlow Condensed, sans-serif', fontWeight:800, fontSize:22, color:'var(--accent)'}}>
                    ${costoTotal.toLocaleString('es-AR')}
                  </span>
                </div>
              )}

              {/* Costo y precio del artículo */}
              {artSel && cuForm > 0 && (
                <div style={S.artCostoBox} aria-label="Costo y precio del artículo">
                  {cambiaCosto && (
                    <label style={S.checkLabel}>
                      <input type="checkbox" checked={form.actualizarCosto} onChange={e => setForm(f => ({...f, actualizarCosto: e.target.checked}))} />
                      <span>Actualizar el costo del artículo: ${Math.round(cuArt).toLocaleString('es-AR')} → <b>${cuForm.toLocaleString('es-AR')}</b></span>
                    </label>
                  )}
                  <div style={S.precioLinea}>
                    <span>Precio de venta <b>${Math.round(precioArt).toLocaleString('es-AR')}</b> · margen {cambiaCosto ? <>{margen(precioArt, cuArt)} → <b style={{color: (precioArt - cuForm) / precioArt < (precioArt - cuArt) / precioArt ? '#f59e0b' : '#22c55e'}}>{margen(precioArt, cuForm)}</b></> : <b>{margen(precioArt, cuForm)}</b>}</span>
                    {!form.cambiarPrecio && <button style={S.linkBtn} onClick={() => setForm(f => ({...f, cambiarPrecio: true, precioNuevo: String(Math.round(precioArt))}))}>Cambiar precio</button>}
                  </div>
                  {form.cambiarPrecio && (
                    <div style={{display:'flex', alignItems:'center', gap:10, flexWrap:'wrap'}}>
                      <input style={{...S.input, width:150, flex:'0 0 auto'}} inputMode="numeric" value={form.precioNuevo} onChange={e => setForm(f => ({...f, precioNuevo: e.target.value}))} aria-label="Nuevo precio de venta" />
                      <span style={{fontFamily:'Barlow, sans-serif', fontSize:13, color:'var(--muted)'}}>margen con este precio: <b style={{color:'var(--text)'}}>{margen(precioNuevoNum, cuForm)}</b>{precioNuevoOk ? ' · se avisa a las tablets' : ''}</span>
                      <button style={S.linkBtn} onClick={() => setForm(f => ({...f, cambiarPrecio: false, precioNuevo: ''}))}>No cambiar</button>
                    </div>
                  )}
                </div>
              )}

              {/* Gasto de una compra (flete, envío…): suma al total de esa compra */}
              {form.tipo === 'GASTO' && (
                <div style={S.fieldGroup}>
                  <label style={S.label}>¿ES PARTE DE UNA COMPRA?</label>
                  <div style={S.compraOpciones}>
                    <button style={{...S.compraOpcion, ...(!form.compraSel ? S.compraOpcionActiva : {})}} onClick={() => setForm(f => ({...f, compraSel: ''}))}>No, es un gasto suelto</button>
                    {comprasRecientes.map(c => (
                      <button key={c.compra} style={{...S.compraOpcion, ...(form.compraSel === c.compra ? S.compraOpcionActiva : {})}} onClick={() => setForm(f => ({...f, compraSel: c.compra, comprobante: c.comprobante || f.comprobante, cantidad: '1'}))}>
                        <b>{c.compra}</b> · {c.proveedor || 'sin proveedor'} · {c.fechaIngreso || '—'}
                        <span style={{color:'var(--muted)'}}> · {textoRenglones(c)} · ${Math.round(c.total).toLocaleString('es-AR')}</span>
                      </button>
                    ))}
                  </div>
                  {form.compraSel && (<>
                    <label style={{...S.label, marginTop:6}}>IMPORTE DEL GASTO *</label>
                    <input style={S.input} inputMode="numeric" value={form.costoUnitario} onChange={e => setForm(f => ({...f, costoUnitario: e.target.value, cantidad: '1'}))} placeholder="Ej: 15000" aria-label="Importe del gasto" />
                    <div style={{fontFamily:'Barlow, sans-serif', fontSize:12, color:'var(--muted)'}}>Es lo que cuesta el flete o gasto. Se suma al total de la compra {form.compraSel} y cuenta en lo comprado del mes. Si ya lo pagaste, tocá "= Importe (ya lo pagué)" en Monto pagado; si no, dejalo en 0 y se paga después con la compra.</div>
                  </>)}
                </div>
              )}

              {/* Monto pagado y pagado */}
              <div style={S.fieldRow}>
                <div style={S.fieldGroup}>
                  <label style={S.label}>MONTO PAGADO {gastoDeCompra && <span style={{fontWeight:400}}>(lo que ya pagaste)</span>}</label>
                  <input style={S.input} type="text" inputMode="numeric" value={form.montoPagado} onChange={e => setForm(f => ({...f, montoPagado: e.target.value}))} />
                  {form.tipo === 'MERCADERÍA' && costoTotal > 0 && (
                    <button style={S.hoyBtn} onClick={() => setForm(f => ({...f, montoPagado: String(costoTotal)}))}>= Costo total</button>
                  )}
                  {gastoDeCompra && parseMonto(form.costoUnitario) > 0 && (
                    <button style={S.hoyBtn} onClick={() => setForm(f => ({...f, montoPagado: String(parseMonto(f.costoUnitario)), pagado: true}))}>= Importe (ya lo pagué)</button>
                  )}
                </div>
                <div style={S.fieldGroup}>
                  <label style={S.label}>¿PAGADO?</label>
                  <div style={S.tipoBtns}>
                    <button style={{...S.tipoBtn, ...(form.pagado ? S.tipoBtnActive : {})}} onClick={() => setForm(f => ({...f, pagado: true, montoPagado: parseMonto(f.montoPagado) > 0 ? f.montoPagado : String(montoTotalForm || f.montoPagado)}))}>✓ Sí</button>
                    <button style={{...S.tipoBtn, ...(!form.pagado ? S.tipoBtnActive : {})}} onClick={() => setForm(f => ({...f, pagado: false}))}>✗ No</button>
                  </div>
                </div>
              </div>

              {/* Proveedor */}
              <div style={S.fieldGroup}>
                <label style={S.label}>PROVEEDOR</label>
                <input style={S.input} value={form.proveedor} onChange={e => setForm(f => ({...f, proveedor: e.target.value}))} placeholder="Nombre del proveedor..." />
              </div>

              {/* Compra (solo MERCADERÍA): agrupa los productos que vinieron juntos */}
              {form.tipo === 'MERCADERÍA' && (
                <div style={S.fieldGroup}>
                  <label style={S.label}>COMPRA</label>
                  <div style={S.compraOpciones}>
                    <button style={{...S.compraOpcion, ...(form.compraSel === 'NUEVA' ? S.compraOpcionActiva : {})}} onClick={() => elegirCompra(null)}>
                      ➕ {editando ? 'Pasar a una compra nueva' : 'Compra nueva'}
                    </button>
                    {editando && !editando.compra && (
                      <button style={{...S.compraOpcion, ...(form.compraSel === '' ? S.compraOpcionActiva : {})}} onClick={() => setForm(f => ({...f, compraSel: ''}))}>Sin número (como estaba)</button>
                    )}
                    {comprasParaSumar.map(c => (
                      <button key={c.compra} style={{...S.compraOpcion, ...(form.compraSel === c.compra ? S.compraOpcionActiva : {})}} onClick={() => elegirCompra(c)}>
                        <b>{c.compra}</b> · {c.proveedor || 'sin proveedor'} · {c.fechaIngreso || '—'}
                        <span style={{color:'var(--muted)'}}> · {textoRenglones(c)} · ${Math.round(c.total).toLocaleString('es-AR')}</span>
                      </button>
                    ))}
                    {editando?.compra && !comprasParaSumar.some(c => c.compra === editando.compra) && (
                      <button style={{...S.compraOpcion, ...(form.compraSel === editando.compra ? S.compraOpcionActiva : {})}} onClick={() => setForm(f => ({...f, compraSel: editando.compra}))}><b>{editando.compra}</b> (la actual)</button>
                    )}
                  </div>
                  <div style={{fontFamily:'Barlow, sans-serif', fontSize:12, color:'var(--muted)'}}>
                    {form.compraSel === 'NUEVA' ? 'Se crea un número de compra nuevo. Si este producto vino con otros ya cargados, elegí esa compra.' : form.compraSel ? `Se suma a la compra ${form.compraSel}.` : 'Queda agrupado por proveedor y fecha, como las compras viejas.'}
                  </div>
                  <label style={{...S.label, marginTop:6}}>Nº DE FACTURA O REMITO</label>
                  <input style={S.input} value={form.comprobante} onChange={e => setForm(f => ({...f, comprobante: e.target.value}))} placeholder="Opcional (ej. 0003-00012345)" />
                </div>
              )}

              {/* Empleado */}
              <div style={S.fieldGroup}>
                <label style={S.label}>EMPLEADO</label>
                <div style={S.empBtns}>
                  {empleadoFijo ? (
                    <div style={{...S.empBtn, ...S.empBtnActive, gridColumn:'span 4'}}>{empleadoFijo}</div>
                  ) : usuarios.filter(u => u.nombre !== 'Tablet').map(u => (
                    <button key={u.id} style={{...S.empBtn, ...(form.empleado===u.nombre ? S.empBtnActive : {})}} onClick={() => setForm(f => ({...f, empleado: u.nombre}))}>
                      {u.nombre}
                    </button>
                  ))}
                </div>
              </div>

            </div>

            <div style={S.modalFooter}>
              <button style={S.cancelBtn} onClick={() => setModalAbierto(false)} disabled={saving}>Cancelar</button>
              {!editando && form.tipo === 'MERCADERÍA' && (
                <button style={{...S.cancelBtn, color:'var(--accent)', borderColor:'var(--accent)', opacity: saving ? 0.6 : 1}} onClick={() => guardar(true)} disabled={saving} title="Guarda y deja listo para otro producto de la misma compra">
                  Guardar y sumar otro
                </button>
              )}
              <button style={{...S.saveBtn, opacity: saving ? 0.6 : 1}} onClick={() => guardar()} disabled={saving}>
                {saving ? 'Guardando...' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm anular */}
      {confirmAnular && (
        <div style={S.overlay} onClick={() => !anulando && setConfirmAnular(null)}>
          <div style={S.confirmBox} onClick={e => e.stopPropagation()}>
            <div style={S.confirmTitle}>¿Anular pago?</div>
            <div style={S.confirmSub}>
              <strong style={{color:'var(--accent)'}}>{confirmAnular.idPago}</strong><br/>
              {confirmAnular.articuloNombre || confirmAnular.descripcion}
            </div>
            <div style={{display:'flex', gap:10, marginTop:20}}>
              <button style={S.confirmCancel} onClick={() => setConfirmAnular(null)} disabled={anulando}>Cancelar</button>
              <button style={S.confirmOk} onClick={confirmarAnulacion} disabled={anulando}>
                {anulando ? 'Anulando...' : 'Sí, anular'}
              </button>
            </div>
          </div>
        </div>
      )}
      {scannerAbierto && (
        <BarcodeScanner
          onDetected={handleScan}
          onClose={() => setScannerAbierto(false)}
        />
      )}
    </div>
  )
}

const S = {
  page: { display:'flex', flexDirection:'column', height:'100%', overflowY:'auto', position:'relative' },
  center: { display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', height:'100%', gap:12 },
  loadingText: { fontFamily:'Barlow Condensed, sans-serif', fontSize:22, color:'var(--muted)' },
  errorText: { fontFamily:'Barlow, sans-serif', fontSize:16, color:'#ef4444', textAlign:'center' },
  retryBtn: { background:'var(--surface)', border:'1.5px solid var(--border)', borderRadius:10, color:'var(--text)', fontFamily:'Barlow, sans-serif', fontSize:15, padding:'10px 24px', cursor:'pointer' },
  toast: { position:'fixed', top:16, left:'50%', transform:'translateX(-50%)', zIndex:400, padding:'12px 28px', borderRadius:10, fontFamily:'Barlow Condensed, sans-serif', fontWeight:700, fontSize:18, maxWidth:'92vw', width:'max-content', textAlign:'center', boxSizing:'border-box', boxShadow:'0 4px 20px rgba(0,0,0,0.5)' },
  toastSuccess: { background:'#22c55e', color:'#000' },
  toastError: { background:'#ef4444', color:'#fff' },
  header: { display:'flex', alignItems:'center', justifyContent:'space-between', padding:'16px 20px 12px', borderBottom:'2px solid var(--accent)', flexShrink:0 },
  headerTitle: { fontFamily:'Barlow Condensed, sans-serif', fontWeight:800, fontSize:28, color:'var(--accent)', textTransform:'uppercase', letterSpacing:2 },
  refreshBtn: { background:'var(--surface)', border:'1.5px solid var(--border)', borderRadius:10, color:'var(--text)', fontSize:22, width:40, height:40, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' },
  newBtn: { background:'var(--accent)', border:'none', borderRadius:10, color:'#000', fontFamily:'Barlow Condensed, sans-serif', fontWeight:800, fontSize:15, padding:'0 16px', height:40, cursor:'pointer', letterSpacing:1 },
  resumenRow: { display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, padding:'14px 20px 10px' },
  resumenCard: { background:'var(--surface)', borderRadius:12, padding:'12px 16px', border:'1.5px solid var(--border)' },
  resumenValue: { fontFamily:'Barlow Condensed, sans-serif', fontWeight:800, fontSize:28, color:'var(--accent)' },
  resumenLabel: { fontFamily:'Barlow, sans-serif', fontSize:12, color:'var(--muted)', marginTop:2 },
  referencias: { margin:'0 20px 10px', background:'var(--surface)', borderRadius:10, border:'1.5px solid var(--border)', padding:'10px 14px' },
  refTitle: { fontFamily:'Barlow Condensed, sans-serif', fontWeight:800, fontSize:11, color:'var(--muted)', letterSpacing:1, marginBottom:8 },
  refGrid: { display:'flex', flexWrap:'wrap', gap:'6px 16px' },
  refItem: { display:'flex', alignItems:'center', gap:6 },
  refDot: { width:10, height:10, borderRadius:'50%', flexShrink:0 },
  refLabel: { fontFamily:'Barlow, sans-serif', fontSize:12, color:'var(--muted)' },
  filtrosRow: { display:'flex', alignItems:'center', gap:10, padding:'0 20px 8px', flexWrap:'wrap' },
  searchWrap: { display:'flex', alignItems:'center', flex:1, minWidth:180, background:'var(--surface)', border:'1.5px solid var(--border)', borderRadius:8, padding:'0 12px' },
  searchIcon: { fontSize:18, color:'var(--muted)' },
  searchInput: { flex:1, background:'none', border:'none', outline:'none', color:'var(--text)', fontFamily:'Barlow, sans-serif', fontSize:15, padding:'8px 6px' },
  clearBtn: { background:'none', border:'none', color:'var(--muted)', cursor:'pointer', fontSize:14 },
  filtroTabs: { display:'flex', gap:4 },
  filtroTab: { fontFamily:'Barlow Condensed, sans-serif', fontWeight:700, fontSize:13, padding:'7px 12px', background:'var(--surface)', border:'1.5px solid var(--border)', borderRadius:8, color:'var(--muted)', cursor:'pointer' },
  filtroTabActive: { background:'rgba(245,200,0,0.12)', border:'1.5px solid var(--accent)', color:'var(--accent)' },
  tableWrap: { flex:1, overflowX:'auto', padding:'0 20px 20px' },
  table: { width:'100%', borderCollapse:'collapse' },
  th: { fontFamily:'Barlow Condensed, sans-serif', fontWeight:800, fontSize:12, color:'var(--muted)', letterSpacing:1, textTransform:'uppercase', padding:'8px 10px', borderBottom:'2px solid var(--border)', textAlign:'left', background:'var(--surface)', position:'sticky', top:0, zIndex:1, whiteSpace:'nowrap' },
  thOrden: { cursor:'pointer', userSelect:'none' },
  artCostoBox: { display:'flex', flexDirection:'column', gap:8, padding:'10px 12px', border:'1.5px dashed var(--border)', borderRadius:8 },
  checkLabel: { display:'flex', alignItems:'center', gap:8, fontFamily:'Barlow, sans-serif', fontSize:14, color:'var(--text)', cursor:'pointer' },
  precioLinea: { display:'flex', alignItems:'center', justifyContent:'space-between', gap:10, flexWrap:'wrap', fontFamily:'Barlow, sans-serif', fontSize:14, color:'var(--muted)' },
  linkBtn: { background:'none', border:'none', padding:0, color:'var(--accent)', fontFamily:'Barlow, sans-serif', fontSize:13, cursor:'pointer', textDecoration:'underline' },
  vistaRow: { display:'flex', gap:6, padding:'0 20px 8px' },
  compraLink: { background:'none', border:'none', padding:0, color:'var(--accent)', fontFamily:'Barlow Condensed, sans-serif', fontWeight:700, fontSize:14, cursor:'pointer', textDecoration:'underline', textUnderlineOffset:2 },
  pagarBtn: { background:'var(--accent)', border:'none', borderRadius:8, color:'#000', fontFamily:'Barlow Condensed, sans-serif', fontWeight:800, fontSize:14, padding:'6px 14px', cursor:'pointer' },
  compraOpciones: { display:'flex', flexDirection:'column', gap:6 },
  compraOpcion: { textAlign:'left', background:'var(--surface2)', border:'1.5px solid var(--border)', borderRadius:8, color:'var(--text)', fontFamily:'Barlow, sans-serif', fontSize:14, padding:'9px 12px', cursor:'pointer' },
  compraOpcionActiva: { border:'1.5px solid var(--accent)', background:'rgba(245,200,0,0.1)' },
  td: { fontFamily:'Barlow, sans-serif', fontSize:13, color:'var(--text)', padding:'8px 10px', borderBottom:'1px solid rgba(13,48,128,0.3)', verticalAlign:'middle' },
  tdId: { fontFamily:'Barlow Condensed, sans-serif', fontSize:12, color:'var(--muted)', whiteSpace:'nowrap' },
  tdNombre: { maxWidth:200 },
  badge: { fontFamily:'Barlow Condensed, sans-serif', fontWeight:800, fontSize:11, padding:'2px 7px', borderRadius:4, letterSpacing:0.5 },
  miniThumb: { width:28, height:28, objectFit:'cover', borderRadius:4, flexShrink:0, border:'1px solid var(--border)' },
  tr: {},
  trAnulado: { opacity:0.4 },
  editBtn: { background:'none', border:'1.5px solid var(--border)', borderRadius:6, fontSize:14, padding:'3px 7px', cursor:'pointer' },
  anularBtn: { background:'none', border:'1px solid rgba(239,68,68,0.4)', borderRadius:6, color:'rgba(239,68,68,0.8)', fontFamily:'Barlow Condensed, sans-serif', fontWeight:700, fontSize:11, padding:'3px 8px', cursor:'pointer', letterSpacing:0.5, textTransform:'uppercase' },
  emptyText: { fontFamily:'Barlow, sans-serif', color:'var(--muted)', textAlign:'center', padding:40, fontSize:16 },
  overlay: { position:'fixed', inset:0, background:'rgba(0,0,10,0.85)', display:'flex', alignItems:'flex-end', justifyContent:'center', zIndex:300, backdropFilter:'blur(6px)' },
  modal: { background:'var(--surface)', borderRadius:'20px 20px 0 0', width:'100%', maxWidth:580, maxHeight:'90vh', display:'flex', flexDirection:'column', overflow:'hidden' },
  modalHeader: { display:'flex', justifyContent:'space-between', alignItems:'center', padding:'20px 24px 14px', borderBottom:'1px solid var(--border)', flexShrink:0 },
  modalTitle: { fontFamily:'Barlow Condensed, sans-serif', fontWeight:800, fontSize:22, color:'var(--accent)', letterSpacing:1 },
  closeBtn: { background:'none', border:'none', color:'var(--muted)', fontSize:20, cursor:'pointer' },
  formScroll: { flex:1, overflowY:'auto', padding:'16px 24px', display:'flex', flexDirection:'column', gap:14 },
  fieldGroup: { display:'flex', flexDirection:'column', gap:6 },
  fieldRow: { display:'grid', gridTemplateColumns:'minmax(0,1fr) minmax(0,1fr)', gap:12 },
  label: { fontFamily:'Barlow Condensed, sans-serif', fontSize:13, color:'var(--accent)', letterSpacing:1, fontWeight:700 },
  input: { background:'var(--surface2)', border:'1.5px solid var(--border)', borderRadius:8, color:'var(--text)', fontFamily:'Barlow, sans-serif', fontSize:16, padding:'10px 12px', outline:'none', minWidth:0, width:'100%', boxSizing:'border-box' },
  inputDate: { background:'var(--surface2)', border:'1.5px solid var(--border)', borderRadius:8, color:'var(--text)', fontFamily:'Barlow, sans-serif', fontSize:16, padding:'10px 12px', outline:'none', colorScheme:'dark' },
  tipoBtns: { display:'flex', gap:8 },
  tipoBtn: { flex:1, padding:'10px', background:'var(--surface2)', border:'1.5px solid var(--border)', borderRadius:8, color:'var(--muted)', fontFamily:'Barlow Condensed, sans-serif', fontWeight:700, fontSize:15, cursor:'pointer', letterSpacing:0.5 },
  tipoBtnActive: { background:'rgba(245,200,0,0.12)', border:'1.5px solid var(--accent)', color:'var(--accent)' },
  hoyBtn: { background:'none', border:'none', color:'var(--muted)', fontFamily:'Barlow Condensed, sans-serif', fontSize:12, cursor:'pointer', textAlign:'left', padding:'2px 0', textDecoration:'underline' },
  artSeleccionado: { display:'flex', alignItems:'center', gap:10, background:'var(--surface2)', border:'1.5px solid var(--accent)', borderRadius:8, padding:'10px 12px' },
  artFoto: { width:40, height:40, objectFit:'cover', borderRadius:6, flexShrink:0 },
  cambiarBtn: { background:'none', border:'1px solid var(--border)', borderRadius:6, color:'var(--muted)', fontFamily:'Barlow Condensed, sans-serif', fontWeight:700, fontSize:12, padding:'4px 10px', cursor:'pointer' },
  artSearchWrap: { display:'flex', alignItems:'stretch', background:'var(--surface2)', border:'1.5px solid var(--border)', borderRadius:8, overflow:'hidden' },
  artSearchInput: { flex:1, background:'none', border:'none', outline:'none', color:'var(--text)', fontFamily:'Barlow, sans-serif', fontSize:16, padding:'10px 12px' },
  artScanBtn: { background:'none', border:'none', borderLeft:'1.5px solid var(--border)', color:'var(--accent)', cursor:'pointer', padding:'0 14px', display:'flex', alignItems:'center', justifyContent:'center' },
  artDropdown: { position:'absolute', top:'100%', left:0, right:0, background:'var(--surface)', border:'1.5px solid var(--border)', borderRadius:8, zIndex:10, maxHeight:280, overflowY:'auto', boxShadow:'0 8px 24px rgba(0,0,0,0.4)' },
  artDropdownItem: { width:'100%', display:'flex', alignItems:'center', gap:10, padding:'10px 14px', background:'none', border:'none', borderBottom:'1px solid var(--border)', cursor:'pointer', textAlign:'left', color:'var(--text)' },
  artDropdownFoto: { width:36, height:36, objectFit:'cover', borderRadius:5, flexShrink:0 },
  qtyWrap: { display:'flex', alignItems:'center', gap:8 },
  qtyBtn: { width:40, height:40, background:'var(--border)', border:'none', borderRadius:8, color:'var(--text)', fontSize:20, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', fontWeight:700, flexShrink:0 },
  qtyInput: { flex:1, background:'var(--surface2)', border:'1.5px solid var(--border)', borderRadius:8, color:'var(--text)', fontFamily:'Barlow Condensed, sans-serif', fontWeight:800, fontSize:20, padding:'8px 12px', outline:'none', textAlign:'center', minWidth:0, width:'100%' },
  costoTotalWrap: { display:'flex', justifyContent:'space-between', alignItems:'center', background:'var(--surface2)', borderRadius:8, padding:'10px 14px', border:'1.5px solid var(--border)' },
  empBtns: { display:'grid', gridTemplateColumns:'repeat(4, 1fr)', gap:6 },
  empBtn: { padding:'8px 6px', background:'var(--surface2)', border:'1.5px solid var(--border)', borderRadius:8, cursor:'pointer', color:'var(--muted)', fontFamily:'Barlow Condensed, sans-serif', fontWeight:700, fontSize:14, letterSpacing:0.5, textAlign:'center' },
  empBtnActive: { background:'rgba(245,200,0,0.12)', border:'1.5px solid var(--accent)', color:'var(--accent)' },
  modalFooter: { display:'flex', gap:10, padding:'14px 24px', borderTop:'1px solid var(--border)', flexShrink:0 },
  cancelBtn: { flex:1, padding:'13px', background:'none', border:'1.5px solid var(--border)', borderRadius:8, color:'var(--muted)', fontFamily:'Barlow, sans-serif', fontSize:15, cursor:'pointer' },
  saveBtn: { flex:2, padding:'13px', background:'var(--accent)', border:'none', borderRadius:8, color:'#000', fontFamily:'Barlow Condensed, sans-serif', fontWeight:800, fontSize:17, cursor:'pointer', letterSpacing:1 },
  confirmBox: { background:'var(--surface)', border:'2px solid #ef4444', borderRadius:16, padding:28, width:320, textAlign:'center', margin:'auto' },
  confirmTitle: { fontFamily:'Barlow Condensed, sans-serif', fontWeight:800, fontSize:22, color:'#ef4444', marginBottom:10 },
  confirmSub: { fontFamily:'Barlow, sans-serif', fontSize:14, color:'var(--muted)', lineHeight:1.6 },
  confirmCancel: { flex:1, padding:'11px', background:'none', border:'1.5px solid var(--border)', borderRadius:8, color:'var(--muted)', fontFamily:'Barlow, sans-serif', fontSize:14, cursor:'pointer' },
  confirmOk: { flex:1, padding:'11px', background:'#ef4444', border:'none', borderRadius:8, color:'#fff', fontFamily:'Barlow Condensed, sans-serif', fontWeight:700, fontSize:15, cursor:'pointer' },
}
