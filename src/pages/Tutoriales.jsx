// src/pages/Tutoriales.jsx
// Instructivos para los empleados. Los ven todos (Tablet y Admin), del más nuevo al más viejo.
// Solo los Admin pueden agregar o quitar. Se guardan en la hoja TUTORIALES (título + link).
import { useState, useEffect } from 'react'
import { getTutoriales, agregarTutorial, quitarTutorial } from '../api/sheets.js'

const DIAS_NUEVO = 7
const esLinkValido = v => /^https?:\/\/\S+\.\S+/i.test(String(v || '').trim())

function tipoDeLink(link) {
  const l = link.toLowerCase()
  if (l.includes('claude.ai')) return { icon: '📘', label: 'Documento' }
  if (l.includes('drive.google') || l.includes('docs.google')) return { icon: '📄', label: 'Google Drive' }
  if (l.includes('youtube') || l.includes('youtu.be')) return { icon: '🎬', label: 'Video' }
  if (l.endsWith('.pdf')) return { icon: '📄', label: 'PDF' }
  return { icon: '🔗', label: 'Link' }
}

export default function Tutoriales({ esAdmin = false, perfilNombre = '' }) {
  const [tutoriales, setTutoriales] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [formAbierto, setFormAbierto] = useState(false)
  const [titulo, setTitulo] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [link, setLink] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [confirmQuitar, setConfirmQuitar] = useState(null)
  const [quitando, setQuitando] = useState(false)
  const [toast, setToast] = useState(null)

  useEffect(() => { cargar() }, [])

  async function cargar() {
    setLoading(true)
    setError(null)
    try { setTutoriales(await getTutoriales()) }
    catch (e) { console.error(e); setError('No se pudieron cargar los tutoriales.') }
    finally { setLoading(false) }
  }

  function showToast(msg, type) {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3000)
  }

  const linkOk = esLinkValido(link)
  const puedeGuardar = titulo.trim() && linkOk && !guardando
  const faltante = !titulo.trim() ? 'Escribí un título' : !link.trim() ? 'Pegá el link' : !linkOk ? 'El link tiene que empezar con https://' : ''

  async function guardar() {
    if (!puedeGuardar) return
    setGuardando(true)
    try {
      await agregarTutorial({ titulo: titulo.trim(), descripcion: descripcion.trim(), link: link.trim(), subidoPor: perfilNombre })
      showToast('Tutorial agregado', 'success')
      setTitulo(''); setDescripcion(''); setLink(''); setFormAbierto(false)
      await cargar()
    } catch (e) {
      console.error(e)
      showToast('No se pudo guardar. Intentá de nuevo.', 'error')
    } finally {
      setGuardando(false)
    }
  }

  async function confirmarQuitar() {
    setQuitando(true)
    try {
      await quitarTutorial(confirmQuitar.id, perfilNombre)
      showToast('Tutorial quitado', 'success')
      setConfirmQuitar(null)
      await cargar()
    } catch (e) {
      console.error(e)
      showToast('No se pudo quitar. Intentá de nuevo.', 'error')
    } finally {
      setQuitando(false)
    }
  }

  const ahora = Date.now()

  return (
    <div style={S.page}>
      {toast && <div style={{ ...S.toast, ...(toast.type === 'error' ? S.toastError : S.toastSuccess) }}>{toast.msg}</div>}

      <div style={S.header}>
        <div>
          <div style={S.headerTitle}>TUTORIALES</div>
          <div style={S.headerSub}>Instructivos de la app y del local · el más nuevo arriba</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {esAdmin && !formAbierto && <button style={S.agregarBtn} onClick={() => setFormAbierto(true)}>+ Agregar</button>}
          <button style={S.refreshBtn} onClick={cargar} aria-label="Actualizar">↻</button>
        </div>
      </div>

      <div style={S.body}>
        {esAdmin && formAbierto && (
          <div style={S.card}>
            <div style={S.fieldLabel}>TÍTULO</div>
            <input style={S.input} type="text" placeholder="Ej: Cómo usar el carrito de ventas" value={titulo} maxLength={80} onChange={e => setTitulo(e.target.value)} autoFocus />
            <div style={S.fieldLabel}>DESCRIPCIÓN <span style={S.opcional}>(opcional)</span></div>
            <input style={S.input} type="text" placeholder="Ej: Promos, descuentos y posnet" value={descripcion} maxLength={140} onChange={e => setDescripcion(e.target.value)} />
            <div style={S.fieldLabel}>LINK</div>
            <input style={S.input} type="url" inputMode="url" placeholder="https://..." value={link} onChange={e => setLink(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') guardar() }} />
            <div style={S.ayuda}>Pegá el link del documento, PDF o video. Tiene que estar compartido para que se pueda abrir desde la tablet.</div>
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <button style={S.cancelBtn} onClick={() => setFormAbierto(false)} disabled={guardando}>Cancelar</button>
              <button style={{ ...S.guardarBtn, opacity: puedeGuardar ? 1 : 0.5 }} onClick={guardar} disabled={!puedeGuardar}>{guardando ? 'Guardando...' : 'GUARDAR'}</button>
            </div>
            {faltante && !guardando && <div style={S.faltante}>{faltante}</div>}
          </div>
        )}

        {loading ? <div style={S.muted}>Cargando...</div>
          : error ? (
            <div>
              <div style={S.errorText}>{error}</div>
              <button style={S.retryBtn} onClick={cargar}>Reintentar</button>
            </div>
          )
          : tutoriales.length === 0 ? (
            <div style={S.muted}>{esAdmin ? 'Todavía no hay tutoriales. Tocá "+ Agregar" para subir el primero.' : 'Todavía no hay tutoriales.'}</div>
          )
          : (
            <div style={S.lista}>
              {tutoriales.map(t => {
                const tipo = tipoDeLink(t.link)
                const esNuevo = t.ms && ahora - t.ms < DIAS_NUEVO * 86400000
                return (
                  <div key={t.id} style={S.item}>
                    <a href={t.link} target="_blank" rel="noopener noreferrer" style={S.itemLink}>
                      <span style={S.itemIcon} aria-hidden="true">{tipo.icon}</span>
                      <span style={{ minWidth: 0, flex: 1 }}>
                        <span style={S.itemTitulo}>
                          {esNuevo && <span style={S.badgeNuevo}>NUEVO</span>}
                          {t.titulo}
                        </span>
                        {t.descripcion && <span style={S.itemDesc}>{t.descripcion}</span>}
                        <span style={S.itemMeta}>Subido el {t.fecha}{t.subidoPor ? ` · ${t.subidoPor}` : ''} · {tipo.label}</span>
                      </span>
                      <span style={S.abrir}>Abrir ↗</span>
                    </a>
                    {esAdmin && <button style={S.quitarBtn} onClick={() => setConfirmQuitar(t)}>Quitar</button>}
                  </div>
                )
              })}
            </div>
          )}
      </div>

      {confirmQuitar && (
        <div style={S.overlay} onClick={() => !quitando && setConfirmQuitar(null)}>
          <div style={S.confirmBox} onClick={e => e.stopPropagation()}>
            <div style={S.confirmTitle}>¿Quitar tutorial?</div>
            <div style={S.confirmSub}>
              <strong style={{ color: 'var(--accent)' }}>{confirmQuitar.titulo}</strong><br />
              Deja de verse en la app. Queda guardado en la planilla.
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
              <button style={S.cancelBtn} onClick={() => setConfirmQuitar(null)} disabled={quitando}>Cancelar</button>
              <button style={S.confirmOk} onClick={confirmarQuitar} disabled={quitando}>{quitando ? 'Quitando...' : 'Sí, quitar'}</button>
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
  agregarBtn: { background: 'var(--accent)', border: 'none', borderRadius: 10, color: '#000', fontFamily: 'Barlow Condensed, sans-serif', fontWeight: 800, fontSize: 17, padding: '0 16px', height: 44, cursor: 'pointer', whiteSpace: 'nowrap' },
  body: { display: 'flex', flexDirection: 'column', gap: 16, padding: '16px 20px 24px', maxWidth: 820, width: '100%', margin: '0 auto' },
  card: { background: 'var(--surface)', border: '1.5px solid var(--accent)', borderRadius: 14, padding: 16, display: 'flex', flexDirection: 'column', gap: 8 },
  fieldLabel: { fontFamily: 'Barlow Condensed, sans-serif', fontWeight: 700, fontSize: 13, color: 'var(--muted)', letterSpacing: 1.5, marginTop: 4 },
  opcional: { fontWeight: 400, letterSpacing: 0 },
  input: { fontFamily: 'Barlow, sans-serif', fontSize: 16, padding: '12px 14px', background: 'var(--bg)', border: '1.5px solid var(--border)', borderRadius: 10, color: 'var(--text)', width: '100%' },
  ayuda: { fontFamily: 'Barlow, sans-serif', fontSize: 12, color: 'var(--muted)', lineHeight: 1.4 },
  guardarBtn: { flex: 2, padding: '14px', background: 'var(--accent)', border: 'none', borderRadius: 10, color: '#000', fontFamily: 'Barlow Condensed, sans-serif', fontWeight: 800, fontSize: 18, letterSpacing: 1, cursor: 'pointer' },
  cancelBtn: { flex: 1, padding: '12px', background: 'none', border: '1.5px solid var(--border)', borderRadius: 10, color: 'var(--muted)', fontFamily: 'Barlow, sans-serif', fontSize: 14, cursor: 'pointer' },
  faltante: { fontFamily: 'Barlow, sans-serif', fontSize: 13, color: 'var(--muted)', textAlign: 'center' },
  lista: { display: 'flex', flexDirection: 'column', gap: 10 },
  item: { display: 'flex', alignItems: 'stretch', gap: 8, background: 'var(--surface)', border: '1.5px solid var(--border)', borderRadius: 14, overflow: 'hidden' },
  itemLink: { flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px', textDecoration: 'none', color: 'var(--text)' },
  itemIcon: { fontSize: 28, flexShrink: 0 },
  itemTitulo: { display: 'block', fontFamily: 'Barlow Condensed, sans-serif', fontWeight: 800, fontSize: 20, color: 'var(--text)', lineHeight: 1.2 },
  itemDesc: { display: 'block', fontFamily: 'Barlow, sans-serif', fontSize: 14, color: 'var(--text)', opacity: 0.85, marginTop: 2 },
  itemMeta: { display: 'block', fontFamily: 'Barlow, sans-serif', fontSize: 12, color: 'var(--muted)', marginTop: 4 },
  abrir: { flexShrink: 0, fontFamily: 'Barlow Condensed, sans-serif', fontWeight: 800, fontSize: 16, color: 'var(--accent)', whiteSpace: 'nowrap' },
  badgeNuevo: { fontSize: 11, fontWeight: 800, color: '#000', background: 'var(--accent)', borderRadius: 4, padding: '2px 6px', marginRight: 8, letterSpacing: 1, verticalAlign: 'middle' },
  quitarBtn: { alignSelf: 'center', marginRight: 12, background: 'none', border: '1px solid rgba(239,68,68,0.4)', borderRadius: 6, color: 'rgba(239,68,68,0.8)', fontFamily: 'Barlow Condensed, sans-serif', fontWeight: 700, fontSize: 11, padding: '3px 8px', cursor: 'pointer', letterSpacing: 0.5, textTransform: 'uppercase', flexShrink: 0 },
  muted: { fontFamily: 'Barlow, sans-serif', fontSize: 14, color: 'var(--muted)', padding: '8px 0' },
  errorText: { fontFamily: 'Barlow, sans-serif', fontSize: 14, color: '#ef4444', marginBottom: 8 },
  retryBtn: { background: 'var(--surface2)', border: '1.5px solid var(--border)', borderRadius: 10, color: 'var(--text)', fontFamily: 'Barlow, sans-serif', fontSize: 14, padding: '8px 18px', cursor: 'pointer' },
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,10,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, backdropFilter: 'blur(6px)' },
  confirmBox: { background: 'var(--surface)', border: '2px solid #ef4444', borderRadius: 16, padding: 28, width: 320, maxWidth: 'calc(100% - 32px)', textAlign: 'center' },
  confirmTitle: { fontFamily: 'Barlow Condensed, sans-serif', fontWeight: 800, fontSize: 24, color: '#ef4444', marginBottom: 10 },
  confirmSub: { fontFamily: 'Barlow, sans-serif', fontSize: 14, color: 'var(--muted)', lineHeight: 1.5 },
  confirmOk: { flex: 1, padding: '12px', background: '#ef4444', border: 'none', borderRadius: 8, color: '#fff', fontFamily: 'Barlow Condensed, sans-serif', fontWeight: 700, fontSize: 16, cursor: 'pointer' },
}
