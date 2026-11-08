// src/components/BonosMes.jsx
// Presentismo y bono de fin de semana del mes, por empleada. Solo lo ven los admin.
// Los valores (valor hora, horas por día, % presentismo, % recargo) se guardan en la hoja CONFIG.
import { useEffect, useState } from 'react'
import { getConfig, setConfig } from '../api/sheets.js'
import { calcularBonos, BONOS_DEFAULT, DIAS_CORTOS, ESTADOS, parseFecha } from '../lib/asistencia.js'

const CLAVES = { valorHora: 'BONOS VALOR HORA', horasDia: 'BONOS HORAS POR DIA', presentismo: 'BONOS PRESENTISMO %', recargo: 'BONOS RECARGO FIN DE SEMANA %' }
const $ = n => '$' + Math.round(n || 0).toLocaleString('es-AR')
const lista = arr => arr.length ? arr.join(', ') : '—'

export default function BonosMes({ resultado, nombreMes, perfilNombre = '' }) {
  const [p, setP] = useState(BONOS_DEFAULT)
  const [editando, setEditando] = useState(false)
  const [borrador, setBorrador] = useState(BONOS_DEFAULT)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')
  const [abierta, setAbierta] = useState(null)

  useEffect(() => {
    getConfig().then(c => {
      const v = { ...BONOS_DEFAULT }
      for (const [k, clave] of Object.entries(CLAVES)) if (c[clave]?.valor !== undefined && c[clave].valor !== '') v[k] = Number(String(c[clave].valor).replace(',', '.')) || v[k]
      setP(v)
    }).catch(() => {})
  }, [])

  async function guardar() {
    setGuardando(true); setError('')
    try {
      await setConfig(Object.fromEntries(Object.entries(CLAVES).map(([k, clave]) => [clave, borrador[k]])), perfilNombre)
      setP(borrador); setEditando(false)
    } catch (e) { setError('No se pudo guardar: ' + e.message) }
    finally { setGuardando(false) }
  }

  const filas = resultado.map(emp => ({ emp, b: calcularBonos(emp, p) }))
  const total = filas.reduce((s, x) => s + x.b.total, 0)
  const base = p.valorHora * p.horasDia

  return (
    <div style={S.card}>
      <div style={S.filaTit}>
        <div style={S.tit}>Presentismo y fin de semana · {nombreMes}</div>
        <button style={S.btnChico} onClick={() => { setBorrador(p); setEditando(e => !e) }}>{editando ? 'Cancelar' : 'Valores'}</button>
      </div>

      {editando ? (
        <div style={S.form}>
          {[['valorHora', 'Valor hora base ($)'], ['horasDia', 'Horas por día'], ['presentismo', 'Presentismo (%)'], ['recargo', 'Recargo fin de semana (%)']].map(([k, t]) => (
            <label key={k} style={S.campo}>
              <span style={S.lbl}>{t}</span>
              <input style={S.input} type="number" inputMode="decimal" min="0" value={borrador[k]} onChange={e => setBorrador(b => ({ ...b, [k]: e.target.value }))} />
            </label>
          ))}
          <div style={S.muted}>El recargo es lo que se paga de más por cada hora de sábado o domingo (50% = la mitad del valor hora).</div>
          {error && <div style={S.error}>{error}</div>}
          <button style={S.btn} onClick={guardar} disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar valores'}</button>
        </div>
      ) : (
        <div style={S.muted}>Hora {$(p.valorHora)} × {p.horasDia} hs = {$(base)} por día · presentismo {p.presentismo}% · recargo fin de semana {p.recargo}%</div>
      )}

      {filas.map(({ emp, b }) => (
        <div key={emp.idUsuario} style={S.emp}>
          <button style={S.empFila} onClick={() => setAbierta(a => a === emp.idUsuario ? null : emp.idUsuario)} aria-expanded={abierta === emp.idUsuario}>
            <span style={S.empNombre}>{abierta === emp.idUsuario ? '▾' : '▸'} {emp.nombre}</span>
            <span style={S.empTotal}>{$(b.total)}</span>
          </button>
          {(b.revisar > 0 || b.pendientes > 0) && (
            <div style={S.aviso}>⚠ {b.revisar > 0 ? `${b.revisar} ${b.revisar === 1 ? 'día para revisar' : 'días para revisar'} en Asistencia` : ''}{b.revisar > 0 && b.pendientes > 0 ? ' · ' : ''}{b.pendientes > 0 ? `faltan ${b.pendientes} días del mes` : ''}: el monto puede cambiar.</div>
          )}
          <table style={S.tabla}><tbody>
            <tr><td style={S.td}>Presentismo</td><td style={S.tdC}>{$(base)} × {b.dias} días × {p.presentismo}%</td><td style={S.tdR}>{$(b.presentismo)}</td></tr>
            <tr><td style={S.td}>Fin de semana</td><td style={S.tdC}>{$(base)} × {b.diasFinde} días × {p.recargo}%</td><td style={S.tdR}>{$(b.bonoFinde)}</td></tr>
          </tbody></table>
          {abierta === emp.idUsuario && (
            <div style={S.detalle}>
              <div>Sábados trabajados: {lista(b.sabados)} · Domingos: {lista(b.domingos)}</div>
              <div style={{ marginTop: 4 }}>Días no trabajados: {b.noTrabajados.length ? b.noTrabajados.map(d => `${DIAS_CORTOS[d.dow]} ${parseFecha(d.fecha).d} (${(ESTADOS[d.estado]?.texto || d.estado).toLowerCase()})`).join(' · ') : 'ninguno'}</div>
            </div>
          )}
        </div>
      ))}
      <div style={S.totalFila}><span>Total del mes</span><span>{$(total)}</span></div>
      <div style={S.muted}>Cuenta como trabajado: días con fichada (a tiempo o tarde) y días cargados como "trabajó sin fichar". Las horas extra no entran: se pagan aparte.</div>
    </div>
  )
}

const S = {
  card: { background: 'var(--surface)', border: '1px solid var(--accent)', borderRadius: 12, padding: 14, display: 'flex', flexDirection: 'column', gap: 10 },
  filaTit: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  tit: { fontFamily: 'Barlow Condensed, sans-serif', fontWeight: 800, fontSize: 19, color: 'var(--accent-text)' },
  btnChico: { fontFamily: 'Barlow Condensed, sans-serif', fontWeight: 700, fontSize: 14, background: 'none', color: 'var(--accent-text)', border: '1.5px solid var(--accent)', borderRadius: 16, padding: '4px 12px', cursor: 'pointer' },
  form: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 },
  campo: { display: 'flex', flexDirection: 'column', gap: 4 },
  lbl: { fontFamily: 'Barlow, sans-serif', fontSize: 13, color: 'var(--muted)' },
  input: { fontFamily: 'Barlow, sans-serif', fontSize: 16, padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface2)', color: 'var(--text)' },
  btn: { gridColumn: '1 / -1', fontFamily: 'Barlow Condensed, sans-serif', fontWeight: 700, fontSize: 16, background: 'var(--accent)', color: '#000', border: 'none', borderRadius: 10, padding: 10, cursor: 'pointer' },
  muted: { fontFamily: 'Barlow, sans-serif', fontSize: 13, color: 'var(--muted)', lineHeight: 1.4, gridColumn: '1 / -1' },
  error: { fontFamily: 'Barlow, sans-serif', fontSize: 14, color: '#f87171', gridColumn: '1 / -1' },
  emp: { borderTop: '1px solid var(--border)', paddingTop: 10 },
  empFila: { width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'var(--text)' },
  empNombre: { fontFamily: 'Barlow Condensed, sans-serif', fontWeight: 700, fontSize: 18 },
  empTotal: { fontFamily: 'Barlow Condensed, sans-serif', fontWeight: 800, fontSize: 20, color: 'var(--accent-text)' },
  aviso: { fontFamily: 'Barlow, sans-serif', fontSize: 13, color: '#fbbf24', marginTop: 4 },
  tabla: { width: '100%', borderCollapse: 'collapse', marginTop: 6 },
  td: { fontFamily: 'Barlow, sans-serif', fontSize: 14, color: 'var(--text)', padding: '3px 0' },
  tdC: { fontFamily: 'Barlow, sans-serif', fontSize: 13, color: 'var(--muted)', padding: '3px 8px' },
  tdR: { fontFamily: 'Barlow, sans-serif', fontSize: 15, color: 'var(--text)', padding: '3px 0', textAlign: 'right', whiteSpace: 'nowrap' },
  detalle: { fontFamily: 'Barlow, sans-serif', fontSize: 13, color: 'var(--muted)', marginTop: 6, lineHeight: 1.4 },
  totalFila: { display: 'flex', justifyContent: 'space-between', borderTop: '1px solid var(--border)', paddingTop: 10, fontFamily: 'Barlow Condensed, sans-serif', fontWeight: 800, fontSize: 20, color: 'var(--text)' },
}
