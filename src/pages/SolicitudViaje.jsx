import { useState, useEffect, useRef } from 'react'
import { useParams } from 'react-router-dom'
import { getUvs, crearViaje, cancelarSolicitud, getViaje, getConductor } from '../services/api'
import '../styles/SolicitudViaje.css'

const POLLING_INTERVAL = 10000  // 10 seg
const TIMEOUT_SIN_CONDUCTOR = 60000  // 1 minuto

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

  const [cancelando, setCancelando] = useState(false)
  const [cancelado, setCancelado] = useState(false)
  const [linkCancelacion, setLinkCancelacion] = useState(null)

  const [conductorAsignado, setConductorAsignado] = useState(null)
  const [viajeCompletado, setViajeCompletado] = useState(false)
  const [sinConductor, setSinConductor] = useState(false)

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

  // Polling — detectar conductor asignado o viaje completado
  useEffect(() => {
    if (!solicitudExitosa || cancelado || conductorAsignado || viajeCompletado) return

    // Timeout 1 minuto sin conductor
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

        if (['cancelado_conductor', 'cancelado_pasajero'].includes(viaje.estado)) {
          clearInterval(pollingRef.current)
          clearTimeout(timeoutRef.current)
        }
      } catch (e) {
        console.log('Polling error:', e)
      }
    }, POLLING_INTERVAL)

    return () => {
      clearInterval(pollingRef.current)
      clearTimeout(timeoutRef.current)
    }
  }, [solicitudExitosa, cancelado, conductorAsignado, viajeCompletado])

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

  const reintentar = () => {
    setSinConductor(false)
    setConductorAsignado(null)
    // Reinicia el polling con el mismo código
    // El useEffect lo detecta porque sinConductor cambia
  }

  const enviarUbicacion = () => {
    const celular = String(conductorAsignado.celular).replace(/\D/g, '')
    const celularWA = celular.startsWith('591') ? celular : `591${celular}`
    const mensaje = encodeURIComponent(
      `🏍️ Solicitud: ${solicitudExitosa.codigo}\n` +
      `📍 Estoy en: ${uvOrigen}\n` +
      `🏠 Referencia: ${referenciaOrigen}\n` +
      `🏁 Destino: ${destinoReferencia}\n` +
      `📱 Mi celular: ${celularPasajero}\n\n` +
      `👇 Ahora te comparto mi ubicación en tiempo real.`
    )
    window.open(`https://wa.me/${celularWA}?text=${mensaje}`, '_blank')
  }

  const handleCancelarPasajero = async () => {
    const confirmar = window.confirm('¿Seguro que quieres cancelar tu viaje?')
    if (!confirmar) return

    setCancelando(true)
    clearInterval(pollingRef.current)
    clearTimeout(timeoutRef.current)

    try {
      const viaje = await getViaje(solicitudExitosa.codigo)
      await cancelarSolicitud(solicitudExitosa.codigo, 'pasajero')

      if (viaje.conductor_id) {
        const conductorData = await getConductor(viaje.conductor_id)
        const celular = String(conductorData.celular).replace(/\D/g, '')
        const celularWA = celular.startsWith('591') ? celular : `591${celular}`
        const msg = encodeURIComponent(
          `❌ El pasajero canceló su viaje.\n\n` +
          `🔖 Solicitud: ${solicitudExitosa.codigo}\n` +
          `📍 Zona: ${uvOrigen}\n\n` +
          `Ya puedes tomar otro viaje.`
        )
        setLinkCancelacion(`https://wa.me/${celularWA}?text=${msg}`)
      }

      setCancelado(true)
    } catch (err) {
      setMensaje({ tipo: 'error', texto: err.message })
    } finally {
      setCancelando(false)
    }
  }

  const resetear = () => {
    clearInterval(pollingRef.current)
    clearTimeout(timeoutRef.current)
    setSolicitudExitosa(null)
    setConductorAsignado(null)
    setViajeCompletado(false)
    setSinConductor(false)
    setMensaje(null)
    setUvOrigen('')
    setReferenciaOrigen('')
    setDestinoReferencia('')
    setCelularPasajero('')
    setTipoServicio('normal')
    setCancelado(false)
    setLinkCancelacion(null)
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
          <p className="exito-desc">
            Tu viaje fue completado. Gracias por usar el servicio.
          </p>
          <div className="exito-codigo">{solicitudExitosa?.codigo}</div>
          <button className="btn-solicitar" onClick={resetear}>
            Pedir otro mototaxi
          </button>
        </div>
      </div>
    )
  }

  // ── PANTALLA: CONDUCTOR ENCONTRADO ────────────────────────
  if (conductorAsignado && !cancelado) {
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
          <h2 className="exito-titulo">¡Conductor en camino!</h2>
          <p className="exito-desc">
            Un conductor aceptó tu solicitud.
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
              <span className="conductor-info-label">Vehículo</span>
              <span className="conductor-info-valor" style={{ textTransform: 'capitalize' }}>
                {conductorAsignado.tipo_vehiculo}
              </span>
            </div>
          </div>

          <button className="btn-solicitar" onClick={enviarUbicacion}>
            📍 Enviar mi ubicación al conductor
          </button>

          <button
            className="btn-cancelar-pasajero"
            onClick={handleCancelarPasajero}
            disabled={cancelando}
          >
            {cancelando ? 'Cancelando...' : '❌ Cancelar mi viaje'}
          </button>
        </div>
      </div>
    )
  }

  // ── PANTALLA: CANCELADO ───────────────────────────────────
  if (cancelado) {
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
          <div className="exito-icon">❌</div>
          <h2 className="exito-titulo">Viaje cancelado</h2>
          {linkCancelacion && (
            <a
            
              href={linkCancelacion}
              target="_blank"
              rel="noreferrer"
              className="btn-whatsapp"
              style={{ textAlign: 'center', textDecoration: 'none', display: 'block', width: '100%' }}
            >
              📲 Avisar al conductor por WhatsApp
            </a>
          )}
          <button className="btn-nuevo" onClick={resetear}>Volver al inicio</button>
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
            Todos los conductores están ocupados en este momento. Puedes intentar de nuevo.
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
            Esta pantalla se actualiza automáticamente cuando un conductor acepte.
          </p>

          {!cancelado && (
            <button
              className="btn-cancelar-pasajero"
              onClick={handleCancelarPasajero}
              disabled={cancelando}
            >
              {cancelando ? 'Cancelando...' : '❌ Cancelar mi viaje'}
            </button>
          )}
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