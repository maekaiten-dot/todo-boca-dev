// src/components/PagosPorMes.jsx
// Pagos resumidos por mes: cuánto se compró de mercadería para vender (por fecha de ingreso), cuánto
// se les pagó a los proveedores (por fecha de pago), cuánto de lo comprado falta pagar, y los otros
// gastos. Tocando un mes se ve el detalle por proveedor y los artículos más comprados.
import { useState, useMemo } from 'react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts'

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
const mesDe = f => { const p = String(f || '').replace(/^'/, '').split(' ')[0].split('/'); return p.length >= 3 && p[2] ? `${p[2]}-${String(p[1]).padStart(2, '0')}` : null }
const nombreMes = k => { const [a, m] = k.split('-'); return `${MESES[Number(m) - 1]} ${a}` }
const corto = k => { const [a, m] = k.split('-'); return `${MESES[Number(m) - 1].slice(0, 3)} ${a.slice(2)}` }
const fmt$ = n => '$' + Math.round(n || 0).toLocaleString('es-AR')
const fmtM = n => n >= 1e6 ? `${(n / 1e6).toLocaleString('es-AR', { maximumFractionDigits: 1 })}M` : n >= 1e3 ? `${Math.round(n / 1e3)}k` : String(Math.round(n))

export function resumirPorMes(pagos) {
  const m = {}
  const mes = k => (m[k] ||= { mes: k, comprado: 0, pagadoMerc: 0, falta: 0, gastos: 0, unidades: 0, renglones: 0, prov: {}, arts: {} })
  for (const p of pagos) {
    if (p.anulado) continue
    if (p.tipo === 'MERCADERÍA') {
      const kc = mesDe(p.fechaIngreso) || mesDe(p.fechaPago)
      if (kc) {
        const x = mes(kc)
        x.comprado += p.costoTotal || 0; x.unidades += p.cantidad || 0; x.renglones++
        x.falta += Math.max(0, (p.costoTotal || 0) - (p.montoPagado || 0))
        const pv = (x.prov[(p.proveedor || 'Sin proveedor').trim()] ||= { comprado: 0, pagado: 0, falta: 0 })
        pv.comprado += p.costoTotal || 0; pv.falta += Math.max(0, (p.costoTotal || 0) - (p.montoPagado || 0))
        const ar = (x.arts[p.articuloId || p.articuloNombre] ||= { nombre: p.articuloNombre || p.articuloId, unidades: 0, total: 0 })
        ar.unidades += p.cantidad || 0; ar.total += p.costoTotal || 0
      }
      const kp = mesDe(p.fechaPago)
      if (kp && p.montoPagado > 0) {
        const x = mes(kp); x.pagadoMerc += p.montoPagado
        const pv = (x.prov[(p.proveedor || 'Sin proveedor').trim()] ||= { comprado: 0, pagado: 0, falta: 0 }); pv.pagado += p.montoPagado
      }
    } else {
      const k = mesDe(p.fechaPago) || mesDe(p.fechaIngreso)
      if (k) mes(k).gastos += p.montoPagado || p.costoTotal || 0
    }
  }
  return Object.values(m).sort((a, b) => b.mes.localeCompare(a.mes))
}

export default function PagosPorMes({ pagos }) {
  const meses = useMemo(() => resumirPorMes(pagos), [pagos])
  const [abierto, setAbierto] = useState(null)
  const grafico = [...meses].slice(0, 12).reverse().map(x => ({ label: corto(x.mes), Comprado: Math.round(x.comprado), Pagado: Math.round(x.pagadoMerc) }))
  if (!meses.length) return <div style={S.vacio}>Todavía no hay pagos cargados.</div>
  return (
    <div style={S.wrap}>
      <div style={S.nota}>
        <b>Comprado</b>: la mercadería para vender que entró ese mes (por fecha de ingreso), esté pagada o no.
        {' '}<b>Pagado</b>: lo que se les pagó a los proveedores ese mes (por fecha de pago), sea de compras de ese mes o de antes.
        {' '}<b>Falta pagar</b>: lo que todavía se debe de las compras de ese mes. <b>Otros gastos</b>: los pagos que no son mercadería.
      </div>
      <div style={{ width: '100%', height: 240 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={grafico} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
            <XAxis dataKey="label" tick={{ fontFamily: 'Barlow Condensed, sans-serif', fontSize: 11, fill: '#6a8ccc' }} tickLine={false} axisLine={false} interval={0} />
            <YAxis tickFormatter={fmtM} tick={{ fontFamily: 'Barlow Condensed, sans-serif', fontSize: 11, fill: '#6a8ccc' }} tickLine={false} axisLine={false} width={44} />
            <Tooltip formatter={v => fmt$(v)} contentStyle={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, fontFamily: 'Barlow, sans-serif' }} labelStyle={{ color: 'var(--text)' }} />
            <Legend wrapperStyle={{ fontFamily: 'Barlow, sans-serif', fontSize: 12 }} />
            <Bar dataKey="Comprado" fill="#f5c800" radius={[4, 4, 0, 0]} maxBarSize={28} />
            <Bar dataKey="Pagado" fill="#22c55e" radius={[4, 4, 0, 0]} maxBarSize={28} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div style={S.tablaWrap}>
        <table style={S.tabla}>
          <thead><tr>
            <th style={{ ...S.th, textAlign: 'left' }}>Mes</th><th style={S.th}>Comprado</th><th style={S.th}>Pagado a proveedores</th><th style={S.th}>Falta pagar</th><th style={S.th}>Otros gastos</th><th style={S.th}>Unidades</th>
          </tr></thead>
          <tbody>
            {meses.map(x => {
              const ab = abierto === x.mes
              const provs = Object.entries(x.prov).sort((a, b) => (b[1].comprado + b[1].pagado) - (a[1].comprado + a[1].pagado))
              const arts = Object.values(x.arts).sort((a, b) => b.total - a.total).slice(0, 8)
              return [
                <tr key={x.mes} style={{ cursor: 'pointer', ...(ab ? { background: 'rgba(245,200,0,0.06)' } : {}) }} onClick={() => setAbierto(ab ? null : x.mes)} data-mes={x.mes}>
                  <td style={{ ...S.td, textAlign: 'left', textTransform: 'capitalize' }}><span style={{ color: '#60a5fa' }}>{ab ? '▾ ' : '▸ '}</span>{nombreMes(x.mes)}</td>
                  <td style={{ ...S.td, fontWeight: 700, color: 'var(--accent)' }}>{fmt$(x.comprado)}</td>
                  <td style={{ ...S.td, color: '#22c55e' }}>{fmt$(x.pagadoMerc)}</td>
                  <td style={{ ...S.td, color: x.falta > 0 ? '#f59e0b' : 'var(--muted)' }}>{x.falta > 0 ? fmt$(x.falta) : '✓'}</td>
                  <td style={{ ...S.td, color: 'var(--muted)' }}>{fmt$(x.gastos)}</td>
                  <td style={{ ...S.td, color: 'var(--muted)' }}>{x.unidades.toLocaleString('es-AR')}</td>
                </tr>,
                ab && (
                  <tr key={x.mes + '-d'}><td colSpan={6} style={{ ...S.td, textAlign: 'left', whiteSpace: 'normal', background: 'var(--surface2)' }}>
                    <div style={S.detalle}>
                      <div>
                        <div style={S.detTitulo}>POR PROVEEDOR</div>
                        {provs.map(([n, v]) => (
                          <div key={n} style={S.detFila}><span>{n}</span><span>{v.comprado > 0 ? `compró ${fmt$(v.comprado)}` : ''}{v.comprado > 0 && v.pagado > 0 ? ' · ' : ''}{v.pagado > 0 ? `pagado ${fmt$(v.pagado)}` : ''}{v.falta > 0 ? <span style={{ color: '#f59e0b' }}> · falta {fmt$(v.falta)}</span> : ''}</span></div>
                        ))}
                      </div>
                      {arts.length > 0 && <div>
                        <div style={S.detTitulo}>LO QUE MÁS SE COMPRÓ</div>
                        {arts.map(a => <div key={a.nombre} style={S.detFila}><span>{a.nombre}</span><span>{a.unidades.toLocaleString('es-AR')} u. · {fmt$(a.total)}</span></div>)}
                      </div>}
                    </div>
                  </td></tr>
                ),
              ]
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

const S = {
  wrap: { display: 'flex', flexDirection: 'column', gap: 12, padding: '0 20px 20px' },
  vacio: { fontFamily: 'Barlow, sans-serif', fontSize: 14, color: 'var(--muted)', padding: 20 },
  nota: { fontFamily: 'Barlow, sans-serif', fontSize: 12, color: 'var(--muted)', lineHeight: 1.5 },
  tablaWrap: { overflowX: 'auto', WebkitOverflowScrolling: 'touch' },
  tabla: { width: '100%', minWidth: 640, borderCollapse: 'collapse' },
  th: { fontFamily: 'Barlow Condensed, sans-serif', fontWeight: 800, fontSize: 12, color: 'var(--muted)', letterSpacing: 1, textTransform: 'uppercase', padding: '8px 10px', borderBottom: '2px solid var(--border)', textAlign: 'right', whiteSpace: 'nowrap' },
  td: { fontFamily: 'Barlow, sans-serif', fontSize: 14, color: 'var(--text)', padding: '9px 10px', borderBottom: '1px solid var(--border)', textAlign: 'right', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' },
  detalle: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16, padding: '4px 0' },
  detTitulo: { fontFamily: 'Barlow Condensed, sans-serif', fontWeight: 800, fontSize: 12, color: 'var(--accent)', letterSpacing: 1, marginBottom: 4 },
  detFila: { display: 'flex', justifyContent: 'space-between', gap: 10, fontFamily: 'Barlow, sans-serif', fontSize: 13, color: 'var(--text)', padding: '3px 0', borderBottom: '1px dashed var(--border)' },
}
