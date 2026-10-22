// src/components/ModalArticulo.jsx
// Ventana de artículo nuevo / editar artículo. La usan la pantalla Arts. y el escaneo de facturas
// (que la abre con el nombre y el costo leídos de la factura ya completos).
import { useState, useEffect, useRef } from 'react'
import { generarIdArticulo, agregarArticulo, editarArticulo } from '../api/sheets.js'
import HerramientasArticulo from './HerramientasArticulo.jsx'

const CLOUDINARY_CLOUD = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME
const CLOUDINARY_PRESET = import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET

export const FORM_ARTICULO_VACIO = {
  id: '', nombre: '', stockInicial: '0', info: '',
  disponibilidad: 'ACTIVO', foto: '',
  precioUnitario: '0', costoUnitario: '0',
  cantidadReponer: '0', stockCierre: '0', stockActual: '0', grupo: '',
}

async function subirFotoCloudinary(file) {
  const formData = new FormData()
  formData.append('file', file)
  formData.append('upload_preset', CLOUDINARY_PRESET)
  const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD}/image/upload`, { method: 'POST', body: formData })
  if (!res.ok) throw new Error('Error al subir foto')
  const data = await res.json()
  return data.secure_url
}

// inicial: valores del formulario (para uno nuevo puede venir sin id: se genera solo)
// editando: el artículo que se edita (con rowNum) o null si es nuevo
// onGuardado(form): después de guardar en la planilla
// articulos: lista de artículos (para sugerir los grupos que ya existen)
export default function ModalArticulo({ inicial, editando = null, empleado = '', onCerrar, onGuardado, aviso = '', articulos = [], stockMap = {} }) {
  const [ocupado, setOcupado] = useState(false)
  const [form, setForm] = useState({ ...FORM_ARTICULO_VACIO, ...inicial, grupo: inicial?.grupo || '' })
  // Grupos existentes con la cantidad de modelos de cada uno
  const grupos = (() => {
    const m = new Map()
    articulos.forEach(a => { const g = String(a.grupo || '').trim(); if (g) m.set(g, (m.get(g) || 0) + 1) })
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0], 'es'))
  })()
  const grupoNorm = String(form.grupo || '').trim().toLowerCase()
  const otrosDelGrupo = grupoNorm ? articulos.filter(a => a.id !== form.id && String(a.grupo || '').trim().toLowerCase() === grupoNorm) : []
  const [saving, setSaving] = useState(false)
  const [uploadingFoto, setUploadingFoto] = useState(false)
  const [error, setError] = useState('')
  const fileInputCamara = useRef(null)
  const fileInputGaleria = useRef(null)

  useEffect(() => {
    if (!editando && !form.id) generarIdArticulo().then(id => setForm(f => f.id ? f : { ...f, id })).catch(() => {})
  }, [])

  async function handleFotoSeleccionada(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadingFoto(true)
    try { const url = await subirFotoCloudinary(file); setForm(f => ({ ...f, foto: url })) }
    catch (err) { setError('Error al subir la foto') }
    finally { setUploadingFoto(false); e.target.value = '' }
  }

  async function guardar() {
    if (!String(form.id).trim() || !String(form.nombre).trim()) { setError('ID y Nombre son obligatorios'); return }
    setSaving(true); setError('')
    // Si escribió un grupo que ya existe con otras mayúsculas/espacios, usa el nombre existente
    const g = String(form.grupo || '').trim().replace(/\s+/g, ' ')
    const existente = grupos.find(([n]) => n.toLowerCase() === g.toLowerCase())
    const datos = { ...form, grupo: existente ? existente[0] : g }
    try {
      if (editando) await editarArticulo(editando.rowNum, datos, empleado)
      else await agregarArticulo(datos, empleado)
      await onGuardado?.(datos)
    } catch (e) {
      setError('Error al guardar')
    } finally {
      setSaving(false)
    }
  }

  return (
        <div style={S.overlay} onClick={() => !saving && !ocupado && onCerrar()}>
            <div style={S.modal} onClick={e => e.stopPropagation()}>
              <div style={S.modalHeader}>
                <div style={S.modalTitle}>{editando ? 'EDITAR ARTÍCULO' : 'NUEVO ARTÍCULO'}</div>
                <button style={S.closeBtn} onClick={() => onCerrar()}>✕</button>
              </div>
  
              <div style={S.formScroll}>
              {aviso && <div style={S.aviso}>{aviso}</div>}
              {error && <div style={S.error}>{error}</div>}
  
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
                  <label style={S.label}>GRUPO</label>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input style={{ ...S.input, flex: 1 }} list="tb-grupos-articulo" value={form.grupo} placeholder="Ej: Bufanda $22.000 (vacío = sin grupo)"
                      onChange={e => setForm(f => ({...f, grupo: e.target.value}))} />
                    {form.grupo && <button style={{ ...S.fotoBtn, ...S.fotoBtnBorrar, marginTop: 0 }} title="Sacar del grupo" onClick={() => setForm(f => ({...f, grupo: ''}))}>✕</button>}
                  </div>
                  <datalist id="tb-grupos-articulo">
                    {grupos.map(([n, c]) => <option key={n} value={n}>{c} {c === 1 ? 'modelo' : 'modelos'}</option>)}
                  </datalist>
                  <div style={S.ayuda}>
                    {grupoNorm
                      ? otrosDelGrupo.length
                        ? `Se suma en Rotación con ${otrosDelGrupo.length} ${otrosDelGrupo.length === 1 ? 'modelo más' : 'modelos más'}: ${otrosDelGrupo.slice(0, 4).map(a => a.nombre).join(', ')}${otrosDelGrupo.length > 4 ? '…' : ''}`
                        : 'Grupo nuevo: poné el mismo nombre en los otros modelos para que se sumen.'
                      : 'Los modelos del mismo producto con el mismo grupo se suman en Rotación.'}
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
  
                {editando && (
                  <HerramientasArticulo editando={editando} form={form} articulos={articulos} stockMap={stockMap} empleado={empleado}
                    ocupado={ocupado || saving} setOcupado={setOcupado} onListo={msg => onGuardado?.(form, msg)} />
                )}
              </div>
  
              <div style={S.modalFooter}>
                <button style={S.cancelBtn} onClick={() => onCerrar()} disabled={saving}>Cancelar</button>
                <button style={{...S.saveBtn, opacity: (saving||uploadingFoto) ? 0.6 : 1}} onClick={guardar} disabled={saving||uploadingFoto||ocupado}>
                  {saving ? 'Guardando...' : uploadingFoto ? 'Subiendo foto...' : 'Guardar'}
                </button>
              </div>
            </div>
          </div>
  )
}

const S = {
  overlay: { position:'fixed', inset:0, background:'rgba(0,0,10,0.85)', display:'flex', alignItems:'flex-end', justifyContent:'center', zIndex:500, backdropFilter:'blur(6px)' },
  modal: { background:'var(--surface)', borderRadius:'20px 20px 0 0', width:'100%', maxWidth:600, maxHeight:'90vh', display:'flex', flexDirection:'column', overflow:'hidden' },
  modalHeader: { display:'flex', justifyContent:'space-between', alignItems:'center', padding:'20px 24px 14px', borderBottom:'1px solid var(--border)', flexShrink:0 },
  modalTitle: { fontFamily:'Barlow Condensed, sans-serif', fontWeight:800, fontSize:22, color:'var(--accent)', letterSpacing:1 },
  closeBtn: { background:'none', border:'none', color:'var(--muted)', fontSize:20, cursor:'pointer' },
  formScroll: { flex:1, overflowY:'auto', padding:'16px 24px', display:'flex', flexDirection:'column', gap:14 },
  fieldGroup: { display:'flex', flexDirection:'column', gap:6 },
  label: { fontFamily:'Barlow Condensed, sans-serif', fontSize:13, color:'var(--accent)', letterSpacing:1, fontWeight:700 },
  input: { background:'var(--surface2)', border:'1.5px solid var(--border)', borderRadius:8, color:'var(--text)', fontFamily:'Barlow, sans-serif', fontSize:16, padding:'10px 12px', outline:'none' },
  fieldRow: { display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 },
  dispBtns: { display:'flex', gap:8 },
  dispBtnOpt: { flex:1, padding:'10px', background:'var(--surface2)', border:'1.5px solid var(--border)', borderRadius:8, color:'var(--muted)', fontFamily:'Barlow Condensed, sans-serif', fontWeight:700, fontSize:15, cursor:'pointer', letterSpacing:1 },
  dispBtnOptActive: { background:'rgba(245,200,0,0.12)', border:'1.5px solid var(--accent)', color:'var(--accent)' },
  textarea: { background:'var(--surface2)', border:'1.5px solid var(--border)', borderRadius:8, color:'var(--text)', fontFamily:'Barlow, sans-serif', fontSize:15, padding:'10px 12px', outline:'none', resize:'vertical' },
  fotoPreviewWrap: { width:'100%', height:160, borderRadius:10, overflow:'hidden', background:'var(--surface2)', border:'1.5px solid var(--border)', display:'flex', alignItems:'center', justifyContent:'center' },
  fotoPreviewImg: { width:'100%', height:'100%', objectFit:'cover' },
  fotoPreviewVacio: { display:'flex', alignItems:'center', justifyContent:'center', width:'100%', height:'100%' },
  fotoBtns: { display:'flex', gap:8, marginTop:6 },
  fotoBtn: { flex:1, padding:'10px', background:'var(--surface2)', border:'1.5px solid var(--border)', borderRadius:8, color:'var(--text)', fontFamily:'Barlow Condensed, sans-serif', fontWeight:700, fontSize:15, cursor:'pointer', letterSpacing:0.5 },
  fotoBtnBorrar: { flex:'0 0 auto', padding:'10px 14px', color:'#ef4444', border:'1.5px solid rgba(239,68,68,0.4)' },
  modalFooter: { display:'flex', gap:10, padding:'14px 24px', borderTop:'1px solid var(--border)', flexShrink:0 },
  cancelBtn: { flex:1, padding:'13px', background:'none', border:'1.5px solid var(--border)', borderRadius:8, color:'var(--muted)', fontFamily:'Barlow, sans-serif', fontSize:15, cursor:'pointer' },
  saveBtn: { flex:2, padding:'13px', background:'var(--accent)', border:'none', borderRadius:8, color:'#000', fontFamily:'Barlow Condensed, sans-serif', fontWeight:800, fontSize:17, cursor:'pointer', letterSpacing:1 },
  aviso: { fontFamily:'Barlow, sans-serif', fontSize:13, color:'var(--text)', background:'rgba(245,200,0,0.1)', border:'1px solid var(--accent)', borderRadius:8, padding:'8px 12px', marginBottom:10 },
  ayuda: { fontFamily:'Barlow, sans-serif', fontSize:12, color:'var(--muted)', lineHeight:1.35 },
  error: { fontFamily:'Barlow, sans-serif', fontSize:13, color:'#ef4444', marginBottom:8 },
}
