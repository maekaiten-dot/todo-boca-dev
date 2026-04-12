// src/pages/Pagos.jsx
import { useState, useEffect } from 'react'
import { getPagos, registrarPago, actualizarPago, anularPago, getArticulosAdmin } from '../api/sheets.js'
import BarcodeScanner from '../components/BarcodeScanner.jsx'

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
}

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

export default function Pagos({ empleado = '', usuarios = [] }) {
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
  const [confirmAnular, setConfirmAnular] = useState(null)
  const [anulando, setAnulando] = useState(false)
  const [scannerAbierto, setScannerAbierto] = useState(false)
  const [articulosMostrar, setArticulosMostrar] = useState(false)

  useEffect(() => { cargar() }, [])
  useEffect(() => { setForm(f => ({...f, empleado})) }, [empleado])

  async function cargar() {
    setLoading(true)
    setError(null)
    try {
      const [pgs, arts] = await Promise.all([getPagos(), getArticulosAdmin()])
      setPagos(pgs.sort((a, b) => {
        const fa = (a.fechaPago || a.fechaIngreso || '').split('/').reverse().join('')
        const fb = (b.fechaPago || b.fechaIngreso || '').split('/').reverse().join('')
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
    setForm({...FORM_VACIO, empleado, fechaPago: hoy()})
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
    })
    setArtBusqueda('')
    setModalAbierto(true)
  }

  function seleccionarArticulo(art) {
    setForm(f => ({...f, articuloId: art.id, articuloNombre: art.nombre, articuloFoto: art.foto, costoUnitario: String(art.costoUnitario || '0')}))
    setArtBusqueda('')
  }

  async function guardar() {
    if (form.tipo === 'MERCADERÍA' && !form.articuloId) { showToast('Seleccioná un artículo', 'error'); return }
    if (form.tipo === 'GASTO' && !form.descripcion.trim()) { showToast('Ingresá una descripción', 'error'); return }
    setSaving(true)
    try {
      if (editando) {
        const yaTeníaIngreso = !!editando.fechaIngreso
        const ahoraTenieIngreso = !!form.fechaIngreso
        await actualizarPago(editando.rowNum, {
          ...form, idPago: editando.idPago, anulado: editando.anulado,
          crearIngreso: !yaTeníaIngreso && ahoraTenieIngreso && form.tipo === 'MERCADERÍA',
        }, form.empleado)
        showToast('Pago actualizado', 'success')
      } else {
        await registrarPago(form)
        showToast('Pago registrado', 'success')
      }
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
      await anularPago(confirmAnular.rowNum, confirmAnular.idPago, empleado)
      showToast('Pago anulado', 'success')
      setConfirmAnular(null)
      await cargar()
    } catch (e) {
      showToast('Error al anular', 'error')
    } finally {
      setAnulando(false)
    }
  }

  function handleScan(codigo) {
    const art = articulos.find(a => a.id === codigo.trim())
    if (art) {
      seleccionarArticulo(art)
      setScannerAbierto(false)
      return { ok: true, nombre: art.nombre }
    }
    return { ok: false, nombre: `No encontrado: ${codigo}` }
  }

  function showToast(msg, type) {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3000)
  }

  const normalizr = str => str.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')

  const pagosFiltrados = pagos
    .filter(p => filtroEstado === 'TODOS' || getEstado(p) === filtroEstado)
    .filter(p => {
      if (!busqueda.trim()) return true
      const q = normalizr(busqueda)
      return normalizr(p.articuloNombre).includes(q) || normalizr(p.descripcion).includes(q) ||
        normalizr(p.proveedor).includes(q) || normalizr(p.idPago).includes(q)
    })

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

  const costoTotal = (Number(form.cantidad) || 0) * (Number(form.costoUnitario) || 0)

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
          <button style={S.newBtn} onClick={abrirNuevo}>+ Nuevo</button>
        </div>
      </div>

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

      {/* Tabla */}
      <div style={S.tableWrap}>
        {pagosFiltrados.length === 0 ? (
          <div style={S.emptyText}>Sin registros</div>
        ) : (
          <table style={S.table}>
            <thead>
              <tr>
                <th style={S.th}></th>
                <th style={S.th}>ID</th>
                <th style={S.th}>Tipo</th>
                <th style={S.th}>Descripción / Artículo</th>
                <th style={S.th}>F. Ingreso</th>
                <th style={S.th}>F. Pago</th>
                <th style={S.th}>Cant.</th>
                <th style={S.th}>Costo total</th>
                <th style={S.th}>Monto pagado</th>
                <th style={S.th}>Proveedor</th>
                <th style={S.th}>Empleado</th>
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
      </div>

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
                    <button key={t} style={{...S.tipoBtn, ...(form.tipo===t ? S.tipoBtnActive : {})}} onClick={() => setForm(f => ({...f, tipo:t}))}>
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

              {/* Monto pagado y pagado */}
              <div style={S.fieldRow}>
                <div style={S.fieldGroup}>
                  <label style={S.label}>MONTO PAGADO</label>
                  <input style={S.input} type="text" inputMode="numeric" value={form.montoPagado} onChange={e => setForm(f => ({...f, montoPagado: e.target.value}))} />
                  {form.tipo === 'MERCADERÍA' && costoTotal > 0 && (
                    <button style={S.hoyBtn} onClick={() => setForm(f => ({...f, montoPagado: String(costoTotal)}))}>= Costo total</button>
                  )}
                </div>
                <div style={S.fieldGroup}>
                  <label style={S.label}>¿PAGADO?</label>
                  <div style={S.tipoBtns}>
                    <button style={{...S.tipoBtn, ...(form.pagado ? S.tipoBtnActive : {})}} onClick={() => setForm(f => ({...f, pagado: true}))}>✓ Sí</button>
                    <button style={{...S.tipoBtn, ...(!form.pagado ? S.tipoBtnActive : {})}} onClick={() => setForm(f => ({...f, pagado: false}))}>✗ No</button>
                  </div>
                </div>
              </div>

              {/* Proveedor */}
              <div style={S.fieldGroup}>
                <label style={S.label}>PROVEEDOR</label>
                <input style={S.input} value={form.proveedor} onChange={e => setForm(f => ({...f, proveedor: e.target.value}))} placeholder="Nombre del proveedor..." />
              </div>

              {/* Empleado */}
              <div style={S.fieldGroup}>
                <label style={S.label}>EMPLEADO</label>
                <div style={S.empBtns}>
                  {usuarios.filter(u => u.nombre !== 'Tablet').map(u => (
                    <button key={u.id} style={{...S.empBtn, ...(form.empleado===u.nombre ? S.empBtnActive : {})}} onClick={() => setForm(f => ({...f, empleado: u.nombre}))}>
                      {u.nombre}
                    </button>
                  ))}
                </div>
              </div>

            </div>

            <div style={S.modalFooter}>
              <button style={S.cancelBtn} onClick={() => setModalAbierto(false)} disabled={saving}>Cancelar</button>
              <button style={{...S.saveBtn, opacity: saving ? 0.6 : 1}} onClick={guardar} disabled={saving}>
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
  toast: { position:'fixed', top:16, left:'50%', transform:'translateX(-50%)', zIndex:400, padding:'12px 28px', borderRadius:10, fontFamily:'Barlow Condensed, sans-serif', fontWeight:700, fontSize:18, whiteSpace:'nowrap', boxShadow:'0 4px 20px rgba(0,0,0,0.5)' },
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
  fieldRow: { display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 },
  label: { fontFamily:'Barlow Condensed, sans-serif', fontSize:13, color:'var(--accent)', letterSpacing:1, fontWeight:700 },
  input: { background:'var(--surface2)', border:'1.5px solid var(--border)', borderRadius:8, color:'var(--text)', fontFamily:'Barlow, sans-serif', fontSize:16, padding:'10px 12px', outline:'none' },
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
  qtyInput: { flex:1, background:'var(--surface2)', border:'1.5px solid var(--border)', borderRadius:8, color:'var(--text)', fontFamily:'Barlow Condensed, sans-serif', fontWeight:800, fontSize:20, padding:'8px 12px', outline:'none', textAlign:'center' },
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
