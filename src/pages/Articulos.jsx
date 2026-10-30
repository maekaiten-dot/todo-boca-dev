// src/pages/Articulos.jsx
import { useState, useEffect, useRef } from 'react'
import { parseMonto as numArs } from '../lib/montos.js'
import ModalArticulo from '../components/ModalArticulo.jsx'
import DesgloseStock from '../components/DesgloseStock.jsx'
import { GRUPOS_INICIALES } from '../lib/gruposIniciales.js'
import { cargarGruposIniciales, getArticulosAdmin, generarIdArticulo, agregarArticulo, editarArticulo, calcularStockTodos } from '../api/sheets.js'

const CLOUDINARY_CLOUD = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME
const CLOUDINARY_PRESET = import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET

const FORM_VACIO = {
  id: '', nombre: '', stockInicial: '0', info: '',
  disponibilidad: 'ACTIVO', foto: '',
  precioUnitario: '0', costoUnitario: '0',
  cantidadReponer: '0', stockCierre: '0', stockActual: '0',
}

async function subirFotoCloudinary(file) {
  const formData = new FormData()
  formData.append('file', file)
  formData.append('upload_preset', CLOUDINARY_PRESET)
  const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD}/image/upload`, {
    method: 'POST',
    body: formData,
  })
  if (!res.ok) throw new Error('Error al subir foto')
  const data = await res.json()
  return data.secure_url
}

export default function Articulos({ empleado = '', esAdmin = false }) {
  const [articulos, setArticulos] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [busqueda, setBusqueda] = useState('')
  const [orden, setOrden] = useState({ col: null, dir: 'asc' })
  const [desglose, setDesglose] = useState(null) // artículo cuyo stock se está explicando
  const [cargandoGrupos, setCargandoGrupos] = useState(false)
  const [filtroDisp, setFiltroDisp] = useState('TODOS')
  const [modalAbierto, setModalAbierto] = useState(false)
  const [editando, setEditando] = useState(null)
  const [form, setForm] = useState(FORM_VACIO)
  const [saving, setSaving] = useState(false)
  const [uploadingFoto, setUploadingFoto] = useState(false)
  const [toast, setToast] = useState(null)
  const [stockMap, setStockMap] = useState({}) // articuloId -> stockActualCalculado
  const [loadingStock, setLoadingStock] = useState(false)
  const [stockContado, setStockContado] = useState({}) // articuloId -> se contó alguna vez
  const fileInputCamara = useRef(null)
  const fileInputGaleria = useRef(null)

  useEffect(() => { cargar() }, [])

  async function cargar() {
    setLoading(true)
    setError(null)
    try {
      const data = await getArticulosAdmin()
      setArticulos(data)
      // Calcular stock dinámico en background
      setLoadingStock(true)
      calcularStockTodos(data).then(conStock => {
        const map = {}, contados = {}
        conStock.forEach(a => { map[a.id] = a.stockActualCalculado; contados[a.id] = a.stockContado })
        setStockMap(map)
        setStockContado(contados)
        setLoadingStock(false)
      }).catch(() => setLoadingStock(false))
    } catch (e) {
      setError('No se pudo cargar los artículos.')
    } finally {
      setLoading(false)
    }
  }

  async function abrirNuevo() {
    const nuevoId = await generarIdArticulo()
    setForm({ ...FORM_VACIO, id: nuevoId })
    setEditando(null)
    setModalAbierto(true)
  }

  function abrirEditar(art) {
    setForm({
      id: art.id, nombre: art.nombre, stockInicial: art.stockInicial,
      info: art.info, disponibilidad: art.disponibilidad, foto: art.foto,
      precioUnitario: art.precioUnitario, costoUnitario: art.costoUnitario,
      cantidadReponer: art.cantidadReponer, stockCierre: art.stockCierre,
      stockActual: art.stockActual, grupo: art.grupo || '',
      tipoManual: art.tipoManual || '', tipoManualAntes: art.tipoManual || '',
    })
    setEditando(art)
    setModalAbierto(true)
  }

  async function handleFotoSeleccionada(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadingFoto(true)
    try {
      const url = await subirFotoCloudinary(file)
      setForm(f => ({ ...f, foto: url }))
      showToast('Foto subida ✓', 'success')
    } catch (err) {
      showToast('Error al subir la foto', 'error')
    } finally {
      setUploadingFoto(false)
      e.target.value = ''
    }
  }

  async function guardar() {
    if (!form.id.trim() || !form.nombre.trim()) {
      showToast('ID y Nombre son obligatorios', 'error')
      return
    }
    setSaving(true)
    try {
      if (editando) {
        await editarArticulo(editando.rowNum, form, empleado)
        showToast('Artículo actualizado', 'success')
      } else {
        await agregarArticulo(form, empleado)
        showToast('Artículo creado', 'success')
      }
      setModalAbierto(false)
      await cargar()
    } catch (e) {
      showToast('Error al guardar', 'error')
    } finally {
      setSaving(false)
    }
  }

  function showToast(msg, type, ms = 3000) {
    setToast({ msg, type })
    setTimeout(() => setToast(null), ms)
  }

  // Sin costo = costo vacío o en $0 (solo se marca para administradores)
  const sinCosto = a => numArs(a.costoUnitario) <= 0
  const [soloSinCosto, setSoloSinCosto] = useState(false)

  const nombreDe = id => articulos.find(a => a.id === id)?.nombre || ''
  const normalizr = str => str.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  // Orden: por defecto, el de la planilla. Tocar el título de una columna ordena por ella; de nuevo, invierte.
  const COLS = {
    id: { label: 'SKU', valor: a => a.id, texto: true },
    nombre: { label: 'Nombre', valor: a => a.nombre, texto: true },
    precio: { label: 'Precio', valor: a => numArs(a.precioUnitario) },
    costo: { label: 'Costo', valor: a => numArs(a.costoUnitario) },
    stock: { label: 'Stock actual', valor: a => a.unificadoEn ? null : (stockMap[a.id] ?? null) },
    estado: { label: 'Estado', valor: a => a.disponibilidad?.toUpperCase() === 'ACTIVO' ? 'ACTIVO' : 'INACTIVO', texto: true },
  }
  const ordenar = lista => {
    const c = COLS[orden.col]; if (!c) return lista
    const sgn = orden.dir === 'asc' ? 1 : -1
    return [...lista].sort((a, b) => {
      const va = c.valor(a), vb = c.valor(b)
      if (va == null || vb == null) return va == null && vb == null ? 0 : va == null ? 1 : -1 // sin dato, siempre al final
      return (c.texto ? String(va).localeCompare(String(vb), 'es', { numeric: true }) : va - vb) * sgn
    })
  }
  const ordenarPor = col => setOrden(o => o.col === col ? (o.dir === (COLS[col].texto ? 'asc' : 'desc') ? { col, dir: COLS[col].texto ? 'desc' : 'asc' } : { col: null, dir: 'asc' }) : { col, dir: COLS[col].texto ? 'asc' : 'desc' })
  const thOrden = col => {
    const activa = orden.col === col
    return (
      <th style={{ ...S.th, cursor: 'pointer', userSelect: 'none', ...(activa ? { color: 'var(--accent)' } : {}) }} onClick={() => ordenarPor(col)} title="Tocá para ordenar" aria-sort={activa ? (orden.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
        {COLS[col].label}<span style={{ marginLeft: 4, opacity: activa ? 1 : 0.3 }}>{activa ? (orden.dir === 'asc' ? '▲' : '▼') : '↕'}</span>
      </th>
    )
  }

  const articulosFiltrados = ordenar(articulos
    .filter(a => esAdmin || a.disponibilidad?.toUpperCase() === 'ACTIVO')
    .filter(a => {
      if (filtroDisp === 'ACTIVO') return a.disponibilidad?.toUpperCase() === 'ACTIVO'
      if (filtroDisp === 'INACTIVO') return a.disponibilidad?.toUpperCase() !== 'ACTIVO'
      return true
    })
    .filter(a => !(esAdmin && soloSinCosto) || sinCosto(a))
    .filter(a => {
      if (!busqueda.trim()) return true
      const q = normalizr(busqueda)
      return normalizr(a.nombre).includes(q) || normalizr(a.id).includes(q) || normalizr(a.grupo || '').includes(q)
    }))

  if (loading) return (
    <div style={S.center}><div style={S.loadingText}>Cargando artículos...</div></div>
  )

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
        <div style={S.headerTitle}>ARTÍCULOS</div>
        <div style={{display:'flex', gap:8}}>
          <button style={S.refreshBtn} onClick={cargar}>↻</button>
          {esAdmin && <button style={S.newBtn} onClick={abrirNuevo}>+ Nuevo</button>}
        </div>
      </div>

      <div style={S.filtrosRow}>
        <div style={S.searchWrap}>
          <span style={S.searchIcon}>⌕</span>
          <input style={S.searchInput} value={busqueda} onChange={e => setBusqueda(e.target.value)} placeholder="Buscar nombre o SKU..." />
          {busqueda && <button style={S.clearBtn} onClick={() => setBusqueda('')}>✕</button>}
        </div>
        {esAdmin && <div style={S.dispTabs}>
          {['TODOS','ACTIVO','INACTIVO'].map(f => (
            <button key={f} style={{...S.dispTab, ...(filtroDisp===f ? S.dispTabActive : {})}} onClick={() => setFiltroDisp(f)}>{f}</button>
          ))}
        </div>}
        {esAdmin && (
          <button style={{...S.dispTab, ...S.sinCostoTab, ...(soloSinCosto ? S.sinCostoTabActivo : {})}} onClick={() => setSoloSinCosto(v => !v)} aria-pressed={soloSinCosto}>
            SIN COSTO ({articulos.filter(a => sinCosto(a) && (filtroDisp === 'TODOS' || (filtroDisp === 'ACTIVO') === (a.disponibilidad?.toUpperCase() === 'ACTIVO'))).length})
          </button>
        )}
      </div>

      {esAdmin && !loading && articulos.length > 0 && !articulos.some(a => a.grupo) && (
        <div style={S.gruposBanner}>
          <div style={{ flex: 1 }}>
            <b>🔗 Grupos listos para cargar:</b> {Object.entries(GRUPOS_INICIALES).map(([g, ids]) => `${g} (${ids.length})`).join(' · ')}.
            <div style={{ color: 'var(--muted)', fontSize: 12, marginTop: 2 }}>Se guardan en la columna GRUPO de ARTICULOS. Después se cambian editando cada artículo.</div>
          </div>
          <button style={S.newBtn} disabled={cargandoGrupos} onClick={async () => {
            setCargandoGrupos(true)
            try { const n = await cargarGruposIniciales(GRUPOS_INICIALES, empleado); showToast(`${n} artículos agrupados ✓`, 'success'); await cargar() }
            catch (e) { console.error(e); showToast('No se pudieron cargar los grupos', 'error') }
            finally { setCargandoGrupos(false) }
          }}>{cargandoGrupos ? 'Cargando…' : 'CARGAR GRUPOS'}</button>
        </div>
      )}

      <div style={S.conteo}>{articulosFiltrados.length} artículos</div>

      <div style={S.tableWrap}>
        <table style={S.table}>
          <thead>
            <tr>
              <th style={S.th}>Foto</th>
              {thOrden('id')}
              {thOrden('nombre')}
              {thOrden('precio')}
              {esAdmin && thOrden('costo')}
              {thOrden('stock')}
              {thOrden('estado')}
              {esAdmin && <th style={S.th}></th>}
            </tr>
          </thead>
          <tbody>
            {articulosFiltrados.map(art => {
              const activo = art.disponibilidad?.toUpperCase() === 'ACTIVO'
              return (
                <tr key={art.rowNum} style={{...S.tr, ...(!activo ? S.trInactivo : {})}}>
                  <td style={S.td}>
                    <div style={S.fotoBox}>
                      <span style={{fontSize:16}}>📦</span>
                      {art.foto && <img src={art.foto} alt="" style={S.foto} onError={e => e.currentTarget.style.display='none'} />}
                    </div>
                  </td>
                  <td style={{...S.td, ...S.tdSku}}>{art.id}</td>
                  <td style={{...S.td, ...S.tdNombre}}>
                    {art.nombre}
                    {art.grupo && <div style={S.grupoTag} title="Grupo: se suma con los otros modelos en Rotación">🔗 {art.grupo}</div>}
                    {art.unificadoEn && <div style={S.unificadoTag}>⇢ Unificado en {art.unificadoEn}{nombreDe(art.unificadoEn) ? ` · ${nombreDe(art.unificadoEn)}` : ''}</div>}
                    {esAdmin && sinCosto(art) && <div style={S.avisoSinCosto}>⚠ Sin costo unitario cargado</div>}
                  </td>
                  <td style={S.td}>${numArs(art.precioUnitario).toLocaleString('es-AR')}</td>
                  {esAdmin && <td style={{...S.td, color:'var(--muted)'}}>${numArs(art.costoUnitario).toLocaleString('es-AR')}</td>}
                  <td style={{...S.td, textAlign:'center'}}>
                    {art.unificadoEn ? <span style={{color:'var(--muted)', fontSize:12}} title="Su stock se suma al artículo en el que se unificó">→ {art.unificadoEn}</span> : loadingStock
                      ? <span style={{color:'var(--muted)', fontSize:12}}>...</span>
                      : <span style={{
                          fontFamily:'Barlow Condensed, sans-serif',
                          fontWeight:700,
                          fontSize:16,
                          color: (stockMap[art.id] ?? 0) <= 0 ? '#ef4444' : (stockMap[art.id] ?? 0) <= 3 ? '#f59e0b' : '#22c55e'
                        }}>
                          {esAdmin && stockMap[art.id] != null
                            ? <button style={S.stockBtn} onClick={() => setDesglose(art)} title="¿De dónde sale este número?">{stockMap[art.id]} <span style={{fontSize:11, opacity:0.7}}>ⓘ</span></button>
                            : stockMap[art.id] ?? '—'}
                        </span>
                    }
                    {!loadingStock && stockContado[art.id] === false && <div style={{fontFamily:'Barlow, sans-serif', fontSize:11, color:'var(--muted)'}} title="Todavía no se contó: el número no es confiable">sin contar</div>}
                  </td>
                  <td style={S.td}>
                    {/* Solo se muestra: el estado se cambia desde ✏️ Editar (así no se toca por error) */}
                    <span style={{...S.toggleBtn, ...(activo ? S.toggleActivo : S.toggleInactivo), cursor:'default'}}>{activo ? 'ACTIVO' : 'INACTIVO'}</span>
                  </td>
                  {esAdmin && <td style={S.td}>
                    <button style={S.editBtn} onClick={() => abrirEditar(art)}>✏️</button>
                  </td>}
                </tr>
              )
            })}
          </tbody>
        </table>
        {articulosFiltrados.length === 0 && <div style={S.emptyText}>Sin resultados</div>}
      </div>

      {desglose && <DesgloseStock art={desglose} onCerrar={() => setDesglose(null)} />}

      {/* Modal formulario */}
      {modalAbierto && (
        <ModalArticulo
          inicial={form} editando={editando} empleado={empleado} articulos={articulos} stockMap={stockMap}
          onCerrar={() => setModalAbierto(false)}
          onGuardado={async (_, mensaje) => { showToast(mensaje || (editando ? 'Artículo actualizado' : 'Artículo creado'), 'success', mensaje ? 7000 : 3000); setModalAbierto(false); await cargar() }}
        />
      )}
    </div>
  )
}

const S = {
  gruposBanner: { display:'flex', alignItems:'center', gap:12, margin:'10px 16px 0', padding:'10px 14px', background:'rgba(96,165,250,0.08)', border:'1.5px solid #60a5fa', borderRadius:10, fontFamily:'Barlow, sans-serif', fontSize:14, color:'var(--text)' },
  stockBtn: { background:'none', border:'none', padding:0, color:'inherit', font:'inherit', cursor:'pointer', textDecoration:'underline dotted', textUnderlineOffset:3 },
  unificadoTag: { fontFamily:'Barlow, sans-serif', fontSize:11, color:'#f59e0b', marginTop:2 },
  grupoTag: { fontFamily:'Barlow, sans-serif', fontSize:11, color:'#60a5fa', marginTop:2 },
  page: { display:'flex', flexDirection:'column', height:'100%', overflowY:'auto', position:'relative' },
  center: { display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', height:'100%', gap:12 },
  loadingText: { fontFamily:'Barlow Condensed, sans-serif', fontSize:22, color:'var(--muted)' },
  errorText: { fontFamily:'Barlow, sans-serif', fontSize:16, color:'#ef4444', textAlign:'center' },
  retryBtn: { background:'var(--surface)', border:'1.5px solid var(--border)', borderRadius:10, color:'var(--text)', fontFamily:'Barlow, sans-serif', fontSize:15, padding:'10px 24px', cursor:'pointer' },
  toast: { position:'fixed', top:16, left:'50%', transform:'translateX(-50%)', zIndex:400, padding:'12px 28px', borderRadius:10, fontFamily:'Barlow Condensed, sans-serif', fontWeight:700, fontSize:18, whiteSpace:'nowrap', boxShadow:'0 4px 20px rgba(0,0,0,0.5)' },
  toastSuccess: { background:'#22c55e', color:'#000' },
  toastError: { background:'#ef4444', color:'#fff' },
  header: { display:'flex', alignItems:'center', justifyContent:'space-between', padding:'16px 20px 12px', borderBottom:'2px solid var(--accent)', flexShrink:0 },
  headerTitle: { fontFamily:'Barlow Condensed, sans-serif', fontWeight:800, fontSize:28, color:'var(--accent)', textTransform:'uppercase', letterSpacing:2 },
  refreshBtn: { background:'var(--surface)', border:'1.5px solid var(--border)', borderRadius:10, color:'var(--text)', fontSize:22, width:40, height:40, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' },
  newBtn: { background:'var(--accent)', border:'none', borderRadius:10, color:'#000', fontFamily:'Barlow Condensed, sans-serif', fontWeight:800, fontSize:16, padding:'0 20px', height:40, cursor:'pointer', letterSpacing:1 },
  filtrosRow: { display:'flex', alignItems:'center', gap:10, padding:'10px 20px 6px', flexWrap:'wrap' },
  searchWrap: { display:'flex', alignItems:'center', flex:1, minWidth:200, background:'var(--surface)', border:'1.5px solid var(--border)', borderRadius:8, padding:'0 12px' },
  searchIcon: { fontSize:18, color:'var(--muted)' },
  searchInput: { flex:1, background:'none', border:'none', outline:'none', color:'var(--text)', fontFamily:'Barlow, sans-serif', fontSize:15, padding:'8px 6px' },
  clearBtn: { background:'none', border:'none', color:'var(--muted)', cursor:'pointer', fontSize:14 },
  dispTabs: { display:'flex', gap:4 },
  dispTab: { fontFamily:'Barlow Condensed, sans-serif', fontWeight:700, fontSize:13, padding:'7px 14px', background:'var(--surface)', border:'1.5px solid var(--border)', borderRadius:8, color:'var(--muted)', cursor:'pointer', letterSpacing:1 },
  dispTabActive: { background:'rgba(245,200,0,0.12)', border:'1.5px solid var(--accent)', color:'var(--accent)' },
  conteo: { fontFamily:'Barlow, sans-serif', fontSize:12, color:'var(--muted)', padding:'2px 20px 6px' },
  tableWrap: { flex:1, overflowX:'auto', padding:'0 20px 20px' },
  table: { width:'100%', borderCollapse:'collapse' },
  th: { fontFamily:'Barlow Condensed, sans-serif', fontWeight:800, fontSize:12, color:'var(--muted)', letterSpacing:1, textTransform:'uppercase', padding:'8px 10px', borderBottom:'2px solid var(--border)', textAlign:'left', background:'var(--surface)', position:'sticky', top:0, zIndex:1, whiteSpace:'nowrap' },
  td: { fontFamily:'Barlow, sans-serif', fontSize:14, color:'var(--text)', padding:'8px 10px', borderBottom:'1px solid rgba(13,48,128,0.3)', verticalAlign:'middle' },
  tdSku: { fontFamily:'Barlow Condensed, sans-serif', fontSize:13, color:'var(--muted)', whiteSpace:'nowrap' },
  tdNombre: { maxWidth:250 },
  tr: { cursor:'default' },
  trInactivo: { opacity:0.45 },
  fotoBox: { width:40, height:40, borderRadius:6, overflow:'hidden', background:'var(--surface2)', border:'1px solid var(--border)', position:'relative', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 },
  foto: { position:'absolute', inset:0, width:'100%', height:'100%', objectFit:'cover' },
  toggleBtn: { fontFamily:'Barlow Condensed, sans-serif', fontWeight:800, fontSize:11, padding:'3px 10px', borderRadius:6, border:'none', cursor:'pointer', letterSpacing:1 },
  toggleActivo: { background:'rgba(34,197,94,0.15)', color:'#22c55e' },
  toggleInactivo: { background:'rgba(239,68,68,0.15)', color:'#ef4444' },
  editBtn: { background:'none', border:'1.5px solid var(--border)', borderRadius:6, fontSize:16, padding:'4px 8px', cursor:'pointer' },
  emptyText: { fontFamily:'Barlow, sans-serif', color:'var(--muted)', textAlign:'center', padding:40, fontSize:16 },
  overlay: { position:'fixed', inset:0, background:'rgba(0,0,10,0.85)', display:'flex', alignItems:'flex-end', justifyContent:'center', zIndex:300, backdropFilter:'blur(6px)' },
  modal: { background:'var(--surface)', borderRadius:'20px 20px 0 0', width:'100%', maxWidth:600, maxHeight:'90vh', display:'flex', flexDirection:'column', overflow:'hidden' },
  modalHeader: { display:'flex', justifyContent:'space-between', alignItems:'center', padding:'20px 24px 14px', borderBottom:'1px solid var(--border)', flexShrink:0 },
  modalTitle: { fontFamily:'Barlow Condensed, sans-serif', fontWeight:800, fontSize:22, color:'var(--accent)', letterSpacing:1 },
  closeBtn: { background:'none', border:'none', color:'var(--muted)', fontSize:20, cursor:'pointer' },
  formScroll: { flex:1, overflowY:'auto', padding:'16px 24px', display:'flex', flexDirection:'column', gap:14 },
  fieldGroup: { display:'flex', flexDirection:'column', gap:6 },
  fieldRow: { display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 },
  label: { fontFamily:'Barlow Condensed, sans-serif', fontSize:13, color:'var(--accent)', letterSpacing:1, fontWeight:700 },
  input: { background:'var(--surface2)', border:'1.5px solid var(--border)', borderRadius:8, color:'var(--text)', fontFamily:'Barlow, sans-serif', fontSize:16, padding:'10px 12px', outline:'none' },
  textarea: { background:'var(--surface2)', border:'1.5px solid var(--border)', borderRadius:8, color:'var(--text)', fontFamily:'Barlow, sans-serif', fontSize:15, padding:'10px 12px', outline:'none', resize:'vertical' },
  dispBtns: { display:'flex', gap:8 },
  dispBtnOpt: { flex:1, padding:'10px', background:'var(--surface2)', border:'1.5px solid var(--border)', borderRadius:8, color:'var(--muted)', fontFamily:'Barlow Condensed, sans-serif', fontWeight:700, fontSize:15, cursor:'pointer', letterSpacing:1 },
  dispBtnOptActive: { background:'rgba(245,200,0,0.12)', border:'1.5px solid var(--accent)', color:'var(--accent)' },
  fotoPreviewWrap: { width:'100%', height:160, borderRadius:10, overflow:'hidden', background:'var(--surface2)', border:'1.5px solid var(--border)', display:'flex', alignItems:'center', justifyContent:'center' },
  fotoPreviewImg: { width:'100%', height:'100%', objectFit:'cover' },
  fotoPreviewVacio: { display:'flex', alignItems:'center', justifyContent:'center', width:'100%', height:'100%' },
  fotoBtns: { display:'flex', gap:8, marginTop:6 },
  fotoBtn: { flex:1, padding:'10px', background:'var(--surface2)', border:'1.5px solid var(--border)', borderRadius:8, color:'var(--text)', fontFamily:'Barlow Condensed, sans-serif', fontWeight:700, fontSize:15, cursor:'pointer', letterSpacing:0.5 },
  fotoBtnBorrar: { flex:'0 0 auto', padding:'10px 14px', color:'#ef4444', border:'1.5px solid rgba(239,68,68,0.4)' },
  modalFooter: { display:'flex', gap:10, padding:'14px 24px', borderTop:'1px solid var(--border)', flexShrink:0 },
  cancelBtn: { flex:1, padding:'13px', background:'none', border:'1.5px solid var(--border)', borderRadius:8, color:'var(--muted)', fontFamily:'Barlow, sans-serif', fontSize:15, cursor:'pointer' },
  saveBtn: { flex:2, padding:'13px', background:'var(--accent)', border:'none', borderRadius:8, color:'#000', fontFamily:'Barlow Condensed, sans-serif', fontWeight:800, fontSize:17, cursor:'pointer', letterSpacing:1 },
  avisoSinCosto: { fontFamily:'Barlow, sans-serif', fontSize:12, fontWeight:600, color:'#f59e0b', marginTop:3 },
  sinCostoTab: { borderColor:'rgba(245,158,11,0.5)', color:'#f59e0b' },
  sinCostoTabActivo: { background:'rgba(245,158,11,0.15)', borderColor:'#f59e0b', color:'#f59e0b' },
}
