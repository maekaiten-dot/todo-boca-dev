// src/pages/Conteo.jsx
// Conteo de stock (todos los usuarios): lista del día, conteo completo de lo que nunca se contó,
// contar cualquier artículo y registrar bajas. Los Admin además ven las diferencias.
// El conteo es "a ciegas": la app no muestra cuánto espera. Si no coincide, pide contar de nuevo.
import { useState, useEffect, useMemo } from 'react'
import BarcodeScanner from '../components/BarcodeScanner.jsx'
import {
  getEstadoStock, registrarConteo, registrarBaja, anularMovimientoStock,
  armarListaConteoDelDia, MOTIVOS_BAJA, FRECUENCIA_CONTEO, ARTICULOS_POR_DIA,
  getAvisosArticulos, registrarAvisoArticulo, resolverAvisoArticulo, TIPOS_AVISO,
} from '../api/sheets.js'

const fmt$ = n => (n < 0 ? '−$' : '$') + Math.abs(Math.round(n)).toLocaleString('es-AR')
// Precio de venta actual, al lado del nombre: ayuda a distinguir artículos parecidos
const Precio = ({ valor }) => valor > 0 ? <span style={S.precio}>{fmt$(valor)}</span> : null
const normalizar = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
const POR_PAGINA = 40

function haceDias(ms) {
  if (!ms) return 'nunca'
  const d = Math.floor((Date.now() - ms) / 86400000)
  return d <= 0 ? 'hoy' : d === 1 ? 'ayer' : `hace ${d} días`
}

function FormAviso({ art, onEnviar, onCancelar }) {
  const [tipo, setTipo] = useState('')
  const [detalle, setDetalle] = useState('')
  const [enviando, setEnviando] = useState(false)
  const ok = tipo && !(tipo === 'Otro' && !detalle.trim())
  async function enviar() {
    if (!ok) return
    setEnviando(true)
    const bien = await onEnviar(art, tipo, detalle)
    if (!bien) setEnviando(false)
  }
  return (
    <div style={S.avisoForm}>
      <div style={S.avisoTitulo}>Anotar algo sobre este artículo</div>
      <div style={S.avisoTipos}>
        {TIPOS_AVISO.map(t => (
          <button key={t} style={{ ...S.avisoTipo, ...(tipo === t ? S.avisoTipoActivo : {}) }} onClick={() => setTipo(t)}>{t}</button>
        ))}
      </div>
      <input style={S.search} placeholder={tipo === 'Otro' ? 'Contá qué pasa (obligatorio)' : 'Detalle (opcional). Ej: está repetido con TB00123'} value={detalle} maxLength={200} onChange={e => setDetalle(e.target.value)} />
      <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
        <button style={S.avisoCancelar} onClick={onCancelar} disabled={enviando}>Cancelar</button>
        <button style={{ ...S.avisoEnviar, opacity: ok && !enviando ? 1 : 0.45 }} disabled={!ok || enviando} onClick={enviar}>{enviando ? 'Guardando...' : 'Guardar anotación'}</button>
      </div>
    </div>
  )
}

function ItemConteo({ art, info, clase, onGuardar, guardando, recuento, resultado, esAdmin, avisosPendientes = 0, onAviso }) {
  const [valor, setValor] = useState('')
  const [anotando, setAnotando] = useState(false)
  const [reabierto, setReabierto] = useState(null) // resultado que había al tocar "Contar de nuevo"
  useEffect(() => { if (recuento != null) setValor('') }, [recuento])
  const num = valor === '' ? null : Number(valor)
  const valido = num != null && Number.isInteger(num) && num >= 0
  const hecho = (resultado?.guardado || art.contadoHoy) && reabierto !== (resultado || 'hoy')
  return (
    <div style={{ ...S.item, ...(recuento != null ? S.itemRecuento : {}), ...(hecho ? S.itemHecho : {}) }}>
      <div style={S.itemFoto}>{art.foto ? <img src={art.foto} alt="" style={S.img} loading="lazy" /> : <span style={{ fontSize: 22 }}>📦</span>}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={S.itemNombre}>{art.nombre} <Precio valor={art.precioUnitario} /></div>
        <div style={S.itemMeta}>
          {art.id}{clase ? ` · clase ${clase}` : ''} · último conteo: {haceDias(info?.ultimoConteoMs)}
        </div>
        {hecho && (
          <div style={S.okTxt}>
            ✓ Contado{resultado?.contado != null ? `: ${resultado.contado}` : ''}
            {esAdmin && resultado?.diferencia != null && resultado.diferencia !== 0 && <span style={{ color: resultado.diferencia < 0 ? '#ef4444' : '#22c55e' }}> · dif {resultado.diferencia > 0 ? '+' : ''}{resultado.diferencia}</span>}
            <button style={S.recontarBtn} onClick={() => { setValor(''); setReabierto(resultado || 'hoy') }}>Contar de nuevo</button>
          </div>
        )}
        {recuento != null && !hecho && <div style={S.recuentoTxt}>No coincide con lo que espera la app. Volvé a contar con cuidado (incluí lo del depósito).</div>}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 3, flexWrap: 'wrap' }}>
          {avisosPendientes > 0 && <span style={S.avisoBadge}>📝 {avisosPendientes} {avisosPendientes === 1 ? 'anotación pendiente' : 'anotaciones pendientes'}</span>}
          {!anotando && onAviso && <button style={S.anotarBtn} onClick={() => setAnotando(true)}>📝 Anotar</button>}
        </div>
        {anotando && <FormAviso art={art} onCancelar={() => setAnotando(false)} onEnviar={async (a, t, d) => { const ok = await onAviso(a, t, d); if (ok) setAnotando(false); return ok }} />}
      </div>
      {!hecho && (
        <div style={S.itemAccion}>
          <input
            style={S.input} type="text" inputMode="numeric" placeholder="Cant."
            value={valor} onChange={e => setValor(e.target.value.replace(/[^\d]/g, ''))}
            onKeyDown={e => { if (e.key === 'Enter' && valido && !guardando) onGuardar(art, num) }}
            aria-label={`Cantidad contada de ${art.nombre}`}
          />
          <button style={{ ...S.guardarBtn, opacity: valido && !guardando ? 1 : 0.45 }} disabled={!valido || guardando} onClick={() => onGuardar(art, num)}>
            {guardando ? '...' : recuento != null ? 'Confirmar' : 'Guardar'}
          </button>
        </div>
      )}
    </div>
  )
}

export default function Conteo({ articulos = [], usuarios = [], perfilNombre = '', esAdmin = false, onActualizado }) {
  const empleados = usuarios.filter(u => u.nombre !== 'Tablet')
  const perfilEsEmpleado = empleados.some(u => u.nombre === perfilNombre)
  const [empleado, setEmpleado] = useState(perfilEsEmpleado ? perfilNombre : '')
  const [modo, setModo] = useState('hoy')
  const [datos, setDatos] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [busqueda, setBusqueda] = useState('')
  const [pagina, setPagina] = useState(1)
  const [guardando, setGuardando] = useState({})
  const [recuentos, setRecuentos] = useState({})   // id -> primer valor contado
  const [resultados, setResultados] = useState({}) // id -> { guardado, contado, diferencia }
  const [toast, setToast] = useState(null)
  // Baja
  const [bajaArt, setBajaArt] = useState(null)
  const [bajaCant, setBajaCant] = useState('1')
  const [bajaMotivo, setBajaMotivo] = useState('')
  const [bajaDetalle, setBajaDetalle] = useState('')
  const [bajaBusqueda, setBajaBusqueda] = useState('')
  const [guardandoBaja, setGuardandoBaja] = useState(false)
  const [anulando, setAnulando] = useState(null)
  // Anotaciones (avisos) sobre artículos
  const [avisos, setAvisos] = useState([])
  const [verResueltos, setVerResueltos] = useState(false)
  const [resolviendo, setResolviendo] = useState(null)
  const [notaResolucion, setNotaResolucion] = useState('')
  const [scannerBaja, setScannerBaja] = useState(false)
  // Tandas extra del día (se recuerdan en este dispositivo hasta medianoche)
  const claveTandas = 'tb_conteo_tandas_' + new Date(Date.now() - 3 * 3600000).toISOString().slice(0, 10)
  const [tandasExtra, setTandasExtra] = useState(() => { try { return Number(localStorage.getItem(claveTandas)) || 0 } catch { return 0 } })
  function pedirOtraTanda() {
    const n = tandasExtra + 1
    setTandasExtra(n)
    try { localStorage.setItem(claveTandas, String(n)) } catch {}
  }
  // Diferencias y anotaciones solo para admins: el perfil tiene que ser admin y,
  // si se eligió quién cuenta, esa persona también (por si un empleado usa un dispositivo de admin).
  const tipoDe = n => (usuarios.find(u => u.nombre === n)?.tipo || '').toLowerCase()
  const verAdmin = esAdmin && (!empleado || tipoDe(empleado) === 'admin')

  useEffect(() => { if (perfilEsEmpleado) setEmpleado(perfilNombre) }, [perfilNombre, perfilEsEmpleado])
  useEffect(() => { if (articulos.length) cargar() }, [articulos.length])
  useEffect(() => { setPagina(1) }, [modo, busqueda])
  useEffect(() => { if (!verAdmin && (modo === 'dif' || modo === 'avisos')) setModo('hoy') }, [verAdmin, modo])

  async function cargar() {
    setLoading(true); setError(null)
    getAvisosArticulos().then(setAvisos).catch(e => console.error(e))
    try { setDatos(await getEstadoStock(articulos)) }
    catch (e) { console.error(e); setError('No se pudo cargar el stock. Intentá de nuevo.') }
    finally { setLoading(false) }
  }

  function showToast(msg, type = 'success') { setToast({ msg, type }); setTimeout(() => setToast(null), 3000) }

  const pendientesPorArt = useMemo(() => {
    const m = {}; avisos.forEach(a => { if (a.estado !== 'RESUELTO') m[a.articuloId] = (m[a.articuloId] || 0) + 1 }); return m
  }, [avisos])

  async function guardarAviso(art, tipo, detalle) {
    if (!empleado) { showToast('Elegí quién está contando', 'error'); return false }
    try {
      await registrarAvisoArticulo({ articulo: art, tipo, detalle, empleado })
      showToast('Anotación guardada')
      getAvisosArticulos().then(setAvisos).catch(() => {})
      return true
    } catch (e) { console.error(e); showToast('No se pudo guardar la anotación.', 'error'); return false }
  }

  async function resolverAviso(av) {
    try {
      await resolverAvisoArticulo({ id: av.id, nota: notaResolucion, quien: perfilNombre })
      showToast('Marcado como resuelto')
      setResolviendo(null); setNotaResolucion('')
      setAvisos(await getAvisosArticulos())
    } catch (e) { console.error(e); showToast('No se pudo guardar.', 'error') }
  }

  const estado = datos?.estado || {}
  const clases = datos?.clases || {}
  const precioDe = useMemo(() => Object.fromEntries(articulos.map(a => [a.id, a.precioUnitario])), [articulos])
  const listaHoy = useMemo(() => datos ? armarListaConteoDelDia(articulos, estado, clases, Date.now(), ARTICULOS_POR_DIA, tandasExtra) : [], [datos, articulos, tandasExtra])
  const quedanParaOtraTanda = listaHoy.length < articulos.length
  const sinContar = useMemo(() => articulos.filter(a => !estado[a.id]?.contado && !resultados[a.id]?.guardado).sort((x, y) => (!x.nombre - !y.nombre) || x.nombre.localeCompare(y.nombre)), [datos, articulos, resultados])
  const contadosTotal = articulos.length - sinContar.length
  const pendientesHoy = listaHoy.filter(a => !a.contadoHoy && !resultados[a.id]?.guardado).length

  async function guardarConteo(art, cantidad) {
    if (!empleado) { showToast('Elegí quién está contando', 'error'); return }
    setGuardando(g => ({ ...g, [art.id]: true }))
    try {
      const r = await registrarConteo({ articulo: art, cantidad, empleado, primerConteo: recuentos[art.id] ?? null })
      if (r.necesitaRecuento) {
        setRecuentos(x => ({ ...x, [art.id]: cantidad }))
      } else {
        setResultados(x => ({ ...x, [art.id]: { guardado: true, contado: cantidad, diferencia: r.diferencia } }))
        setRecuentos(x => { const n = { ...x }; delete n[art.id]; return n })
        onActualizado?.()
      }
    } catch (e) {
      console.error(e); showToast('No se pudo guardar. Revisá la conexión.', 'error')
    } finally {
      setGuardando(g => ({ ...g, [art.id]: false }))
    }
  }

  async function guardarBaja() {
    if (!empleado) { showToast('Elegí quién registra la baja', 'error'); return }
    const cant = Number(bajaCant)
    if (!bajaArt || !Number.isInteger(cant) || cant <= 0 || !bajaMotivo || (bajaMotivo === 'Otro' && !bajaDetalle.trim())) return
    setGuardandoBaja(true)
    try {
      await registrarBaja({ articulo: bajaArt, cantidad: cant, motivo: bajaMotivo, detalle: bajaDetalle.trim(), empleado })
      showToast(`Baja registrada: ${cant} × ${bajaArt.nombre}`)
      setBajaArt(null); setBajaCant('1'); setBajaMotivo(''); setBajaDetalle(''); setBajaBusqueda('')
      onActualizado?.(); cargar()
    } catch (e) { console.error(e); showToast('No se pudo guardar la baja.', 'error') }
    finally { setGuardandoBaja(false) }
  }

  async function anular(m) {
    setAnulando(m.id)
    try { await anularMovimientoStock(m.id, perfilNombre); showToast('Movimiento anulado'); onActualizado?.(); await cargar() }
    catch (e) { console.error(e); showToast('No se pudo anular.', 'error') }
    finally { setAnulando(null) }
  }

  const filtrar = lista => {
    if (!busqueda.trim()) return lista
    const q = normalizar(busqueda)
    return lista.filter(a => normalizar(a.nombre).includes(q) || normalizar(a.id).includes(q))
  }

  const renderItems = (lista, paginar = false) => {
    const visibles = paginar ? lista.slice(0, pagina * POR_PAGINA) : lista
    return (
      <>
        <div style={S.lista}>
          {visibles.map(a => (
            <ItemConteo
              key={a.id} art={a} info={estado[a.id]} clase={clases[a.id]} esAdmin={verAdmin}
              onGuardar={guardarConteo} guardando={!!guardando[a.id]}
              avisosPendientes={pendientesPorArt[a.id] || 0} onAviso={guardarAviso}
              recuento={recuentos[a.id]} resultado={resultados[a.id]}
            />
          ))}
        </div>
        {paginar && visibles.length < lista.length && (
          <button style={S.masBtn} onClick={() => setPagina(p => p + 1)}>Ver más ({lista.length - visibles.length} restantes)</button>
        )}
      </>
    )
  }

  // ── Diferencias (Admin) ──
  const hace30 = Date.now() - 30 * 86400000
  const movs30 = (datos?.movimientos || []).filter(m => m.ms >= hace30).sort((a, b) => b.ms - a.ms)
  // El primer conteo de cada artículo es su punto de partida: se compara contra la cuenta vieja, que no es
  // confiable, así que no se toma como faltante ni sobrante (vale también para los guardados antes de este cambio)
  const primerConteo = {}
  ;(datos?.movimientos || []).filter(m => m.tipo === 'CONTEO' && !m.anulado).forEach(m => {
    if (!primerConteo[m.articuloId] || m.ms < primerConteo[m.articuloId].ms) primerConteo[m.articuloId] = m
  })
  const esInicial = m => m.tipo === 'CONTEO' && primerConteo[m.articuloId]?.id === m.id
  const difs = movs30.filter(m => m.tipo === 'BAJA' || (m.tipo === 'CONTEO' && m.diferencia !== 0 && !esInicial(m)))
  const activos30 = difs.filter(m => !m.anulado)
  const valorFaltante = activos30.filter(m => m.tipo === 'CONTEO' && m.diferencia < 0).reduce((s, m) => s + m.valorDiferencia, 0)
  const valorSobrante = activos30.filter(m => m.tipo === 'CONTEO' && m.diferencia > 0).reduce((s, m) => s + m.valorDiferencia, 0)
  const valorBajas = activos30.filter(m => m.tipo === 'BAJA').reduce((s, m) => s + m.valorDiferencia, 0)
  const alDia = articulos.filter(a => {
    const e = estado[a.id]; if (!e?.contado) return false
    return (Date.now() - e.ultimoConteoMs) / 86400000 <= FRECUENCIA_CONTEO[clases[a.id] || 'C']
  }).length
  // La exactitud se mide solo con recuentos (el conteo inicial no tiene contra qué comparar)
  const conteosCuenta = (datos?.movimientos || []).filter(m => m.tipo === 'CONTEO' && !m.anulado && m.ms >= hace30 && !esInicial(m))
  const exactitud = conteosCuenta.length ? Math.round(conteosCuenta.filter(m => m.diferencia === 0).length / conteosCuenta.length * 100) : null

  const modos = [
    { id: 'hoy', label: `Hoy${datos ? ` (${pendientesHoy})` : ''}` },
    { id: 'sincontar', label: `Sin contar${datos ? ` (${sinContar.length})` : ''}` },
    { id: 'buscar', label: 'Buscar' },
    { id: 'baja', label: 'Baja' },
    ...(verAdmin ? [{ id: 'dif', label: 'Diferencias' }, { id: 'avisos', label: `Anotaciones${avisos.filter(a => a.estado !== 'RESUELTO').length ? ` (${avisos.filter(a => a.estado !== 'RESUELTO').length})` : ''}` }] : []),
  ]

  const bajaResultados = bajaBusqueda.trim()
    ? articulos.filter(a => normalizar(a.nombre).includes(normalizar(bajaBusqueda)) || normalizar(a.id).includes(normalizar(bajaBusqueda))).slice(0, 12)
    : []

  function escanearBaja(codigo) {
    const c = String(codigo || '').trim()
    const art = articulos.find(a => a.id === c || a.id.toLowerCase() === c.toLowerCase())
    if (!art) return { ok: false, nombre: `No encontrado: ${c}` }
    setBajaArt(art); setBajaBusqueda('')
    return { ok: true, nombre: art.nombre }
  }

  const fotoArt = (a, tam) => (
    <div style={{ ...S.itemFoto, width: tam, height: tam }}>
      {a.foto ? <img src={a.foto} alt="" style={S.img} loading="lazy" /> : <span style={{ fontSize: tam * 0.45 }}>📦</span>}
    </div>
  )

  return (
    <div style={S.page}>
      {toast && <div style={{ ...S.toast, ...(toast.type === 'error' ? S.toastError : S.toastSuccess) }}>{toast.msg}</div>}

      <div style={S.header}>
        <div>
          <div style={S.headerTitle}>CONTEO DE STOCK</div>
          <div style={S.headerSub}>Contá lo que hay en el salón y en el depósito, y cargá el total</div>
        </div>
        <button style={S.refreshBtn} onClick={cargar} aria-label="Actualizar">↻</button>
      </div>

      <div style={S.body}>
        <div style={S.fieldLabel}>QUIÉN CUENTA</div>
        <div style={S.grid4}>
          {empleados.map(u => (
            <button key={u.id} style={{ ...S.optBtn, ...(empleado === u.nombre ? S.optBtnActivo : {}) }} onClick={() => setEmpleado(u.nombre)}>{u.nombre}</button>
          ))}
        </div>

        <div style={S.modos}>
          {modos.map(m => (
            <button key={m.id} style={{ ...S.modoBtn, ...(modo === m.id ? S.modoBtnActivo : {}) }} onClick={() => setModo(m.id)}>{m.label}</button>
          ))}
        </div>

        {loading && !datos ? <div style={S.muted}>Cargando stock...</div>
          : error ? <div><div style={S.errorText}>{error}</div><button style={S.retryBtn} onClick={cargar}>Reintentar</button></div>
          : (
          <>
            {modo === 'hoy' && (
              <>
                <div style={S.ayuda}>
                  {pendientesHoy === 0
                    ? (listaHoy.length ? '¡Listo! Ya se contó todo lo de hoy.' : 'Hoy no hay artículos que toque contar.')
                    : `Contá estos ${pendientesHoy} artículos. Cargá el total que hay (salón + depósito).`}
                </div>
                {pendientesHoy === 0 && quedanParaOtraTanda && (
                  <div style={S.otraTanda}>
                    <div style={S.otraTandaTxt}>¿Hay tiempo libre? Podés adelantar trabajo con otra tanda: son los que más cerca están de tocarles.</div>
                    <button style={S.otraTandaBtn} onClick={pedirOtraTanda}>+ Contar otra tanda ({ARTICULOS_POR_DIA} artículos)</button>
                  </div>
                )}
                {renderItems([...listaHoy].sort((x, y) => x.contadoHoy - y.contadoHoy))}
              </>
            )}

            {modo === 'sincontar' && (
              <>
                <div style={S.progresoWrap}>
                  <div style={S.progresoTxt}>Contados {contadosTotal} de {articulos.length} artículos activos</div>
                  <div style={S.progresoBar}><div style={{ ...S.progresoFill, width: `${articulos.length ? contadosTotal / articulos.length * 100 : 0}%` }} /></div>
                </div>
                <input style={S.search} placeholder="Filtrar por nombre o código..." value={busqueda} onChange={e => setBusqueda(e.target.value)} />
                {sinContar.length === 0 ? <div style={S.muted}>Todos los artículos activos ya se contaron al menos una vez.</div> : renderItems(filtrar(sinContar), true)}
              </>
            )}

            {modo === 'buscar' && (
              <>
                <input style={S.search} placeholder="Buscar artículo para contar..." value={busqueda} onChange={e => setBusqueda(e.target.value)} autoFocus />
                {busqueda.trim() ? renderItems(filtrar(articulos).slice(0, 20)) : <div style={S.muted}>Escribí el nombre o el código del artículo.</div>}
              </>
            )}

            {modo === 'baja' && (
              <div style={S.card}>
                <div style={S.ayuda}>Registrá lo que sale del stock sin venderse: roturas, faltantes, uso del local o regalos.</div>
                <div style={S.fieldLabel}>ARTÍCULO</div>
                {bajaArt ? (
                  <div style={S.bajaSel}>
                    {fotoArt(bajaArt, 64)}
                    <span style={{ minWidth: 0, flex: 1 }}>{bajaArt.nombre} <Precio valor={bajaArt.precioUnitario} /> <span style={{ color: 'var(--muted)' }}>· {bajaArt.id}</span></span>
                    <button style={S.linkBtn} onClick={() => setBajaArt(null)}>Cambiar</button>
                  </div>
                ) : (
                  <>
                    <div style={S.buscarFila}>
                      <input style={{ ...S.search, flex: 1 }} placeholder="Buscar por nombre o código..." value={bajaBusqueda} onChange={e => setBajaBusqueda(e.target.value)} />
                      <button style={S.qrBtn} onClick={() => setScannerBaja(true)} aria-label="Escanear código QR">
                        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                          <rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/>
                          <path d="M14 14h3v3h-3z"/><path d="M20 14v.01"/><path d="M14 20h.01"/><path d="M17 20h4v-3"/>
                        </svg>
                        <span>QR</span>
                      </button>
                    </div>
                    {bajaBusqueda.trim() && (
                      <div style={S.resLista}>
                        {bajaResultados.length === 0 && <div style={S.muted}>No se encontró ningún artículo.</div>}
                        {bajaResultados.map(a => (
                          <button key={a.id} style={S.resBtn} onClick={() => setBajaArt(a)}>
                            {fotoArt(a, 56)}
                            <span style={{ minWidth: 0 }}>
                              <span style={S.resNombre}>{a.nombre} <Precio valor={a.precioUnitario} /></span>
                              <span style={S.resCodigo}>{a.id}</span>
                            </span>
                          </button>
                        ))}
                      </div>
                    )}
                  </>
                )}
                <div style={S.fieldLabel}>CANTIDAD</div>
                <input style={{ ...S.input, width: 120 }} type="text" inputMode="numeric" value={bajaCant} onChange={e => setBajaCant(e.target.value.replace(/[^\d]/g, ''))} />
                <div style={S.fieldLabel}>MOTIVO</div>
                <div style={S.motivos}>
                  {MOTIVOS_BAJA.map(m => (
                    <button key={m} style={{ ...S.optBtn, ...(bajaMotivo === m ? S.optBtnActivo : {}) }} onClick={() => setBajaMotivo(m)}>{m}</button>
                  ))}
                </div>
                <div style={S.fieldLabel}>DETALLE {bajaMotivo === 'Otro' ? '' : <span style={{ fontWeight: 400 }}>(opcional)</span>}</div>
                <input style={S.search} placeholder="Ej: se cayó y se rompió el vidrio" value={bajaDetalle} maxLength={120} onChange={e => setBajaDetalle(e.target.value)} />
                <button
                  style={{ ...S.bajaBtn, opacity: bajaArt && Number(bajaCant) > 0 && bajaMotivo && !(bajaMotivo === 'Otro' && !bajaDetalle.trim()) && !guardandoBaja ? 1 : 0.45 }}
                  disabled={!bajaArt || !(Number(bajaCant) > 0) || !bajaMotivo || (bajaMotivo === 'Otro' && !bajaDetalle.trim()) || guardandoBaja}
                  onClick={guardarBaja}
                >{guardandoBaja ? 'Guardando...' : 'REGISTRAR BAJA'}</button>
              </div>
            )}

            {modo === 'avisos' && verAdmin && (() => {
              const lista = avisos.filter(a => verResueltos || a.estado !== 'RESUELTO').sort((x, y) => (x.estado === 'RESUELTO') - (y.estado === 'RESUELTO') || y.ms - x.ms)
              return (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                    <div style={S.ayuda}>Lo que anotaron los empleados al contar. Cuando lo corrijas (por ejemplo en la solapa Artículos), marcalo como resuelto.</div>
                    <label style={{ ...S.ayuda, display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                      <input type="checkbox" checked={verResueltos} onChange={e => setVerResueltos(e.target.checked)} /> Ver también los resueltos
                    </label>
                  </div>
                  {lista.length === 0 ? <div style={S.muted}>No hay anotaciones pendientes.</div> : (
                    <div style={S.lista}>
                      {lista.map(av => (
                        <div key={av.id} style={{ ...S.difRow, alignItems: 'flex-start', ...(av.estado === 'RESUELTO' ? { opacity: 0.55 } : {}) }}>
                          <div style={{ minWidth: 0, flex: 1 }}>
                            <div style={S.itemNombre}>{av.estado === 'RESUELTO' && <span style={S.badgeResuelto}>RESUELTO</span>}{av.nombre} <Precio valor={precioDe[av.articuloId]} /> <span style={{ ...S.itemMeta, display: 'inline' }}>· {av.articuloId}</span></div>
                            <div style={{ ...S.itemMeta, color: 'var(--accent)', fontWeight: 600 }}>{av.tipo}</div>
                            {av.detalle && <div style={{ fontFamily: 'Barlow, sans-serif', fontSize: 14, color: 'var(--text)', marginTop: 2 }}>{av.detalle}</div>}
                            <div style={S.itemMeta}>{av.fecha} {String(av.hora).slice(0, 5)} · {av.empleado}</div>
                            {av.estado === 'RESUELTO' && <div style={S.itemMeta}>Resuelto por {av.resueltoPor} el {av.fechaResuelto}{av.notaResolucion ? ` · ${av.notaResolucion}` : ''}</div>}
                            {resolviendo === av.id && (
                              <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                                <input style={{ ...S.search, flex: 1, minWidth: 180 }} placeholder="Qué se hizo (opcional)" value={notaResolucion} onChange={e => setNotaResolucion(e.target.value)} />
                                <button style={S.avisoEnviar} onClick={() => resolverAviso(av)}>Confirmar</button>
                                <button style={S.avisoCancelar} onClick={() => { setResolviendo(null); setNotaResolucion('') }}>Cancelar</button>
                              </div>
                            )}
                          </div>
                          {av.estado !== 'RESUELTO' && resolviendo !== av.id && <button style={S.resolverBtn} onClick={() => { setResolviendo(av.id); setNotaResolucion('') }}>Marcar resuelto</button>}
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )
            })()}

            {modo === 'dif' && verAdmin && (
              <>
                <div style={S.resumen}>
                  <div style={S.resItem}><div style={S.resValor}>{contadosTotal}/{articulos.length}</div><div style={S.resLabel}>Contados alguna vez</div></div>
                  <div style={S.resItem}><div style={S.resValor}>{articulos.length ? Math.round(alDia / articulos.length * 100) : 0}%</div><div style={S.resLabel}>Al día según su frecuencia</div></div>
                  <div style={S.resItem}><div style={S.resValor}>{exactitud == null ? '—' : `${exactitud}%`}</div><div style={S.resLabel}>Conteos sin diferencia (30 días)</div></div>
                  <div style={S.resItem}><div style={{ ...S.resValor, color: '#ef4444' }}>{fmt$(valorFaltante + valorBajas)}</div><div style={S.resLabel}>Faltantes + bajas al costo (30 días)</div></div>
                </div>
                <div style={S.ayuda}>
                  Faltantes en conteos {fmt$(valorFaltante)} · sobrantes {fmt$(valorSobrante)} · bajas {fmt$(valorBajas)}.
                  Frecuencia: clase A cada {FRECUENCIA_CONTEO.A} días, B cada {FRECUENCIA_CONTEO.B}, C cada {FRECUENCIA_CONTEO.C}; {ARTICULOS_POR_DIA} artículos por día.
                </div>
                {difs.length === 0 ? <div style={S.muted}>Sin diferencias ni bajas en los últimos 30 días.</div> : (
                  <div style={S.lista}>
                    {difs.map(m => (
                      <div key={m.id} style={{ ...S.difRow, ...(m.anulado ? { opacity: 0.45 } : {}) }}>
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <div style={S.itemNombre}>{m.anulado && <span style={S.badgeAnulado}>ANULADO</span>}{m.nombre} <Precio valor={precioDe[m.articuloId]} /></div>
                          <div style={S.itemMeta}>
                            {m.fecha} {String(m.hora).slice(0, 5)} · {m.empleado} · {m.tipo === 'BAJA' ? `Baja: ${m.motivo}${m.notas ? ` (${m.notas})` : ''}` : `Esperado ${m.esperado} → contado ${m.cantidad}${m.notas ? ` · ${m.notas}` : ''}`}
                          </div>
                        </div>
                        <div style={{ textAlign: 'right', flexShrink: 0 }}>
                          <div style={{ ...S.difValor, color: m.diferencia < 0 ? '#ef4444' : '#22c55e' }}>{m.diferencia > 0 ? '+' : ''}{m.diferencia} u.</div>
                          <div style={S.itemMeta}>{fmt$(m.valorDiferencia)}</div>
                          {!m.anulado && <button style={S.anularBtn} disabled={anulando === m.id} onClick={() => anular(m)}>{anulando === m.id ? '...' : 'Anular'}</button>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>
      {scannerBaja && <BarcodeScanner titulo="ESCANEAR ARTÍCULO" autoCerrarMs={900} onDetected={escanearBaja} onClose={() => setScannerBaja(false)} />}
    </div>
  )
}

const S = {
  page: { display: 'flex', flexDirection: 'column', height: '100%', overflowY: 'auto', position: 'relative' },
  toast: { position: 'fixed', top: 16, left: '50%', transform: 'translateX(-50%)', zIndex: 300, padding: '12px 28px', borderRadius: 10, fontFamily: 'Barlow Condensed, sans-serif', fontWeight: 700, fontSize: 18, maxWidth: 'calc(100% - 32px)', boxShadow: '0 4px 20px rgba(0,0,0,0.5)' },
  toastSuccess: { background: '#22c55e', color: '#000' },
  toastError: { background: '#ef4444', color: '#fff' },
  header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '16px 20px 12px', borderBottom: '2px solid var(--accent)', flexShrink: 0 },
  headerTitle: { fontFamily: 'Barlow Condensed, sans-serif', fontWeight: 800, fontSize: 28, color: 'var(--accent)', letterSpacing: 2 },
  headerSub: { fontFamily: 'Barlow, sans-serif', fontSize: 13, color: 'var(--muted)' },
  refreshBtn: { background: 'var(--surface)', border: '1.5px solid var(--border)', borderRadius: 10, color: 'var(--text)', fontSize: 24, width: 44, height: 44, cursor: 'pointer', flexShrink: 0 },
  body: { display: 'flex', flexDirection: 'column', gap: 10, padding: '14px 20px 24px', maxWidth: 900, width: '100%', margin: '0 auto' },
  fieldLabel: { fontFamily: 'Barlow Condensed, sans-serif', fontWeight: 700, fontSize: 13, color: 'var(--muted)', letterSpacing: 1.5, marginTop: 4 },
  grid4: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(80px, 1fr))', gap: 8 },
  optBtn: { padding: '10px 8px', background: 'var(--surface2)', border: '1.5px solid var(--border)', borderRadius: 10, cursor: 'pointer', color: 'var(--muted)', fontFamily: 'Barlow Condensed, sans-serif', fontWeight: 700, fontSize: 16, textAlign: 'center' },
  optBtnActivo: { background: 'rgba(245,200,0,0.12)', border: '1.5px solid var(--accent)', color: 'var(--accent)' },
  modos: { display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 },
  modoBtn: { fontFamily: 'Barlow Condensed, sans-serif', fontWeight: 700, fontSize: 15, padding: '8px 14px', background: 'var(--surface)', border: '1.5px solid var(--border)', borderRadius: 20, color: 'var(--muted)', cursor: 'pointer' },
  modoBtnActivo: { borderColor: 'var(--accent)', color: 'var(--accent)', background: 'rgba(245,200,0,0.1)' },
  ayuda: { fontFamily: 'Barlow, sans-serif', fontSize: 13, color: 'var(--muted)', lineHeight: 1.4 },
  lista: { display: 'flex', flexDirection: 'column', gap: 8 },
  item: { display: 'flex', alignItems: 'center', gap: 12, background: 'var(--surface)', border: '1.5px solid var(--border)', borderRadius: 12, padding: '10px 12px' },
  itemRecuento: { borderColor: '#f59e0b', background: 'rgba(245,158,11,0.08)' },
  itemHecho: { opacity: 0.6 },
  itemFoto: { width: 52, height: 52, borderRadius: 8, background: 'var(--surface2)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0 },
  img: { width: '100%', height: '100%', objectFit: 'cover' },
  itemNombre: { fontFamily: 'Barlow Condensed, sans-serif', fontWeight: 700, fontSize: 17, color: 'var(--text)', lineHeight: 1.2 },
  precio: { display: 'inline-block', fontFamily: 'Barlow Condensed, sans-serif', fontWeight: 700, fontSize: 15, color: 'var(--accent)', background: 'rgba(245,200,0,0.1)', borderRadius: 6, padding: '0 6px', marginLeft: 4, whiteSpace: 'nowrap', verticalAlign: 'baseline' },
  itemMeta: { fontFamily: 'Barlow, sans-serif', fontSize: 12, color: 'var(--muted)', marginTop: 2 },
  recontarBtn: { marginLeft: 10, background: 'none', border: 'none', color: 'var(--muted)', textDecoration: 'underline', fontFamily: 'Barlow, sans-serif', fontSize: 12, cursor: 'pointer', padding: 0 },
  otraTanda: { display: 'flex', flexDirection: 'column', gap: 8, background: 'rgba(245,200,0,0.07)', border: '1.5px dashed var(--accent)', borderRadius: 12, padding: 14 },
  otraTandaTxt: { fontFamily: 'Barlow, sans-serif', fontSize: 14, color: 'var(--text)' },
  otraTandaBtn: { padding: '13px', background: 'var(--accent)', border: 'none', borderRadius: 10, color: '#000', fontFamily: 'Barlow Condensed, sans-serif', fontWeight: 800, fontSize: 18, cursor: 'pointer' },
  anotarBtn: { background: 'var(--surface2)', border: '1.5px solid var(--border)', borderRadius: 10, color: 'var(--text)', fontFamily: 'Barlow, sans-serif', fontWeight: 600, fontSize: 22, padding: '8px 18px', cursor: 'pointer' },
  avisoBadge: { fontFamily: 'Barlow, sans-serif', fontSize: 12, color: 'var(--accent)', background: 'rgba(245,200,0,0.1)', borderRadius: 6, padding: '2px 8px' },
  avisoForm: { marginTop: 8, background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 10, padding: 10, display: 'flex', flexDirection: 'column', gap: 6 },
  avisoTitulo: { fontFamily: 'Barlow Condensed, sans-serif', fontWeight: 700, fontSize: 13, color: 'var(--muted)', letterSpacing: 1, textTransform: 'uppercase' },
  avisoTipos: { display: 'flex', flexWrap: 'wrap', gap: 6 },
  avisoTipo: { background: 'var(--surface)', border: '1.5px solid var(--border)', borderRadius: 20, color: 'var(--muted)', fontFamily: 'Barlow, sans-serif', fontSize: 13, padding: '6px 12px', cursor: 'pointer' },
  avisoTipoActivo: { borderColor: 'var(--accent)', color: 'var(--accent)', background: 'rgba(245,200,0,0.1)' },
  avisoCancelar: { flex: 1, background: 'none', border: '1.5px solid var(--border)', borderRadius: 8, color: 'var(--muted)', fontFamily: 'Barlow, sans-serif', fontSize: 14, padding: '9px', cursor: 'pointer' },
  avisoEnviar: { flex: 2, background: 'var(--accent)', border: 'none', borderRadius: 8, color: '#000', fontFamily: 'Barlow Condensed, sans-serif', fontWeight: 800, fontSize: 15, padding: '9px 14px', cursor: 'pointer' },
  resolverBtn: { flexShrink: 0, background: 'none', border: '1px solid rgba(34,197,94,0.5)', borderRadius: 6, color: '#22c55e', fontFamily: 'Barlow Condensed, sans-serif', fontWeight: 700, fontSize: 12, padding: '4px 10px', cursor: 'pointer', textTransform: 'uppercase' },
  badgeResuelto: { fontSize: 10, fontWeight: 800, color: '#22c55e', background: 'rgba(34,197,94,0.15)', borderRadius: 4, padding: '1px 5px', marginRight: 6, letterSpacing: 1 },
  okTxt: { fontFamily: 'Barlow, sans-serif', fontSize: 13, color: '#22c55e', fontWeight: 600, marginTop: 3 },
  recuentoTxt: { fontFamily: 'Barlow, sans-serif', fontSize: 13, color: '#f59e0b', fontWeight: 600, marginTop: 3 },
  itemAccion: { display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 },
  input: { width: 76, fontFamily: 'Barlow Condensed, sans-serif', fontWeight: 800, fontSize: 22, padding: '8px 10px', background: 'var(--bg)', border: '1.5px solid var(--border)', borderRadius: 10, color: 'var(--text)', textAlign: 'center' },
  guardarBtn: { padding: '12px 14px', background: 'var(--accent)', border: 'none', borderRadius: 10, color: '#000', fontFamily: 'Barlow Condensed, sans-serif', fontWeight: 800, fontSize: 15, cursor: 'pointer' },
  search: { fontFamily: 'Barlow, sans-serif', fontSize: 16, padding: '11px 14px', background: 'var(--bg)', border: '1.5px solid var(--border)', borderRadius: 10, color: 'var(--text)', width: '100%' },
  masBtn: { background: 'var(--surface)', border: '1.5px solid var(--border)', borderRadius: 10, color: 'var(--text)', fontFamily: 'Barlow, sans-serif', fontSize: 14, padding: '10px', cursor: 'pointer' },
  progresoWrap: { display: 'flex', flexDirection: 'column', gap: 6 },
  progresoTxt: { fontFamily: 'Barlow Condensed, sans-serif', fontWeight: 700, fontSize: 16, color: 'var(--text)' },
  progresoBar: { height: 8, background: 'var(--surface2)', borderRadius: 4, overflow: 'hidden' },
  progresoFill: { height: '100%', background: 'var(--accent)' },
  card: { background: 'var(--surface)', border: '1.5px solid var(--border)', borderRadius: 14, padding: 16, display: 'flex', flexDirection: 'column', gap: 8 },
  bajaSel: { display: 'flex', alignItems: 'center', gap: 12, fontFamily: 'Barlow, sans-serif', fontSize: 15, color: 'var(--text)', background: 'var(--surface2)', borderRadius: 10, padding: '10px 12px' },
  linkBtn: { background: 'none', border: 'none', color: 'var(--accent)', fontFamily: 'Barlow, sans-serif', fontSize: 14, cursor: 'pointer', flexShrink: 0 },
  resBtn: { display: 'flex', alignItems: 'center', gap: 12, textAlign: 'left', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 10, padding: '8px 10px', color: 'var(--text)', fontFamily: 'Barlow, sans-serif', fontSize: 14, cursor: 'pointer', width: '100%' },
  resLista: { display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 420, overflowY: 'auto' },
  resNombre: { display: 'block', fontFamily: 'Barlow Condensed, sans-serif', fontWeight: 700, fontSize: 17, lineHeight: 1.2 },
  resCodigo: { display: 'block', fontSize: 12, color: 'var(--muted)', marginTop: 2 },
  buscarFila: { display: 'flex', gap: 8, alignItems: 'stretch' },
  qrBtn: { display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0, background: 'var(--surface2)', border: '1.5px solid var(--accent)', borderRadius: 10, color: 'var(--accent)', fontFamily: 'Barlow Condensed, sans-serif', fontWeight: 800, fontSize: 17, padding: '0 14px', cursor: 'pointer' },
  motivos: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 8 },
  bajaBtn: { marginTop: 10, padding: '15px', background: '#ef4444', border: 'none', borderRadius: 12, color: '#fff', fontFamily: 'Barlow Condensed, sans-serif', fontWeight: 800, fontSize: 19, letterSpacing: 1, cursor: 'pointer' },
  resumen: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 8 },
  resItem: { background: 'var(--surface)', border: '1.5px solid var(--border)', borderRadius: 10, padding: '10px 14px' },
  resValor: { fontFamily: 'Barlow Condensed, sans-serif', fontWeight: 800, fontSize: 24, color: 'var(--accent)' },
  resLabel: { fontFamily: 'Barlow, sans-serif', fontSize: 12, color: 'var(--muted)' },
  difRow: { display: 'flex', gap: 12, alignItems: 'center', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 12px' },
  difValor: { fontFamily: 'Barlow Condensed, sans-serif', fontWeight: 800, fontSize: 18 },
  badgeAnulado: { fontSize: 10, fontWeight: 800, color: '#ef4444', background: 'rgba(239,68,68,0.15)', borderRadius: 4, padding: '1px 5px', marginRight: 6, letterSpacing: 1 },
  anularBtn: { marginTop: 4, background: 'none', border: '1px solid rgba(239,68,68,0.4)', borderRadius: 6, color: 'rgba(239,68,68,0.85)', fontFamily: 'Barlow Condensed, sans-serif', fontWeight: 700, fontSize: 11, padding: '3px 8px', cursor: 'pointer', textTransform: 'uppercase' },
  muted: { fontFamily: 'Barlow, sans-serif', fontSize: 14, color: 'var(--muted)', padding: '8px 0' },
  errorText: { fontFamily: 'Barlow, sans-serif', fontSize: 14, color: '#ef4444', marginBottom: 8 },
  retryBtn: { background: 'var(--surface2)', border: '1.5px solid var(--border)', borderRadius: 10, color: 'var(--text)', fontFamily: 'Barlow, sans-serif', fontSize: 14, padding: '8px 18px', cursor: 'pointer' },
}
