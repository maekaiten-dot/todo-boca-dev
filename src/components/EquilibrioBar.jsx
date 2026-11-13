// src/components/EquilibrioBar.jsx
// Barra de punto de equilibrio en Hoy (solo Admin): lo vendido hoy y en el mes contra lo que hace falta
// vender para cubrir los gastos fijos (ver src/lib/equilibrio.js). Tocándola se ve de dónde sale la cuenta.
import { useEffect, useMemo, useState } from 'react'
import { getPagos, getVentasDesde } from '../api/sheets.js'
import { calcularRentabilidad, sumarRentabilidad } from '../lib/rentabilidad.js'
import { gastosFijosVigentes, calcularEquilibrio } from '../lib/equilibrio.js'
import { nombreMesGasto } from '../lib/etiquetasGastos.js'

const fmt$ = n => '$' + Math.round(n || 0).toLocaleString('es-AR')
const hoyAR = () => { const d = new Date(Date.now() - 3 * 3600000); return { a: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate() } }
const montoFila = v => Number(v.precioTotalFinal) || Number(v.precioTotal) || 0

export default function EquilibrioBar({ totalDia = 0, articulos = [], refreshKey }) {
  const [datos, setDatos] = useState(null)
  const [error, setError] = useState(false)
  const [abierto, setAbierto] = useState(() => { try { return localStorage.getItem('tb_equilibrio_abierto') === '1' } catch { return false } })
  const alternar = () => setAbierto(v => { try { localStorage.setItem('tb_equilibrio_abierto', v ? '0' : '1') } catch {} return !v })

  useEffect(() => {
    let vivo = true
    const h = hoyAR()
    const desde = new Date(Date.UTC(h.a, h.m - 1, h.d - 89)).toISOString().slice(0, 10)
    Promise.all([getPagos(), getVentasDesde(desde)])
      .then(([pagos, ventas]) => { if (vivo) { setDatos({ pagos, ventas }); setError(false) } })
      .catch(() => { if (vivo) setError(true) })
    return () => { vivo = false }
  }, [refreshKey])

  const r = useMemo(() => {
    if (!datos) return null
    const h = hoyAR()
    const mesActual = `${h.a}-${String(h.m).padStart(2, '0')}`
    const fijos = gastosFijosVigentes(datos.pagos, mesActual)
    const { items } = calcularRentabilidad({ ventas: datos.ventas, articulos, dias: 90 })
    const margenPct = sumarRentabilidad(items, 90).margenPct
    const sufijo = `/${h.m}/${h.a}`
    const vendidoMes = datos.ventas.filter(v => !v.anulado && String(v.fecha || '').replace(/^'/, '').endsWith(sufijo)).reduce((s, v) => s + montoFila(v), 0)
    const eq = calcularEquilibrio({ fijos: fijos.total, margenPct, anio: h.a, mes: h.m, dia: h.d, vendidoHoy: totalDia, vendidoMes })
    return { fijos, margenPct, vendidoMes, eq, h }
  }, [datos, articulos, totalDia])

  if (error) return null
  if (!r) return <div style={S.barra}><span style={S.etq}>Calculando punto de equilibrio…</span></div>
  if (!r.eq) return (
    <div style={S.barra}><span style={S.etq}>Punto de equilibrio: cargá en Pagos los gastos fijos con su etiqueta (sueldos, alquiler, servicios…) para calcularlo.</span></div>
  )
  const { eq, fijos } = r
  const okHoy = totalDia >= eq.diario
  const okMes = eq.diferenciaMes >= 0
  return (
    <div style={S.caja}>
      <button style={S.barraBtn} onClick={alternar} aria-expanded={abierto}>
        <div style={S.item}>
          <span style={{ ...S.valor, color: okHoy ? '#22c55e' : '#f59e0b' }}>{okHoy ? '✓ Cubierto' : `Faltan ${fmt$(eq.faltaHoy)}`}</span>
          <span style={S.etq}>Equilibrio de hoy: {fmt$(eq.diario)}</span>
        </div>
        <div style={S.barraWrap} aria-hidden="true">
          <div style={{ ...S.relleno, width: `${Math.min(100, eq.pctHoy * 100)}%`, background: okHoy ? '#22c55e' : '#f59e0b' }} />
        </div>
        <div style={S.item}>
          <span style={{ ...S.valor, color: okMes ? '#22c55e' : '#f59e0b' }}>{okMes ? '+' : '−'}{fmt$(Math.abs(eq.diferenciaMes))}</span>
          <span style={S.etq}>Mes {okMes ? 'adelantado' : 'atrasado'} · {Math.round(eq.pctMes * 100)}% de {fmt$(eq.mensual)}</span>
        </div>
        <span style={S.toggle}>{abierto ? 'Ocultar ▴' : 'Detalle ▾'}</span>
      </button>
      {abierto && (
        <div style={S.detalle}>
          <div style={S.fila}><span>Vendido en el mes</span><b>{fmt$(r.vendidoMes)}</b></div>
          <div style={S.fila}><span>Para llegar al equilibrio: vender por día desde hoy</span><b>{fmt$(eq.porDiaRestante)}</b></div>
          <div style={S.fila}><span>Margen (últimos 90 días: venta − mercadería − cobro)</span><b>{Math.round(r.margenPct * 100)}%</b></div>
          <div style={S.fila}><span>Gastos fijos del mes</span><b>{fmt$(fijos.total)}</b></div>
          {fijos.detalle.map(d => (
            <div key={d.etiqueta} style={S.subfila}><span>{d.etiqueta} <span style={S.mes}>({nombreMesGasto(d.mes)})</span></span><span>{fmt$(d.monto)}</span></div>
          ))}
          {fijos.sinAlquiler && <div style={S.aviso}>⚠ No hay alquiler cargado en Pagos (etiqueta "Alquiler local"): el equilibrio da más bajo de lo real.</div>}
          <div style={S.nota}>Equilibrio del mes = gastos fijos ÷ margen. Por día = el del mes ÷ {eq.diasMes} días. De cada gasto fijo se usa el último mes cargado.</div>
        </div>
      )}
    </div>
  )
}

const S = {
  caja: { margin: '0 20px 10px', background: 'var(--surface)', border: '1.5px solid var(--border)', borderRadius: 12, flexShrink: 0 },
  barra: { margin: '0 20px 10px', padding: '8px 16px', background: 'var(--surface)', border: '1.5px solid var(--border)', borderRadius: 12, flexShrink: 0 },
  barraBtn: { display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '6px 20px', width: '100%', padding: '8px 16px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', color: 'inherit' },
  item: { display: 'flex', flexDirection: 'column' },
  valor: { fontFamily: 'Barlow Condensed, sans-serif', fontWeight: 800, fontSize: 22, lineHeight: 1.1 },
  etq: { fontFamily: 'Barlow, sans-serif', fontSize: 12, color: 'var(--muted)' },
  barraWrap: { flex: '1 1 120px', minWidth: 100, height: 10, background: 'var(--border)', borderRadius: 5, overflow: 'hidden' },
  relleno: { height: '100%', borderRadius: 5 },
  toggle: { marginLeft: 'auto', fontFamily: 'Barlow Condensed, sans-serif', fontWeight: 700, fontSize: 14, color: 'var(--muted)', letterSpacing: 0.5, textTransform: 'uppercase', whiteSpace: 'nowrap' },
  detalle: { padding: '4px 16px 12px', borderTop: '1px solid var(--border)', fontFamily: 'Barlow, sans-serif', fontSize: 14, color: 'var(--text)' },
  fila: { display: 'flex', justifyContent: 'space-between', gap: 12, padding: '5px 0' },
  subfila: { display: 'flex', justifyContent: 'space-between', gap: 12, padding: '2px 0 2px 14px', fontSize: 13, color: 'var(--muted)' },
  mes: { fontSize: 11 },
  aviso: { marginTop: 6, color: '#f59e0b', fontSize: 13 },
  nota: { marginTop: 8, fontSize: 11, color: 'var(--muted)' },
}
