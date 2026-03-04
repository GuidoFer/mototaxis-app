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
  const [conductorCancelo, setConductorCancelo] = useState(false)

  const [segundosRestantes, setSegundosRestantes] = useState(0)

  const timerRef = useRef(null)
  const pollingRef = useRef(null)
  const timeoutRef = useRef(null)

  // ── FIX 3: Recuperar solicitud de sessionStorage al montar ─
  useEffect(() => {
    const guardado = sessionStorage.getItem('solicitudActiva')
    if (guardado) {
      try {
        const data = JSON.parse(guardado)
        setSolicitudExitosa(data.solicitud)
        setUvOrigen(data.uvOrigen || '')
        setReferenciaOrigen(data.referenciaOrigen || '')
        setDestinoReferencia(data.destinoReferencia || '')
        setCelularPasajero(data.celularPasajero || '')
      } catch (e) {}
    }
  }, [])

  // ── FIX 5: Interceptar botón atrás del celular ────────────
  useEffect(() => {
    window.history.pushState(null, '', window.location.href)

    const handlePopState = () => {
      const confirmar = window.confirm('¿Deseas salir de la app?')
      if (confirmar) {
        sessionStorage.removeItem('solicitudActiva')
        window.history.back()
      } else {
        window.history.pushState(null, '', window.location.href)
      }
    }

    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [])

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

  // ── FIX 2: Polling siempre activo mientras haya solicitud ──
  useEffect(() => {
    if (!solicitudExitosa || conductorAsignado || viajeCompletado || conductorCancelo) return

    // Timeout 1 minuto — muestra aviso pero NO detiene el polling
    timeoutRef.current = setTimeout(() => {
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
          sessionStorage.removeItem('solicitudActiva')
        }

        if (viaje.estado === 'cancelado_conductor') {
          clearInterval(pollingRef.current)
          clearTimeout(timeoutRef.current)
          setConductorCancelo(true)
          sessionStorage.removeItem('solicitudActiva')
        }

        if (viaje.estado === 'cancelado_pasajero') {
          clearInterval(pollingRef.current)
          clearTimeout(timeoutRef.current)
          sessionStorage.removeItem('solicitudActiva')
          resetear()
        }

      } catch (e) {
        console.log('Polling error:', e)
      }
    }, POLLING_INTERVAL)

    return () => {
      clearInterval(pollingRef.current)
      clearTimeout(timeoutRef.current)
    }
  }, [solicitudExitosa, conductorAsignado, viajeCompletado, conductorCancelo])

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

      // FIX 3: Guardar en sessionStorage
      sessionStorage.setItem('solicitudActiva', JSON.stringify({
        solicitud: resultado,
        uvOrigen,
        referenciaOrigen,
        destinoReferencia,
        celularPasajero: celularPasajero.trim(),
      }))

    } catch (err) {
      setMensaje({ tipo: 'error', texto: err.message })
    } finally {
      setCargando(false)
    }
  }

  // FIX 4: Solo abre WhatsApp al conductor sin mensaje pre-armado
  const irAWhatsApp = () => {
    const celular = String(conductorAsignado.celular).replace(/\D/g, '')
    const celularWA = celular.startsWith('591') ? celular : `591${celular}`
    window.open(`https://wa.me/${celularWA}`, '_blank')
  }

  const reintentar = () => {
    setSinConductor(false)
  }

  const resetear = () => {
    clearInterval(pollingRef.current)
    clearTimeout(timeoutRef.current)
    sessionStorage.removeItem('solicitudActiva')
    setSolicitudExitosa(null)
    setConductorAsignado(null)
    setViajeCompletado(false)
    setSinConductor(false)
    setConductorCancelo(false)
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
            Te llegará un mensaje a tu WhatsApp con los detalles y la tarifa.
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
            ¿Necesitas cancelar? Usa el link que te enviará el conductor en el mensaje de WhatsApp.
          </p>
        </div>
      </div>
    )
  }

  // ── PANTALLA: ESPERANDO / SIN CONDUCTOR ───────────────────
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

          {sinConductor ? (
            <>
              <div className="exito-icon">😕</div>
              <h2 className="exito-titulo">Sin conductores disponibles</h2>
              <p className="exito-desc">
                Todos están ocupados. Seguimos buscando automáticamente.
              </p>
              <div className="buscando-indicator">
                <span className="buscando-dot" />
                <span className="buscando-dot" />
                <span className="buscando-dot" />
              </div>
              <button className="btn-nuevo" onClick={resetear}>
                Cancelar y volver al inicio
              </button>
            </>
          ) : (
            <>
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
              <button className="btn-nuevo" onClick={resetear}>
                Cancelar solicitud
              </button>
            </>
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

        {/* FIX 1: Campo celular con confirmación */}
        <div className="campo">
          <label>Tu número de celular</label>
          <input
            className="input"
            type="tel"
            placeholder="Ej: 70000000"
            value={celularPasajero}
            onChange={e => setCelularPasajero(e.target.value)}
          />
          {celularPasajero.trim().length >= 7 && (
            <p className="celular-confirmacion">
              ¿Tu número es <strong>{celularPasajero.trim()}</strong>? Verifica antes de continuar.
            </p>
          )}
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