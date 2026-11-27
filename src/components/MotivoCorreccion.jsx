// src/components/MotivoCorreccion.jsx
// Al corregir un gasto o un "a cobrar" en Pagos: por qué se corrige (obligatorio) y quién lo hace.
// También muestra las correcciones anteriores del renglón.
import { MOTIVOS_CORRECCION_PAGO } from '../api/sheets.js'

export const faltaMotivo = m => !m?.motivo ? 'Elegí por qué se corrige' : m.motivo === 'Otro' && !String(m.detalle || '').trim() ? 'Contá por qué se corrige' : ''

export default function MotivoCorreccion({ valor, onChange, editor, anteriores = '' }) {
  const lista = String(anteriores || '').split(' | ').filter(Boolean)
  return (
    <div style={S.caja} aria-label="Motivo de la corrección">
      <div style={S.titulo}>¿POR QUÉ SE CORRIGE? <span style={S.quien}>Corrige: <b>{editor || '?'}</b></span></div>
      <div style={S.chips}>
        {MOTIVOS_CORRECCION_PAGO.map(m => (
          <button key={m} type="button" style={{ ...S.chip, ...(valor.motivo === m ? S.chipOn : {}) }} onClick={() => onChange({ ...valor, motivo: m })} aria-pressed={valor.motivo === m}>{m}</button>
        ))}
      </div>
      <input style={S.input} value={valor.detalle || ''} maxLength={140} onChange={e => onChange({ ...valor, detalle: e.target.value })}
        placeholder={valor.motivo === 'Otro' ? 'Contá qué pasó (obligatorio)' : 'Detalle (opcional)'} aria-label="Detalle del motivo" />
      {lista.length > 0 && (
        <div style={S.hist}>
          <div style={S.histTit}>✎ CORREGIDO {lista.length === 1 ? 'UNA VEZ' : `${lista.length} VECES`}</div>
          {lista.map((l, i) => <div key={i} style={S.histLinea}>{l}</div>)}
        </div>
      )}
    </div>
  )
}

const S = {
  caja: { margin: '14px 0 4px', padding: '10px 12px', border: '1.5px solid var(--accent)', borderRadius: 10, background: 'rgba(245,197,24,0.06)' },
  titulo: { display: 'flex', justifyContent: 'space-between', gap: 8, fontFamily: 'Barlow Condensed, sans-serif', fontWeight: 800, fontSize: 14, letterSpacing: 0.5, color: 'var(--accent-text)', marginBottom: 8 },
  quien: { fontFamily: 'Barlow, sans-serif', fontWeight: 400, fontSize: 13, color: 'var(--text)', letterSpacing: 0 },
  chips: { display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 },
  chip: { padding: '6px 10px', background: 'none', border: '1.5px solid var(--border)', borderRadius: 8, color: 'var(--text)', fontFamily: 'Barlow, sans-serif', fontSize: 13, cursor: 'pointer' },
  chipOn: { border: '1.5px solid var(--accent)', background: 'rgba(245,197,24,0.15)', color: 'var(--accent-text)', fontWeight: 700 },
  input: { width: '100%', boxSizing: 'border-box', padding: '8px 10px', background: 'var(--surface2, var(--bg))', border: '1.5px solid var(--border)', borderRadius: 8, color: 'var(--text)', fontFamily: 'Barlow, sans-serif', fontSize: 14 },
  hist: { marginTop: 10, borderTop: '1px solid var(--border)', paddingTop: 8 },
  histTit: { fontFamily: 'Barlow Condensed, sans-serif', fontWeight: 700, fontSize: 12, letterSpacing: 0.5, color: 'var(--muted)', marginBottom: 4 },
  histLinea: { fontFamily: 'Barlow, sans-serif', fontSize: 12, color: 'var(--muted)', padding: '1px 0' },
}
