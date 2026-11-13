// src/components/DeudasPorMes.jsx
// Lo que falta pagar de mercadería, agrupado por el mes en que entró (fecha de ingreso).
// Tocando un mes se ve cuánto se le debe a cada proveedor.
import { useMemo, useState } from 'react'

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
const mesDe = f => { const p = String(f || '').replace(/^'/, '').split(' ')[0].split('/'); return p.length >= 3 && p[2] ? `${p[2]}-${String(p[1]).padStart(2, '0')}` : null }
const nombreMes = k => { if (!k) return 'Sin fecha de ingreso'; const [a, m] = k.split('-'); const n = MESES[Number(m) - 1]; return `${n[0].toUpperCase()}${n.slice(1)} ${a}` }
const fmt$ = n => '$' + Math.round(n || 0).toLocaleString('es-AR')

export function deudasPorMes(pagos) {
  const m = {}
  for (const p of pagos) {
    if (p.anulado || p.pagado || p.tipo !== 'MERCADERÍA') continue
    const k = mesDe(p.fechaIngreso) || ''
    const x = m[k] || (m[k] = { mes: k, total: 0, renglones: 0, prov: {} })
    x.total += p.costoTotal; x.renglones++
    const pr = (p.proveedor || 'Sin proveedor').trim()
    x.prov[pr] = (x.prov[pr] || 0) + p.costoTotal
  }
  // Los más viejos primero (son los que hay que pagar antes); "sin fecha" al final
  return Object.values(m).sort((a, b) => !a.mes ? 1 : !b.mes ? -1 : a.mes.localeCompare(b.mes))
}

export default function DeudasPorMes({ pagos }) {
  const meses = useMemo(() => deudasPorMes(pagos), [pagos])
  const [abierto, setAbierto] = useState(null)
  const total = meses.reduce((s, x) => s + x.total, 0)
  if (!meses.length) return null
  return (
    <div style={S.card}>
      <div style={S.titulo}>DEUDA DE MERCADERÍA POR MES <span style={S.total}>{fmt$(total)}</span></div>
      {meses.map(x => {
        const prov = Object.entries(x.prov).sort((a, b) => b[1] - a[1])
        const ab = abierto === x.mes
        return (
          <div key={x.mes || 'sin'}>
            <button style={S.fila} onClick={() => setAbierto(ab ? null : x.mes)} aria-expanded={ab}>
              <span style={S.mes}>{ab ? '▾' : '▸'} {nombreMes(x.mes)}</span>
              <span style={S.sub}>{prov.length} {prov.length === 1 ? 'proveedor' : 'proveedores'}</span>
              <span style={S.monto}>{fmt$(x.total)}</span>
            </button>
            {ab && (
              <div style={S.detalle}>
                {prov.map(([n, v]) => (
                  <div key={n} style={S.prov}><span>{n}</span><span style={S.provMonto}>{fmt$(v)}</span></div>
                ))}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

const S = {
  card: { margin: '0 20px 10px', background: 'var(--surface)', border: '1.5px solid var(--border)', borderRadius: 12, padding: '10px 14px' },
  titulo: { fontFamily: 'Barlow Condensed, sans-serif', fontWeight: 800, fontSize: 14, letterSpacing: 1, color: 'var(--muted)', display: 'flex', justifyContent: 'space-between', marginBottom: 4 },
  total: { color: '#f59e0b', fontSize: 16 },
  fila: { width: '100%', display: 'grid', gridTemplateColumns: '1fr auto auto', gap: 10, alignItems: 'center', background: 'none', border: 'none', borderTop: '1px solid var(--border)', padding: '9px 0', cursor: 'pointer', color: 'var(--text)', textAlign: 'left' },
  mes: { fontFamily: 'Barlow, sans-serif', fontWeight: 700, fontSize: 15 },
  sub: { fontFamily: 'Barlow, sans-serif', fontSize: 12, color: 'var(--muted)' },
  monto: { fontFamily: 'Barlow Condensed, sans-serif', fontWeight: 800, fontSize: 18, color: '#f59e0b', minWidth: 90, textAlign: 'right' },
  detalle: { padding: '0 0 8px 18px' },
  prov: { display: 'flex', justifyContent: 'space-between', fontFamily: 'Barlow, sans-serif', fontSize: 14, padding: '3px 0', color: 'var(--text)' },
  provMonto: { fontWeight: 700 },
}
