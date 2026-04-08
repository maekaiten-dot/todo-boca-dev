// src/pages/Ingresos.jsx
import { useState, useEffect } from 'react'
import { getIngresos, registrarIngreso, anularIngreso, getArticulosAdmin } from '../api/sheets.js'

const FORM_VACIO = {
  articuloId: '', articuloNombre: '', articuloFoto: '',
  cantidad: '1', costoUnitario: '0', proveedor: '',
}

export default function Ingresos({ empleado = '', usuarios = [] }) {
  const [ingresos, setIngresos] = useState([])
  const [articulos, setArticulos] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [modalAbierto, setModalAbierto] = useState(false)
  const [form, setForm] = useState(FORM_VACIO)
  const [formEmpleado, setFormEmpleado] = useState(empleado)
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState(null)
  const [busqueda, setBusqueda] = useState('')
  const [artBusqueda, setArtBusqueda] = useState('')
  const [confirmAnular, setConfirmAnular] = useState(null)
  const [anulando, setAnulando] = useState(false)

  useEffect(() => { cargar() }, [])
  useEffect(() => { setFormEmpleado(empleado) }, [empleado])

  async function cargar() {
    setLoading(true)
    setError(null)
    try {
      const [ing, arts] = await Promise.all([getIngresos(), getArticulosAdmin()])
      setIngresos(ing.sort((a, b) => {
        const fa = a.fecha?.split('/').reverse().join('') + a.hora
        const fb = b.fecha?.split('/').reverse().join('') + b.hora
        return fb.localeCompare(fa)
      }))
      setArticulos(arts.filter(a => a.disponibilidad?.toUpperCase() === 'ACTIVO'))
    } catch (e) {
      setError('No se pudo cargar.')
    } finally {
      setLoading(false)
    }
  }

  function abrirNuevo() {
    setForm(FORM_VACIO)
    setArtBusqueda('')
    setFormEmpleado(empleado)
    setModalAbierto(true)
  }

  function seleccionarArticulo(art) {
    setForm(f => ({
      ...f,
      articuloId: art.id,
      articuloNombre: art.nombre,
      articuloFoto: art.foto,
      costoUnitario: String(art.costoUnitario || '0'),
    }))
    setArtBusqueda('')
  }

  async function guardar() {
    if (!form.articuloId) { showToast('Seleccioná un artículo', 'error'); return }
    if (!form.cantidad || Number(form.cantidad) <= 0) { showToast('Cantidad inválida', 'error'); return }
    setSaving(true)
    try {
      const id = await registrarIngreso({
        articuloId: form.articuloId,
        articuloNombre: form.articuloNombre,
        cantidad: Number(form.cantidad),
        costoUnitario: form.costoUnitario,
        proveedor: form.proveedor,
        empleado: formEmpleado,
      })
      showToast(`Ingreso ${id} registrado ✓`, 'success')
      setModalAbierto(false)
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
      await anularIngreso(confirmAnular.rowNum, confirmAnular.idIngreso, empleado)
      showToast('Ingreso anulado', 'success')
      setConfirmAnular(null)
      await cargar()
    } catch (e) {
      showToast('Error al anular', 'error')
    } finally {
      setAnulando(false)
    }
  }

  function showToast(msg, type) {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3000)
  }

  const normalizr = str => str.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')

  const ingresosFiltrados = ingresos.filter(i => {
    if (!busqueda.trim()) return true
    const q = normalizr(busqueda)
    return normalizr(i.articuloNombre).includes(q) ||
      normalizr(i.articuloId).includes(q) ||
      normalizr(i.proveedor).includes(q) ||
      normalizr(i.idIngreso).includes(q)
  })

  const articulosFiltrados = artBusqueda.trim()
    ? articulos.filter(a => {
        const q = normalizr(artBusqueda)
        return normalizr(a.nombre).includes(q) || normalizr(a.id).includes(q)
      })
    : []

  const costoTotal = (Number(form.cantidad) || 0) * (Number(form.costoUnitario) || 0)

  if (loading) return <div style={S.center}><div style={S.loadingText}>Cargando ingresos...</div></div>
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
        <div style={S.headerTitle}>INGRESOS</div>
        <div style={{display:'flex', gap:8}}>
          <button style={S.refreshBtn} onClick={cargar}>↻</button>
          <button style={S.newBtn} onClick={abrirNuevo}>+ Nuevo ingreso</button>
        </div>
      </div>

      <div style={S.searchWrap}>
        <span style={S.searchIcon}>⌕</span>
        <input style={S.searchInput} value={busqueda} onChange={e => setBusqueda(e.target.value)} placeholder="Buscar por artículo, proveedor, ID..." />
        {busqueda && <button style={S.clearBtn} onClick={() => setBusqueda('')}>✕</button>}
      </div>

      <div style={S.tableWrap}>
        {ingresosFiltrados.length === 0 ? (
          <div style={S.emptyText}>Sin ingresos registrados</div>
        ) : (
          <table style={S.table}>
            <thead>
              <tr>
                <th style={S.th}>ID</th>
                <th style={S.th}>Fecha</th>
                <th style={S.th}>Artículo</th>
                <th style={S.th}>Cant.</th>
                <th style={S.th}>Costo unit.</th>
                <th style={S.th}>Costo total</th>
                <th style={S.th}>Proveedor</th>
                <th style={S.th}>Empleado</th>
                <th style={S.th}></th>
              </tr>
            </thead>
            <tbody>
              {ingresosFiltrados.map(ing => (
                <tr key={ing.rowNum} style={{...S.tr, ...(ing.anulado ? S.trAnulado : {})}}>
                  <td style={{...S.td, ...S.tdId}}>{ing.idIngreso}</td>
                  <td style={S.td}>{ing.fecha}</td>
                  <td style={{...S.td, ...S.tdNombre}}>
                    {ing.anulado && <span style={S.badgeAnulado}>ANULADO</span>}
                    {ing.articuloNombre || ing.articuloId}
                  </td>
                  <td style={{...S.td, textAlign:'center', fontWeight:700}}>{ing.cantidad}</td>
                  <td style={S.td}>${(ing.costoUnitario||0).toLocaleString('es-AR')}</td>
                  <td style={{...S.td, color:'var(--accent)', fontWeight:700}}>${(ing.costoTotal||0).toLocaleString('es-AR')}</td>
                  <td style={{...S.td, color:'var(--muted)'}}>{ing.proveedor}</td>
                  <td style={{...S.td, color:'var(--muted)'}}>{ing.empleado}</td>
                  <td style={S.td}>
                    {!ing.anulado && (
                      <button style={S.anularBtn} onClick={() => setConfirmAnular(ing)}>Anular</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Modal nuevo ingreso */}
      {modalAbierto && (
        <div style={S.overlay} onClick={() => !saving && setModalAbierto(false)}>
          <div style={S.modal} onClick={e => e.stopPropagation()}>
            <div style={S.modalHeader}>
              <div style={S.modalTitle}>NUEVO INGRESO</div>
              <button style={S.closeBtn} onClick={() => setModalAbierto(false)}>✕</button>
            </div>

            <div style={S.formScroll}>

              {/* Artículo */}
              <div style={S.fieldGroup}>
                <label style={S.label}>ARTÍCULO *</label>
                {form.articuloId ? (
                  <div style={S.artSeleccionado}>
                    {form.articuloFoto && <img src={form.articuloFoto} alt="" style={S.artFoto} onError={e => e.currentTarget.style.display='none'} />}
                    <div style={{flex:1}}>
                      <div style={{fontFamily:'Barlow, sans-serif', fontSize:15, color:'var(--text)'}}>{form.articuloNombre}</div>
                      <div style={{fontFamily:'Barlow Condensed, sans-serif', fontSize:13, color:'var(--muted)'}}>{form.articuloId}</div>
                    </div>
                    <button style={S.cambiarBtn} onClick={() => { setForm(f => ({...f, articuloId:'', articuloNombre:'', articuloFoto:''})); setArtBusqueda('') }}>Cambiar</button>
                  </div>
                ) : (
                  <div style={{position:'relative'}}>
                    <input
                      style={S.input}
                      value={artBusqueda}
                      onChange={e => setArtBusqueda(e.target.value)}
                      placeholder="Buscar artículo por nombre o SKU..."
                      autoFocus
                    />
                    {articulosFiltrados.length > 0 && (
                      <div style={S.artDropdown}>
                        {articulosFiltrados.slice(0, 8).map(a => (
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

              {/* Empleado */}
              <div style={S.fieldGroup}>
                <label style={S.label}>EMPLEADO</label>
                <div style={S.empBtns}>
                  {usuarios.filter(u => u.nombre !== 'Tablet').map(u => (
                    <button key={u.id} style={{...S.empBtn, ...(formEmpleado === u.nombre ? S.empBtnActive : {})}} onClick={() => setFormEmpleado(u.nombre)}>
                      {u.nombre}
                    </button>
                  ))}
                </div>
              </div>

              {/* Cantidad */}
              <div style={S.fieldGroup}>
                <label style={S.label}>CANTIDAD *</label>
                <div style={S.qtyWrap}>
                  <button style={S.qtyBtn} onClick={() => setForm(f => ({...f, cantidad: String(Math.max(1, Number(f.cantidad) - 1))}))}>−</button>
                  <input style={S.qtyInput} type="text" inputMode="numeric" value={form.cantidad} onChange={e => setForm(f => ({...f, cantidad: e.target.value}))} />
                  <button style={S.qtyBtn} onClick={() => setForm(f => ({...f, cantidad: String(Number(f.cantidad) + 1)}))}>+</button>
                </div>
              </div>

              {/* Costo unitario */}
              <div style={S.fieldGroup}>
                <label style={S.label}>COSTO UNITARIO</label>
                <input style={S.input} type="text" inputMode="numeric" value={form.costoUnitario} onChange={e => setForm(f => ({...f, costoUnitario: e.target.value}))} />
              </div>

              {/* Costo total calculado */}
              {costoTotal > 0 && (
                <div style={S.costoTotalWrap}>
                  <span style={{fontFamily:'Barlow Condensed, sans-serif', fontSize:14, color:'var(--muted)'}}>COSTO TOTAL</span>
                  <span style={{fontFamily:'Barlow Condensed, sans-serif', fontWeight:800, fontSize:24, color:'var(--accent)'}}>
                    ${costoTotal.toLocaleString('es-AR')}
                  </span>
                </div>
              )}

              {/* Proveedor */}
              <div style={S.fieldGroup}>
                <label style={S.label}>PROVEEDOR</label>
                <input style={S.input} value={form.proveedor} onChange={e => setForm(f => ({...f, proveedor: e.target.value}))} placeholder="Nombre del proveedor..." />
              </div>

            </div>

            <div style={S.modalFooter}>
              <button style={S.cancelBtn} onClick={() => setModalAbierto(false)} disabled={saving}>Cancelar</button>
              <button style={{...S.saveBtn, opacity: saving ? 0.6 : 1}} onClick={guardar} disabled={saving}>
                {saving ? 'Guardando...' : 'Registrar ingreso'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm anular */}
      {confirmAnular && (
        <div style={S.overlay} onClick={() => !anulando && setConfirmAnular(null)}>
          <div style={S.confirmBox} onClick={e => e.stopPropagation()}>
            <div style={S.confirmTitle}>¿Anular ingreso?</div>
            <div style={S.confirmSub}>
              <strong style={{color:'var(--accent)'}}>{confirmAnular.idIngreso}</strong><br/>
              {confirmAnular.articuloNombre} · x{confirmAnular.cantidad}
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
  newBtn: { background:'var(--accent)', border:'none', borderRadius:10, color:'#000', fontFamily:'Barlow Condensed, sans-serif', fontWeight:800, fontSize:15, padding:'0 16px', height:40, cursor:'pointer', letterSpacing:1 },
  searchWrap: { display:'flex', alignItems:'center', margin:'10px 20px 6px', background:'var(--surface)', border:'1.5px solid var(--border)', borderRadius:8, padding:'0 12px' },
  searchIcon: { fontSize:18, color:'var(--muted)' },
  searchInput: { flex:1, background:'none', border:'none', outline:'none', color:'var(--text)', fontFamily:'Barlow, sans-serif', fontSize:15, padding:'8px 6px' },
  clearBtn: { background:'none', border:'none', color:'var(--muted)', cursor:'pointer', fontSize:14 },
  tableWrap: { flex:1, overflowX:'auto', padding:'0 20px 20px' },
  table: { width:'100%', borderCollapse:'collapse' },
  th: { fontFamily:'Barlow Condensed, sans-serif', fontWeight:800, fontSize:12, color:'var(--muted)', letterSpacing:1, textTransform:'uppercase', padding:'8px 10px', borderBottom:'2px solid var(--border)', textAlign:'left', background:'var(--surface)', position:'sticky', top:0, zIndex:1, whiteSpace:'nowrap' },
  td: { fontFamily:'Barlow, sans-serif', fontSize:14, color:'var(--text)', padding:'8px 10px', borderBottom:'1px solid rgba(13,48,128,0.3)', verticalAlign:'middle' },
  tdId: { fontFamily:'Barlow Condensed, sans-serif', fontSize:12, color:'var(--muted)', whiteSpace:'nowrap' },
  tdNombre: { maxWidth:220 },
  tr: {},
  trAnulado: { opacity:0.4 },
  badgeAnulado: { fontFamily:'Barlow Condensed, sans-serif', fontWeight:800, fontSize:10, color:'#ef4444', background:'rgba(239,68,68,0.15)', borderRadius:4, padding:'1px 5px', marginRight:6, letterSpacing:1 },
  anularBtn: { background:'none', border:'1px solid rgba(239,68,68,0.4)', borderRadius:6, color:'rgba(239,68,68,0.8)', fontFamily:'Barlow Condensed, sans-serif', fontWeight:700, fontSize:11, padding:'3px 8px', cursor:'pointer', letterSpacing:0.5, textTransform:'uppercase' },
  emptyText: { fontFamily:'Barlow, sans-serif', color:'var(--muted)', textAlign:'center', padding:40, fontSize:16 },
  overlay: { position:'fixed', inset:0, background:'rgba(0,0,10,0.85)', display:'flex', alignItems:'flex-end', justifyContent:'center', zIndex:300, backdropFilter:'blur(6px)' },
  modal: { background:'var(--surface)', borderRadius:'20px 20px 0 0', width:'100%', maxWidth:560, maxHeight:'90vh', display:'flex', flexDirection:'column', overflow:'hidden' },
  modalHeader: { display:'flex', justifyContent:'space-between', alignItems:'center', padding:'20px 24px 14px', borderBottom:'1px solid var(--border)', flexShrink:0 },
  modalTitle: { fontFamily:'Barlow Condensed, sans-serif', fontWeight:800, fontSize:22, color:'var(--accent)', letterSpacing:1 },
  closeBtn: { background:'none', border:'none', color:'var(--muted)', fontSize:20, cursor:'pointer' },
  formScroll: { flex:1, overflowY:'auto', padding:'16px 24px', display:'flex', flexDirection:'column', gap:14 },
  fieldGroup: { display:'flex', flexDirection:'column', gap:6 },
  label: { fontFamily:'Barlow Condensed, sans-serif', fontSize:13, color:'var(--accent)', letterSpacing:1, fontWeight:700 },
  input: { background:'var(--surface2)', border:'1.5px solid var(--border)', borderRadius:8, color:'var(--text)', fontFamily:'Barlow, sans-serif', fontSize:16, padding:'10px 12px', outline:'none' },
  artSeleccionado: { display:'flex', alignItems:'center', gap:10, background:'var(--surface2)', border:'1.5px solid var(--accent)', borderRadius:8, padding:'10px 12px' },
  artFoto: { width:40, height:40, objectFit:'cover', borderRadius:6, flexShrink:0 },
  cambiarBtn: { background:'none', border:'1px solid var(--border)', borderRadius:6, color:'var(--muted)', fontFamily:'Barlow Condensed, sans-serif', fontWeight:700, fontSize:12, padding:'4px 10px', cursor:'pointer' },
  artDropdown: { position:'absolute', top:'100%', left:0, right:0, background:'var(--surface)', border:'1.5px solid var(--border)', borderRadius:8, zIndex:10, maxHeight:280, overflowY:'auto', boxShadow:'0 8px 24px rgba(0,0,0,0.4)' },
  artDropdownItem: { width:'100%', display:'flex', alignItems:'center', gap:10, padding:'10px 14px', background:'none', border:'none', borderBottom:'1px solid var(--border)', cursor:'pointer', textAlign:'left', color:'var(--text)' },
  artDropdownFoto: { width:36, height:36, objectFit:'cover', borderRadius:5, flexShrink:0 },
  empBtns: { display:'grid', gridTemplateColumns:'repeat(4, 1fr)', gap:6 },
  empBtn: { padding:'8px 6px', background:'var(--surface2)', border:'1.5px solid var(--border)', borderRadius:8, cursor:'pointer', color:'var(--muted)', fontFamily:'Barlow Condensed, sans-serif', fontWeight:700, fontSize:14, letterSpacing:0.5, textAlign:'center' },
  empBtnActive: { background:'rgba(245,200,0,0.12)', border:'1.5px solid var(--accent)', color:'var(--accent)' },
  qtyWrap: { display:'flex', alignItems:'center', gap:8 },
  qtyBtn: { width:44, height:44, background:'var(--border)', border:'none', borderRadius:8, color:'var(--text)', fontSize:22, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', fontWeight:700, flexShrink:0 },
  qtyInput: { flex:1, background:'var(--surface2)', border:'1.5px solid var(--border)', borderRadius:8, color:'var(--text)', fontFamily:'Barlow Condensed, sans-serif', fontWeight:800, fontSize:22, padding:'10px 12px', outline:'none', textAlign:'center' },
  costoTotalWrap: { display:'flex', justifyContent:'space-between', alignItems:'center', background:'var(--surface2)', borderRadius:8, padding:'12px 16px', border:'1.5px solid var(--border)' },
  modalFooter: { display:'flex', gap:10, padding:'14px 24px', borderTop:'1px solid var(--border)', flexShrink:0 },
  cancelBtn: { flex:1, padding:'13px', background:'none', border:'1.5px solid var(--border)', borderRadius:8, color:'var(--muted)', fontFamily:'Barlow, sans-serif', fontSize:15, cursor:'pointer' },
  saveBtn: { flex:2, padding:'13px', background:'var(--accent)', border:'none', borderRadius:8, color:'#000', fontFamily:'Barlow Condensed, sans-serif', fontWeight:800, fontSize:17, cursor:'pointer', letterSpacing:1 },
  confirmBox: { background:'var(--surface)', border:'2px solid #ef4444', borderRadius:16, padding:28, width:320, textAlign:'center', margin:'auto' },
  confirmTitle: { fontFamily:'Barlow Condensed, sans-serif', fontWeight:800, fontSize:22, color:'#ef4444', marginBottom:10 },
  confirmSub: { fontFamily:'Barlow, sans-serif', fontSize:14, color:'var(--muted)', lineHeight:1.6 },
  confirmCancel: { flex:1, padding:'11px', background:'none', border:'1.5px solid var(--border)', borderRadius:8, color:'var(--muted)', fontFamily:'Barlow, sans-serif', fontSize:14, cursor:'pointer' },
  confirmOk: { flex:1, padding:'11px', background:'#ef4444', border:'none', borderRadius:8, color:'#fff', fontFamily:'Barlow Condensed, sans-serif', fontWeight:700, fontSize:15, cursor:'pointer' },
}
