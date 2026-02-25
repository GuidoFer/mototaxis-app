import { useState, useEffect, useRef } from 'react'
import { useParams } from 'react-router-dom'
import { getUvs, crearViaje, cancelarSolicitud, getViaje, getConductor } from '../services/api'
import '../styles/SolicitudViaje.css'

const POLLING_INTERVAL = 10000 // 10 seg

export default function SolicitudViaje() {
  const { ciudad } = useParams()

  const [uvs, setUvs] = useState([])
  const [cargandoUvs, setCargandoUvs] = useState(true)
  const [uvOrigen, setUvOrigen] = useState('')
  const [tipoVehiculo, setTipoVehiculo] = useState('moto')
  const [tipoServicio, setTipoServicio] = useState('normal')
  const [referenciaOrigen, setReferenciaOrigen] = useState('')
  const [destinoReferencia, setDestinoReferencia] = useState('')
  const [celularPasajero, setCelularPasajero] = useState('')

  const [cargando, setCargando] = useState(false)
  const [mensaje, setMensaje] = useState(null)
  const [solicitudExitosa, setSolicitudExitosa] = useState(null)

  const [cancelando, setCancelando] = useState(false)
  const [cancelado, setCancelado] = useState(false)
  const [linkCancelacion, setLinkCancelacion] = useState(null)

  const [conductorAsignado, setConductorAsignado] = useState(null)

  const [segundosRestantes, setSegundosRestantes] = useState(0)
  const timerRef = useRef(null)
  const pollingRef = useRef(null)

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

  // Polling — detectar conductor asignado
  useEffect(() => {
    if (!solicitudExitosa || cancelado || conductorAsignado) return

    pollingRef.current = setInterval(async () => {
      try {
        const viaje = await getViaje(solicitudExitosa.codigo)

        if (viaje.estado === 'asignado' && viaje.conductor_id) {
          clearInterval(pollingRef.current)
          const conductor = await getConductor(viaje.conductor_id)
          setConductorAsignado(conductor)
        }

        if (['cancelado_conductor', 'cancelado_pasajero'].includes(viaje.estado)) {
          clearInterval(pollingRef.current)
        }
      } catch (e) {
        console.log('Polling error:', e)
      }
    }, POLLING_INTERVAL)

    return () => clearInterval(pollingRef.current)
  }, [solicitudExitosa, cancelado, conductorAsignado])

  const btnDeshabilitado = cargando || segundosRestantes > 0

  const handleSolicitar = async () => {
    setMensaje(null)
    if (!uvOrigen) return setMensaje({ tipo: 'error', texto: 'Selecciona tu zona.' })
    if (!referenciaOrigen.trim()) return setMensaje({ tipo: 'error', texto: 'Ingresa una referencia de dónde estás.' })
    if (!celularPasajero.trim()) return setMensaje({ tipo: 'error', texto: 'Ingresa tu número de celular.' })

    setCargando(true)
    try {
      const resultado = await crearViaje({
        celular_pasajero: celularPasajero.trim(),
        uv_origen: uvOrigen,
        tipo_vehiculo: tipoVehiculo,
        tipo_servicio: tipoServicio,
        referencia_origen: referenciaOrigen.trim(),
        destino_referencia: destinoReferencia.trim(),
      })
      setSolicitudExitosa(resultado)
      setSegundosRestantes(30)
    } catch (err) {
      setMensaje({ tipo: 'error', texto: err.message })
    } finally {
      setCargando(false)
    }
  }

  const abrirWhatsApp = () => {
    const telefono = '59160605127'
    const texto = encodeURIComponent(
      `🏍️ Solicitud ${solicitudExitosa.codigo}\n` +
      `Zona: ${uvOrigen}\n` +
      `Referencia: ${referenciaOrigen}\n` +
      (destinoReferencia ? `Destino: ${destinoReferencia}\n` : '') +
      `Vehículo: ${tipoVehiculo === 'moto' ? 'Moto' : 'Torito'}\n` +
      `Servicio: ${tipoServicio === 'premium' ? '⭐ Premium' : 'Normal'}`
    )
    window.open(`https://wa.me/${telefono}?text=${texto}`, '_blank')
  }

  const handleCancelarPasajero = async () => {
    const confirmar = window.confirm('¿Seguro que quieres cancelar tu viaje?')
    if (!confirmar) return

    setCancelando(true)
    clearInterval(pollingRef.current)

    try {
      const viaje = await getViaje(solicitudExitosa.codigo)
      await cancelarSolicitud(solicitudExitosa.codigo, 'pasajero')

      if (viaje.conductor_id) {
        const conductorData = await getConductor(viaje.conductor_id)
        const celular = String(conductorData.celular).replace(/\D/g, '')
        const celularWA = celular.startsWith('591') ? celular : `591${celular}`
        const mensaje = encodeURIComponent(
          `❌ El pasajero canceló su viaje.\n\n` +
          `🔖 Solicitud: ${solicitudExitosa.codigo}\n` +
          `📍 Zona: ${uvOrigen}\n` +
          `📱 Pasajero: ${celularPasajero}\n\n` +
          `Ya puedes tomar otro viaje.`
        )
        setLinkCancelacion(`https://wa.me/${celularWA}?text=${mensaje}`)
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
    setSolicitudExitosa(null)
    setConductorAsignado(null)
    setMensaje(null)
    setUvOrigen('')
    setReferenciaOrigen('')
    setDestinoReferencia('')
    setCelularPasajero('')
    setTipoVehiculo('moto')
    setTipoServicio('normal')
    setCancelado(false)
    setLinkCancelacion(null)
  }

  // ── PANTALLA: CONDUCTOR ENCONTRADO ────────────────────────
  if (conductorAsignado) {
    return (
      <div className="app">
        <div className="header">
          <span className="header-icon">🏍️</span>
          <div className="header-texto">
            <h1>Mototaxis</h1>
            <p>{ciudad?.replace('-', ' ') || 'Santa Cruz'}</p>
          </div>
        </div>
        <div className="exito-screen">
          <div className="exito-icon" style={{ animation: 'pop 0.4s cubic-bezier(0.175,0.885,0.32,1.275)' }}>
            🏍️
          </div>
          <h2 className="exito-titulo">¡Conductor en camino!</h2>
          <p className="exito-desc">
            Un conductor aceptó tu solicitud y está yendo a recogerte.
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

          <p className="exito-desc" style={{ fontSize: '0.82rem' }}>
            El conductor te enviará su ubicación en tiempo real por WhatsApp. Mantente atento al chat.
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

          {cancelado && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', width: '100%' }}>
              <div className="mensaje error">Viaje cancelado.</div>
              {linkCancelacion && (
                <a
                  href={linkCancelacion}
                  target="_blank"
                  rel="noreferrer"
                  className="btn-whatsapp"
                  style={{ textAlign: 'center', textDecoration: 'none', display: 'block' }}
                >
                  📲 Avisar al conductor por WhatsApp
                </a>
              )}
              <button className="btn-nuevo" onClick={resetear}>Volver al inicio</button>
            </div>
          )}
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
            <p>{ciudad?.replace('-', ' ') || 'Santa Cruz'}</p>
          </div>
        </div>
        <div className="exito-screen">
          <div className="exito-icon">✅</div>
          <h2 className="exito-titulo">¡Solicitud enviada!</h2>
          <p className="exito-desc">
            Buscando conductor disponible en tu zona...
          </p>
          <div className="exito-codigo">{solicitudExitosa.codigo}</div>

          <div className="buscando-indicator">
            <span className="buscando-dot" />
            <span className="buscando-dot" />
            <span className="buscando-dot" />
          </div>

          <p className="exito-desc" style={{ fontSize: '0.8rem' }}>
            Cuando un conductor acepte, esta pantalla se actualizará automáticamente.
          </p>

          <button className="btn-whatsapp" onClick={abrirWhatsApp}>
            📍 Compartir mi ubicación por WhatsApp
          </button>

          {!cancelado && (
            <button
              className="btn-cancelar-pasajero"
              onClick={handleCancelarPasajero}
              disabled={cancelando}
            >
              {cancelando ? 'Cancelando...' : '❌ Cancelar mi viaje'}
            </button>
          )}

          {cancelado && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', width: '100%' }}>
              <div className="mensaje error">Viaje cancelado.</div>
              {linkCancelacion && (
                <a
                  href={linkCancelacion}
                  target="_blank"
                  rel="noreferrer"
                  className="btn-whatsapp"
                  style={{ textAlign: 'center', textDecoration: 'none', display: 'block' }}
                >
                  📲 Avisar al conductor por WhatsApp
                </a>
              )}
              <button className="btn-nuevo" onClick={resetear}>Volver al inicio</button>
            </div>
          )}

          {!cancelado && (
            <button className="btn-nuevo" onClick={resetear}>Nueva solicitud</button>
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
          <p>{ciudad?.replace('-', ' ') || 'Santa Cruz'} · Bs. 4</p>
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
            placeholder="Ej: Frente a la farmacia, frente a una casa blanca"
            value={referenciaOrigen}
            onChange={e => setReferenciaOrigen(e.target.value)}
          />
        </div>

        <div className="campo">
          <label>¿A dónde vas? <span style={{ color: '#555', fontWeight: 400 }}>(opcional)</span></label>
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
          <label>Tipo de vehículo</label>
          <div className="toggle-group">
            <button className={`toggle-btn ${tipoVehiculo === 'moto' ? 'activo' : ''}`} onClick={() => setTipoVehiculo('moto')}>
              <span className="icon">🏍️</span>Moto
            </button>
            <button className={`toggle-btn ${tipoVehiculo === 'torito' ? 'activo' : ''}`} onClick={() => setTipoVehiculo('torito')}>
              <span className="icon">🛺</span>Torito
            </button>
          </div>
        </div>

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
          <span>Tarifa base: <strong>Bs. {tipoServicio === 'premium' ? '5' : '4'}</strong> — Si el destino es lejano, el conductor te informará el ajuste.</span>
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
            ? <><span className="spinner" />Buscando conductor...</>
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