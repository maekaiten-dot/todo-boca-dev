// src/components/DesgloseStock.jsx
// "¿De dónde sale este número?": el stock de un artículo paso a paso, desde el último conteo.
// Las ventas se agrupan por día; ingresos, bajas y devoluciones van cada uno en su renglón.
import { useState, useEffect } from 'react'
import { desgloseStock } from '../api/sheets.js'

const sgn = n => (n > 0 ? '+' : n < 0 ? '−' : '') + Math.abs(n)
const corta = f => String(f || '').split('/').slice(0, 2).join('/')

export default function DesgloseStock({ art, onCerrar }) {
  const [d, setD] = useState(null)
  const [error, setError] = useState('')
  const [abiertos, setAbiertos] = useState(() => new Set())
  useEffect(() => { desgloseStock(art).then(setD).catch(e => { console.error(e); setError('No se pudo calcular el desglose') }) }, [art])

  // Ventas del mismo día juntas
  const filas = []
  for (const e of d?.eventos || []) {
    const ult = filas[filas.length - 1]
    if (e.tipo === 'VENTA' && ult?.tipo === 'DIA' && ult.fecha === e.fecha) { ult.cant += e.cant; ult.saldo = e.saldo; ult.items.push(e) }
    else if (e.tipo === 'VENTA') filas.push({ tipo: 'DIA', fecha: e.fecha, cant: e.cant, saldo: e.saldo, items: [e] })
    else filas.push(e)
  }
  const texto = f => f.tipo === 'DIA' ? `Ventas del ${corta(f.fecha)} (${f.items.length} ${f.items.length === 1 ? 'ticket' : 'tickets'})`
    : f.tipo === 'INGRESO' ? `Ingreso ${corta(f.fecha)} ${String(f.hora).slice(0, 5)}${f.detalle ? ` · ${f.detalle}` : ''} · ${f.ref}`
    : f.tipo === 'BAJA' ? `Baja ${corta(f.fecha)} ${String(f.hora).slice(0, 5)} · ${f.detalle || ''}${f.quien ? ` · ${f.quien}` : ''}`
    : `Devolución (cambio) ${corta(f.fecha)} ${String(f.hora).slice(0, 5)} · ${f.ref}`
  const color = f => f.cant > 0 ? '#22c55e' : f.tipo === 'BAJA' ? '#f59e0b' : 'var(--text)'

  return (
    <div style={S.overlay} onClick={onCerrar}>
      <div style={S.modal} onClick={e => e.stopPropagation()} role="dialog" aria-label="Desglose del stock">
        <div style={S.header}>
          <div>
            <div style={S.titulo}>¿DE DÓNDE SALE EL STOCK?</div>
            <div style={S.sub}>{art.nombre} · {art.id}</div>
          </div>
          <button style={S.cerrar} onClick={onCerrar} aria-label="Cerrar">✕</button>
        </div>
        <div style={S.cuerpo}>
          {error && <div style={{ color: '#ef4444' }}>{error}</div>}
          {!d && !error && <div style={S.chico}>Calculando…</div>}
          {d && (<>
            <div style={S.fila}>
              <span>{d.base.tipo === 'CONTEO' ? <><b>Conteo</b> {corta(d.base.fecha)} {String(d.base.hora).slice(0, 5)}{d.base.quien ? ` · ${d.base.quien}` : ''}</> : <b>Stock inicial (todavía no se contó)</b>}</span>
              <span style={S.num}>{d.base.cant}</span><span style={S.saldo}>{d.base.cant}</span>
            </div>
            {d.base.tipo === 'CONTEO' && <div style={S.chico}>Lo anterior al conteo no cuenta: el conteo es el punto de partida{d.conteosAnteriores ? ` (hay ${d.conteosAnteriores} conteo${d.conteosAnteriores === 1 ? '' : 's'} anterior${d.conteosAnteriores === 1 ? '' : 'es'})` : ''}.</div>}
            {filas.map((f, k) => (
              <div key={k}>
                <div style={{ ...S.fila, ...(f.tipo === 'DIA' ? { cursor: 'pointer' } : {}) }} onClick={f.tipo === 'DIA' ? () => setAbiertos(s => { const n = new Set(s); n.has(k) ? n.delete(k) : n.add(k); return n }) : undefined} data-tipo={f.tipo}>
                  <span>{f.tipo === 'DIA' && <span style={{ color: '#60a5fa' }}>{abiertos.has(k) ? '▾ ' : '▸ '}</span>}{texto(f)}</span>
                  <span style={{ ...S.num, color: color(f) }}>{sgn(f.cant)}</span><span style={S.saldo}>{f.saldo}</span>
                </div>
                {f.tipo === 'DIA' && abiertos.has(k) && f.items.map((e, j) => (
                  <div key={j} style={{ ...S.fila, ...S.sub2 }}><span>{String(e.hora).slice(0, 5)} · {e.ref}{e.quien ? ` · ${e.quien}` : ''}</span><span style={S.num}>{sgn(e.cant)}</span><span style={S.saldo}>{e.saldo}</span></div>
                ))}
              </div>
            ))}
            {d.unificados.map(u => (
              <div key={u.id} style={S.fila}><span>Stock de {u.id} (unificado en este, hasta que se cuente)</span><span style={{ ...S.num, color: '#60a5fa' }}>{sgn(u.stock)}</span><span style={S.saldo}></span></div>
            ))}
            <div style={{ ...S.fila, ...S.total }}><span>STOCK SEGÚN LA APP</span><span></span><span style={{ ...S.saldo, color: d.total < 0 ? '#ef4444' : 'var(--accent)', fontSize: 22 }}>{d.total}</span></div>
            <div style={S.chico}>Si en el local hay otra cantidad, contalo en Conteo: el conteo pasa a ser el nuevo punto de partida y la diferencia queda registrada.</div>
          </>)}
        </div>
      </div>
    </div>
  )
}

const S = {
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,10,0.85)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 520, backdropFilter: 'blur(6px)' },
  modal: { background: 'var(--surface)', borderRadius: '20px 20px 0 0', width: '100%', maxWidth: 620, maxHeight: '88vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '16px 20px 10px', borderBottom: '1px solid var(--border)' },
  titulo: { fontFamily: 'Barlow Condensed, sans-serif', fontWeight: 800, fontSize: 20, color: 'var(--accent)', letterSpacing: 1 },
  sub: { fontFamily: 'Barlow, sans-serif', fontSize: 13, color: 'var(--muted)', marginTop: 2 },
  cerrar: { background: 'none', border: 'none', color: 'var(--muted)', fontSize: 20, cursor: 'pointer' },
  cuerpo: { overflowY: 'auto', padding: '10px 20px 20px', display: 'flex', flexDirection: 'column', gap: 2 },
  fila: { display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 56px 56px', alignItems: 'center', gap: 8, padding: '7px 0', borderBottom: '1px solid var(--border)', fontFamily: 'Barlow, sans-serif', fontSize: 14, color: 'var(--text)' },
  sub2: { paddingLeft: 22, fontSize: 12, color: 'var(--muted)' },
  num: { textAlign: 'right', fontFamily: 'Barlow Condensed, sans-serif', fontWeight: 700, fontSize: 16 },
  saldo: { textAlign: 'right', fontFamily: 'Barlow Condensed, sans-serif', fontWeight: 800, fontSize: 16, color: 'var(--muted)' },
  total: { borderBottom: 'none', borderTop: '2px solid var(--accent)', marginTop: 6, fontFamily: 'Barlow Condensed, sans-serif', fontWeight: 800, letterSpacing: 1 },
  chico: { fontFamily: 'Barlow, sans-serif', fontSize: 12, color: 'var(--muted)', lineHeight: 1.4, padding: '4px 0' },
}
