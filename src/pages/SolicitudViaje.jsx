import { useState, useEffect, useRef } from 'react'
import { useParams } from 'react-router-dom'
import { getUvs, crearViaje, getViaje, getConductor } from '../services/api'
import '../styles/SolicitudViaje.css'

const POLLING_INTERVAL = 10000
const TIMEOUT_SIN_CONDUCTOR = 60000

export default function SolicitudViaje() {
  const { ciudad } = useParams()

  const [uvs, setUvs] = useState([])
  const [cargandoUvs, setCargandoUvs] = useState(true)
  const [uvOrigen, setUvOrigen] = useState('')
  const [referenciaOrigen, setReferenciaOrigen] = useState('')
  const [destinoReferencia, setDestinoReferencia] = useState('')
  const [tipoServicio, setTipoServicio] = useState('normal')
  const [celularPasajero, setCelularPasajero] = useState('')

  const [cargando, setCargando] = useState(false)
  const [mensaje, setMensaje] = useState(null)
  const [solicitudExitosa, setSolicitudExitosa] = useState(null)
  const [conductorAsignado, setConductorAsignado] = useState(null)
  const [viajeCompletado, setViajeCompletado] = useState(false)
  const [sinConductor, setSinConductor] = useState(false)
  const [conductorCancelo, setConductorCancelo] = useState(false) // ← agregado

  const [segundosRestantes, setSegundosRestantes] = useState(0)

  const timerRef = useRef(null)
  const pollingRef = useRef(null)
  const timeoutRef = useRef(null)

  // Cargar UVs
  useEffect(() => {
    getUvs()
      .then(data => setUvs(data))
      .catch(() => setMensaje({ tipo: 'error', texto: 'No se pudieron cargar las zonas. Recarga la página.' }))
      .finally(() => setCargandoUvs(false))
  }, [])

  // Timer anti-flood
  useEffect(() => {
    if (segundosRestantes <= 0) return
    timerRef.current = setTimeout(() => setSegundosRestantes(s => s - 1), 1000)
    return () => clearTimeout(timerRef.current)
  }, [segundosRestantes])

  // Polling
  useEffect(() => {
    if (!solicitudExitosa || conductorAsignado || viajeCompletado) return

    timeoutRef.current = setTimeout(() => {
      clearInterval(pollingRef.current)
      setSinConductor(true)
    }, TIMEOUT_SIN_CONDUCTOR)

    pollingRef.current = setInterval(async () => {
      try {
        const viaje = await getViaje(solicitudExitosa.codigo)

        if (viaje.estado === 'asignado' && viaje.conductor_id) {
          clearInterval(pollingRef.current)
          clearTimeout(timeoutRef.current)
          const conductor = await getConductor(viaje.conductor_id)
          setConductorAsignado(conductor)
          setSinConductor(false)
        }

        if (viaje.estado === 'completado') {
          clearInterval(pollingRef.current)
          clearTimeout(timeoutRef.current)
          setViajeCompletado(true)
          setConductorAsignado(null)
        }

        if (viaje.estado === 'cancelado_conductor') {
          clearInterval(pollingRef.current)
          clearTimeout(timeoutRef.current)
          setConductorCancelo(true)
        }

      } catch (e) {
        console.log('Polling error:', e)
      }
    }, POLLING_INTERVAL)

    return () => {
      clearInterval(pollingRef.current)
      clearTimeout(timeoutRef.current)
    }
  }, [solicitudExitosa, conductorAsignado, viajeCompletado])

  const btnDeshabilitado = cargando || segundosRestantes > 0

  const handleSolicitar = async () => {
    setMensaje(null)
    if (!uvOrigen) return setMensaje({ tipo: 'error', texto: 'Selecciona tu zona.' })
    if (!referenciaOrigen.trim()) return setMensaje({ tipo: 'error', texto: 'Ingresa una referencia de dónde estás.' })
    if (!destinoReferencia.trim()) return setMensaje({ tipo: 'error', texto: 'Ingresa tu destino.' })
    if (!celularPasajero.trim()) return setMensaje({ tipo: 'error', texto: 'Ingresa tu número de celular.' })

    setCargando(true)
    try {
      const resultado = await crearViaje({
        celular_pasajero: celularPasajero.trim(),
        uv_origen: uvOrigen,
        tipo_vehiculo: 'moto',
        tipo_servicio: tipoServicio,
        referencia_origen: referenciaOrigen.trim(),
        destino_referencia: destinoReferencia.trim(),
      })
      setSolicitudExitosa(resultado)
      setSinConductor(false)
      setSegundosRestantes(30)
    } catch (err) {
      setMensaje({ tipo: 'error', texto: err.message })
    } finally {
      setCargando(false)
    }
  }

  // ← REEMPLAZADA
  const irAWhatsApp = () => {
    const celular = String(conductorAsignado.celular).replace(/\D/g, '')
    const celularWA = celular.startsWith('591') ? celular : `591${celular}`
    const linkCancelacion = `https://mototaxis-app.vercel.app/cancelar/${solicitudExitosa.codigo}`
    const msg = encodeURIComponent(
      `Hola, soy el pasajero de la solicitud ${solicitudExitosa.codigo} 👋\n\n` +
      `📍 Estoy en: ${uvOrigen} — ${referenciaOrigen}\n` +
      `🏁 Destino: ${destinoReferencia}\n\n` +
      `Ahora te comparto mi ubicación en tiempo real.\n\n` +
      `❌ Si necesitas cancelar: ${linkCancelacion}`
    )
    window.open(`https://wa.me/${celularWA}?text=${msg}`, '_blank')
  }

  const reintentar = () => {
    setSinConductor(false)
    setConductorAsignado(null)
  }

  // ← MODIFICADO
  const resetear = () => {
    clearInterval(pollingRef.current)
    clearTimeout(timeoutRef.current)
    setSolicitudExitosa(null)
    setConductorAsignado(null)
    setViajeCompletado(false)
    setSinConductor(false)
    setConductorCancelo(false) // ← agregado
    setMensaje(null)
    setUvOrigen('')
    setReferenciaOrigen('')
    setDestinoReferencia('')
    setCelularPasajero('')
    setTipoServicio('normal')
  }

  // ── PANTALLA: VIAJE COMPLETADO ────────────────────────────
  if (viajeCompletado) {
    return (
      <div className="app">
        <div className="header">
          <span className="header-icon">🏍️</span>
          <div className="header-texto">
            <h1>Mototaxis</h1>
            <p>{ciudad || 'Warnes'}</p>
          </div>
        </div>
        <div className="exito-screen">
          <div className="exito-icon">⭐</div>
          <h2 className="exito-titulo">¡Llegaste!</h2>
          <p className="exito-desc">Tu viaje fue completado. Gracias por usar el servicio.</p>
          <div className="exito-codigo">{solicitudExitosa?.codigo}</div>
          <button className="btn-solicitar" onClick={resetear}>
            Pedir otro mototaxi
          </button>
        </div>
      </div>
    )
  }

  // ── PANTALLA: CONDUCTOR ENCONTRADO ────────────────────────
  if (conductorAsignado) {
    return (
      <div className="app">
        <div className="header">
          <span className="header-icon">🏍️</span>
          <div className="header-texto">
            <h1>Mototaxis</h1>
            <p>{ciudad || 'Warnes'}</p>
          </div>
        </div>
        <div className="exito-screen">
          <div className="exito-icon">🏍️</div>
          <h2 className="exito-titulo">¡Un mototaxista aceptó tu viaje!</h2>
          <p className="exito-desc">
            Te llegará un mensaje a tu WhatsApp con los detalles.
          </p>

          <div className="conductor-info-pasajero">
            <div className="conductor-info-fila">
              <span className="conductor-info-label">Conductor</span>
              <span className="conductor-info-valor">{conductorAsignado.nombre}</span>
            </div>
            <div className="conductor-info-fila">
              <span className="conductor-info-label">Chaleco</span>
              <span className="conductor-info-valor" style={{ textTransform: 'capitalize' }}>
                {conductorAsignado.color_chaleco}
              </span>
            </div>
            <div className="conductor-info-fila">
              <span className="conductor-info-label">Solicitud</span>
              <span className="conductor-info-valor" style={{ color: '#e85d04' }}>
                {solicitudExitosa.codigo}
              </span>
            </div>
          </div>

          <button className="btn-whatsapp" onClick={irAWhatsApp}>
            💬 Ir a WhatsApp
          </button>

          <p className="exito-desc" style={{ fontSize: '0.78rem' }}>
            ¿Necesitas cancelar? Usa el link que te enviará el conductor en el mensaje.
          </p>
        </div>
      </div>
    )
  }

  // ── PANTALLA: CONDUCTOR CANCELÓ ───────────────────────────
  if (conductorCancelo) {
    return (
      <div className="app">
        <div className="header">
          <span className="header-icon">🏍️</span>
          <div className="header-texto">
            <h1>Mototaxis</h1>
            <p>{ciudad || 'Warnes'}</p>
          </div>
        </div>
        <div className="exito-screen">
          <div className="exito-icon">😔</div>
          <h2 className="exito-titulo">El conductor canceló</h2>
          <p className="exito-desc">
            El conductor no pudo completar el viaje. Puedes solicitar uno nuevo.
          </p>
          <button className="btn-solicitar" onClick={resetear}>
            🔄 Pedir otro mototaxi
          </button>
        </div>
      </div>
    )
  }

  // ── PANTALLA: SIN CONDUCTOR ───────────────────────────────
  if (sinConductor) {
    return (
      <div className="app">
        <div className="header">
          <span className="header-icon">🏍️</span>
          <div className="header-texto">
            <h1>Mototaxis</h1>
            <p>{ciudad || 'Warnes'}</p>
          </div>
        </div>
        <div className="exito-screen">
          <div className="exito-icon">😕</div>
          <h2 className="exito-titulo">Sin conductores disponibles</h2>
          <p className="exito-desc">
            Todos los conductores están ocupados. Puedes intentar de nuevo.
          </p>
          <button className="btn-solicitar" onClick={reintentar}>
            🔄 Volver a intentar
          </button>
          <button className="btn-nuevo" onClick={resetear}>
            Cancelar y volver al inicio
          </button>
        </div>
      </div>
    )
  }

  // ── PANTALLA: ESPERANDO CONDUCTOR ─────────────────────────
  if (solicitudExitosa) {
    return (
      <div className="app">
        <div className="header">
          <span className="header-icon">🏍️</span>
          <div className="header-texto">
            <h1>Mototaxis</h1>
            <p>{ciudad || 'Warnes'}</p>
          </div>
        </div>
        <div className="exito-screen">
          <div className="exito-icon">✅</div>
          <h2 className="exito-titulo">¡Solicitud enviada!</h2>
          <p className="exito-desc">Buscando conductor en tu zona...</p>
          <div className="exito-codigo">{solicitudExitosa.codigo}</div>
          <div className="buscando-indicator">
            <span className="buscando-dot" />
            <span className="buscando-dot" />
            <span className="buscando-dot" />
          </div>
          <p className="exito-desc" style={{ fontSize: '0.8rem' }}>
            Esta pantalla se actualiza automáticamente.
          </p>
        </div>
      </div>
    )
  }

  // ── FORMULARIO ────────────────────────────────────────────
  return (
    <div className="app">
      <div className="header">
        <span className="header-icon">🏍️</span>
        <div className="header-texto">
          <h1>Pedir Mototaxi</h1>
          <p>{ciudad || 'Warnes'} · Bs. 4</p>
        </div>
      </div>

      <div className="form">
        <div className="campo">
          <label>¿Dónde estás?</label>
          {cargandoUvs ? (
            <div className="skeleton" />
          ) : (
            <div className="select-wrap">
              <select className="select" value={uvOrigen} onChange={e => setUvOrigen(e.target.value)}>
                <option value="">Selecciona tu zona / UV...</option>
                {uvs.map(uv => (
                  <option key={uv.id} value={uv.nombre}>{uv.nombre}</option>
                ))}
              </select>
            </div>
          )}
        </div>

        <div className="campo">
          <label>¿En qué referencia estás?</label>
          <input
            className="input"
            type="text"
            placeholder="Ej: Frente a la farmacia Chávez"
            value={referenciaOrigen}
            onChange={e => setReferenciaOrigen(e.target.value)}
          />
        </div>

        <div className="campo">
          <label>¿A dónde vas?</label>
          <input
            className="input"
            type="text"
            placeholder="Ej: Mercado central, Terminal"
            value={destinoReferencia}
            onChange={e => setDestinoReferencia(e.target.value)}
          />
        </div>

        <hr className="divider" />

        <div className="campo">
          <label>Tipo de servicio</label>
          <div className="servicio-group">
            <button className={`servicio-btn ${tipoServicio === 'normal' ? 'activo' : ''}`} onClick={() => setTipoServicio('normal')}>
              <span className="sv-titulo">Normal</span>
              <span className="sv-desc">Bs. 4 · Conductor disponible</span>
            </button>
            <button className={`servicio-btn ${tipoServicio === 'premium' ? 'activo' : ''}`} onClick={() => setTipoServicio('premium')}>
              <span className="sv-titulo">⭐ Premium</span>
              <span className="sv-desc">Bs. 5 · Prioridad de despacho</span>
            </button>
          </div>
        </div>

        <div className="tarifa-badge">
          <span>💰</span>
          <span>Tarifa base: <strong>Bs. {tipoServicio === 'premium' ? '5' : '4'}</strong> — El conductor puede ajustar si el destino es lejano.</span>
        </div>

        <hr className="divider" />

        <div className="campo">
          <label>Tu número de celular</label>
          <input
            className="input"
            type="tel"
            placeholder="Ej: 70000000"
            value={celularPasajero}
            onChange={e => setCelularPasajero(e.target.value)}
          />
        </div>

        {mensaje && (
          <div className={`mensaje ${mensaje.tipo}`}>{mensaje.texto}</div>
        )}

        <button className="btn-solicitar" onClick={handleSolicitar} disabled={btnDeshabilitado}>
          {cargando
            ? <><span className="spinner" />Enviando solicitud...</>
            : segundosRestantes > 0
              ? `Espera ${segundosRestantes} seg...`
              : '🏍️ Solicitar Mototaxi'
          }
        </button>

        {segundosRestantes > 0 && (
          <p className="countdown">Puedes volver a solicitar en <span>{segundosRestantes}s</span></p>
        )}
      </div>
    </div>
  )
}