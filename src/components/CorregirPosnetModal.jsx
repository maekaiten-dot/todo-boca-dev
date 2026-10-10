// src/components/CorregirPosnetModal.jsx
// Ventana para corregir a mano el posnet de una venta (solo Admin). Pide el posnet correcto,
// el motivo y quién corrige; se usa en Hoy y en el detalle de ventas por día de Estadísticas.
import { useState } from 'react'
import { corregirPosnetVenta, MOTIVOS_CORRECCION_POSNET, POSNETS } from '../api/sheets.js'

const COLOR_POSNET = { AMARILLO: '#f5c800', BLANCO: '#f0f4ff' }

// Ventana para corregir a mano el posnet de una venta (pide motivo y quién corrige)
export default function CorregirPosnetModal({ venta, usuarios = [], perfilNombre = '', onCerrar, onGuardado }) {
  const empleados = usuarios.filter(u => u.nombre !== 'Tablet')
  const perfilEsEmpleado = empleados.some(u => u.nombre === perfilNombre)
  const otro = POSNETS.find(p => p !== venta.posnet) || ''
  const [nuevo, setNuevo] = useState(venta.posnet ? otro : '')
  const [motivo, setMotivo] = useState('')
  const [detalle, setDetalle] = useState('')
  const [quien, setQuien] = useState(perfilEsEmpleado ? perfilNombre : '')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')
  const falta = !nuevo ? 'Elegí el posnet correcto' : !motivo ? 'Elegí el motivo' : motivo === 'Otro' && !detalle.trim() ? 'Contá qué pasó' : !quien ? 'Elegí quién corrige' : ''

  async function guardar() {
    if (falta) return
    setGuardando(true); setError('')
    try {
      await corregirPosnetVenta({ idVenta: venta.idVenta, posnetNuevo: nuevo, motivo, detalle, quien })
      onGuardado(nuevo)
    } catch (e) {
      console.error(e)
      setError(e?.message === 'MISMO_POSNET' ? 'La venta ya tiene ese posnet.' : 'No se pudo guardar. Revisá la conexión.')
      setGuardando(false)
    }
  }

  return (
    <div style={S.overlay} onClick={() => !guardando && onCerrar()}>
      <div style={{ ...S.confirmBox, ...S.corrBox }} onClick={e => e.stopPropagation()}>
        <div style={{ ...S.confirmTitle, color: 'var(--accent)' }}>Corregir posnet</div>
        <div style={S.confirmSub}>
          Venta <strong style={{ color: 'var(--text)' }}>{venta.idVenta}</strong> · {venta.hora} · ${Math.round(venta.total).toLocaleString('es-AR')}<br />
          Registrado: <strong style={{ color: 'var(--text)' }}>{venta.posnet ? `posnet ${venta.posnet.toLowerCase()}` : 'sin posnet'}</strong>
        </div>

        <div style={S.corrLabel}>¿CON QUÉ POSNET SE COBRÓ?</div>
        <div style={S.corrGrid2}>
          {POSNETS.map(p => (
            <button key={p} disabled={p === venta.posnet} onClick={() => setNuevo(p)}
              style={{ ...S.corrPosnet, ...(nuevo === p ? S.corrActivo : {}), opacity: p === venta.posnet ? 0.35 : 1 }}>
              <span style={{ ...S.corrRect, background: COLOR_POSNET[p] }} />
              {p === 'AMARILLO' ? 'Amarillo' : 'Blanco'}{p === venta.posnet ? ' (actual)' : ''}
            </button>
          ))}
        </div>

        <div style={S.corrLabel}>¿POR QUÉ SE CORRIGE?</div>
        <div style={S.corrMotivos}>
          {MOTIVOS_CORRECCION_POSNET.map(m => (
            <button key={m} style={{ ...S.corrOpt, ...(motivo === m ? S.corrActivo : {}) }} onClick={() => setMotivo(m)}>{m}</button>
          ))}
        </div>
        <input style={S.corrInput} placeholder={motivo === 'Otro' ? 'Contá qué pasó (obligatorio)' : 'Detalle (opcional)'} value={detalle} maxLength={140} onChange={e => setDetalle(e.target.value)} />

        <div style={S.corrLabel}>¿QUIÉN CORRIGE?</div>
        <div style={S.corrGrid4}>
          {empleados.map(u => (
            <button key={u.id} style={{ ...S.corrOpt, textAlign: 'center', ...(quien === u.nombre ? S.corrActivo : {}) }} onClick={() => setQuien(u.nombre)}>{u.nombre}</button>
          ))}
        </div>

        {error && <div style={{ color: '#ef4444', fontFamily: 'Barlow, sans-serif', fontSize: 13, marginTop: 10 }}>{error}</div>}
        <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
          <button style={S.confirmCancel} onClick={onCerrar} disabled={guardando}>Cancelar</button>
          <button style={{ ...S.corrGuardar, opacity: falta || guardando ? 0.45 : 1 }} onClick={guardar} disabled={!!falta || guardando}>
            {guardando ? 'Guardando...' : 'Guardar corrección'}
          </button>
        </div>
        {falta && !guardando && <div style={{ fontFamily: 'Barlow, sans-serif', fontSize: 12, color: 'var(--muted)', marginTop: 8 }}>{falta}</div>}
      </div>
    </div>
  )
}


const S = {
  overlay: { position:'fixed', inset:0, background:'rgba(0,0,10,0.8)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:500, backdropFilter:'blur(6px)' },
  confirmBox: { background:'var(--surface)', border:'2px solid #ef4444', borderRadius:16, padding:28, width:320, textAlign:'center' },
  corrBox: { width:420, maxWidth:'calc(100% - 32px)', textAlign:'left', border:'2px solid var(--accent)', maxHeight:'90vh', overflowY:'auto' },
  confirmTitle: { fontFamily:'Barlow Condensed, sans-serif', fontWeight:800, fontSize:24, color:'#ef4444', marginBottom:10 },
  confirmSub: { fontFamily:'Barlow, sans-serif', fontSize:14, color:'var(--muted)', lineHeight:1.5 },
  corrLabel: { fontFamily:'Barlow Condensed, sans-serif', fontWeight:700, fontSize:13, color:'var(--muted)', letterSpacing:1.5, margin:'14px 0 6px' },
  corrGrid2: { display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 },
  corrGrid4: { display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(80px, 1fr))', gap:8 },
  corrMotivos: { display:'flex', flexDirection:'column', gap:6, marginBottom:8 },
  corrPosnet: { display:'flex', alignItems:'center', gap:10, padding:'12px', background:'var(--surface2)', border:'1.5px solid var(--border)', borderRadius:10, color:'var(--text)', fontFamily:'Barlow Condensed, sans-serif', fontWeight:700, fontSize:16, cursor:'pointer' },
  corrRect: { width:34, height:20, borderRadius:6, flexShrink:0 },
  corrOpt: { padding:'10px 12px', background:'var(--surface2)', border:'1.5px solid var(--border)', borderRadius:10, color:'var(--muted)', fontFamily:'Barlow, sans-serif', fontSize:14, cursor:'pointer', textAlign:'left' },
  corrActivo: { background:'rgba(245,200,0,0.12)', border:'1.5px solid var(--accent)', color:'var(--accent)' },
  corrInput: { width:'100%', fontFamily:'Barlow, sans-serif', fontSize:15, padding:'10px 12px', background:'var(--bg)', border:'1.5px solid var(--border)', borderRadius:10, color:'var(--text)' },
  confirmCancel: { flex:1, padding:'12px', background:'none', border:'1.5px solid var(--border)', borderRadius:8, color:'var(--muted)', fontFamily:'Barlow, sans-serif', fontSize:14, cursor:'pointer' },
  corrGuardar: { flex:2, padding:'12px', background:'var(--accent)', border:'none', borderRadius:8, color:'#000', fontFamily:'Barlow Condensed, sans-serif', fontWeight:800, fontSize:16, cursor:'pointer' },
}
