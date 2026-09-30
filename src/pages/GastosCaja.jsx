// src/pages/GastosCaja.jsx
// Registro de movimientos de efectivo de la caja (gastos del día, cambios por transferencia, etc.).
// Visible para todos los usuarios. Se guarda en la hoja GASTOS CAJA.
import { useState, useEffect } from 'react'
import { getGastosCajaHoy, registrarGastoCaja, anularGastoCaja } from '../api/sheets.js'

export const CATEGORIAS_CAJA = {
  SALIDA: [
    { id: 'Comida y bebida', icon: '🍪', ayuda: 'Galletitas, café, almuerzo…' },
    { id: 'Limpieza', icon: '🧽', ayuda: 'Artículos de limpieza' },
    { id: 'Insumos del local', icon: '📎', ayuda: 'Bolsas, cinta, librería…' },
    { id: 'Efectivo por transferencia', icon: '🔁', ayuda: 'Te transfirieron y diste efectivo' },
    { id: 'Otro', icon: '📝', ayuda: 'Contá en el detalle qué fue' },
  ],
  ENTRADA: [
    { id: 'Transferencia por efectivo', icon: '🔁', ayuda: 'Te dieron efectivo y vos transferiste' },
    { id: 'Otro', icon: '📝', ayuda: 'Contá en el detalle qué fue' },
  ],
}

const fmt$ = n => '$' + Math.round(n).toLocaleString('es-AR')
// "12.500" o "12500" o "12500,50" → 12500.5
const parseMonto = v => Number(String(v || '').replace(/[$\s.]/g, '').replace(',', '.')) || 0

export default function GastosCaja({ usuarios = [], perfilNombre = '', onRegistrado }) {
  const empleados = usuarios.filter(u => u.nombre !== 'Tablet')
  const perfilEsEmpleado = empleados.some(u => u.nombre === perfilNombre)

  const [movimientos, setMovimientos] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [empleado, setEmpleado] = useState(perfilEsEmpleado ? perfilNombre : '')
  const [tipo, setTipo] = useState('SALIDA')
  const [categoria, setCategoria] = useState('')
  const [detalle, setDetalle] = useState('')
  const [monto, setMonto] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [confirmAnular, setConfirmAnular] = useState(null)
  const [anulando, setAnulando] = useState(false)
  const [toast, setToast] = useState(null)

  useEffect(() => { cargar() }, [])
  // Si cambia el perfil (ej. al iniciar sesión) se preselecciona ese usuario
  useEffect(() => { if (perfilEsEmpleado) setEmpleado(perfilNombre) }, [perfilNombre, perfilEsEmpleado])

  async function cargar() {
    setLoading(true)
    setError(null)
    try { setMovimientos(await getGastosCajaHoy()) }
    catch (e) { console.error(e); setError('No se pudo cargar. Intentá de nuevo.') }
    finally { setLoading(false) }
  }

  function showToast(msg, type) {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3000)
  }

  function cambiarTipo(t) {
    setTipo(t)
    setCategoria('')
  }

  const montoNum = parseMonto(monto)
  const faltaDetalle = categoria === 'Otro' && !detalle.trim()
  const puedeGuardar = empleado && categoria && montoNum > 0 && !faltaDetalle && !guardando
  const faltante = !empleado ? 'Elegí quién lo registra'
    : !categoria ? 'Elegí el concepto'
    : faltaDetalle ? 'Escribí el detalle'
    : montoNum <= 0 ? 'Ingresá el monto' : ''

  async function guardar() {
    if (!puedeGuardar) return
    setGuardando(true)
    try {
      await registrarGastoCaja({ empleado, tipo, categoria, detalle: detalle.trim(), monto: montoNum, registradoDesde: perfilNombre })
      showToast(tipo === 'SALIDA' ? 'Gasto registrado' : 'Entrada registrada', 'success')
      setCategoria('')
      setDetalle('')
      setMonto('')
      // En la Tablet (usuario compartido) se vuelve a pedir quién registra el próximo
      if (!perfilEsEmpleado) setEmpleado('')
      await cargar()
      onRegistrado?.()
    } catch (e) {
      console.error(e)
      showToast('No se pudo guardar. Intentá de nuevo.', 'error')
    } finally {
      setGuardando(false)
    }
  }

  async function confirmarAnulacion() {
    setAnulando(true)
    try {
      await anularGastoCaja(confirmAnular.id, perfilNombre)
      showToast('Movimiento anulado', 'success')
      setConfirmAnular(null)
      await cargar()
      onRegistrado?.()
    } catch (e) {
      console.error(e)
      showToast('No se pudo anular. Intentá de nuevo.', 'error')
    } finally {
      setAnulando(false)
    }
  }

  const activos = movimientos.filter(m => !m.anulado)
  const totalSalidas = activos.filter(m => m.tipo === 'SALIDA').reduce((s, m) => s + m.monto, 0)
  const totalEntradas = activos.filter(m => m.tipo === 'ENTRADA').reduce((s, m) => s + m.monto, 0)
  const lista = [...movimientos].sort((a, b) => b.hora.localeCompare(a.hora))

  return (
    <div style={S.page}>
      {toast && <div style={{ ...S.toast, ...(toast.type === 'error' ? S.toastError : S.toastSuccess) }}>{toast.msg}</div>}

      <div style={S.header}>
        <div>
          <div style={S.headerTitle}>GASTOS DE CAJA</div>
          <div style={S.headerSub}>Registrá solo lo que sale o entra en efectivo de la caja</div>
        </div>
        <button style={S.refreshBtn} onClick={cargar} aria-label="Actualizar">↻</button>
      </div>

      <div style={S.layout}>
        {/* Formulario */}
        <div style={S.card}>
          <div style={S.fieldLabel}>QUIÉN LO REGISTRA</div>
          <div style={S.grid4}>
            {empleados.map(u => (
              <button key={u.id} style={{ ...S.optBtn, ...(empleado === u.nombre ? S.optBtnActivo : {}) }} onClick={() => setEmpleado(u.nombre)}>{u.nombre}</button>
            ))}
            {empleados.length === 0 && <span style={S.muted}>Sin usuarios</span>}
          </div>

          <div style={S.fieldLabel}>MOVIMIENTO</div>
          <div style={S.grid2}>
            <button style={{ ...S.tipoBtn, ...(tipo === 'SALIDA' ? S.tipoSalidaActivo : {}) }} onClick={() => cambiarTipo('SALIDA')}>
              <span style={S.tipoIcon}>💸</span>
              <span style={S.tipoLabel}>Sale de la caja</span>
            </button>
            <button style={{ ...S.tipoBtn, ...(tipo === 'ENTRADA' ? S.tipoEntradaActivo : {}) }} onClick={() => cambiarTipo('ENTRADA')}>
              <span style={S.tipoIcon}>💵</span>
              <span style={S.tipoLabel}>Entra a la caja</span>
            </button>
          </div>

          <div style={S.fieldLabel}>CONCEPTO</div>
          <div style={S.catGrid}>
            {CATEGORIAS_CAJA[tipo].map(c => (
              <button key={c.id} style={{ ...S.catBtn, ...(categoria === c.id ? S.optBtnActivo : {}) }} onClick={() => setCategoria(c.id)}>
                <span style={S.catNombre}>{c.icon} {c.id}</span>
                <span style={S.catAyuda}>{c.ayuda}</span>
              </button>
            ))}
          </div>

          <div style={S.fieldLabel}>DETALLE {categoria === 'Otro' ? '' : <span style={S.opcional}>(opcional)</span>}</div>
          <input
            style={S.input}
            type="text"
            placeholder={tipo === 'SALIDA' ? 'Ej: galletitas y café para el local' : 'Ej: transferí a un cliente que me dio efectivo'}
            value={detalle}
            maxLength={120}
            onChange={e => setDetalle(e.target.value)}
          />

          <div style={S.fieldLabel}>MONTO</div>
          <div style={S.montoWrap}>
            <span style={S.montoSimbolo}>$</span>
            <input
              style={S.montoInput}
              type="text"
              inputMode="decimal"
              placeholder="0"
              value={monto}
              onChange={e => setMonto(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') guardar() }}
            />
          </div>

          <button
            style={{ ...S.guardarBtn, ...(tipo === 'ENTRADA' ? S.guardarEntrada : {}), opacity: puedeGuardar ? 1 : 0.5 }}
            onClick={guardar}
            disabled={!puedeGuardar}
          >
            {guardando ? 'Guardando...' : `${tipo === 'SALIDA' ? 'REGISTRAR GASTO' : 'REGISTRAR ENTRADA'}${montoNum > 0 ? ` · ${fmt$(montoNum)}` : ''}`}
          </button>
          {faltante && !guardando && <div style={S.faltante}>{faltante}</div>}
        </div>

        {/* Movimientos del día */}
        <div style={S.card}>
          <div style={S.resumen}>
            <div style={S.resumenItem}>
              <div style={{ ...S.resumenValor, color: '#ef4444' }}>− {fmt$(totalSalidas)}</div>
              <div style={S.resumenLabel}>Salió hoy</div>
            </div>
            <div style={S.resumenItem}>
              <div style={{ ...S.resumenValor, color: '#22c55e' }}>+ {fmt$(totalEntradas)}</div>
              <div style={S.resumenLabel}>Entró hoy</div>
            </div>
          </div>

          <div style={S.fieldLabel}>MOVIMIENTOS DE HOY</div>
          {loading ? <div style={S.muted}>Cargando...</div>
            : error ? (
              <div>
                <div style={S.errorText}>{error}</div>
                <button style={S.retryBtn} onClick={cargar}>Reintentar</button>
              </div>
            )
            : lista.length === 0 ? <div style={S.muted}>Todavía no hay movimientos hoy.</div>
            : (
              <div style={S.lista}>
                {lista.map(m => (
                  <div key={m.id} style={{ ...S.mov, ...(m.anulado ? S.movAnulado : {}) }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={S.movConcepto}>
                        {m.anulado && <span style={S.badgeAnulado}>ANULADO</span>}
                        {m.categoria}
                      </div>
                      {m.detalle && <div style={S.movDetalle}>{m.detalle}</div>}
                      <div style={S.movMeta}>{m.hora.slice(0, 5)} · {m.empleado}</div>
                    </div>
                    <div style={S.movDerecha}>
                      <div style={{ ...S.movMonto, color: m.tipo === 'SALIDA' ? '#ef4444' : '#22c55e', ...(m.anulado ? { textDecoration: 'line-through', color: 'var(--muted)' } : {}) }}>
                        {m.tipo === 'SALIDA' ? '−' : '+'} {fmt$(m.monto)}
                      </div>
                      {!m.anulado && <button style={S.anularBtn} onClick={() => setConfirmAnular(m)}>Anular</button>}
                    </div>
                  </div>
                ))}
              </div>
            )}
        </div>
      </div>

      {confirmAnular && (
        <div style={S.overlay} onClick={() => !anulando && setConfirmAnular(null)}>
          <div style={S.confirmBox} onClick={e => e.stopPropagation()}>
            <div style={S.confirmTitle}>¿Anular movimiento?</div>
            <div style={S.confirmSub}>
              {confirmAnular.categoria} · <strong style={{ color: 'var(--accent)' }}>{fmt$(confirmAnular.monto)}</strong><br />
              registrado por {confirmAnular.empleado} a las {confirmAnular.hora.slice(0, 5)}.<br />
              Queda en la lista marcado como anulado.
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
              <button style={S.confirmCancel} onClick={() => setConfirmAnular(null)} disabled={anulando}>Cancelar</button>
              <button style={S.confirmOk} onClick={confirmarAnulacion} disabled={anulando}>{anulando ? 'Anulando...' : 'Sí, anular'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const S = {
  page: { display: 'flex', flexDirection: 'column', height: '100%', overflowY: 'auto', position: 'relative' },
  toast: { position: 'fixed', top: 16, left: '50%', transform: 'translateX(-50%)', zIndex: 300, padding: '12px 28px', borderRadius: 10, fontFamily: 'Barlow Condensed, sans-serif', fontWeight: 700, fontSize: 20, whiteSpace: 'nowrap', boxShadow: '0 4px 20px rgba(0,0,0,0.5)' },
  toastSuccess: { background: '#22c55e', color: '#000' },
  toastError: { background: '#ef4444', color: '#fff' },
  header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '16px 20px 12px', borderBottom: '2px solid var(--accent)', flexShrink: 0 },
  headerTitle: { fontFamily: 'Barlow Condensed, sans-serif', fontWeight: 800, fontSize: 28, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: 2 },
  headerSub: { fontFamily: 'Barlow, sans-serif', fontSize: 13, color: 'var(--muted)' },
  refreshBtn: { background: 'var(--surface)', border: '1.5px solid var(--border)', borderRadius: 10, color: 'var(--text)', fontSize: 24, width: 44, height: 44, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  layout: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16, padding: '16px 20px 24px', alignItems: 'start' },
  card: { background: 'var(--surface)', border: '1.5px solid var(--border)', borderRadius: 14, padding: 16, display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 },
  fieldLabel: { fontFamily: 'Barlow Condensed, sans-serif', fontWeight: 700, fontSize: 13, color: 'var(--muted)', letterSpacing: 1.5, marginTop: 8 },
  opcional: { fontWeight: 400, letterSpacing: 0, textTransform: 'none' },
  grid4: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(70px, 1fr))', gap: 8 },
  grid2: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 },
  optBtn: { padding: '12px 6px', background: 'var(--surface2)', border: '1.5px solid var(--border)', borderRadius: 10, cursor: 'pointer', color: 'var(--muted)', fontFamily: 'Barlow Condensed, sans-serif', fontWeight: 700, fontSize: 17, textAlign: 'center' },
  optBtnActivo: { background: 'rgba(245,200,0,0.12)', border: '1.5px solid var(--accent)', color: 'var(--accent)' },
  tipoBtn: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, padding: '12px 6px', background: 'var(--surface2)', border: '1.5px solid var(--border)', borderRadius: 10, cursor: 'pointer', color: 'var(--muted)' },
  tipoSalidaActivo: { background: 'rgba(239,68,68,0.12)', border: '1.5px solid #ef4444', color: '#ef4444' },
  tipoEntradaActivo: { background: 'rgba(34,197,94,0.12)', border: '1.5px solid #22c55e', color: '#22c55e' },
  tipoIcon: { fontSize: 22 },
  tipoLabel: { fontFamily: 'Barlow Condensed, sans-serif', fontWeight: 800, fontSize: 17 },
  catGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 8 },
  catBtn: { display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 2, padding: '10px 12px', background: 'var(--surface2)', border: '1.5px solid var(--border)', borderRadius: 10, cursor: 'pointer', color: 'var(--text)', textAlign: 'left' },
  catNombre: { fontFamily: 'Barlow Condensed, sans-serif', fontWeight: 700, fontSize: 16 },
  catAyuda: { fontFamily: 'Barlow, sans-serif', fontSize: 11, color: 'var(--muted)', lineHeight: 1.3 },
  input: { fontFamily: 'Barlow, sans-serif', fontSize: 16, padding: '12px 14px', background: 'var(--bg)', border: '1.5px solid var(--border)', borderRadius: 10, color: 'var(--text)', width: '100%' },
  montoWrap: { display: 'flex', alignItems: 'center', background: 'var(--bg)', border: '1.5px solid var(--accent)', borderRadius: 10 },
  montoSimbolo: { padding: '0 14px', fontFamily: 'Barlow Condensed, sans-serif', fontWeight: 800, fontSize: 24, color: 'var(--accent)', borderRight: '1.5px solid var(--border)' },
  montoInput: { flex: 1, minWidth: 0, fontFamily: 'Barlow Condensed, sans-serif', fontWeight: 800, fontSize: 28, padding: '8px 14px', background: 'transparent', border: 'none', color: 'var(--text)', outline: 'none' },
  guardarBtn: { marginTop: 12, padding: '16px', background: '#ef4444', border: 'none', borderRadius: 12, color: '#fff', fontFamily: 'Barlow Condensed, sans-serif', fontWeight: 800, fontSize: 20, letterSpacing: 1, cursor: 'pointer' },
  guardarEntrada: { background: '#22c55e', color: '#000' },
  faltante: { fontFamily: 'Barlow, sans-serif', fontSize: 13, color: 'var(--muted)', textAlign: 'center' },
  resumen: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 },
  resumenItem: { background: 'var(--surface2)', border: '1.5px solid var(--border)', borderRadius: 10, padding: '10px 14px' },
  resumenValor: { fontFamily: 'Barlow Condensed, sans-serif', fontWeight: 800, fontSize: 26 },
  resumenLabel: { fontFamily: 'Barlow, sans-serif', fontSize: 12, color: 'var(--muted)' },
  lista: { display: 'flex', flexDirection: 'column' },
  mov: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: '1px solid var(--border)' },
  movAnulado: { opacity: 0.5 },
  movConcepto: { fontFamily: 'Barlow Condensed, sans-serif', fontWeight: 700, fontSize: 17, color: 'var(--text)' },
  movDetalle: { fontFamily: 'Barlow, sans-serif', fontSize: 13, color: 'var(--text)', opacity: 0.85 },
  movMeta: { fontFamily: 'Barlow, sans-serif', fontSize: 12, color: 'var(--muted)', marginTop: 2 },
  movDerecha: { display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, flexShrink: 0 },
  movMonto: { fontFamily: 'Barlow Condensed, sans-serif', fontWeight: 800, fontSize: 20, whiteSpace: 'nowrap' },
  badgeAnulado: { fontSize: 11, fontWeight: 800, color: '#ef4444', background: 'rgba(239,68,68,0.15)', borderRadius: 4, padding: '2px 6px', marginRight: 8, letterSpacing: 1 },
  anularBtn: { background: 'none', border: '1px solid rgba(239,68,68,0.4)', borderRadius: 6, color: 'rgba(239,68,68,0.8)', fontFamily: 'Barlow Condensed, sans-serif', fontWeight: 700, fontSize: 11, padding: '3px 8px', cursor: 'pointer', letterSpacing: 0.5, textTransform: 'uppercase' },
  muted: { fontFamily: 'Barlow, sans-serif', fontSize: 14, color: 'var(--muted)', padding: '8px 0' },
  errorText: { fontFamily: 'Barlow, sans-serif', fontSize: 14, color: '#ef4444', marginBottom: 8 },
  retryBtn: { background: 'var(--surface2)', border: '1.5px solid var(--border)', borderRadius: 10, color: 'var(--text)', fontFamily: 'Barlow, sans-serif', fontSize: 14, padding: '8px 18px', cursor: 'pointer' },
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,10,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, backdropFilter: 'blur(6px)' },
  confirmBox: { background: 'var(--surface)', border: '2px solid #ef4444', borderRadius: 16, padding: 28, width: 320, maxWidth: 'calc(100% - 32px)', textAlign: 'center' },
  confirmTitle: { fontFamily: 'Barlow Condensed, sans-serif', fontWeight: 800, fontSize: 24, color: '#ef4444', marginBottom: 10 },
  confirmSub: { fontFamily: 'Barlow, sans-serif', fontSize: 14, color: 'var(--muted)', lineHeight: 1.5 },
  confirmCancel: { flex: 1, padding: '12px', background: 'none', border: '1.5px solid var(--border)', borderRadius: 8, color: 'var(--muted)', fontFamily: 'Barlow, sans-serif', fontSize: 14, cursor: 'pointer' },
  confirmOk: { flex: 1, padding: '12px', background: '#ef4444', border: 'none', borderRadius: 8, color: '#fff', fontFamily: 'Barlow Condensed, sans-serif', fontWeight: 700, fontSize: 16, cursor: 'pointer' },
}
