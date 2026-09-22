// src/pages/GastosFijos.jsx
import { useState, useEffect } from 'react'
import {
  getGastosFijos, agregarGastoFijo, editarGastoFijo, eliminarGastoFijo,
  togglePagoGastoFijo, cerrarMesGastosFijos
} from '../api/sheets.js'

const SEMANAS = ['1ra semana', '2da semana', '3ra semana', '4ta semana']
const FORM_VACIO = { concepto: '', monto: '', semana: '1ra semana' }

function getMesActual() {
  const now = new Date()
  const y = now.toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', year: 'numeric' })
  const m = now.toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', month: '2-digit' })
  return `${y}-${m}`
}

export default function GastosFijos({ soloLectura = false }) {
  const [gastos, setGastos] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [modalAbierto, setModalAbierto] = useState(false)
  const [editando, setEditando] = useState(null)
  const [form, setForm] = useState(FORM_VACIO)
  const [saving, setSaving] = useState(false)
  const [confirmEliminar, setConfirmEliminar] = useState(null)
  const [eliminando, setEliminando] = useState(false)
  const [toggling, setToggling] = useState(null) // rowNum en proceso
  const [toast, setToast] = useState(null)

  useEffect(() => { cargar() }, [])

  async function cargar() {
    setLoading(true)
    setError(null)
    try {
      const data = await getGastosFijos()
      const mesActual = getMesActual()

      // Detectar si hay gastos de un mes anterior → cerrar mes automáticamente
      const hayMesAnterior = data.some(g => g.mesActivo && g.mesActivo !== mesActual)
      if (hayMesAnterior) {
        await cerrarMesGastosFijos(data, mesActual)
        const fresco = await getGastosFijos()
        setGastos(fresco)
      } else {
        setGastos(data)
      }
    } catch (e) {
      setError('No se pudo cargar.')
    } finally {
      setLoading(false)
    }
  }

  async function togglePago(gasto) {
    if (soloLectura) return
    setToggling(gasto.rowNum)
    try {
      const mesActual = getMesActual()
      await togglePagoGastoFijo(gasto.rowNum, !gasto.pagado, mesActual)
      setGastos(prev => prev.map(g =>
        g.rowNum === gasto.rowNum
          ? { ...g, pagado: !g.pagado, fechaPago: !g.pagado ? new Date().toLocaleDateString('es-AR') : '', mesActivo: mesActual }
          : g
      ))
    } catch (e) {
      showToast('Error al actualizar', 'error')
    } finally {
      setToggling(null)
    }
  }

  function abrirNuevo() {
    setEditando(null)
    setForm(FORM_VACIO)
    setModalAbierto(true)
  }

  function abrirEditar(gasto) {
    setEditando(gasto)
    setForm({ concepto: gasto.concepto, monto: String(gasto.monto), semana: gasto.semana })
    setModalAbierto(true)
  }

  async function guardar() {
    if (!form.concepto.trim()) { showToast('Ingresá un concepto', 'error'); return }
    if (!form.monto || Number(form.monto) <= 0) { showToast('Ingresá un monto válido', 'error'); return }
    setSaving(true)
    try {
      if (editando) {
        await editarGastoFijo(editando.rowNum, { concepto: form.concepto.trim(), monto: Number(form.monto), semana: form.semana })
        showToast('Gasto actualizado ✓', 'success')
      } else {
        await agregarGastoFijo({ concepto: form.concepto.trim(), monto: Number(form.monto), semana: form.semana })
        showToast('Gasto agregado ✓', 'success')
      }
      setModalAbierto(false)
      await cargar()
    } catch (e) {
      showToast('Error al guardar', 'error')
    } finally {
      setSaving(false)
    }
  }

  async function confirmarEliminar() {
    setEliminando(true)
    try {
      await eliminarGastoFijo(confirmEliminar.rowNum)
      showToast('Gasto eliminado', 'success')
      setConfirmEliminar(null)
      await cargar()
    } catch (e) {
      showToast('Error al eliminar', 'error')
    } finally {
      setEliminando(false)
    }
  }

  function showToast(msg, type) {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3000)
  }

  const porSemana = SEMANAS.map(semana => ({
    semana,
    items: gastos.filter(g => g.semana === semana),
    total: gastos.filter(g => g.semana === semana).reduce((s, g) => s + g.monto, 0),
    totalPagado: gastos.filter(g => g.semana === semana && g.pagado).reduce((s, g) => s + g.monto, 0),
  }))
  const totalMensual = gastos.reduce((s, g) => s + g.monto, 0)
  const totalPagado = gastos.filter(g => g.pagado).reduce((s, g) => s + g.monto, 0)

  if (loading) return <div style={S.center}><div style={S.loadingText}>Cargando gastos fijos...</div></div>
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
        <div style={S.headerTitle}>GASTOS FIJOS</div>
        <div style={{display:'flex', gap:8}}>
          <button style={S.refreshBtn} onClick={cargar}>↻</button>
          {!soloLectura && <button style={S.newBtn} onClick={abrirNuevo}>+ Nuevo</button>}
        </div>
      </div>

      {soloLectura && (
        <div style={S.infoBar}>
          <span style={S.infoText}>📋 Solo lectura — los gastos fijos los administra Adrián</span>
        </div>
      )}

      {/* Totales */}
      <div style={S.totalesRow}>
        <div style={S.totalCard}>
          <div style={S.totalLabel}>TOTAL MENSUAL</div>
          <div style={S.totalMonto}>${totalMensual.toLocaleString('es-AR')}</div>
        </div>
        <div style={{...S.totalCard, border:'2px solid #22c55e'}}>
          <div style={S.totalLabel}>PAGADO</div>
          <div style={{...S.totalMonto, color:'#22c55e'}}>${totalPagado.toLocaleString('es-AR')}</div>
        </div>
        <div style={{...S.totalCard, border:'2px solid #ef4444'}}>
          <div style={S.totalLabel}>PENDIENTE</div>
          <div style={{...S.totalMonto, color:'#ef4444'}}>${(totalMensual - totalPagado).toLocaleString('es-AR')}</div>
        </div>
      </div>

      {/* Por semana */}
      <div style={S.scrollArea}>
        {porSemana.map(({ semana, items, total, totalPagado: pagadoSemana }) => (
          <div key={semana} style={S.semanaBlock}>
            <div style={S.semanaHeader}>
              <span style={S.semanaLabel}>{semana.toUpperCase()}</span>
              <div style={{display:'flex', alignItems:'center', gap:12}}>
                {pagadoSemana > 0 && (
                  <span style={{fontFamily:'Barlow Condensed, sans-serif', fontSize:14, color:'#22c55e'}}>
                    ✓ ${pagadoSemana.toLocaleString('es-AR')}
                  </span>
                )}
                <span style={S.semanadTotal}>${total.toLocaleString('es-AR')}</span>
              </div>
            </div>
            {items.length === 0 ? (
              <div style={S.emptyRow}>Sin gastos cargados para esta semana</div>
            ) : items.map(g => (
              <div key={g.rowNum} style={{...S.gastoRow, ...(g.pagado ? S.gastoRowPagado : {})}}>
                {/* Botón tilde */}
                <button
                  style={{...S.tildeBtn, ...(g.pagado ? S.tildeBtnActivo : {})}}
                  onClick={() => togglePago(g)}
                  disabled={toggling === g.rowNum || soloLectura}
                  title={g.pagado ? `Pagado el ${g.fechaPago}` : 'Marcar como pagado'}
                >
                  {toggling === g.rowNum ? '…' : g.pagado ? '✓' : '○'}
                </button>
                <div style={{flex:1}}>
                  <div style={{...S.gastoConcepto, ...(g.pagado ? {color:'#22c55e'} : {})}}>
                    {g.concepto}
                  </div>
                  {g.pagado && g.fechaPago && (
                    <div style={S.fechaPago}>pagado el {g.fechaPago}</div>
                  )}
                </div>
                <div style={{...S.gastoMonto, ...(g.pagado ? {color:'#22c55e'} : {})}}>
                  ${g.monto.toLocaleString('es-AR')}
                </div>
                {!soloLectura && (
                  <div style={S.gastoBtns}>
                    <button style={S.editBtn} onClick={() => abrirEditar(g)}>✏️</button>
                    <button style={S.deleteBtn} onClick={() => setConfirmEliminar(g)}>🗑️</button>
                  </div>
                )}
              </div>
            ))}
          </div>
        ))}
      </div>

      {/* Modal nuevo/editar */}
      {modalAbierto && (
        <div style={S.overlay} onClick={() => !saving && setModalAbierto(false)}>
          <div style={S.modal} onClick={e => e.stopPropagation()}>
            <div style={S.modalHeader}>
              <div style={S.modalTitle}>{editando ? 'EDITAR GASTO' : 'NUEVO GASTO'}</div>
              <button style={S.closeBtn} onClick={() => setModalAbierto(false)}>✕</button>
            </div>
            <div style={S.formBody}>
              <div style={S.fieldGroup}>
                <label style={S.label}>CONCEPTO *</label>
                <input style={S.input} value={form.concepto}
                  onChange={e => setForm(f => ({...f, concepto: e.target.value}))}
                  placeholder="Ej: Alquiler, Sueldo Jorge, Monotributo..." autoFocus />
              </div>
              <div style={S.fieldGroup}>
                <label style={S.label}>MONTO *</label>
                <input style={S.input} type="text" inputMode="numeric" value={form.monto}
                  onChange={e => setForm(f => ({...f, monto: e.target.value}))} placeholder="0" />
              </div>
              <div style={S.fieldGroup}>
                <label style={S.label}>SEMANA DEL MES</label>
                <div style={S.semanaBtns}>
                  {SEMANAS.map(s => (
                    <button key={s}
                      style={{...S.semanaBtn, ...(form.semana === s ? S.semanaBtnActive : {})}}
                      onClick={() => setForm(f => ({...f, semana: s}))}>
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div style={S.modalFooter}>
              <button style={S.cancelBtn} onClick={() => setModalAbierto(false)} disabled={saving}>Cancelar</button>
              <button style={{...S.saveBtn, opacity: saving ? 0.6 : 1}} onClick={guardar} disabled={saving}>
                {saving ? 'Guardando...' : editando ? 'Guardar cambios' : 'Agregar gasto'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm eliminar */}
      {confirmEliminar && (
        <div style={S.overlay} onClick={() => !eliminando && setConfirmEliminar(null)}>
          <div style={S.confirmBox} onClick={e => e.stopPropagation()}>
            <div style={S.confirmTitle}>¿Eliminar gasto?</div>
            <div style={S.confirmSub}>
              <strong style={{color:'var(--accent)'}}>{confirmEliminar.concepto}</strong><br/>
              ${confirmEliminar.monto.toLocaleString('es-AR')} · {confirmEliminar.semana}
            </div>
            <div style={{display:'flex', gap:10, marginTop:20}}>
              <button style={S.confirmCancel} onClick={() => setConfirmEliminar(null)} disabled={eliminando}>Cancelar</button>
              <button style={S.confirmOk} onClick={confirmarEliminar} disabled={eliminando}>
                {eliminando ? 'Eliminando...' : 'Sí, eliminar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const S = {
  page: { display:'flex', flexDirection:'column', height:'100%', overflow:'hidden', position:'relative' },
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
  infoBar: { margin:'10px 20px 0', background:'rgba(59,130,246,0.1)', border:'1px solid rgba(59,130,246,0.3)', borderRadius:8, padding:'8px 14px' },
  infoText: { fontFamily:'Barlow, sans-serif', fontSize:13, color:'#93c5fd' },
  totalesRow: { display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:10, margin:'14px 20px 0', flexShrink:0 },
  totalCard: { background:'var(--surface)', border:'2px solid var(--accent)', borderRadius:12, padding:'12px 16px', display:'flex', flexDirection:'column', gap:4 },
  totalLabel: { fontFamily:'Barlow Condensed, sans-serif', fontSize:11, color:'var(--muted)', letterSpacing:1 },
  totalMonto: { fontFamily:'Barlow Condensed, sans-serif', fontWeight:800, fontSize:24, color:'var(--accent)' },
  scrollArea: { flex:1, overflowY:'auto', padding:'14px 20px 20px', display:'flex', flexDirection:'column', gap:16 },
  semanaBlock: { background:'var(--surface)', border:'1.5px solid var(--border)', borderRadius:12, overflow:'visible' },
  semanaHeader: { display:'flex', justifyContent:'space-between', alignItems:'center', padding:'10px 16px', background:'var(--surface2)', borderBottom:'1.5px solid var(--border)', borderRadius:'12px 12px 0 0' },
  semanaLabel: { fontFamily:'Barlow Condensed, sans-serif', fontWeight:800, fontSize:14, color:'var(--accent)', letterSpacing:2 },
  semanadTotal: { fontFamily:'Barlow Condensed, sans-serif', fontWeight:700, fontSize:18, color:'var(--text)' },
  gastoRow: { display:'flex', alignItems:'center', gap:10, padding:'10px 16px', borderBottom:'1px solid rgba(13,48,128,0.3)' },
  gastoRowPagado: { background:'rgba(34,197,94,0.05)' },
  tildeBtn: { width:32, height:32, borderRadius:'50%', border:'2px solid var(--border)', background:'none', color:'var(--muted)', fontSize:16, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, fontWeight:700, transition:'all 0.15s' },
  tildeBtnActivo: { border:'2px solid #22c55e', background:'rgba(34,197,94,0.15)', color:'#22c55e' },
  gastoConcepto: { fontFamily:'Barlow, sans-serif', fontSize:15, color:'var(--text)' },
  fechaPago: { fontFamily:'Barlow Condensed, sans-serif', fontSize:12, color:'#22c55e', opacity:0.7, marginTop:2 },
  gastoMonto: { fontFamily:'Barlow Condensed, sans-serif', fontWeight:700, fontSize:17, color:'var(--accent)', flexShrink:0 },
  gastoBtns: { display:'flex', gap:6, flexShrink:0 },
  editBtn: { background:'none', border:'1px solid var(--border)', borderRadius:6, fontSize:15, padding:'4px 8px', cursor:'pointer' },
  deleteBtn: { background:'none', border:'1px solid rgba(239,68,68,0.3)', borderRadius:6, fontSize:15, padding:'4px 8px', cursor:'pointer' },
  emptyRow: { padding:'14px 16px', fontFamily:'Barlow, sans-serif', fontSize:14, color:'var(--muted)', fontStyle:'italic' },
  overlay: { position:'fixed', inset:0, background:'rgba(0,0,10,0.85)', display:'flex', alignItems:'flex-end', justifyContent:'center', zIndex:300, backdropFilter:'blur(6px)' },
  modal: { background:'var(--surface)', borderRadius:'20px 20px 0 0', width:'100%', maxWidth:520, display:'flex', flexDirection:'column', overflow:'hidden' },
  modalHeader: { display:'flex', justifyContent:'space-between', alignItems:'center', padding:'20px 24px 14px', borderBottom:'1px solid var(--border)', flexShrink:0 },
  modalTitle: { fontFamily:'Barlow Condensed, sans-serif', fontWeight:800, fontSize:22, color:'var(--accent)', letterSpacing:1 },
  closeBtn: { background:'none', border:'none', color:'var(--muted)', fontSize:20, cursor:'pointer' },
  formBody: { padding:'20px 24px', display:'flex', flexDirection:'column', gap:16 },
  fieldGroup: { display:'flex', flexDirection:'column', gap:6 },
  label: { fontFamily:'Barlow Condensed, sans-serif', fontSize:13, color:'var(--accent)', letterSpacing:1, fontWeight:700 },
  input: { background:'var(--surface2)', border:'1.5px solid var(--border)', borderRadius:8, color:'var(--text)', fontFamily:'Barlow, sans-serif', fontSize:16, padding:'10px 12px', outline:'none' },
  semanaBtns: { display:'grid', gridTemplateColumns:'repeat(4, 1fr)', gap:6 },
  semanaBtn: { padding:'10px 6px', background:'var(--surface2)', border:'1.5px solid var(--border)', borderRadius:8, cursor:'pointer', color:'var(--muted)', fontFamily:'Barlow Condensed, sans-serif', fontWeight:700, fontSize:13, textAlign:'center' },
  semanaBtnActive: { background:'rgba(245,200,0,0.12)', border:'1.5px solid var(--accent)', color:'var(--accent)' },
  modalFooter: { display:'flex', gap:10, padding:'14px 24px', borderTop:'1px solid var(--border)', flexShrink:0 },
  cancelBtn: { flex:1, padding:'13px', background:'none', border:'1.5px solid var(--border)', borderRadius:8, color:'var(--muted)', fontFamily:'Barlow, sans-serif', fontSize:15, cursor:'pointer' },
  saveBtn: { flex:2, padding:'13px', background:'var(--accent)', border:'none', borderRadius:8, color:'#000', fontFamily:'Barlow Condensed, sans-serif', fontWeight:800, fontSize:17, cursor:'pointer', letterSpacing:1 },
  confirmBox: { background:'var(--surface)', border:'2px solid #ef4444', borderRadius:16, padding:28, width:320, textAlign:'center', margin:'auto' },
  confirmTitle: { fontFamily:'Barlow Condensed, sans-serif', fontWeight:800, fontSize:22, color:'#ef4444', marginBottom:10 },
  confirmSub: { fontFamily:'Barlow, sans-serif', fontSize:14, color:'var(--muted)', lineHeight:1.6 },
  confirmCancel: { flex:1, padding:'11px', background:'none', border:'1.5px solid var(--border)', borderRadius:8, color:'var(--muted)', fontFamily:'Barlow, sans-serif', fontSize:14, cursor:'pointer' },
  confirmOk: { flex:1, padding:'11px', background:'#ef4444', border:'none', borderRadius:8, color:'#fff', fontFamily:'Barlow Condensed, sans-serif', fontWeight:700, fontSize:15, cursor:'pointer' },
}
