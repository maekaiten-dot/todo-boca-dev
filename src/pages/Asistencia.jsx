// src/pages/Asistencia.jsx — Admin: asistencia del mes por empleada (tardes, francos, fichadas faltantes)
import { useEffect, useMemo, useState } from 'react'
import { asistencia, getPinFichadas, setPinFichadas } from '../api/fichadas.js'
import {
  calcularAsistencia, parseFecha, fmtHora, parseTurno, DIAS, DIAS_CORTOS, ESTADOS, TIPOS_CAMBIO, HORARIOS_SUGERIDOS, TOLERANCIA_MIN,
} from '../lib/asistencia.js'

const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']

export default function Asistencia({ usuarios = [] }) {
  const [pin, setPinLocal] = useState(getPinFichadas())
  const [datos, setDatos] = useState(null)
  const [mes, setMes] = useState(null) // { anio, mes }
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState('')
  const [soloRevisar, setSoloRevisar] = useState(false)
  const [diaAbierto, setDiaAbierto] = useState(null) // { emp, dia }
  const [editandoHorarios, setEditandoHorarios] = useState(false)

  const setPin = (p) => { setPinLocal(p); setPinFichadas(p) }

  async function pedir(accion, extra) {
    setCargando(true); setError('')
    try {
      const r = await asistencia(pin, accion, extra)
      setDatos(r)
      if (!mes) { const { m, a } = parseFecha(r.ahora.fecha); setMes({ anio: a, mes: m }) }
      if (accion === 'datos' && r.empleadas.length === 0) setEditandoHorarios(true)
      return true
    } catch (e) { setError(e.message); return false }
    finally { setCargando(false) }
  }

  useEffect(() => { if (pin) pedir('datos') }, [])

  const resultado = useMemo(() => {
    if (!datos || !mes) return []
    return calcularAsistencia({ empleadas: datos.empleadas, fichadas: datos.fichadas, cambios: datos.cambios, mes, hoy: datos.ahora })
  }, [datos, mes])

  const moverMes = (d) => setMes(({ anio, mes: m }) => {
    const x = m + d
    return x < 1 ? { anio: anio - 1, mes: 12 } : x > 12 ? { anio: anio + 1, mes: 1 } : { anio, mes: x }
  })

  if (!datos) {
    return (
      <div style={S.page}>
        <div style={S.titulo}>Asistencia</div>
        <div style={S.card}>
          <label style={S.label}>PIN de fichadas</label>
          <input style={S.input} type="password" inputMode="numeric" value={pin} onChange={e => setPin(e.target.value)} onKeyDown={e => e.key === 'Enter' && pedir('datos')} />
          {error && <div style={S.error}>{error}</div>}
          <button style={S.btn} onClick={() => pedir('datos')} disabled={cargando || !pin}>{cargando ? 'Cargando…' : 'Ver asistencia'}</button>
        </div>
      </div>
    )
  }

  if (editandoHorarios) {
    return <EditorHorarios usuarios={usuarios} empleadas={datos.empleadas} cargando={cargando} error={error}
      onCancelar={datos.empleadas.length ? () => setEditandoHorarios(false) : null}
      onGuardar={async (empleadas) => { if (await pedir('guardarHorarios', { empleadas })) setEditandoHorarios(false) }} />
  }

  return (
    <div style={S.page}>
      <div style={S.filaTitulo}>
        <div style={S.titulo}>Asistencia</div>
        <div style={S.fila}>
          <button style={S.btnChico} onClick={() => pedir('datos')} disabled={cargando}>{cargando ? '…' : '↻'}</button>
          <button style={S.btnChico} onClick={() => setEditandoHorarios(true)}>Horarios</button>
        </div>
      </div>

      <div style={S.mesNav}>
        <button style={S.flecha} onClick={() => moverMes(-1)}>‹</button>
        <div style={S.mesTxt}>{MESES[mes.mes - 1]} {mes.anio}</div>
        <button style={S.flecha} onClick={() => moverMes(1)}>›</button>
      </div>
      <label style={S.check}><input type="checkbox" checked={soloRevisar} onChange={e => setSoloRevisar(e.target.checked)} /> Mostrar solo tardes y días para revisar</label>
      {error && <div style={S.error}>{error}</div>}

      {resultado.map(emp => (
        <div key={emp.idUsuario} style={S.card}>
          <div style={S.empNombre}>{emp.nombre}</div>
          <div style={S.chips}>
            <Chip n={emp.resumen.trabajados} t="trabajados" />
            <Chip n={emp.resumen.tardes} t={emp.resumen.tardes ? `tardes (${emp.resumen.minutosTarde} min)` : 'tardes'} color={emp.resumen.tardes ? ESTADOS.tarde.color : null} />
            <Chip n={emp.resumen.francos} t="francos" />
            {emp.resumen.olvidos > 0 && <Chip n={emp.resumen.olvidos} t="sin fichar (trabajó)" color={ESTADOS.olvido.color} />}
            {emp.resumen.ausencias > 0 && <Chip n={emp.resumen.ausencias} t="ausencias" color={ESTADOS.ausencia.color} />}
            {emp.resumen.revisar > 0 && <Chip n={emp.resumen.revisar} t="para revisar" color={ESTADOS.falta.color} />}
          </div>
          <div style={S.tabla}>
            {emp.dias
              .filter(d => d.estado !== 'futuro' || !soloRevisar)
              .filter(d => !soloRevisar || ['tarde', 'falta', 'francoProbable'].includes(d.estado))
              .map(d => {
                const est = ESTADOS[d.estado] || ESTADOS.futuro
                const { d: dd, m: mm } = parseFecha(d.fecha)
                return (
                  <button key={d.fecha} style={{ ...S.filaDia, ...(d.estado === 'futuro' ? { opacity: 0.4 } : {}) }} onClick={() => setDiaAbierto({ emp, dia: d })}>
                    <span style={S.colFecha}>{DIAS_CORTOS[d.dow]} {dd}/{mm}</span>
                    <span style={S.colHora}>{d.esperado ? fmtHora(d.esperado.entrada) : '—'}</span>
                    <span style={S.colHora}>{d.entrada ? fmtHora(d.entrada) : ''}</span>
                    <span style={{ ...S.estado, color: est.color }}>
                      {est.texto}{d.estado === 'tarde' ? ` ${d.minutosTarde} min` : ''}{d.cambio ? ' ✎' : ''}
                    </span>
                  </button>
                )
              })}
          </div>
        </div>
      ))}
      <div style={S.muted}>Columnas: día · entrada esperada · fichada. Tolerancia {TOLERANCIA_MIN} min. Tocá un día para cargar un franco, un cambio de horario o un olvido de fichada.</div>

      {diaAbierto && (
        <ModalDia {...diaAbierto} cargando={cargando} onCerrar={() => setDiaAbierto(null)}
          onAgregar={async (cambio) => { if (await pedir('agregarCambio', { cambio })) setDiaAbierto(null) }}
          onBorrar={async (id) => { if (await pedir('borrarCambio', { id })) setDiaAbierto(null) }} />
      )}
    </div>
  )
}

function Chip({ n, t, color }) {
  return <span style={{ ...S.chip, ...(color ? { borderColor: color, color } : {}) }}><b>{n}</b> {t}</span>
}

function ModalDia({ emp, dia, cargando, onCerrar, onAgregar, onBorrar }) {
  const [tipo, setTipo] = useState(dia.estado === 'francoProbable' ? 'FRANCO' : dia.estado === 'falta' ? 'OLVIDO' : 'HORARIO')
  const [entrada, setEntrada] = useState(dia.esperado?.entrada || '')
  const [nota, setNota] = useState('')
  const est = ESTADOS[dia.estado] || ESTADOS.futuro
  const { d, m } = parseFecha(dia.fecha)

  return (
    <div style={S.overlay} onClick={onCerrar}>
      <div style={S.modal} onClick={e => e.stopPropagation()}>
        <div style={S.empNombre}>{emp.nombre} · {DIAS[dia.dow]} {d}/{m}</div>
        <div style={S.muted}>
          Esperado: {dia.esperado ? `${fmtHora(dia.esperado.entrada)}${dia.esperado.salida ? ` a ${fmtHora(dia.esperado.salida)}` : ''}` : 'no trabaja'}
          {' · '}Fichada: {dia.entrada ? fmtHora(dia.entrada) : 'ninguna'}{dia.salida ? ` · Salida: ${fmtHora(dia.salida)}` : ''}
        </div>
        {est.texto && <div style={{ ...S.estado, color: est.color }}>{est.texto}{dia.estado === 'tarde' ? ` ${dia.minutosTarde} min` : ''}</div>}

        {dia.cambio ? (
          <div style={S.cambioBox}>
            <div style={S.textoChico}>Cambio cargado: <b>{TIPOS_CAMBIO[dia.cambio.tipo]}{dia.cambio.tipo === 'HORARIO' ? ` · entrada ${dia.cambio.entrada}` : ''}</b>{dia.cambio.nota ? ` — ${dia.cambio.nota}` : ''}</div>
            <button style={S.btnBaja} onClick={() => onBorrar(dia.cambio.id)} disabled={cargando}>Quitar cambio</button>
          </div>
        ) : (
          <>
            <div style={S.opciones}>
              {Object.entries(TIPOS_CAMBIO).map(([k, t]) => (
                <button key={k} style={{ ...S.opcion, ...(tipo === k ? S.opcionActiva : {}) }} onClick={() => setTipo(k)}>{t}</button>
              ))}
            </div>
            {tipo === 'HORARIO' && (
              <label style={S.label}>Hora de entrada
                <input style={S.input} value={entrada} onChange={e => setEntrada(e.target.value)} placeholder="12:00" inputMode="numeric" />
              </label>
            )}
            <input style={S.input} value={nota} onChange={e => setNota(e.target.value)} placeholder="Nota (opcional)" />
            <button style={S.btn} disabled={cargando} onClick={() => onAgregar({ fecha: dia.fecha, idUsuario: emp.idUsuario, nombre: emp.nombre, tipo, entrada: entrada.trim(), nota })}>
              {cargando ? 'Guardando…' : 'Guardar'}
            </button>
          </>
        )}
        <button style={S.btnSec} onClick={onCerrar}>Cerrar</button>
      </div>
    </div>
  )
}

function EditorHorarios({ usuarios, empleadas, cargando, error, onGuardar, onCancelar }) {
  const candidatas = usuarios.filter(u => u.nombre && u.nombre !== 'Tablet' && u.tipo?.toLowerCase() !== 'admin')
  const [lista, setLista] = useState(() => {
    if (empleadas.length) return empleadas.map(e => ({ ...e, dias: { ...e.dias } }))
    return candidatas.map(u => {
      const sug = HORARIOS_SUGERIDOS[u.nombre.toLowerCase()]
      return { idUsuario: u.id, nombre: u.nombre, franco: sug?.franco || 1, dias: { ...(sug?.dias || {}) } }
    })
  })
  const [agregar, setAgregar] = useState('')
  const faltan = usuarios.filter(u => u.nombre && u.nombre !== 'Tablet' && !lista.some(e => e.idUsuario === u.id))

  const cambiar = (i, campo, valor) => setLista(l => l.map((e, j) => j === i ? { ...e, [campo]: valor } : e))
  const cambiarDia = (i, dia, valor) => setLista(l => l.map((e, j) => j === i ? { ...e, dias: { ...e.dias, [dia]: valor } } : e))
  const invalido = lista.some(e => [1, 2, 3, 4, 5, 6, 7].some(d => e.dias[d] && !parseTurno(e.dias[d])))

  return (
    <div style={S.page}>
      <div style={S.titulo}>Horarios habituales</div>
      <div style={S.muted}>Formato: 9:30-14:30. Dejá vacío el día que no trabaja. Los cambios puntuales (francos movidos, otro horario un día) se cargan tocando el día en Asistencia.</div>
      {lista.map((e, i) => (
        <div key={e.idUsuario} style={S.card}>
          <div style={S.filaTitulo}>
            <div style={S.empNombre}>{e.nombre}</div>
            <button style={S.btnBaja} onClick={() => setLista(l => l.filter((_, j) => j !== i))}>Quitar</button>
          </div>
          <label style={S.label}>Franco habitual
            <select style={S.input} value={e.franco} onChange={ev => cambiar(i, 'franco', Number(ev.target.value))}>
              {[1, 2, 3, 4, 5, 6, 7].map(d => <option key={d} value={d}>{DIAS[d]}</option>)}
            </select>
          </label>
          <div style={S.gridDias}>
            {[1, 2, 3, 4, 5, 6, 7].map(d => (
              <label key={d} style={S.labelDia}>{DIAS_CORTOS[d]}
                <input style={{ ...S.inputDia, ...(e.dias[d] && !parseTurno(e.dias[d]) ? { borderColor: '#ef4444' } : {}) }}
                  value={e.dias[d] || ''} onChange={ev => cambiarDia(i, d, ev.target.value)} placeholder="—" />
              </label>
            ))}
          </div>
        </div>
      ))}
      {faltan.length > 0 && (
        <div style={S.fila}>
          <select style={{ ...S.input, flex: 1 }} value={agregar} onChange={e => setAgregar(e.target.value)}>
            <option value="">Agregar empleada…</option>
            {faltan.map(u => <option key={u.id} value={u.id}>{u.nombre}</option>)}
          </select>
          <button style={S.btnSec} disabled={!agregar} onClick={() => {
            const u = usuarios.find(x => x.id === agregar)
            setLista(l => [...l, { idUsuario: u.id, nombre: u.nombre, franco: 1, dias: {} }]); setAgregar('')
          }}>Agregar</button>
        </div>
      )}
      {error && <div style={S.error}>{error}</div>}
      <div style={S.fila}>
        <button style={S.btn} onClick={() => onGuardar(lista)} disabled={cargando || invalido}>{cargando ? 'Guardando…' : 'Guardar horarios'}</button>
        {onCancelar && <button style={S.btnSec} onClick={onCancelar}>Cancelar</button>}
      </div>
    </div>
  )
}

const S = {
  page: { flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 720, width: '100%', margin: '0 auto' },
  titulo: { fontFamily: 'Barlow Condensed, sans-serif', fontWeight: 800, fontSize: 26, color: 'var(--accent)', letterSpacing: 1.5, textTransform: 'uppercase' },
  filaTitulo: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 },
  fila: { display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' },
  card: { background: 'var(--surface)', border: '1.5px solid var(--border)', borderRadius: 14, padding: 14, display: 'flex', flexDirection: 'column', gap: 10 },
  label: { display: 'flex', flexDirection: 'column', gap: 4, fontFamily: 'Barlow Condensed, sans-serif', fontWeight: 700, fontSize: 14, color: 'var(--muted)', letterSpacing: 0.5 },
  input: { padding: '11px 12px', background: 'var(--surface2)', border: '1.5px solid var(--border)', borderRadius: 10, color: 'var(--text)', fontFamily: 'Barlow, sans-serif', fontSize: 16 },
  muted: { fontFamily: 'Barlow, sans-serif', fontSize: 13, color: 'var(--muted)', lineHeight: 1.5 },
  textoChico: { fontFamily: 'Barlow, sans-serif', fontSize: 14, color: 'var(--text)', lineHeight: 1.5 },
  error: { fontFamily: 'Barlow, sans-serif', fontSize: 14, color: '#ef4444' },
  btn: { padding: '12px 16px', background: 'var(--accent)', border: 'none', borderRadius: 10, color: '#000', fontFamily: 'Barlow Condensed, sans-serif', fontWeight: 800, fontSize: 16, cursor: 'pointer' },
  btnSec: { padding: '12px 16px', background: 'none', border: '1.5px solid var(--border)', borderRadius: 10, color: 'var(--text)', fontFamily: 'Barlow Condensed, sans-serif', fontWeight: 700, fontSize: 16, cursor: 'pointer' },
  btnChico: { padding: '7px 12px', background: 'var(--surface2)', border: '1.5px solid var(--border)', borderRadius: 8, color: 'var(--text)', fontFamily: 'Barlow Condensed, sans-serif', fontWeight: 700, fontSize: 15, cursor: 'pointer' },
  btnBaja: { padding: '8px 12px', background: 'none', border: '1.5px solid #ef4444', borderRadius: 8, color: '#ef4444', fontFamily: 'Barlow Condensed, sans-serif', fontWeight: 700, fontSize: 14, cursor: 'pointer', alignSelf: 'flex-start' },
  mesNav: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16 },
  flecha: { width: 40, height: 40, background: 'var(--surface2)', border: '1.5px solid var(--border)', borderRadius: 10, color: 'var(--text)', fontSize: 22, cursor: 'pointer' },
  mesTxt: { fontFamily: 'Barlow Condensed, sans-serif', fontWeight: 800, fontSize: 22, color: 'var(--text)', minWidth: 170, textAlign: 'center' },
  check: { display: 'flex', alignItems: 'center', gap: 8, fontFamily: 'Barlow, sans-serif', fontSize: 14, color: 'var(--muted)' },
  empNombre: { fontFamily: 'Barlow Condensed, sans-serif', fontWeight: 800, fontSize: 21, color: 'var(--text)', letterSpacing: 0.5 },
  chips: { display: 'flex', flexWrap: 'wrap', gap: 6 },
  chip: { fontFamily: 'Barlow, sans-serif', fontSize: 13, color: 'var(--muted)', border: '1px solid var(--border)', borderRadius: 20, padding: '3px 10px' },
  tabla: { display: 'flex', flexDirection: 'column', gap: 2 },
  filaDia: { display: 'grid', gridTemplateColumns: '64px 52px 52px 1fr', alignItems: 'center', gap: 6, padding: '8px 6px', background: 'none', border: 'none', borderBottom: '1px solid var(--border)', cursor: 'pointer', textAlign: 'left' },
  colFecha: { fontFamily: 'Barlow Condensed, sans-serif', fontWeight: 700, fontSize: 15, color: 'var(--text)' },
  colHora: { fontFamily: 'Barlow, sans-serif', fontSize: 14, color: 'var(--muted)' },
  estado: { fontFamily: 'Barlow Condensed, sans-serif', fontWeight: 700, fontSize: 15 },
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,10,0.8)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 450 },
  modal: { width: '100%', maxWidth: 520, background: 'var(--surface)', borderTop: '2px solid var(--accent)', borderRadius: '18px 18px 0 0', padding: '18px 16px calc(18px + env(safe-area-inset-bottom, 0px))', display: 'flex', flexDirection: 'column', gap: 12, maxHeight: '90%', overflowY: 'auto' },
  cambioBox: { display: 'flex', flexDirection: 'column', gap: 10, padding: 12, background: 'var(--surface2)', borderRadius: 10 },
  opciones: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 },
  opcion: { padding: '12px 10px', background: 'var(--surface2)', border: '1.5px solid var(--border)', borderRadius: 10, color: 'var(--text)', fontFamily: 'Barlow, sans-serif', fontSize: 14, cursor: 'pointer' },
  opcionActiva: { borderColor: 'var(--accent)', color: 'var(--accent)' },
  gridDias: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(92px, 1fr))', gap: 8 },
  labelDia: { display: 'flex', flexDirection: 'column', gap: 3, fontFamily: 'Barlow Condensed, sans-serif', fontWeight: 700, fontSize: 13, color: 'var(--muted)' },
  inputDia: { padding: '9px 8px', background: 'var(--surface2)', border: '1.5px solid var(--border)', borderRadius: 8, color: 'var(--text)', fontFamily: 'Barlow, sans-serif', fontSize: 14, width: '100%' },
}
