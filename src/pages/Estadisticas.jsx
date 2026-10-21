// src/pages/Estadisticas.jsx
import { useState, useEffect, useMemo, Fragment } from 'react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LabelList } from 'recharts'
import { getHistoricoVentas, montoConMetodo, repartoPago, usaPosnet } from '../api/sheets.js'
import CorregirPosnetModal from '../components/CorregirPosnetModal.jsx'
import MonotributoPosnet from '../components/MonotributoPosnet.jsx'
import IndiceEficiencia from '../components/IndiceEficiencia.jsx'

function esTarjetaOQR(metodo) {
  if (!metodo) return false
  const m = metodo.trim().toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  return m === 'tarjeta' ||
    m === 'tarjeta de credito' ||
    m === 'tarjeta de debito' ||
    m === 'qr'
}

function getUltimos35Dias() {
  const dias = []
  const hoy = new Date()
  const offset = -3 * 60
  const local = new Date(hoy.getTime() + (offset - hoy.getTimezoneOffset()) * 60000)
  for (let i = 34; i >= 0; i--) {
    const d = new Date(local)
    d.setDate(d.getDate() - i)
    const dia = d.getDate()
    const mes = d.getMonth() + 1
    const anio = d.getFullYear()
    const fechaKey = `${dia}/${mes}/${anio}`
    const label = `${String(dia).padStart(2,'0')}/${String(mes).padStart(2,'0')}`
    dias.push({ fechaKey, label, total: 0 })
  }
  return dias
}

function parsePrecio(v) {
  if (!v && v !== 0) return 0
  return Number(String(v).replace(/[$\s.]/g, '').replace(',', '.')) || 0
}

// monto (opcional): cuánto de la fila se suma (por ej. solo la parte con tarjeta o QR)
function agruparPorMes(ventas, filtro, monto) {
  const mesMap = {}
  ventas
    .filter(v => !v.anulado && (filtro ? filtro(v) : true))
    .forEach(v => {
      if (!v.fecha) return
      const partes = v.fecha.split('/')
      if (partes.length < 3) return
      const key = `${partes[2]}-${String(partes[1]).padStart(2,'0')}`
      const label = `${String(partes[1]).padStart(2,'0')}/${partes[2]}`
      if (!mesMap[key]) mesMap[key] = { key, label, total: 0 }
      mesMap[key].total += monto ? monto(v) : parsePrecio(v.precioTotalFinal) || parsePrecio(v.precioTotal)
    })
  return Object.values(mesMap).sort((a, b) => a.key.localeCompare(b.key))
}

const esPosnetBlanco = v => String(v.posnet || '').trim().toUpperCase() === 'BLANCO'
const tienePosnet = v => ['AMARILLO', 'BLANCO'].includes(String(v.posnet || '').trim().toUpperCase())

// Posnet blanco por mes: total cobrado y % sobre el total del mes.
// El posnet se registra desde que se agregó a la app: los meses anteriores no tienen el dato
// y no se muestran (arranca en el primer mes con algún posnet registrado).

// Tarjeta + QR por mes, separado por posnet (amarillo / blanco / sin dato). "Sin dato" son las ventas
// con tarjeta o QR de antes de que la app registrara el posnet. Porcentajes sobre el total vendido del mes.
const COLORES_POSNET = { amarillo: '#f5c800', blanco: '#e8eefc', sinDato: '#4b5f8a' }
function calcularTarjetaQRPorPosnet(ventas, mesTotales) {
  const porMes = {}
  // Con 2 medios de pago solo cuenta la parte cobrada con tarjeta o QR
  ventas.filter(v => !v.anulado && v.fecha && montoConMetodo(v, esTarjetaOQR) > 0).forEach(v => {
    const p = String(v.fecha).split('/'); if (p.length < 3) return
    const key = `${p[2]}-${String(p[1]).padStart(2, '0')}`
    const m = porMes[key] || (porMes[key] = { amarillo: 0, blanco: 0, sinDato: 0 })
    const monto = montoConMetodo(v, esTarjetaOQR)
    const pos = String(v.posnet || '').trim().toUpperCase()
    if (pos === 'AMARILLO') m.amarillo += monto
    else if (pos === 'BLANCO') m.blanco += monto
    else m.sinDato += monto
  })
  return mesTotales.filter(mt => porMes[mt.key]).map(mt => {
    const m = porMes[mt.key]
    const total = m.amarillo + m.blanco + m.sinDato
    const pct = x => mt.total > 0 ? Math.round(x / mt.total * 1000) / 10 : 0
    return {
      key: mt.key, label: mt.label, totalMes: mt.total, total, ...m,
      pctAmarillo: pct(m.amarillo), pctBlanco: pct(m.blanco), pctSinDato: pct(m.sinDato), pct: pct(total),
    }
  })
}

const PosnetTooltip = ({ active, payload, label, modo }) => {
  if (!(active && payload && payload.length)) return null
  const d = payload[0].payload
  const fila = (nombre, color, monto, pctTotal) => monto > 0 && (
    <div style={{ display:'flex', alignItems:'center', gap:8, fontFamily:'Barlow, sans-serif', fontSize:13, color:'var(--text)', marginTop:3 }}>
      <span style={{ width:14, height:9, borderRadius:3, background:color, flexShrink:0 }} />
      <span style={{ flex:1 }}>{nombre}</span>
      <strong>{modo === 'pct' ? `${pctTotal.toFixed(1)}%` : `$${Math.round(monto).toLocaleString('es-AR')}`}</strong>
      <span style={{ color:'var(--muted)', fontSize:12 }}>{modo === 'pct' ? `$${Math.round(monto).toLocaleString('es-AR')}` : `${pctTotal.toFixed(1)}%`}</span>
    </div>
  )
  return (
    <div style={{ background:'var(--surface)', border:'1.5px solid var(--border)', borderRadius:8, padding:'10px 14px', minWidth:230 }}>
      <div style={{ fontFamily:'Barlow Condensed, sans-serif', fontSize:13, color:'var(--muted)', marginBottom:4 }}>{label}</div>
      <div style={{ fontFamily:'Barlow Condensed, sans-serif', fontWeight:800, fontSize:20, color:'var(--accent)' }}>
        {modo === 'pct' ? `${d.pct.toFixed(1)}% del total` : `$${Math.round(d.total).toLocaleString('es-AR')}`}
      </div>
      <div style={{ fontFamily:'Barlow, sans-serif', fontSize:12, color:'var(--muted)' }}>
        Tarjeta + QR · {modo === 'pct' ? `$${Math.round(d.total).toLocaleString('es-AR')}` : `${d.pct.toFixed(1)}% del total del mes`}
      </div>
      {fila('Posnet blanco', COLORES_POSNET.blanco, d.blanco, d.pctBlanco)}
      {fila('Posnet amarillo', COLORES_POSNET.amarillo, d.amarillo, d.pctAmarillo)}
      {fila('Sin posnet registrado', COLORES_POSNET.sinDato, d.sinDato, d.pctSinDato)}
    </div>
  )
}

const LeyendaPosnet = () => (
  <div style={{ display:'flex', flexWrap:'wrap', gap:'4px 16px', fontFamily:'Barlow, sans-serif', fontSize:12, color:'var(--muted)', margin:'-4px 0 8px' }}>
    {[['Posnet blanco', COLORES_POSNET.blanco], ['Posnet amarillo', COLORES_POSNET.amarillo], ['Sin posnet registrado (ventas anteriores)', COLORES_POSNET.sinDato]].map(([t, c]) => (
      <span key={t} style={{ display:'inline-flex', alignItems:'center', gap:6 }}><span style={{ width:14, height:9, borderRadius:3, background:c }} />{t}</span>
    ))}
  </div>
)

function calcularPctPorMes(mesTotales, mesTarjeta) {
  // Para cada mes en mesTotales, calcular % tarjeta+QR
  return mesTotales.map(mt => {
    const tq = mesTarjeta.find(m => m.key === mt.key)
    const pct = mt.total > 0 ? parseFloat(((tq?.total || 0) / mt.total * 100).toFixed(2)) : 0
    return { key: mt.key, label: mt.label, pct }
  })
}

// Proyección del mes en curso: lo vendido hasta ahora + lo que falta, estimando cada día que queda
// con el promedio de ese día de la semana en las últimas 8 semanas (días completos, sin contar hoy).
// Para hoy se estima el día completo y se descuenta lo que ya se vendió.
const SEMANAS_PROYECCION = 8
function proyectarMesActual(ventas, ahoraMs = Date.now(), valor = v => parsePrecio(v.precioTotalFinal) || parsePrecio(v.precioTotal)) {
  const hoy = new Date(ahoraMs - 3 * 3600000) // fecha en Argentina (UTC-3)
  const y = hoy.getUTCFullYear(), m = hoy.getUTCMonth(), d = hoy.getUTCDate()
  const clave = (yy, mm, dd) => `${dd}/${mm + 1}/${yy}`
  const norm = f => { const [dd, mm, yy] = String(f || '').split('/').map(Number); return dd && mm && yy ? clave(yy, mm - 1, dd) : '' }
  const porDia = {}
  ventas.forEach(v => { if (v.anulado) return; const k = norm(v.fecha); if (k) porDia[k] = (porDia[k] || 0) + valor(v) })
  // Promedio por día de la semana con los días completos anteriores a hoy
  const suma = Array(7).fill(0), cuenta = Array(7).fill(0)
  for (let i = 1; i <= SEMANAS_PROYECCION * 7; i++) {
    const f = new Date(Date.UTC(y, m, d - i))
    const dow = f.getUTCDay()
    suma[dow] += porDia[clave(f.getUTCFullYear(), f.getUTCMonth(), f.getUTCDate())] || 0
    cuenta[dow]++
  }
  const prom = suma.map((s, i) => cuenta[i] ? s / cuenta[i] : 0)
  const diasMes = new Date(Date.UTC(y, m + 1, 0)).getUTCDate()
  let vendido = 0
  for (let i = 1; i <= d; i++) vendido += porDia[clave(y, m, i)] || 0
  const vendidoHoy = porDia[clave(y, m, d)] || 0
  let resto = Math.max(0, prom[new Date(Date.UTC(y, m, d)).getUTCDay()] - vendidoHoy)
  for (let i = d + 1; i <= diasMes; i++) resto += prom[new Date(Date.UTC(y, m, i)).getUTCDay()]
  const temporada = factorTemporada(porDia, clave, y, m, d, diasMes - d)
  return {
    key: `${y}-${String(m + 1).padStart(2, '0')}`, vendido, resto, proyectado: vendido + resto, diasQuedan: diasMes - d, diasMes,
    temporada: temporada ? { factor: temporada, proyectado: vendido + resto * temporada } : null,
  }
}

// "Si se repite la temporada del año pasado": hace la misma proyección hace 364 días (mismo día de la
// semana) y mira cuánto se equivocó con lo que realmente se vendió el resto de ese mes. Ese desvío
// (limitado entre ×0,6 y ×1,6) se aplica a lo que falta de este mes. null si no hay datos del año pasado.
function factorTemporada(porDia, clave, y, m, d, diasQuedan) {
  const base = Date.UTC(y, m, d) - 364 * 86400000
  const dia = i => { const f = new Date(base + i * 86400000); return { v: porDia[clave(f.getUTCFullYear(), f.getUTCMonth(), f.getUTCDate())], dow: f.getUTCDay() } }
  const suma = Array(7).fill(0), cuenta = Array(7).fill(0)
  let conDatos = 0
  for (let i = 1; i <= SEMANAS_PROYECCION * 7; i++) { const x = dia(-i); suma[x.dow] += x.v || 0; cuenta[x.dow]++; if (x.v) conDatos++ }
  if (conDatos < SEMANAS_PROYECCION * 7 * 0.6) return null // el año pasado todavía no había suficientes ventas cargadas
  const prom = suma.map((s, i) => cuenta[i] ? s / cuenta[i] : 0)
  let previsto = 0, real = 0
  for (let i = 1; i <= diasQuedan; i++) { const x = dia(i); previsto += prom[x.dow]; real += x.v || 0 }
  if (!(previsto > 0) || !(real > 0)) return null
  return Math.min(1.6, Math.max(0.6, real / previsto))
}

// ── Pesos, pesos de hoy (IPC) o dólares (blue promedio del mes) ────────────
const MODOS_MONEDA = [
  { id: 'ARS', label: 'Pesos' },
  { id: 'REAL', label: 'Pesos de hoy' },
  { id: 'USD', label: 'Dólares' },
]
// Devuelve una función mes ('aaaa-mm') → multiplicador, o null si no hay datos para ese modo
function conversorMoneda(modo, indices) {
  if (modo === 'ARS' || !indices) return () => 1
  if (modo === 'REAL') {
    const meses = Object.keys(indices.inflacion || {}).sort()
    if (!meses.length) return null
    // factor de cada mes = inflación acumulada desde el mes siguiente hasta el último IPC publicado
    const acum = {}; let f = 1
    for (let i = meses.length - 1; i >= 0; i--) { acum[meses[i]] = f; f *= 1 + indices.inflacion[meses[i]] / 100 }
    const primero = meses[0]
    return mes => mes > meses[meses.length - 1] ? 1 : (acum[mes] ?? (mes < primero ? null : 1))
  }
  const meses = Object.keys(indices.blue || {}).sort()
  if (!meses.length) return null
  return mes => { const k = meses.filter(x => x <= mes).pop() || meses[0]; return 1 / indices.blue[k] }
}
const prefijo = modo => modo === 'USD' ? 'US$' : '$'
const nombreMesCorto = mes => { const [a, m] = mes.split('-'); return `${['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'][Number(m) - 1]} ${a}` }

const fmtCorto = (v, p = '$') => v >= 1000000 ? `${p}${(v / 1000000).toFixed(1)}M` : v >= 1000 ? `${p}${Math.round(v / 1000)}k` : `${p}${Math.round(v)}`

const MesTooltip = ({ active, payload, label, modo = 'ARS' }) => {
  if (!active || !payload?.length) return null
  const r = payload[0].payload
  const pf = prefijo(modo)
  const caja = { background:'var(--surface)', border:'1.5px solid var(--border)', borderRadius:8, padding:'10px 14px' }
  const t = { fontFamily:'Barlow Condensed, sans-serif' }
  return (
    <div style={caja}>
      <div style={{ ...t, fontSize:13, color:'var(--muted)', marginBottom:4 }}>{label}{r.proy ? ' · mes en curso' : ''}</div>
      <div style={{ ...t, fontWeight:800, fontSize:20, color:'var(--accent)' }}>{pf}{Math.round(r.total).toLocaleString('es-AR')}{r.proy ? <span style={{ fontSize:13, fontWeight:600, color:'var(--muted)' }}> vendido</span> : null}</div>
      {r.proy && (
        <>
          <div style={{ ...t, fontWeight:800, fontSize:18, color:'#90caf9', marginTop:4 }}>≈ {pf}{Math.round(r.proy.proyectado).toLocaleString('es-AR')} <span style={{ fontSize:13, fontWeight:600, color:'var(--muted)' }}>proyectado a fin de mes</span></div>
          <div style={{ fontFamily:'Barlow, sans-serif', fontSize:12, color:'var(--muted)', maxWidth:260 }}>según el ritmo de las últimas {SEMANAS_PROYECCION} semanas</div>
          {r.proy.temporada && (
            <>
              <div style={{ ...t, fontWeight:800, fontSize:18, color:'#c4b5fd', marginTop:6 }}>≈ {pf}{Math.round(r.proy.temporada.proyectado).toLocaleString('es-AR')} <span style={{ fontSize:13, fontWeight:600, color:'var(--muted)' }}>si se repite la temporada</span></div>
              <div style={{ fontFamily:'Barlow, sans-serif', fontSize:12, color:'var(--muted)', maxWidth:260 }}>
                El año pasado, el resto de este mes se vendió {r.proy.temporada.factor >= 1 ? `un ${Math.round((r.proy.temporada.factor - 1) * 100)}% más` : `un ${Math.round((1 - r.proy.temporada.factor) * 100)}% menos`} de lo que marcaba el ritmo de las semanas anteriores.
              </div>
            </>
          )}
          <div style={{ fontFamily:'Barlow, sans-serif', fontSize:12, color:'var(--muted)', marginTop:6 }}>Faltan {r.proy.diasQuedan} {r.proy.diasQuedan === 1 ? 'día' : 'días'}.</div>
        </>
      )}
    </div>
  )
}

const UnidadesTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null
  const r = payload[0].payload
  const t = { fontFamily:'Barlow Condensed, sans-serif' }
  const n = v => Math.round(v).toLocaleString('es-AR')
  return (
    <div style={{ background:'var(--surface)', border:'1.5px solid var(--border)', borderRadius:8, padding:'10px 14px' }}>
      <div style={{ ...t, fontSize:13, color:'var(--muted)', marginBottom:4 }}>{label}{r.proy ? ' · mes en curso' : ''}</div>
      <div style={{ ...t, fontWeight:800, fontSize:20, color:'var(--accent)' }}>{n(r.unidades)} unidades{r.proy ? <span style={{ fontSize:13, fontWeight:600, color:'var(--muted)' }}> vendidas</span> : null}</div>
      {r.proy && (
        <>
          <div style={{ ...t, fontWeight:800, fontSize:18, color:'#fde68a', marginTop:4 }}>≈ {n(r.proy.proyectado)} <span style={{ fontSize:13, fontWeight:600, color:'var(--muted)' }}>proyectadas a fin de mes</span></div>
          <div style={{ fontFamily:'Barlow, sans-serif', fontSize:12, color:'var(--muted)', maxWidth:260 }}>según el ritmo de las últimas {SEMANAS_PROYECCION} semanas</div>
          {r.proy.temporada && (
            <>
              <div style={{ ...t, fontWeight:800, fontSize:18, color:'#c4b5fd', marginTop:6 }}>≈ {n(r.proy.temporada.proyectado)} <span style={{ fontSize:13, fontWeight:600, color:'var(--muted)' }}>si se repite la temporada</span></div>
              <div style={{ fontFamily:'Barlow, sans-serif', fontSize:12, color:'var(--muted)', maxWidth:260 }}>
                El año pasado, el resto de este mes se vendieron {r.proy.temporada.factor >= 1 ? `un ${Math.round((r.proy.temporada.factor - 1) * 100)}% más` : `un ${Math.round((1 - r.proy.temporada.factor) * 100)}% menos`} unidades de lo que marcaba el ritmo de las semanas anteriores.
              </div>
            </>
          )}
          <div style={{ fontFamily:'Barlow, sans-serif', fontSize:12, color:'var(--muted)', marginTop:6 }}>Faltan {r.proy.diasQuedan} {r.proy.diasQuedan === 1 ? 'día' : 'días'}.</div>
        </>
      )}
    </div>
  )
}

const CustomTooltip = ({ active, payload, label }) => {
  if (active && payload && payload.length) {
    return (
      <div style={{ background:'var(--surface)', border:'1.5px solid var(--border)', borderRadius:8, padding:'10px 14px' }}>
        <div style={{ fontFamily:'Barlow Condensed, sans-serif', fontSize:13, color:'var(--muted)', marginBottom:4 }}>{label}</div>
        <div style={{ fontFamily:'Barlow Condensed, sans-serif', fontWeight:800, fontSize:20, color:'var(--accent)' }}>
          ${Math.round(payload[0].value).toLocaleString('es-AR')}
        </div>
      </div>
    )
  }
  return null
}

// Frecuencia de cierre de tickets por día: minutos promedio entre una venta y la siguiente.
// Promedio = (hora del último ticket − hora del primero) / (tickets − 1). Días con menos de 2 tickets quedan sin barra.
const aMin = h => { const [hh, mm = 0, ss = 0] = String(h || '').split(':').map(Number); return Number.isFinite(hh) ? hh * 60 + mm + ss / 60 : null }
const fmtHora = m => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(Math.floor(m % 60)).padStart(2, '0')}`
// Horario del local (minutos desde las 00:00). Lunes a viernes 9:30 a 19:00; sábados y domingos 9:00 a 19:00.
// Se da un margen de 30 min antes de abrir y 30 min después de cerrar. Lo que queda afuera son las
// aperturas especiales (por ejemplo, después de un partido de Boca) y se muestra aparte.
const HORARIO = { 0: [540, 1140], 1: [570, 1140], 2: [570, 1140], 3: [570, 1140], 4: [570, 1140], 5: [570, 1140], 6: [540, 1140] }
const diaSemana = fecha => { const [d, m, a] = String(fecha).split('/').map(Number); return new Date(Date.UTC(a, m - 1, d)).getUTCDay() }
const enHorario = (fecha, min) => { const [ab, ci] = HORARIO[diaSemana(fecha)]; return min >= ab - 30 && min <= ci + 30 }

function calcularFrecuenciaPorDia(ventas, dias) {
  const porDia = {}
  ventas.filter(v => !v.anulado && v.fecha && v.hora).forEach(v => {
    const id = v.idVenta || v.idDetalle
    const t = aMin(v.hora); if (t == null) return
    const d = porDia[v.fecha] || (porDia[v.fecha] = {})
    if (d[id] == null || t < d[id]) d[id] = t
  })
  return dias.map(d => {
    const todas = Object.values(porDia[d.fechaKey] || {}).sort((a, b) => a - b)
    const horas = todas.filter(h => enHorario(d.fechaKey, h))
    const fuera = todas.filter(h => !enHorario(d.fechaKey, h))
    const extra = fuera.length ? { fueraN: fuera.length, fueraDesde: fmtHora(fuera[0]), fueraHasta: fmtHora(fuera[fuera.length - 1]) } : { fueraN: 0 }
    const n = horas.length
    if (n < 2) return { fechaKey: d.fechaKey, label: d.label, prom: null, tickets: n, ...extra }
    const gaps = horas.slice(1).map((h, i) => h - horas[i])
    const iMax = gaps.indexOf(Math.max(...gaps))
    const ord = [...gaps].sort((a, b) => a - b)
    const mediana = ord.length % 2 ? ord[(ord.length - 1) / 2] : (ord[ord.length / 2 - 1] + ord[ord.length / 2]) / 2
    return { fechaKey: d.fechaKey, label: d.label, prom: Math.round((horas[n - 1] - horas[0]) / (n - 1) * 10) / 10, mediana: Math.round(mediana * 10) / 10, maxGap: Math.round(ord[ord.length - 1]), huecoDesde: fmtHora(horas[iMax]), huecoHasta: fmtHora(horas[iMax + 1]), tickets: n, desde: fmtHora(horas[0]), hasta: fmtHora(horas[n - 1]), ...extra }
  })
}
const fmtMin = m => m >= 60 ? `${Math.floor(m / 60)} h ${Math.round(m % 60)} min` : `${Math.round(m)} min`

const FrecuenciaTooltip = ({ active, payload, label }) => {
  if (active && payload && payload.length && payload[0].payload.prom != null) {
    const d = payload[0].payload
    return (
      <div style={{ background:'var(--surface)', border:'1.5px solid var(--border)', borderRadius:8, padding:'10px 14px' }}>
        <div style={{ fontFamily:'Barlow Condensed, sans-serif', fontSize:13, color:'var(--muted)', marginBottom:4 }}>{label}</div>
        <div style={{ fontFamily:'Barlow Condensed, sans-serif', fontWeight:800, fontSize:20, color:'#38bdf8' }}>Una venta cada {fmtMin(d.prom)}</div>
        <div style={{ fontFamily:'Barlow, sans-serif', fontSize:12, color:'var(--muted)', marginTop:2, lineHeight:1.5 }}>
          {d.tickets} tickets entre {d.desde} y {d.hasta}<br />
          Mediana: {fmtMin(d.mediana)}<br />Hueco más largo: {fmtMin(d.maxGap)} (de {d.huecoDesde} a {d.huecoHasta})
          {d.fueraN > 0 && <><br /><span style={{ color:'var(--accent)' }}>+ {d.fueraN} {d.fueraN === 1 ? 'venta' : 'ventas'} fuera de horario ({d.fueraDesde}{d.fueraN > 1 ? ` a ${d.fueraHasta}` : ''}), no incluidas</span></>}
        </div>
      </div>
    )
  }
  return null
}

// Mapa de calor: promedio de tickets cerrados por día de la semana y hora.
// El promedio se toma sobre los días de ese tipo en que hubo ventas (los días cerrados no bajan el promedio).
const DIAS_MAPA = [{ d: 1, l: 'Lun' }, { d: 2, l: 'Mar' }, { d: 3, l: 'Mié' }, { d: 4, l: 'Jue' }, { d: 5, l: 'Vie' }, { d: 6, l: 'Sáb' }, { d: 0, l: 'Dom' }]
function calcularMapaHoras(ventas, dias) {
  const hoy = new Date(Date.now() - 3 * 3600000); hoy.setUTCHours(0, 0, 0, 0)
  const desde = hoy.getTime() - (dias - 1) * 86400000
  const tickets = {}
  ventas.filter(v => !v.anulado && v.fecha && v.hora).forEach(v => {
    const [d, m, a] = String(v.fecha).split('/').map(Number); if (!d || !m || !a) return
    const t = Date.UTC(a, m - 1, d); if (t < desde || t > hoy.getTime()) return
    const min = aMin(v.hora); if (min == null) return
    const id = v.idVenta || v.idDetalle
    const k = `${v.fecha}|${id}`
    if (tickets[k] == null || min < tickets[k].min) tickets[k] = { min, fecha: v.fecha, dow: new Date(t).getUTCDay(), monto: 0 }
    tickets[k].monto += parsePrecio(v.precioTotalFinal) || parsePrecio(v.precioTotal)
  })
  // Ventas fuera de horario (aperturas especiales): se separan y se resumen por día
  const fueraPorDia = {}
  Object.entries(tickets).forEach(([k, tk]) => {
    if (enHorario(tk.fecha, tk.min)) return
    const f = fueraPorDia[tk.fecha] || (fueraPorDia[tk.fecha] = { fecha: tk.fecha, dow: tk.dow, n: 0, monto: 0, desde: 1e9, hasta: 0 })
    f.n++; f.monto += tk.monto; f.desde = Math.min(f.desde, tk.min); f.hasta = Math.max(f.hasta, tk.min)
    delete tickets[k]
  })
  const fuera = Object.values(fueraPorDia).sort((a, b) => { const [d1, m1, a1] = a.fecha.split('/').map(Number), [d2, m2, a2] = b.fecha.split('/').map(Number); return Date.UTC(a2, m2 - 1, d2) - Date.UTC(a1, m1 - 1, d1) })
  const conteo = {}, diasConVentas = {}, porHora = {}
  Object.values(tickets).forEach(({ min, fecha, dow }) => {
    const h = Math.floor(min / 60)
    conteo[`${dow}|${h}`] = (conteo[`${dow}|${h}`] || 0) + 1
    porHora[h] = (porHora[h] || 0) + 1
    ;(diasConVentas[dow] ||= new Set()).add(fecha)
  })
  // Columnas = horario del local (de 9 a 18 h, la última franja es 18:00 a 19:00)
  const hMin = 9, hMax = 18
  if (Object.keys(tickets).length === 0) return { horas: [], celdas: {}, max: 0, diasConVentas: {}, fuera }
  const horas = Array.from({ length: hMax - hMin + 1 }, (_, i) => hMin + i)
  const celdas = {}
  let max = 0
  DIAS_MAPA.forEach(({ d }) => horas.forEach(h => {
    const nDias = diasConVentas[d]?.size || 0
    const prom = nDias ? (conteo[`${d}|${h}`] || 0) / nDias : null
    celdas[`${d}|${h}`] = prom
    if (prom != null && prom > max) max = prom
  }))
  return { horas, celdas, max, fuera, diasConVentas: Object.fromEntries(Object.entries(diasConVentas).map(([k, v]) => [k, v.size])) }
}

function MapaHoras({ ventas }) {
  const [rango, setRango] = useState(30)
  const { horas, celdas, max, diasConVentas, fuera = [] } = useMemo(() => calcularMapaHoras(ventas, rango), [ventas, rango])
  // De rojo (menos ventas) a amarillo y verde (más ventas), relativo al casillero con más ventas
  const color = v => {
    if (v == null) return 'transparent'
    const t = max > 0 ? Math.min(1, v / max) : 0
    return `hsl(${Math.round(t * 120)}, 70%, 36%)`
  }
  return (
    <div style={S.chartCard}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:12, flexWrap:'wrap' }}>
        <div>
          <div style={S.chartTitle}>Tickets por hora y día de la semana</div>
          <div style={S.chartHint}>Promedio de ventas cerradas en cada franja horaria. Rojo = horario más flojo; verde = más ventas. Pasá el dedo o el mouse por un casillero para ver el detalle.</div>
        </div>
        <div style={{ display:'flex', gap:6 }}>
          {[30, 60, 90].map(r => (
            <button key={r} onClick={() => setRango(r)} style={{ ...S.rangoBtn, ...(rango === r ? S.rangoBtnActivo : {}) }}>{r} días</button>
          ))}
        </div>
      </div>
      {horas.length === 0 ? <div style={S.chartHint}>No hay ventas con hora en este período.</div> : (
        <div style={{ overflowX:'auto' }}>
          <div style={{ display:'grid', gridTemplateColumns:`44px repeat(${horas.length}, minmax(38px, 1fr))`, gap:3, minWidth: 44 + horas.length * 41 }}>
            <div />
            {horas.map(h => <div key={h} style={S.mapaHora}>{h}h</div>)}
            {DIAS_MAPA.map(({ d, l }) => (
              <Fragment key={d}>
                <div style={S.mapaDia}>{l}</div>
                {horas.map(h => {
                  const v = celdas[`${d}|${h}`]
                  return (
                    <div key={h} style={{ ...S.mapaCelda, background: color(v), color: '#fff' }}
                      title={v == null ? `${l} ${h}:00 · sin datos` : `${l} de ${h}:00 a ${h + 1}:00 · ${v.toFixed(1)} tickets en promedio (${diasConVentas[d]} ${l.toLowerCase()} con ventas)`}>
                      {v == null ? '' : v < 0.05 ? '0' : v.toFixed(1)}
                    </div>
                  )
                })}
              </Fragment>
            ))}
          </div>
        </div>
      )}
      {fuera.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <div style={S.chartHint}>
            Fuera de horario (aperturas especiales, por ejemplo después de un partido): {fuera.reduce((s, f) => s + f.n, 0)} tickets · {fmt$(fuera.reduce((s, f) => s + f.monto, 0))} en {fuera.length} {fuera.length === 1 ? 'día' : 'días'}. No se incluyen en el mapa.
          </div>
          <div style={{ display:'flex', flexWrap:'wrap', gap:6 }}>
            {fuera.map(f => (
              <span key={f.fecha} style={S.fueraChip}>
                {DIAS_MAPA.find(x => x.d === f.dow)?.l} {f.fecha.split('/').slice(0, 2).join('/')} · {fmtHora(f.desde)}{f.n > 1 ? `–${fmtHora(f.hasta)}` : ''} · {f.n} {f.n === 1 ? 'ticket' : 'tickets'} · {fmt$(f.monto)}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

const PctTooltip = ({ active, payload, label }) => {
  if (active && payload && payload.length) {
    return (
      <div style={{ background:'var(--surface)', border:'1.5px solid var(--border)', borderRadius:8, padding:'10px 14px' }}>
        <div style={{ fontFamily:'Barlow Condensed, sans-serif', fontSize:13, color:'var(--muted)', marginBottom:4 }}>{label}</div>
        <div style={{ fontFamily:'Barlow Condensed, sans-serif', fontWeight:800, fontSize:20, color:'#ff4dd2' }}>
          {payload[0].value.toFixed(2)}%
        </div>
      </div>
    )
  }
  return null
}


const fmt$ = n => '$' + Math.round(n).toLocaleString('es-AR')
const DIAS_SEMANA = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']

// Agrupa las filas de un día por ticket (ID_VENTA), de la más nueva a la más vieja
function armarTicketsDelDia(ventas, fechaKey) {
  const map = {}
  ventas.filter(v => v.fecha === fechaKey).forEach(v => {
    const id = v.idVenta || v.idDetalle
    if (!map[id]) map[id] = { id, hora: v.hora || '', empleado: v.empleado || '', metodoPago: v.metodoPago || '', posnet: v.posnet || '', correccionPosnet: v.correccionPosnet || '', notas: v.notas || '', pagos: v.pagos || null, anulado: v.anulado, items: [], total: 0 }
    const t = map[id]
    const precio = parsePrecio(v.precioTotalFinal) || parsePrecio(v.precioTotal)
    t.items.push({ nombre: v.nombre || v.articulo || '', cantidad: v.cantidad || 0, precio, reparto: repartoPago(v) })
    t.total += precio
    if (!v.anulado) t.anulado = false
  })
  return Object.values(map).sort((a, b) => b.hora.localeCompare(a.hora))
}

function DetalleDia({ dia, ventas, onCerrar, esAdmin = false, usuarios = [], perfilNombre = '', onPosnetCorregido }) {
  const [corrigiendo, setCorrigiendo] = useState(null)
  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape' && !corrigiendo) onCerrar() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCerrar, corrigiendo])

  const tickets = armarTicketsDelDia(ventas, dia.fechaKey)
  const validos = tickets.filter(t => !t.anulado)
  const total = validos.reduce((s, t) => s + t.total, 0)
  const porMetodo = {}
  // Con 2 medios de pago, cada artículo se reparte entre los dos en la proporción cobrada
  validos.forEach(t => t.items.forEach(i => i.reparto.forEach(p => { const k = p.metodo || 'Sin método'; porMetodo[k] = (porMetodo[k] || 0) + p.monto })))
  const [d, m, a] = dia.fechaKey.split('/').map(Number)
  const nombreDia = DIAS_SEMANA[new Date(a, m - 1, d).getDay()]

  return (
    <div style={D.overlay} onClick={onCerrar}>
      <div style={D.sheet} onClick={e => e.stopPropagation()} role="dialog" aria-label={`Ventas del ${dia.label}`}>
        <div style={D.head}>
          <div>
            <div style={D.titulo}>{nombreDia} {String(d).padStart(2, '0')}/{String(m).padStart(2, '0')}/{a}</div>
            <div style={D.sub}>{validos.length} {validos.length === 1 ? 'venta' : 'ventas'}{tickets.length > validos.length ? ` · ${tickets.length - validos.length} anulada(s)` : ''}</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={D.total}>{fmt$(total)}</div>
            <button style={D.cerrar} onClick={onCerrar} aria-label="Cerrar">✕</button>
          </div>
        </div>

        {Object.keys(porMetodo).length > 0 && (
          <div style={D.metodos}>
            {Object.entries(porMetodo).sort((x, y) => y[1] - x[1]).map(([met, monto]) => (
              <span key={met} style={D.metodoChip}>{met} · <strong style={{ color: 'var(--text)' }}>{fmt$(monto)}</strong></span>
            ))}
          </div>
        )}

        <div style={D.lista}>
          {tickets.length === 0 ? <div style={D.vacio}>No hubo ventas este día.</div> : tickets.map(t => (
            <div key={t.id} style={{ ...D.ticket, ...(t.anulado ? { opacity: 0.45 } : {}) }}>
              <div style={D.ticketHead}>
                <div style={{ minWidth: 0 }}>
                  <div style={D.ticketMeta}>
                    {t.anulado && <span style={D.badgeAnulada}>ANULADA</span>}
                    {t.hora.slice(0, 5)} · {t.empleado}
                  </div>
                  <div style={D.ticketMetodo}>
                    {t.pagos ? t.pagos.map(p => `${p.metodo} ${fmt$(p.monto)}`).join(' + ') : t.metodoPago}
                    {t.posnet && <span style={{ ...D.posnetDot, background: t.posnet.toUpperCase() === 'AMARILLO' ? '#f5c800' : '#f0f4ff' }} title={`Posnet ${t.posnet.toLowerCase()}`} />}
                    {t.correccionPosnet && <span style={{ color: 'var(--muted)' }} title={t.correccionPosnet}>corregido</span>}
                    {esAdmin && !t.anulado && usaPosnet(t.metodoPago) && (
                      <button style={D.posnetBtn} onClick={() => setCorrigiendo({ idVenta: t.id, hora: t.hora.slice(0, 5), total: t.total, posnet: t.posnet })}>
                        Corregir posnet
                      </button>
                    )}
                    {t.notas && <span style={{ color: 'var(--muted)' }}> · {t.notas}</span>}
                  </div>
                </div>
                <div style={{ ...D.ticketTotal, ...(t.anulado ? { textDecoration: 'line-through' } : {}) }}>{fmt$(t.total)}</div>
              </div>
              {t.items.map((it, i) => (
                <div key={i} style={D.item}>
                  <span style={D.itemNombre}>{it.cantidad} × {it.nombre}</span>
                  <span style={D.itemPrecio}>{fmt$(it.precio)}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
      {corrigiendo && (
        <div onClick={e => e.stopPropagation()}>
          <CorregirPosnetModal
            venta={corrigiendo} usuarios={usuarios} perfilNombre={perfilNombre}
            onCerrar={() => setCorrigiendo(null)}
            onGuardado={nuevo => { onPosnetCorregido?.(corrigiendo.idVenta, nuevo); setCorrigiendo(null) }}
          />
        </div>
      )}
    </div>
  )
}

const D = {
  overlay: { position:'fixed', inset:0, background:'rgba(0,0,10,0.7)', zIndex:400, display:'flex', alignItems:'flex-end', justifyContent:'center' },
  sheet: { width:'100%', maxWidth:720, maxHeight:'88vh', display:'flex', flexDirection:'column', background:'var(--surface)', borderTop:'2px solid var(--accent)', borderRadius:'18px 18px 0 0', padding:'14px 16px calc(12px + env(safe-area-inset-bottom, 0px))', gap:10 },
  head: { display:'flex', justifyContent:'space-between', alignItems:'center', gap:12 },
  titulo: { fontFamily:'Barlow Condensed, sans-serif', fontWeight:800, fontSize:22, color:'var(--accent)', letterSpacing:0.5 },
  sub: { fontFamily:'Barlow, sans-serif', fontSize:13, color:'var(--muted)' },
  total: { fontFamily:'Barlow Condensed, sans-serif', fontWeight:800, fontSize:26, color:'#00e676', whiteSpace:'nowrap' },
  cerrar: { background:'var(--surface2)', border:'1.5px solid var(--border)', borderRadius:10, color:'var(--text)', fontSize:18, width:40, height:40, cursor:'pointer', flexShrink:0 },
  metodos: { display:'flex', flexWrap:'wrap', gap:6 },
  metodoChip: { fontFamily:'Barlow, sans-serif', fontSize:12, color:'var(--muted)', background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:20, padding:'3px 10px' },
  lista: { overflowY:'auto', display:'flex', flexDirection:'column', gap:8, paddingBottom:4 },
  vacio: { fontFamily:'Barlow, sans-serif', fontSize:14, color:'var(--muted)', padding:'16px 0' },
  ticket: { background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:10, padding:'10px 12px' },
  posnetBtn: { background:'none', border:'1px solid rgba(245,200,0,0.45)', borderRadius:6, color:'var(--accent)', fontFamily:'Barlow Condensed, sans-serif', fontWeight:700, fontSize:11, padding:'2px 8px', cursor:'pointer', letterSpacing:0.5, textTransform:'uppercase' },
  ticketHead: { display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:10, marginBottom:4 },
  ticketMeta: { fontFamily:'Barlow Condensed, sans-serif', fontWeight:700, fontSize:16, color:'var(--text)' },
  ticketMetodo: { fontFamily:'Barlow, sans-serif', fontSize:12, color:'var(--muted)', display:'flex', alignItems:'center', gap:6, flexWrap:'wrap' },
  posnetDot: { display:'inline-block', width:18, height:10, borderRadius:3 },
  ticketTotal: { fontFamily:'Barlow Condensed, sans-serif', fontWeight:800, fontSize:18, color:'var(--accent)', whiteSpace:'nowrap' },
  item: { display:'flex', justifyContent:'space-between', gap:10, fontFamily:'Barlow, sans-serif', fontSize:13, color:'var(--text)', padding:'2px 0' },
  itemNombre: { minWidth:0, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', opacity:0.9 },
  itemPrecio: { flexShrink:0, color:'var(--muted)' },
  badgeAnulada: { fontSize:10, fontWeight:800, color:'#ef4444', background:'rgba(239,68,68,0.15)', borderRadius:4, padding:'1px 5px', marginRight:6, letterSpacing:1 },
}

export default function Estadisticas({ esAdmin = false, usuarios = [], perfilNombre = '' }) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [datosGrafico, setDatosGrafico] = useState([])
  const [datosFrecuencia, setDatosFrecuencia] = useState([])
  const [datosMes, setDatosMes] = useState([])
  const [datosMetodo, setDatosMetodo] = useState([])
  const [datosPct, setDatosPct] = useState([])
  const [ventasTodas, setVentasTodas] = useState([])
  const [diaAbierto, setDiaAbierto] = useState(null)
  const datosPosnet = useMemo(() => calcularTarjetaQRPorPosnet(ventasTodas, datosMes), [ventasTodas, datosMes])
  // Mes en curso: se le suma una barra semitransparente con lo que falta según la proyección
  const datosMesConProy = useMemo(() => {
    if (!ventasTodas.length) return datosMes
    const p = proyectarMesActual(ventasTodas)
    const filas = datosMes.map(mt => mt.key === p.key ? { ...mt, resto: p.resto, proy: p } : mt)
    if (!filas.some(f => f.key === p.key)) {
      const [yy, mm] = p.key.split('-')
      filas.push({ key: p.key, label: `${mm}/${yy}`, total: 0, resto: p.resto, proy: p })
    }
    return filas
  }, [ventasTodas, datosMes])
  // Pesos / pesos de hoy / dólares
  const [modoMoneda, setModoMoneda] = useState('ARS')
  const [indices, setIndices] = useState(null)
  const [errorIndices, setErrorIndices] = useState(null)
  useEffect(() => {
    if (modoMoneda === 'ARS' || indices) return
    fetch('/api/indices').then(r => r.ok ? r.json() : r.json().then(j => Promise.reject(new Error(j.error || r.status))))
      .then(setIndices).catch(e => { setErrorIndices('No se pudieron traer la inflación y el dólar. Probá más tarde.'); console.error(e) })
  }, [modoMoneda, indices])
  const datosMesMoneda = useMemo(() => {
    if (modoMoneda === 'ARS') return datosMesConProy
    if (!indices) return []
    const conv = conversorMoneda(modoMoneda, indices)
    if (!conv) return []
    return datosMesConProy.map(f => {
      const k = conv(f.key)
      if (k == null) return null
      const proy = f.proy && { ...f.proy, proyectado: f.proy.proyectado * k, temporada: f.proy.temporada && { ...f.proy.temporada, proyectado: f.proy.temporada.proyectado * k } }
      return { ...f, total: f.total * k, resto: f.resto != null ? f.resto * k : f.resto, proy }
    }).filter(Boolean)
  }, [datosMesConProy, modoMoneda, indices])
  const notaMoneda = modoMoneda === 'REAL' && indices?.ultimoIpc
    ? `Cada mes ajustado por la inflación del INDEC hasta ${nombreMesCorto(indices.ultimoIpc)} (último dato publicado): todos los meses en pesos de ese momento.`
    : modoMoneda === 'USD' && indices ? 'Cada mes dividido por el dólar blue promedio de ese mes.' : null
  // Unidades vendidas por mes (no tienen inflación: muestran la estacionalidad real)
  const unidadesMes = useMemo(() => {
    const m = {}
    ventasTodas.forEach(v => {
      if (v.anulado || !v.fecha) return
      const [dd, mm, aa] = String(v.fecha).split('/')
      if (!aa) return
      const key = `${aa}-${String(mm).padStart(2, '0')}`
      ;(m[key] ||= { key, label: `${String(mm).padStart(2, '0')}/${aa}`, unidades: 0 }).unidades += Number(v.cantidad) || 0
    })
    const p = proyectarMesActual(ventasTodas, Date.now(), v => Number(v.cantidad) || 0)
    if (!m[p.key]) { const [aa, mm] = p.key.split('-'); m[p.key] = { key: p.key, label: `${mm}/${aa}`, unidades: 0 } }
    return Object.values(m).sort((a, b) => a.key.localeCompare(b.key)).map(x => x.key === p.key ? { ...x, enCurso: true, resto: p.resto, proy: p } : x)
  }, [ventasTodas])
  const [totalPeriodo, setTotalPeriodo] = useState(0)
  const [mejorDia, setMejorDia] = useState(null)

  useEffect(() => { cargar() }, [])

  async function cargar() {
    setLoading(true)
    setError(null)
    try {
      const ventas = await getHistoricoVentas()
      const dias = getUltimos35Dias()

      ventas
        .filter(v => !v.anulado)
        .forEach(v => {
          const precio = parsePrecio(v.precioTotalFinal) || parsePrecio(v.precioTotal)
          const diaObj = dias.find(d => d.fechaKey === v.fecha)
          if (diaObj) diaObj.total += precio
        })

      const total = dias.reduce((s, d) => s + d.total, 0)
      const mejor = dias.reduce((a, b) => b.total > a.total ? b : a, dias[0])

      const mesTotales = agruparPorMes(ventas)
      const mesTarjeta = agruparPorMes(ventas, v => montoConMetodo(v, esTarjetaOQR) > 0, v => montoConMetodo(v, esTarjetaOQR))

      setVentasTodas(ventas)
      setDatosGrafico(dias)
      setDatosFrecuencia(calcularFrecuenciaPorDia(ventas, dias))
      setTotalPeriodo(total)
      setMejorDia(mejor)
      setDatosMes(mesTotales)
      setDatosMetodo(mesTarjeta)
      setDatosPct(calcularPctPorMes(mesTotales, mesTarjeta))

    } catch (e) {
      setError('No se pudo cargar. Intentá de nuevo.')
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  if (loading) return (
    <div style={S.center}>
      <div style={S.loadingText}>Calculando estadísticas...</div>
      <div style={S.loadingSub}>Esto puede tardar unos segundos</div>
    </div>
  )

  if (error) return (
    <div style={S.center}>
      <div style={S.errorText}>{error}</div>
      <button style={S.retryBtn} onClick={cargar}>Reintentar</button>
    </div>
  )

  const promedioDiario = totalPeriodo / 35

  return (
    <div style={S.page}>
      <div style={S.header}>
        <div style={S.headerTitle}>ESTADÍSTICAS</div>
        <button style={S.refreshBtn} onClick={cargar}>↻</button>
      </div>

      <div style={S.statsRow}>
        <div style={S.statCard}>
          <div style={S.statValue}>${Math.round(totalPeriodo).toLocaleString('es-AR')}</div>
          <div style={S.statLabel}>Total 35 días</div>
        </div>
        <div style={S.statCard}>
          <div style={S.statValue}>${Math.round(promedioDiario).toLocaleString('es-AR')}</div>
          <div style={S.statLabel}>Promedio diario</div>
        </div>
        <div style={S.statCard}>
          <div style={S.statValue}>${Math.round(mejorDia?.total || 0).toLocaleString('es-AR')}</div>
          <div style={S.statLabel}>Mejor día ({mejorDia?.label})</div>
        </div>
      </div>

      {esAdmin && <IndiceEficiencia ventas={ventasTodas} />}

      {/* Gráfico diario */}
      <div style={S.chartCard}>
        <div style={S.chartTitle}>Ventas por día — últimos 35 días</div>
        <div style={S.chartHint}>Tocá una columna para ver las ventas de ese día</div>
        <div style={S.chartWrap}>
          <ResponsiveContainer width="100%" height={560}>
            <BarChart data={datosGrafico} margin={{ top: 8, right: 8, left: 0, bottom: 40 }} style={{ cursor:'pointer', outline:'none' }} onClick={st => { const dia = st?.activePayload?.[0]?.payload || datosGrafico[Number(st?.activeTooltipIndex ?? st?.activeIndex)] || datosGrafico.find(x => x.label === st?.activeLabel); if (dia?.fechaKey) setDiaAbierto(dia) }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
              <XAxis dataKey="label" tick={{ fontFamily:'Barlow Condensed, sans-serif', fontSize:11, fill:'#6a8ccc' }} angle={-45} textAnchor="end" interval={2} tickLine={false} axisLine={false} />
              <YAxis tick={{ fontFamily:'Barlow Condensed, sans-serif', fontSize:11, fill:'#6a8ccc' }} tickFormatter={v => v >= 1000000 ? `${(v/1000000).toFixed(1)}M` : v >= 1000 ? `${(v/1000).toFixed(0)}k` : v} tickLine={false} axisLine={false} width={48} />
              <Tooltip content={<CustomTooltip />} cursor={{ fill:'rgba(0,230,118,0.06)' }} />
              <Bar dataKey="total" fill="#00e676" radius={[4, 4, 0, 0]} maxBarSize={32} cursor="pointer" onClick={d => { const dia = d?.payload || d; if (dia?.fechaKey) setDiaAbierto(dia) }} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Frecuencia de cierre de tickets por día */}
      <div style={S.chartCard}>
        <div style={S.chartTitle}>Frecuencia de ventas por día — últimos 35 días</div>
        <div style={S.chartHint}>Minutos promedio entre un ticket y el siguiente, dentro del horario del local. Barra más baja = se vende más seguido. Las ventas fuera de horario (aperturas después de un partido) no se cuentan y se avisan en el detalle.</div>
        <div style={S.chartWrap}>
          <ResponsiveContainer width="100%" height={420}>
            <BarChart data={datosFrecuencia} margin={{ top: 8, right: 8, left: 0, bottom: 40 }} style={{ cursor:'pointer', outline:'none' }} onClick={st => { const i = Number(st?.activeTooltipIndex ?? st?.activeIndex); const dia = datosGrafico[i] || datosGrafico.find(x => x.label === st?.activeLabel); if (dia?.fechaKey) setDiaAbierto(dia) }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
              <XAxis dataKey="label" tick={{ fontFamily:'Barlow Condensed, sans-serif', fontSize:11, fill:'#6a8ccc' }} angle={-45} textAnchor="end" interval={2} tickLine={false} axisLine={false} />
              <YAxis tick={{ fontFamily:'Barlow Condensed, sans-serif', fontSize:11, fill:'#6a8ccc' }} tickFormatter={v => `${v} min`} tickLine={false} axisLine={false} width={56} />
              <Tooltip content={<FrecuenciaTooltip />} cursor={{ fill:'rgba(56,189,248,0.08)' }} />
              <Bar dataKey="prom" fill="#38bdf8" radius={[4, 4, 0, 0]} maxBarSize={32} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <MapaHoras ventas={ventasTodas} />

      {/* Gráfico mensual total */}
      <div style={S.chartCard}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', gap:10, flexWrap:'wrap' }}>
          <div style={S.chartTitle}>Ventas por mes — histórico</div>
          <div style={{ display:'flex', gap:4, background:'var(--surface2)', borderRadius:10, padding:3 }} role="group" aria-label="Moneda del gráfico">
            {MODOS_MONEDA.map(m => (
              <button key={m.id} onClick={() => setModoMoneda(m.id)} aria-pressed={modoMoneda === m.id}
                style={{ fontFamily:'Barlow Condensed, sans-serif', fontWeight:700, fontSize:14, padding:'6px 12px', borderRadius:8, border:'none', cursor:'pointer',
                  background: modoMoneda === m.id ? 'var(--accent)' : 'transparent', color: modoMoneda === m.id ? '#000' : 'var(--muted)' }}>{m.label}</button>
            ))}
          </div>
        </div>
        <div style={{ fontFamily:'Barlow, sans-serif', fontSize:12, color:'var(--muted)', margin:'2px 0 6px' }}>
          En el mes en curso, la parte transparente es la proyección de lo que falta vender hasta fin de mes.{notaMoneda ? ` ${notaMoneda}` : ''}
        </div>
        {modoMoneda !== 'ARS' && !indices ? (
          <div style={{ fontFamily:'Barlow, sans-serif', fontSize:14, color: errorIndices ? '#ef4444' : 'var(--muted)', padding:'40px 0', textAlign:'center' }}>{errorIndices || 'Trayendo inflación y dólar…'}</div>
        ) : (
        <div style={S.chartWrap}>
          <ResponsiveContainer width="100%" height={560}>
            <BarChart data={datosMesMoneda} margin={{ top: 26, right: 8, left: 0, bottom: 40 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
              <XAxis dataKey="label" tick={{ fontFamily:'Barlow Condensed, sans-serif', fontSize:11, fill:'#6a8ccc' }} angle={-45} textAnchor="end" interval={0} tickLine={false} axisLine={false} />
              <YAxis tick={{ fontFamily:'Barlow Condensed, sans-serif', fontSize:11, fill:'#6a8ccc' }} tickFormatter={v => v >= 1000000 ? `${(v/1000000).toFixed(1)}M` : v >= 1000 ? `${(v/1000).toFixed(0)}k` : Math.round(v)} tickLine={false} axisLine={false} width={48} />
              <Tooltip content={<MesTooltip modo={modoMoneda} />} cursor={{ fill:'rgba(33,150,243,0.08)' }} />
              <Bar dataKey="total" stackId="mes" fill="#2196f3" radius={[4, 4, 0, 0]} maxBarSize={48} />
              <Bar dataKey="resto" stackId="mes" fill="rgba(33,150,243,0.32)" stroke="#2196f3" strokeDasharray="4 3" strokeWidth={1.5} radius={[4, 4, 0, 0]} maxBarSize={48}>
                <LabelList dataKey="proy" position="top" formatter={p => p ? `≈\u00a0${fmtCorto(p.proyectado, prefijo(modoMoneda))}` : ''} style={{ fontFamily:'Barlow Condensed, sans-serif', fontWeight:800, fontSize:12, fill:'#90caf9' }} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
        )}
      </div>

      {/* Unidades vendidas por mes */}
      <div style={S.chartCard}>
        <div style={S.chartTitle}>Unidades vendidas por mes</div>
        <div style={{ fontFamily:'Barlow, sans-serif', fontSize:12, color:'var(--muted)', margin:'-4px 0 6px' }}>Cantidad de productos vendidos. No tiene inflación: muestra la temporada real y sirve para planificar compras. En el mes en curso, la parte transparente es la proyección de lo que falta vender.</div>
        <div style={S.chartWrap}>
          <ResponsiveContainer width="100%" height={420}>
            <BarChart data={unidadesMes} margin={{ top: 26, right: 8, left: 0, bottom: 40 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
              <XAxis dataKey="label" tick={{ fontFamily:'Barlow Condensed, sans-serif', fontSize:11, fill:'#6a8ccc' }} angle={-45} textAnchor="end" interval={0} tickLine={false} axisLine={false} />
              <YAxis tick={{ fontFamily:'Barlow Condensed, sans-serif', fontSize:11, fill:'#6a8ccc' }} tickLine={false} axisLine={false} width={48} />
              <Tooltip cursor={{ fill:'rgba(245,200,0,0.06)' }} content={<UnidadesTooltip />} />
              <Bar dataKey="unidades" stackId="u" fill="#f5c800" radius={[4, 4, 0, 0]} maxBarSize={48} />
              <Bar dataKey="resto" stackId="u" fill="rgba(245,200,0,0.28)" stroke="#f5c800" strokeDasharray="4 3" strokeWidth={1.5} radius={[4, 4, 0, 0]} maxBarSize={48}>
                <LabelList dataKey="proy" position="top" formatter={p => p ? `≈\u00a0${Math.round(p.proyectado).toLocaleString('es-AR')}` : ''} style={{ fontFamily:'Barlow Condensed, sans-serif', fontWeight:800, fontSize:12, fill:'#fde68a' }} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <MonotributoPosnet ventas={ventasTodas} />

      {/* Tarjeta + QR por mes, separado por posnet */}
      <div style={S.chartCard}>
        <div style={S.chartTitle}>Ventas Tarjeta + QR por mes — por posnet</div>
        <LeyendaPosnet />
        <div style={S.chartWrap}>
          <ResponsiveContainer width="100%" height={560}>
            <BarChart data={datosPosnet} margin={{ top: 8, right: 8, left: 0, bottom: 40 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
              <XAxis dataKey="label" tick={{ fontFamily:'Barlow Condensed, sans-serif', fontSize:11, fill:'#6a8ccc' }} angle={-45} textAnchor="end" interval={0} tickLine={false} axisLine={false} />
              <YAxis tick={{ fontFamily:'Barlow Condensed, sans-serif', fontSize:11, fill:'#6a8ccc' }} tickFormatter={v => v >= 1000000 ? `${(v/1000000).toFixed(1)}M` : v >= 1000 ? `${(v/1000).toFixed(0)}k` : v} tickLine={false} axisLine={false} width={48} />
              <Tooltip content={<PosnetTooltip modo="pesos" />} cursor={{ fill:'rgba(255,255,255,0.05)' }} />
              <Bar dataKey="sinDato" stackId="p" fill={COLORES_POSNET.sinDato} maxBarSize={48} />
              <Bar dataKey="amarillo" stackId="p" fill={COLORES_POSNET.amarillo} maxBarSize={48} />
              <Bar dataKey="blanco" stackId="p" fill={COLORES_POSNET.blanco} radius={[4, 4, 0, 0]} maxBarSize={48} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* % Tarjeta + QR sobre el total del mes, separado por posnet */}
      <div style={S.chartCard}>
        <div style={S.chartTitle}>% Tarjeta + QR sobre total — por mes y posnet</div>
        <LeyendaPosnet />
        <div style={S.chartWrap}>
          <ResponsiveContainer width="100%" height={560}>
            <BarChart data={datosPosnet} margin={{ top: 8, right: 8, left: 0, bottom: 40 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
              <XAxis dataKey="label" tick={{ fontFamily:'Barlow Condensed, sans-serif', fontSize:11, fill:'#6a8ccc' }} angle={-45} textAnchor="end" interval={0} tickLine={false} axisLine={false} />
              <YAxis tick={{ fontFamily:'Barlow Condensed, sans-serif', fontSize:11, fill:'#6a8ccc' }} tickFormatter={v => `${v}%`} domain={[0, 100]} tickLine={false} axisLine={false} width={48} />
              <Tooltip content={<PosnetTooltip modo="pct" />} cursor={{ fill:'rgba(255,255,255,0.05)' }} />
              <Bar dataKey="pctSinDato" stackId="p" fill={COLORES_POSNET.sinDato} maxBarSize={48} />
              <Bar dataKey="pctAmarillo" stackId="p" fill={COLORES_POSNET.amarillo} maxBarSize={48} />
              <Bar dataKey="pctBlanco" stackId="p" fill={COLORES_POSNET.blanco} radius={[4, 4, 0, 0]} maxBarSize={48} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {diaAbierto && (
        <DetalleDia
          dia={diaAbierto} ventas={ventasTodas} onCerrar={() => setDiaAbierto(null)}
          esAdmin={esAdmin} usuarios={usuarios} perfilNombre={perfilNombre}
          onPosnetCorregido={(idVenta, nuevo) => {
            const nuevas = ventasTodas.map(v => v.idVenta === idVenta ? { ...v, posnet: nuevo, correccionPosnet: v.correccionPosnet || 'corregido' } : v)
            setVentasTodas(nuevas)
          }}
        />
      )}
    </div>
  )
}

const S = {
  page: { display:'flex', flexDirection:'column', height:'100%', overflowY:'auto' },
  center: { display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', height:'100%', gap:12 },
  loadingText: { fontFamily:'Barlow Condensed, sans-serif', fontSize:22, color:'var(--muted)' },
  loadingSub: { fontFamily:'Barlow, sans-serif', fontSize:13, color:'var(--muted)' },
  errorText: { fontFamily:'Barlow, sans-serif', fontSize:16, color:'#ef4444', textAlign:'center' },
  retryBtn: { background:'var(--surface)', border:'1.5px solid var(--border)', borderRadius:10, color:'var(--text)', fontFamily:'Barlow, sans-serif', fontSize:15, padding:'10px 24px', cursor:'pointer' },
  header: { display:'flex', alignItems:'center', justifyContent:'space-between', padding:'16px 20px 12px', borderBottom:'2px solid var(--accent)', flexShrink:0 },
  headerTitle: { fontFamily:'Barlow Condensed, sans-serif', fontWeight:800, fontSize:28, color:'var(--accent)', textTransform:'uppercase', letterSpacing:2 },
  refreshBtn: { background:'var(--surface)', border:'1.5px solid var(--border)', borderRadius:10, color:'var(--text)', fontSize:24, width:44, height:44, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' },
  statsRow: { display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:12, padding:'16px 20px 12px' },
  statCard: { background:'var(--surface)', borderRadius:12, padding:'14px 16px', border:'1.5px solid var(--border)' },
  statValue: { fontFamily:'Barlow Condensed, sans-serif', fontWeight:800, fontSize:24, color:'var(--accent)' },
  statLabel: { fontFamily:'Barlow, sans-serif', fontSize:12, color:'var(--muted)', marginTop:2 },
  chartCard: { margin:'0 20px 16px', background:'var(--surface)', borderRadius:14, border:'1.5px solid var(--border)', padding:'16px' },
  chartTitle: { fontFamily:'Barlow Condensed, sans-serif', fontWeight:700, fontSize:16, color:'var(--muted)', letterSpacing:1, textTransform:'uppercase', marginBottom:12 },
  chartWrap: { width:'100%' },
  fueraChip: { fontFamily:'Barlow, sans-serif', fontSize:12, color:'var(--accent)', background:'rgba(245,200,0,0.08)', border:'1px solid rgba(245,200,0,0.3)', borderRadius:20, padding:'3px 10px' },
  rangoBtn: { fontFamily:'Barlow Condensed, sans-serif', fontWeight:700, fontSize:13, padding:'6px 12px', background:'var(--surface2)', border:'1.5px solid var(--border)', borderRadius:8, color:'var(--muted)', cursor:'pointer' },
  rangoBtnActivo: { borderColor:'var(--accent)', color:'var(--accent)', background:'rgba(245,200,0,0.1)' },
  mapaHora: { fontFamily:'Barlow Condensed, sans-serif', fontSize:12, color:'var(--muted)', textAlign:'center', padding:'2px 0' },
  mapaDia: { fontFamily:'Barlow Condensed, sans-serif', fontWeight:700, fontSize:13, color:'var(--muted)', display:'flex', alignItems:'center' },
  mapaCelda: { height:34, borderRadius:6, display:'flex', alignItems:'center', justifyContent:'center', fontFamily:'Barlow Condensed, sans-serif', fontWeight:700, fontSize:13, border:'1px solid rgba(255,255,255,0.05)' },
  chartHint: { fontFamily:'Barlow, sans-serif', fontSize:12, color:'var(--muted)', marginTop:-8, marginBottom:8 },
  sinDatos: { fontFamily:'Barlow, sans-serif', fontSize:14, color:'var(--muted)', padding:'24px 0' },
}
