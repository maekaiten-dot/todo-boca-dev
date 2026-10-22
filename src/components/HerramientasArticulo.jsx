// src/components/HerramientasArticulo.jsx
// Dentro de "Editar artículo" (solo Admin): unificar dos códigos que son el mismo producto, deshacer
// una unificación, o separar un código en dos productos. Nada del historial se borra ni se reescribe.
import { useState } from 'react'
import { unificarArticulo, deshacerUnificacion, idCanonico, generarIdArticulo, agregarArticulo, editarArticulo } from '../api/sheets.js'

const normalizar = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
const num = id => Number(String(id).replace(/\D/g, '')) || 0

export default function HerramientasArticulo({ editando, form, articulos = [], stockMap = {}, empleado = '', onListo, ocupado, setOcupado }) {
  const [modo, setModo] = useState(null) // null | 'unificar' | 'separar'
  const [error, setError] = useState('')
  // Unificar
  const [busqueda, setBusqueda] = useState('')
  const [otro, setOtro] = useState(null)
  const [queda, setQueda] = useState(null) // id del que queda
  // Separar
  const [sep, setSep] = useState(null)

  if (!editando?.rowNum) return null
  const stockDe = id => stockMap[id]
  const fmtStock = v => v == null ? '?' : v

  // Ya unificado: solo se puede deshacer
  if (editando.unificadoEn) {
    const destino = articulos.find(a => a.id === editando.unificadoEn)
    return (
      <div style={S.caja}>
        <div style={{ ...S.titulo, color: '#f59e0b' }}>⇢ UNIFICADO EN {editando.unificadoEn}</div>
        <div style={S.texto}>
          {destino ? `${destino.nombre}. ` : ''}Desde {editando.unificadoEl || 'antes'}: sus ventas, ingresos y stock se cuentan en {editando.unificadoEn}, y sus etiquetas cargan ese artículo.
        </div>
        {error && <div style={S.error}>{error}</div>}
        <button style={S.btn} disabled={ocupado} onClick={async () => {
          if (!window.confirm(`¿Deshacer la unificación? ${editando.id} vuelve a ser un artículo aparte (ACTIVO), con su propio historial.`)) return
          setOcupado(true); setError('')
          try { await deshacerUnificacion(editando, empleado); await onListo(`${editando.id} vuelve a ser un artículo aparte. Contalo en Conteo para que su stock arranque bien.`) }
          catch (e) { setError(e.message || 'No se pudo deshacer') }
          finally { setOcupado(false) }
        }}>DESHACER UNIFICACIÓN</button>
      </div>
    )
  }

  const candidatos = busqueda.trim().length < 2 ? [] : articulos
    .filter(a => a.id !== editando.id && !a.unificadoEn && idCanonico(a.id) === a.id)
    .filter(a => normalizar(a.nombre).includes(normalizar(busqueda)) || normalizar(a.id).includes(normalizar(busqueda)))
    .slice(0, 8)

  function elegirOtro(a) {
    setOtro(a); setBusqueda('')
    // Por defecto queda el código más viejo, salvo que el otro esté inactivo
    const otroActivo = String(a.disponibilidad || '').toUpperCase() === 'ACTIVO'
    setQueda(otroActivo && num(a.id) < num(editando.id) ? a.id : editando.id)
  }

  async function unificar() {
    const quedaArt = queda === editando.id ? { ...editando, nombre: form.nombre } : otro
    const viejo = queda === editando.id ? otro : editando
    setOcupado(true); setError('')
    try {
      await unificarArticulo(viejo, quedaArt, empleado)
      await onListo(`${viejo.id} quedó unificado en ${quedaArt.id}. Contá ${quedaArt.id} en Conteo (ya junto) para que el stock quede exacto.`)
    } catch (e) { setError(e.message || 'No se pudo unificar') }
    finally { setOcupado(false) }
  }

  function abrirSeparar() {
    setModo('separar'); setError('')
    setSep({ nombreEste: form.nombre, nombreNuevo: '', precio: form.precioUnitario, costo: form.costoUnitario, grupo: form.grupo || form.nombre })
  }

  async function separar() {
    if (!sep.nombreNuevo.trim() || !sep.nombreEste.trim()) { setError('Poné el nombre de los dos'); return }
    setOcupado(true); setError('')
    try {
      const grupo = sep.grupo.trim()
      const id = await generarIdArticulo()
      await agregarArticulo({ ...form, id, nombre: sep.nombreNuevo.trim(), precioUnitario: sep.precio, costoUnitario: sep.costo, stockInicial: '0', cantidadReponer: '0', stockCierre: '0', stockActual: '0', disponibilidad: 'ACTIVO', grupo }, empleado)
      await editarArticulo(editando.rowNum, { ...form, nombre: sep.nombreEste.trim(), grupo }, empleado)
      await onListo(`Separado: ${editando.id} y el nuevo ${id}, los dos en el grupo "${grupo}". Contá los dos hoy en Conteo para que cada uno arranque con su stock real, e imprimí etiquetas para ${id}.`)
    } catch (e) { setError(e.message || 'No se pudo separar') }
    finally { setOcupado(false) }
  }

  return (
    <div style={S.caja}>
      <div style={S.titulo}>HERRAMIENTAS</div>
      {!modo && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button style={S.btnSec} onClick={() => { setModo('unificar'); setError('') }}>🔗 Unificar con otro artículo</button>
          <button style={S.btnSec} onClick={abrirSeparar}>✂️ Separar en dos</button>
        </div>
      )}

      {modo === 'unificar' && (
        <>
          <div style={S.texto}>Para cuando dos códigos son el mismo producto. El que no queda pasa a INACTIVO; sus ventas, ingresos y stock se suman al que queda, y sus etiquetas siguen funcionando. Se puede deshacer.</div>
          {!otro && (
            <>
              <input style={S.input} autoFocus placeholder="Buscá el otro artículo (nombre o código)…" value={busqueda} onChange={e => setBusqueda(e.target.value)} aria-label="Buscar el otro artículo" />
              {candidatos.map(a => (
                <button key={a.id} style={S.opcion} onClick={() => elegirOtro(a)}>
                  <b>{a.id}</b> · {a.nombre} <span style={{ color: 'var(--muted)' }}>· stock {fmtStock(stockDe(a.id))}{a.disponibilidad?.toUpperCase() !== 'ACTIVO' ? ' · INACTIVO' : ''}</span>
                </button>
              ))}
            </>
          )}
          {otro && (
            <>
              <div style={S.texto}>¿Cuál queda?</div>
              {[{ ...editando, nombre: form.nombre }, otro].map(a => (
                <label key={a.id} style={{ ...S.opcion, ...(queda === a.id ? S.opcionActiva : {}) }}>
                  <input type="radio" name="queda" checked={queda === a.id} onChange={() => setQueda(a.id)} style={{ marginRight: 8 }} />
                  <b>{a.id}</b> · {a.nombre} <span style={{ color: 'var(--muted)' }}>· stock {fmtStock(stockDe(a.id))}</span>
                </label>
              ))}
              <div style={S.texto}>
                {(() => { const viejo = queda === editando.id ? otro : editando; return `${viejo.id} pasa a INACTIVO.` })()} Stock del que queda: {fmtStock(stockDe(editando.id))} + {fmtStock(stockDe(otro.id))} = <b>{stockDe(editando.id) != null && stockDe(otro.id) != null ? stockDe(editando.id) + stockDe(otro.id) : '?'}</b> hasta que lo cuentes.
                {String(editando.precioUnitario) !== String(otro.precioUnitario) && ' Ojo: tienen precios distintos; queda el precio del que queda.'}
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button style={S.btnSec} disabled={ocupado} onClick={() => setOtro(null)}>Elegir otro</button>
                <button style={S.btn} disabled={ocupado} onClick={unificar}>{ocupado ? 'Unificando…' : 'UNIFICAR'}</button>
              </div>
            </>
          )}
          {!otro && <button style={{ ...S.btnSec, alignSelf: 'flex-start' }} onClick={() => setModo(null)}>Cancelar</button>}
        </>
      )}

      {modo === 'separar' && sep && (
        <>
          <div style={S.texto}>Para cuando este código en realidad son dos productos. Este código sigue con su historial (dejale el producto que más se vende) y se crea uno nuevo para el otro, desde hoy. Los dos quedan en el mismo grupo, así Rotación sigue mostrando la tendencia junta.</div>
          <label style={S.label}>NOMBRE DE ESTE ({editando.id})</label>
          <input style={S.input} value={sep.nombreEste} onChange={e => setSep(s => ({ ...s, nombreEste: e.target.value }))} />
          <label style={S.label}>NOMBRE DEL NUEVO</label>
          <input style={S.input} autoFocus placeholder="Ej: Buzo canguro azul (proveedor nuevo)" value={sep.nombreNuevo} onChange={e => setSep(s => ({ ...s, nombreNuevo: e.target.value }))} />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <div><label style={S.label}>PRECIO DEL NUEVO</label><input style={S.input} inputMode="numeric" value={sep.precio} onChange={e => setSep(s => ({ ...s, precio: e.target.value }))} /></div>
            <div><label style={S.label}>COSTO DEL NUEVO</label><input style={S.input} inputMode="numeric" value={sep.costo} onChange={e => setSep(s => ({ ...s, costo: e.target.value }))} /></div>
          </div>
          <label style={S.label}>GRUPO DE LOS DOS</label>
          <input style={S.input} value={sep.grupo} onChange={e => setSep(s => ({ ...s, grupo: e.target.value }))} />
          <div style={S.texto}>El nuevo arranca con stock 0: después de separar, contá los dos en Conteo.</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button style={S.btnSec} disabled={ocupado} onClick={() => setModo(null)}>Cancelar</button>
            <button style={S.btn} disabled={ocupado} onClick={separar}>{ocupado ? 'Separando…' : 'CREAR Y SEPARAR'}</button>
          </div>
        </>
      )}
      {error && <div style={S.error}>{error}</div>}
    </div>
  )
}

const S = {
  caja: { display: 'flex', flexDirection: 'column', gap: 8, padding: 12, border: '1.5px dashed var(--border)', borderRadius: 10 },
  titulo: { fontFamily: 'Barlow Condensed, sans-serif', fontWeight: 800, fontSize: 13, color: 'var(--accent)', letterSpacing: 1 },
  texto: { fontFamily: 'Barlow, sans-serif', fontSize: 13, color: 'var(--muted)', lineHeight: 1.4 },
  label: { fontFamily: 'Barlow Condensed, sans-serif', fontSize: 12, color: 'var(--accent)', letterSpacing: 1, fontWeight: 700 },
  input: { background: 'var(--surface2)', border: '1.5px solid var(--border)', borderRadius: 8, color: 'var(--text)', fontFamily: 'Barlow, sans-serif', fontSize: 15, padding: '9px 12px', outline: 'none', width: '100%', boxSizing: 'border-box' },
  opcion: { display: 'block', textAlign: 'left', width: '100%', background: 'var(--surface2)', border: '1.5px solid var(--border)', borderRadius: 8, color: 'var(--text)', fontFamily: 'Barlow, sans-serif', fontSize: 14, padding: '8px 10px', cursor: 'pointer', boxSizing: 'border-box' },
  opcionActiva: { border: '1.5px solid var(--accent)', background: 'rgba(245,200,0,0.08)' },
  btn: { flex: 2, padding: '11px', background: 'var(--accent)', border: 'none', borderRadius: 8, color: '#000', fontFamily: 'Barlow Condensed, sans-serif', fontWeight: 800, fontSize: 15, letterSpacing: 1, cursor: 'pointer' },
  btnSec: { flex: 1, padding: '10px 12px', background: 'var(--surface2)', border: '1.5px solid var(--border)', borderRadius: 8, color: 'var(--text)', fontFamily: 'Barlow Condensed, sans-serif', fontWeight: 700, fontSize: 15, cursor: 'pointer' },
  error: { fontFamily: 'Barlow, sans-serif', fontSize: 13, color: '#ef4444' },
}
