// src/pages/Articulos.jsx
import { useState, useEffect, useRef } from 'react'
import { getArticulosAdmin, generarIdArticulo, agregarArticulo, editarArticulo, toggleDisponibilidad } from '../api/sheets.js'

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
  const [filtroDisp, setFiltroDisp] = useState('TODOS')
  const [modalAbierto, setModalAbierto] = useState(false)
  const [editando, setEditando] = useState(null)
  const [form, setForm] = useState(FORM_VACIO)
  const [saving, setSaving] = useState(false)
  const [uploadingFoto, setUploadingFoto] = useState(false)
  const [toast, setToast] = useState(null)
  const fileInputCamara = useRef(null)
  const fileInputGaleria = useRef(null)

  useEffect(() => { cargar() }, [])

  async function cargar() {
    setLoading(true)
    setError(null)
    try {
      const data = await getArticulosAdmin()
      setArticulos(data)
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
      stockActual: art.stockActual,
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

  async function handleToggle(art) {
    const nueva = art.disponibilidad?.toUpperCase() === 'ACTIVO' ? 'INACTIVO' : 'ACTIVO'
    try {
      await toggleDisponibilidad(art.rowNum, art.id, nueva, empleado)
      setArticulos(prev => prev.map(a => a.rowNum === art.rowNum ? { ...a, disponibilidad: nueva } : a))
    } catch (e) {
      showToast('Error al cambiar disponibilidad', 'error')
    }
  }

  function showToast(msg, type) {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3000)
  }

  const normalizr = str => str.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  const articulosFiltrados = articulos
    .filter(a => esAdmin || a.disponibilidad?.toUpperCase() === 'ACTIVO')
    .filter(a => {
      if (filtroDisp === 'ACTIVO') return a.disponibilidad?.toUpperCase() === 'ACTIVO'
      if (filtroDisp === 'INACTIVO') return a.disponibilidad?.toUpperCase() !== 'ACTIVO'
      return true
    })
    .filter(a => {
      if (!busqueda.trim()) return true
      const q = normalizr(busqueda)
      return normalizr(a.nombre).includes(q) || normalizr(a.id).includes(q)
    })

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
      </div>

      <div style={S.conteo}>{articulosFiltrados.length} artículos</div>

      <div style={S.tableWrap}>
        <table style={S.table}>
          <thead>
            <tr>
              <th style={S.th}>Foto</th>
              <th style={S.th}>SKU</th>
              <th style={S.th}>Nombre</th>
              <th style={S.th}>Precio</th>
              {esAdmin && <th style={S.th}>Costo</th>}
              <th style={S.th}>Stock</th>
              <th style={S.th}>Estado</th>
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
                  <td style={{...S.td, ...S.tdNombre}}>{art.nombre}</td>
                  <td style={S.td}>${Number(String(art.precioUnitario).replace(/[$\s.]/g,'').replace(',','.')||0).toLocaleString('es-AR')}</td>
                  {esAdmin && <td style={{...S.td, color:'var(--muted)'}}>${Number(String(art.costoUnitario).replace(/[$\s.]/g,'').replace(',','.')||0).toLocaleString('es-AR')}</td>}
                  <td style={{...S.td, textAlign:'center'}}>{art.stockActual}</td>
                  <td style={S.td}>
                    {esAdmin
                      ? <button style={{...S.toggleBtn, ...(activo ? S.toggleActivo : S.toggleInactivo)}} onClick={() => handleToggle(art)}>{activo ? 'ACTIVO' : 'INACTIVO'}</button>
                      : <span style={{...S.toggleBtn, ...(activo ? S.toggleActivo : S.toggleInactivo)}}>{activo ? 'ACTIVO' : 'INACTIVO'}</span>
                    }
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

      {/* Modal formulario */}
      {modalAbierto && (
        <div style={S.overlay} onClick={() => !saving && setModalAbierto(false)}>
          <div style={S.modal} onClick={e => e.stopPropagation()}>
            <div style={S.modalHeader}>
              <div style={S.modalTitle}>{editando ? 'EDITAR ARTÍCULO' : 'NUEVO ARTÍCULO'}</div>
              <button style={S.closeBtn} onClick={() => setModalAbierto(false)}>✕</button>
            </div>

            <div style={S.formScroll}>

              <div style={S.fieldGroup}>
                <label style={S.label}>ID ARTÍCULO *</label>
                <input style={S.input} value={form.id} onChange={e => setForm(f => ({...f, id: e.target.value}))} />
              </div>

              <div style={S.fieldGroup}>
                <label style={S.label}>NOMBRE *</label>
                <input style={S.input} value={form.nombre} onChange={e => setForm(f => ({...f, nombre: e.target.value}))} />
              </div>

              <div style={S.fieldRow}>
                <div style={S.fieldGroup}>
                  <label style={S.label}>PRECIO UNITARIO</label>
                  <input style={S.input} type="text" inputMode="numeric" value={form.precioUnitario} onChange={e => setForm(f => ({...f, precioUnitario: e.target.value}))} />
                </div>
                <div style={S.fieldGroup}>
                  <label style={S.label}>COSTO UNITARIO</label>
                  <input style={S.input} type="text" inputMode="numeric" value={form.costoUnitario} onChange={e => setForm(f => ({...f, costoUnitario: e.target.value}))} />
                </div>
              </div>

              <div style={S.fieldRow}>
                <div style={S.fieldGroup}>
                  <label style={S.label}>STOCK INICIAL</label>
                  <input style={S.input} type="text" inputMode="numeric" value={form.stockInicial} onChange={e => setForm(f => ({...f, stockInicial: e.target.value}))} />
                </div>
                <div style={S.fieldGroup}>
                  <label style={S.label}>CANT. A REPONER</label>
                  <input style={S.input} type="text" inputMode="numeric" value={form.cantidadReponer} onChange={e => setForm(f => ({...f, cantidadReponer: e.target.value}))} />
                </div>
              </div>

              <div style={S.fieldGroup}>
                <label style={S.label}>DISPONIBILIDAD</label>
                <div style={S.dispBtns}>
                  {['ACTIVO','INACTIVO'].map(d => (
                    <button key={d} style={{...S.dispBtnOpt, ...(form.disponibilidad === d ? S.dispBtnOptActive : {})}} onClick={() => setForm(f => ({...f, disponibilidad: d}))}>
                      {d}
                    </button>
                  ))}
                </div>
              </div>

              <div style={S.fieldGroup}>
                <label style={S.label}>INFO</label>
                <textarea style={S.textarea} value={form.info} onChange={e => setForm(f => ({...f, info: e.target.value}))} rows={2} />
              </div>

              {/* FOTO */}
              <div style={S.fieldGroup}>
                <label style={S.label}>FOTO</label>

                {/* Preview */}
                <div style={S.fotoPreviewWrap}>
                  {form.foto ? (
                    <img src={form.foto} alt="" style={S.fotoPreviewImg} onError={e => e.currentTarget.style.display='none'} />
                  ) : (
                    <div style={S.fotoPreviewVacio}>
                      {uploadingFoto ? <span style={{fontSize:13, color:'var(--muted)'}}>Subiendo...</span> : <span style={{fontSize:32}}>📷</span>}
                    </div>
                  )}
                </div>

                {/* Botones foto */}
                <div style={S.fotoBtns}>
                  {/* Cámara trasera */}
                  <button
                    style={S.fotoBtn}
                    onClick={() => fileInputCamara.current?.click()}
                    disabled={uploadingFoto}
                  >
                    📷 Cámara
                  </button>
                  {/* Galería */}
                  <button
                    style={S.fotoBtn}
                    onClick={() => fileInputGaleria.current?.click()}
                    disabled={uploadingFoto}
                  >
                    🖼️ Galería
                  </button>
                  {/* Borrar foto */}
                  {form.foto && (
                    <button
                      style={{...S.fotoBtn, ...S.fotoBtnBorrar}}
                      onClick={() => setForm(f => ({...f, foto: ''}))}
                      disabled={uploadingFoto}
                    >
                      🗑️
                    </button>
                  )}
                </div>

                {/* Input cámara trasera */}
                <input
                  ref={fileInputCamara}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  style={{display:'none'}}
                  onChange={handleFotoSeleccionada}
                />
                {/* Input galería */}
                <input
                  ref={fileInputGaleria}
                  type="file"
                  accept="image/*"
                  style={{display:'none'}}
                  onChange={handleFotoSeleccionada}
                />

                {/* URL manual como alternativa */}
                <input
                  style={{...S.input, marginTop:6, fontSize:13}}
                  value={form.foto}
                  onChange={e => setForm(f => ({...f, foto: e.target.value}))}
                  placeholder="O pegá una URL manualmente..."
                />
              </div>

            </div>

            <div style={S.modalFooter}>
              <button style={S.cancelBtn} onClick={() => setModalAbierto(false)} disabled={saving}>Cancelar</button>
              <button style={{...S.saveBtn, opacity: (saving||uploadingFoto) ? 0.6 : 1}} onClick={guardar} disabled={saving||uploadingFoto}>
                {saving ? 'Guardando...' : uploadingFoto ? 'Subiendo foto...' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
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
}
