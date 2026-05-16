import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams } from 'react-router-dom'
import {
  verificarConductor,
  actualizarEstadoConductor,
  enviarOferta,
  getViajesHoy,
  getViaje,
  completarViaje,
  cancelarSolicitud,
  guardarFCMToken
} from '../services/api'
import { solicitarPermisoNotificaciones } from '../firebase'
import '../styles/ConductorTaxis.css'

const INTERVALO_BASE = 15000
const INTERVALO_ACTIVO = 5000
const SESION_DURACION = 12 * 60 * 60 * 1000
const COUNTDOWN_OFERTA = 90

export default function ConductorTaxis() {
  const { ciudad } = useParams()

  const [celularInput, setCelularInput] = useState('')
  const [pinInput, setPinInput] = useState('')
  const [verPin, setVerPin] = useState(false)
  const [loginCargando, setLoginCargando] = useState(false)
  const [loginError, setLoginError] = useState(null)
  const [sesionVerificada, setSesionVerificada] = useState(false)
  const [conductor, setConductor] = useState(null)
  const [cargando, setCargando] = useState(true)

  const [viajes, setViajes] = useState([])
  const [viajesIgnorados, setViajesIgnorados] = useState([])
  const [cargandoViajes, setCargandoViajes] = useState(false)
  const [ultimoRefresh, setUltimoRefresh] = useState(null)
  const [actualizando, setActualizando] = useState(false)

  const [ofertaEnviada, setOfertaEnviada] = useState(null)
  const [ofertaAceptada, setOfertaAceptada] = useState(null)
  const [tarifas, setTarifas] = useState({})
  const [tiempos, setTiempos] = useState({}) // CAMBIO 2: Estado para tiempos
  const [countdowns, setCountdowns] = useState({})
  const [enviandoOferta, setEnviandoOferta] = useState(false)
  const [tiempoLlegada, setTiempoLlegada] = useState('')
  const [completando, setCompletando] = useState(false)

  const [audioActivado, setAudioActivado] = useState(false)
  const [alarmaSilenciada, setAlarmaSilenciada] = useState(false)
  const [toast, setToast] = useState(null)

  const toastTimeoutRef = useRef(null)
  const audioCtxRef = useRef(null)
  const alarmaIntervalRef = useRef(null)
  const viajesAnterioresRef = useRef([])
  const intervaloRef = useRef(null)
  const audioActivadoRef = useRef(false)
  const alarmaSilenciadaRef = useRef(false)
  const viajeAsignadoRefCodigo = useRef(null)
  const viajeCompletadoRef = useRef(null)

  // CAMBIO 6: Función calcularDistancia
  const calcularDistancia = (lat1, lon1, lat2, lon2) => {
    const R = 6371000
    const rad = Math.PI / 180
    const dLat = (lat2 - lat1) * rad
    const dLon = (lon2 - lon1) * rad
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * rad) * Math.cos(lat2 * rad) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2)
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
    return Math.round(R * c)
  }

  useEffect(() => {
    const guardado = localStorage.getItem('conductorViajesIgnorados')
    if (guardado) {
      try { setViajesIgnorados(JSON.parse(guardado)) } catch (e) {}
    }
  }, [])

  useEffect(() => {
    if (viajesIgnorados.length > 0 || localStorage.getItem('conductorViajesIgnorados')) {
      localStorage.setItem('conductorViajesIgnorados', JSON.stringify(viajesIgnorados))
    }
  }, [viajesIgnorados])

  useEffect(() => {
    try {
      const sesionGuardada = localStorage.getItem('conductorTaxiSesion')
      if (sesionGuardada) {
        const sesion = JSON.parse(sesionGuardada)
        if (sesion.expira > Date.now()) {
          setConductor(sesion.conductor)
          setSesionVerificada(true)
          setCargando(false)
          return
        } else {
          localStorage.removeItem('conductorTaxiSesion')
        }
      }
    } catch (e) {}
    setCargando(false)
  }, [])

  useEffect(() => {
    if (!sesionVerificada) return
    window.history.pushState(null, '', window.location.href)
    const handlePopState = () => {
      const confirmar = window.confirm('¿Deseas cerrar sesión y salir del panel?')
      if (confirmar) cerrarSesion()
      else window.history.pushState(null, '', window.location.href)
    }
    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [sesionVerificada])

  useEffect(() => {
    if (!ofertaEnviada || !conductor) return
    const polling = setInterval(async () => {
      try {
        const viaje = await getViaje(ofertaEnviada.codigo)
        if (viaje.estado === 'asignado' && viaje.conductor_id === conductor.id) {
          clearInterval(polling)
          viajeAsignadoRefCodigo.current = viaje.codigo
          setOfertaAceptada({ ...viaje, tarifa: ofertaEnviada.tarifa })
          setOfertaEnviada(null)
          cambiarEstado('ocupado')
        } else if (viaje.estado === 'asignado' && viaje.conductor_id !== conductor.id) {
          clearInterval(polling)
          setOfertaEnviada(null)
          mostrarToast('error', '😔 Otro conductor tomó el viaje.')
        } else if (['cancelado_pasajero', 'cancelado_conductor'].includes(viaje.estado)) {
          clearInterval(polling)
          setOfertaEnviada(null)
          mostrarToast('error', 'El viaje fue cancelado.')
        }
      } catch (err) {
        console.log('Polling oferta error:', err)
      }
    }, 5000)
    return () => clearInterval(polling)
  }, [ofertaEnviada, conductor])

  const handleLogin = async () => {
    setLoginError(null)
    if (!celularInput.trim()) return setLoginError('Ingresa tu número de celular.')
    if (!pinInput.trim()) return setLoginError('Ingresa tu PIN.')
    setLoginCargando(true)
    try {
      const data = await verificarConductor(celularInput.trim(), pinInput.trim())
      const sesion = { conductor: data, expira: Date.now() + SESION_DURACION }
      localStorage.setItem('conductorTaxiSesion', JSON.stringify(sesion))
      setConductor(data)
      setSesionVerificada(true)

      const tokenFCM = await solicitarPermisoNotificaciones()
      if (tokenFCM) {
        console.log('Token FCM guardado:', tokenFCM)
        localStorage.setItem('conductorFCMToken', tokenFCM)
        await guardarFCMToken(data.id, data.sheet_id, tokenFCM)
      }
    } catch (err) {
      setLoginError(err.message)
    } finally {
      setLoginCargando(false)
    }
  }

  const cerrarSesion = () => {
    localStorage.removeItem('conductorTaxiSesion')
    setConductor(null)
    setSesionVerificada(false)
    setCelularInput('')
    setPinInput('')
    setOfertaEnviada(null)
    setOfertaAceptada(null)
    setTiempoLlegada('')
    setTarifas({})
    setTiempos({})
    viajeAsignadoRefCodigo.current = null
    viajeCompletadoRef.current = null
    alarmaSilenciadaRef.current = false
    setAlarmaSilenciada(false)
  }

  const mostrarToast = (tipo, texto) => {
    setToast({ tipo, texto })
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current)
    toastTimeoutRef.current = setTimeout(() => setToast(null), 4000)
  }

  const sonarAlarma = (silenciada = alarmaSilenciadaRef.current) => {
    if (!audioActivadoRef.current || silenciada) return
    if (navigator.vibrate) navigator.vibrate([500, 300, 500, 300, 500])
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)()
      audioCtxRef.current = ctx
      const tocar = (freq, inicio, dur) => {
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.connect(gain)
        gain.connect(ctx.destination)
        osc.type = 'square'
        osc.frequency.setValueAtTime(freq, ctx.currentTime + inicio)
        gain.gain.setValueAtTime(0.3, ctx.currentTime + inicio)
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + inicio + dur)
        osc.start(ctx.currentTime + inicio)
        osc.stop(ctx.currentTime + inicio + dur)
      }
      tocar(880, 0, 0.2)
      tocar(1100, 0.25, 0.2)
      tocar(880, 0.5, 0.2)
      tocar(1100, 0.75, 0.2)
    } catch (e) {}
  }

  const soloVibrar = (silenciada = alarmaSilenciadaRef.current) => {
    if (silenciada) return
    if (navigator.vibrate) navigator.vibrate([1000, 300, 1000, 300, 1000, 300, 1000, 300, 1000])
  }

  const iniciarAlarma = (esOperadora = false) => {
    detenerAlarma()
    alarmaSilenciadaRef.current = false
    setAlarmaSilenciada(false)
    if (esOperadora) {
      soloVibrar(false)
    } else {
      sonarAlarma(false)
    }
    let reps = 0
    alarmaIntervalRef.current = setInterval(() => {
      reps++
      if (reps >= 60) { detenerAlarma(); return }
      if (esOperadora) {
        soloVibrar()
      } else {
        sonarAlarma()
      }
    }, 2000)
  }

  const detenerAlarma = () => {
    if (alarmaIntervalRef.current) { clearInterval(alarmaIntervalRef.current); alarmaIntervalRef.current = null }
    if (audioCtxRef.current) { audioCtxRef.current.close(); audioCtxRef.current = null }
    if (navigator.vibrate) navigator.vibrate(0)
  }

  const silenciarAlarma = () => {
    detenerAlarma()
    alarmaSilenciadaRef.current = true
    setAlarmaSilenciada(true)
  }

  const activarAudio = () => {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)()
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.connect(gain)
      gain.connect(ctx.destination)
      gain.gain.setValueAtTime(0.001, ctx.currentTime)
      osc.start(ctx.currentTime)
      osc.stop(ctx.currentTime + 0.1)
      ctx.close()
    } catch (e) {}
    audioActivadoRef.current = true
    setAudioActivado(true)
    mostrarToast('exito', '🔔 Alarma de pedidos activada')
  }

  const cargarViajes = useCallback(async () => {
    if (!conductor) return
    setCargandoViajes(true)
    try {
      const todos = await getViajesHoy(conductor.asociacion_id)

      const miViajeAsignado = todos.find(v =>
        v.estado === 'asignado' &&
        v.conductor_id === conductor.id &&
        v.tipo_vehiculo === 'taxi'
      )

      if (
        miViajeAsignado &&
        viajeAsignadoRefCodigo.current !== miViajeAsignado.codigo &&
        viajeCompletadoRef.current !== miViajeAsignado.codigo
      ) {
        viajeAsignadoRefCodigo.current = miViajeAsignado.codigo
        setOfertaAceptada({
          ...miViajeAsignado,
          tarifa: parseFloat(miViajeAsignado.tarifa_final) || parseFloat(miViajeAsignado.tarifa_base) || 0
        })
        setOfertaEnviada(null)
        if (!alarmaSilenciadaRef.current) {
          iniciarAlarma(true)
        }
      }

      const pendientes = todos.filter(v =>
        v.estado === 'notificado' &&
        v.tipo_vehiculo === 'taxi' &&
        (v.asociaciones_notificadas || '').includes(conductor.asociacion_id) &&
        !viajesIgnorados.includes(v.codigo)
      )

      const codigosAnteriores = viajesAnterioresRef.current.map(v => v.codigo)
      const hayNuevo = pendientes.some(v => !codigosAnteriores.includes(v.codigo))
      if (hayNuevo && pendientes.length > 0) iniciarAlarma(false)
      else if (pendientes.length === 0 && !miViajeAsignado) detenerAlarma()

      viajesAnterioresRef.current = pendientes
      setViajes(pendientes)

      setCountdowns(prev => {
        const nuevo = { ...prev }
        pendientes.forEach(v => {
          if (!(v.codigo in nuevo)) nuevo[v.codigo] = COUNTDOWN_OFERTA
        })
        return nuevo
      })

      setUltimoRefresh(new Date())
    } catch (err) {
      mostrarToast('error', 'Error al cargar viajes: ' + err.message)
    } finally {
      setCargandoViajes(false)
    }
  }, [conductor, viajesIgnorados])

  useEffect(() => {
    if (!conductor || !sesionVerificada) return
    cargarViajes()
    const intervalo = viajes.length > 0 ? INTERVALO_ACTIVO : INTERVALO_BASE
    intervaloRef.current = setInterval(cargarViajes, intervalo)
    return () => clearInterval(intervaloRef.current)
  }, [conductor, sesionVerificada, cargarViajes, viajes.length])

  useEffect(() => {
    const timer = setInterval(() => {
      setCountdowns(prev => {
        const nuevo = { ...prev }
        Object.keys(nuevo).forEach(codigo => {
          if (nuevo[codigo] > 0) nuevo[codigo]--
        })
        return nuevo
      })
    }, 1000)
    return () => clearInterval(timer)
  }, [])

  const cambiarEstado = async (nuevoEstado) => {
    if (actualizando) return
    setActualizando(true)
    try {
      await actualizarEstadoConductor(conductor.id, conductor.sheet_id, nuevoEstado)
      setConductor(prev => ({ ...prev, estado: nuevoEstado }))
      const sesion = JSON.parse(localStorage.getItem('conductorTaxiSesion'))
      sesion.conductor.estado = nuevoEstado
      localStorage.setItem('conductorTaxiSesion', JSON.stringify(sesion))
      mostrarToast('exito', `Estado: ${nuevoEstado}`)
    } catch (err) {
      mostrarToast('error', err.message)
    } finally {
      setActualizando(false)
    }
  }

  // CAMBIO 3: handleEnviarOferta actualizado con tiempo
  const handleEnviarOferta = async (viaje) => {
    const tarifa = tarifas[viaje.codigo]
    const tiempo = tiempos[viaje.codigo]
    if (!tarifa || isNaN(parseFloat(tarifa))) {
      return mostrarToast('error', 'Ingresa una tarifa válida.')
    }
    if (!tiempo || isNaN(parseInt(tiempo))) {
      return mostrarToast('error', 'Ingresa el tiempo de llegada.')
    }
    setEnviandoOferta(true)
    try {
      await enviarOferta(
        viaje.codigo,
        conductor.id,
        conductor.asociacion_id,
        parseFloat(tarifa),
        parseInt(tiempo)
      )
      setOfertaEnviada({ codigo: viaje.codigo, tarifa: parseFloat(tarifa), tiempo: parseInt(tiempo) })
      setViajes(prev => prev.filter(v => v.codigo !== viaje.codigo))
      detenerAlarma()
      mostrarToast('exito', '✅ Oferta enviada.')
    } catch (err) {
      if (err.message?.includes('ya_ofertado')) {
        mostrarToast('error', 'Ya enviaste una oferta para este viaje.')
      } else if (err.message?.includes('limite_ofertas')) {
        mostrarToast('error', 'Este viaje ya tiene 3 ofertas.')
      } else {
        mostrarToast('error', err.message)
      }
    } finally {
      setEnviandoOferta(false)
    }
  }

  const handleCompletar = async () => {
    if (!ofertaAceptada || completando) return
    
    alarmaSilenciadaRef.current = false
    setAlarmaSilenciada(false)
    
    setCompletando(true)
    try {
      await completarViaje(ofertaAceptada.codigo, ofertaAceptada.tarifa, conductor.sheet_id)
      viajeCompletadoRef.current = ofertaAceptada.codigo
      viajeAsignadoRefCodigo.current = null
      setOfertaAceptada(null)
      setTiempoLlegada('')
      cambiarEstado('disponible')
      mostrarToast('exito', '✅ Viaje completado.')
    } catch (err) {
      mostrarToast('error', err.message)
    } finally {
      setCompletando(false)
    }
  }

  const verEnMaps = (lat, lng) => {
    window.open(`https://www.google.com/maps?q=${lat},${lng}`, '_blank')
  }

  useEffect(() => {
    return () => {
      if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current)
      detenerAlarma()
    }
  }, [])

  if (cargando) {
    return (
      <div className="conductortaxi-app">
        <div className="conductortaxi-loading">
          <div className="conductortaxi-spinner" />
          <p>Cargando panel...</p>
        </div>
      </div>
    )
  }

  if (ofertaAceptada) {
    const celular = String(ofertaAceptada.celular_pasajero).replace(/\D/g, '')
    const celularWA = celular.startsWith('591') ? celular : `591${celular}`

    const enviarWhatsApp = () => {
      const msg = encodeURIComponent(
        `🚕 ¡Hola! Soy tu conductor.\n\n` +
        `🔖 Código: ${ofertaAceptada.codigo}\n` +
        `👤 ${conductor?.nombre || 'Conductor'}\n` +
        `🚗 ${conductor?.modelo_vehiculo || 'Taxi'} — ${conductor?.color_vehiculo || ''}\n` +
        `🔖 Placa: ${conductor?.placa || ''}\n` +
        `🏁 Destino: ${ofertaAceptada.destino_referencia || 'No especificado'}\n` +
        `💰 Tarifa acordada: Bs. ${ofertaAceptada.tarifa}\n` +
        `⏱ Paso a recogerte en: ${ofertaAceptada.tiempo_llegada || tiempoLlegada} minutos\n\n` +
        `Responde OK y te enviare mi ubicación en tiempo real. 📍`
      )
      window.open(`https://wa.me/${celularWA}?text=${msg}`, '_blank')
    }

    return (
      <div className="conductortaxi-app">
        <div className="conductortaxi-header">
          <div className="conductortaxi-header-left">
            <span className="conductortaxi-header-icon">🚕</span>
            <div>
              <h1>{conductor?.nombre || 'Conductor'}</h1>
              <p>{conductor?.asociacion_nombre || ''}</p>
            </div>
          </div>
        </div>
        <div className="conductortaxi-body">
          <div className="viaje-asignado-card">
            <p className="viaje-asignado-titulo">✅ ¡Viaje asignado!</p>

            <button
              className={`btn-silenciar ${alarmaSilenciada ? 'silenciada' : ''}`}
              onClick={silenciarAlarma}
            >
              {alarmaSilenciada ? '✅ Alarma desactivada' : '🔕 Detener alarma'}
            </button>

            <div className="viaje-datos">
              <div className="viaje-fila">
                <span className="viaje-fila-icon">📍</span>
                <span className="viaje-fila-texto">{ofertaAceptada.referencia_origen}</span>
              </div>
              <div className="viaje-fila">
                <span className="viaje-fila-icon">🏁</span>
                <span className="viaje-fila-texto">{ofertaAceptada.destino_referencia}</span>
              </div>
              <div className="viaje-fila">
                <span className="viaje-fila-icon">📱</span>
                <span className="viaje-fila-texto">{ofertaAceptada.celular_pasajero}</span>
              </div>
              <div className="viaje-fila">
                <span className="viaje-fila-icon">💰</span>
                <span className="viaje-fila-texto">Bs. {ofertaAceptada.tarifa}</span>
              </div>
            </div>

            {ofertaAceptada.lat_pasajeros && ofertaAceptada.lng_pasajeros && (
              <button className="btn-maps" onClick={() => verEnMaps(ofertaAceptada.lat_pasajeros, ofertaAceptada.lng_pasajeros)}>
                📍 Ver origen en Maps
              </button>
            )}
            {ofertaAceptada.lat_destino && ofertaAceptada.lng_destino && (
              <button className="btn-maps btn-maps-destino" onClick={() => verEnMaps(ofertaAceptada.lat_destino, ofertaAceptada.lng_destino)}>
                🏁 Ver destino en Maps
              </button>
            )}

            <button className="btn-completar" onClick={enviarWhatsApp}>
              💬 Enviar mensaje al pasajero
            </button>

            <button
              className="btn-cancelar-viaje"
              onClick={handleCompletar}
              disabled={completando}
            >
              {completando ? 'Completando...' : '✅ Marcar como completado'}
            </button>

            <button
              className="btn-cancelar-viaje"
              style={{ background: 'transparent', border: '1px solid #e63946', color: '#e63946', marginTop: '8px' }}
              onClick={async () => {
                const confirmar = window.confirm('¿Cancelar este viaje? El pasajero será notificado.')
                if (!confirmar) return
                
                alarmaSilenciadaRef.current = false
                setAlarmaSilenciada(false)
                
                try {
                  await cancelarSolicitud(ofertaAceptada.codigo, 'conductor')
                  viajeCompletadoRef.current = ofertaAceptada.codigo
                  viajeAsignadoRefCodigo.current = null
                  setOfertaAceptada(null)
                  setTiempoLlegada('')
                  cambiarEstado('disponible')
                  mostrarToast('exito', 'Viaje cancelado.')
                } catch (err) {
                  mostrarToast('error', err.message)
                }
              }}
            >
              ❌ Cancelar viaje
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (!sesionVerificada) {
    return (
      <div className="conductortaxi-app">
        <div className="conductortaxi-header">
          <span className="conductortaxi-header-icon">🚕</span>
          <div>
            <h1>Panel Conductor</h1>
            <p>{ciudad || 'El Alto'}</p>
          </div>
        </div>
        <div className="conductortaxi-body">
          <div className="card">
            <p className="card-titulo">Acceso al panel</p>
            <div className="campo-login">
              <label>Número de celular</label>
              <input
                className="input-login"
                type="tel"
                placeholder="Ej: 70000000"
                value={celularInput}
                onChange={e => setCelularInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleLogin()}
              />
            </div>
            <div className="campo-login">
              <label>PIN</label>
              <div className="input-pin-wrap">
                <input
                  className="input-login"
                  type={verPin ? 'text' : 'password'}
                  placeholder="4 dígitos"
                  maxLength={4}
                  value={pinInput}
                  onChange={e => setPinInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleLogin()}
                />
                <button className="btn-ver-pin" onClick={() => setVerPin(v => !v)} type="button">
                  {verPin ? '🙈' : '👁️'}
                </button>
              </div>
            </div>
            {loginError && <div className="mensaje error">{loginError}</div>}
            <button className="btn-completar" onClick={handleLogin} disabled={loginCargando}>
              {loginCargando ? 'Verificando...' : '🔐 Ingresar al panel'}
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="conductortaxi-app">
      <div className="conductortaxi-header">
        <div className="conductortaxi-header-left">
          <span className="conductortaxi-header-icon">🚕</span>
          <div>
            <h1>{conductor.nombre}</h1>
            <p>{conductor.asociacion_nombre}</p>
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
          <span className={`estado-badge ${conductor.estado}`}>{conductor.estado}</span>
          <button className="btn-cerrar-sesion" onClick={cerrarSesion}>Cerrar sesión</button>
        </div>
      </div>

      <div className="conductortaxi-body">
        {toast && <div className={`mensaje-toast ${toast.tipo}`}>{toast.texto}</div>}

        {!audioActivado && (
          <button className="btn-activar-alarma" onClick={activarAudio}>
            🔔 Toca aquí para activar la alarma de pedidos
          </button>
        )}

        <div className="disponibilidad-section">
          <p className="seccion-titulo">Mi disponibilidad</p>
          <div className="toggle-disponibilidad">
            <button
              className={`btn-disponible ${conductor.estado === 'disponible' ? 'activo' : ''}`}
              onClick={() => cambiarEstado('disponible')}
              disabled={actualizando || conductor.estado === 'disponible'}
            >
              ✅ Disponible
            </button>
            <button
              className={`btn-ocupado ${conductor.estado === 'ocupado' ? 'activo' : ''}`}
              onClick={() => cambiarEstado('ocupado')}
              disabled={actualizando || conductor.estado === 'ocupado'}
            >
              🔴 Ocupado
            </button>
          </div>
        </div>

        {ofertaEnviada && (
          <div className="oferta-enviada-card">
            <p className="oferta-enviada-titulo">⏳ Esperando respuesta del pasajero</p>
            <p className="oferta-enviada-desc">
              Enviaste una oferta de <strong>Bs. {ofertaEnviada.tarifa}</strong> para el viaje <strong>{ofertaEnviada.codigo}</strong>
            </p>
            <p className="oferta-enviada-desc" style={{ fontSize: '0.78rem', color: '#888' }}>
              Si el pasajero acepta recibirás una notificación aquí.
            </p>
            <button className="btn-cancelar-viaje" onClick={() => setOfertaEnviada(null)}>
              Cancelar oferta
            </button>
          </div>
        )}

        {!ofertaEnviada && (
          <div className="viajes-section">
            <div className="viajes-header">
              <p className="seccion-titulo">
                Solicitudes {viajes.length > 0 && `(${viajes.length})`}
              </p>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                {ultimoRefresh && (
                  <span className="ultimo-refresh">
                    {ultimoRefresh.toLocaleTimeString('es-BO', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                  </span>
                )}
                <button className="btn-refrescar" onClick={cargarViajes} disabled={cargandoViajes}>
                  {cargandoViajes ? '...' : '↻'}
                </button>
              </div>
            </div>

            {viajes.length === 0 ? (
              <div className="empty-state">
                <span className="empty-icon">🚕</span>
                No hay solicitudes ahora.<br />
                <span style={{ fontSize: '0.8rem', color: '#444' }}>
                  Última actualización: {ultimoRefresh?.toLocaleTimeString('es-BO', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) || '—'}
                </span>
              </div>
            ) : (
              viajes.map(viaje => {
                const segs = countdowns[viaje.codigo] ?? COUNTDOWN_OFERTA
                const tarifaActual = tarifas[viaje.codigo] || ''
                const tiempoActual = tiempos[viaje.codigo] || ''
                return (
                  <div key={viaje.codigo} className="viaje-card">
                    <div className="viaje-card-header">
                      <span className="viaje-codigo">{viaje.codigo}</span>
                      <span className={`viaje-countdown ${segs <= 15 ? 'urgente' : ''}`}>
                        ⏱ {segs}s
                      </span>
                    </div>

                    {audioActivado && (
                      <button
                        className={`btn-silenciar ${alarmaSilenciada ? 'silenciada' : ''}`}
                        onClick={silenciarAlarma}
                      >
                        {alarmaSilenciada ? '✅ Alarma desactivada' : '🔕 Silenciar alarma'}
                      </button>
                    )}
                    {/* CAMBIO 5: Viaje-datos con distancia y ruta completa */}
                    <div className="viaje-datos">
                      <div className="viaje-fila">
                        <span className="viaje-fila-icon">📍</span>
                        <span className="viaje-fila-texto">
                          <strong>
                            {viaje.lat_pasajeros && viaje.lng_pasajeros && conductor.lat && conductor.lng
                              ? `A ${calcularDistancia(
                                  parseFloat(conductor.lat),
                                  parseFloat(conductor.lng),
                                  parseFloat(viaje.lat_pasajeros),
                                  parseFloat(viaje.lng_pasajeros)
                                )} metros`
                              : 'Distancia no disponible'
                            }
                          </strong>
                          {viaje.referencia_origen ? ` · ${viaje.referencia_origen}` : ''}
                        </span>
                      </div>
                      <div className="viaje-fila">
                        <span className="viaje-fila-icon">🏁</span>
                        <span className="viaje-fila-texto">
                          <strong>Destino:</strong> {viaje.destino_referencia}
                        </span>
                      </div>
                    </div>

                    {/* BOTÓN DESTINO + PRECIO */}
                    {viaje.lat_destino && viaje.lng_destino && viaje.lat_pasajeros && viaje.lng_pasajeros && (
                      <div className="oferta-campo-grupo">
                        <button
                          className="btn-maps btn-maps-ruta"
                          onClick={() => window.open(
                            `https://www.google.com/maps/dir/${viaje.lat_pasajeros},${viaje.lng_pasajeros}/${viaje.lat_destino},${viaje.lng_destino}`,
                            '_blank'
                          )}
                        >
                          🏁 Ver destino en Maps
                        </button>
                        <p className="oferta-campo-hint">Para calcular el precio del viaje</p>
                        <input
                          className="tarifa-input"
                          type="number"
                          min="1"
                          placeholder="Bs. precio del viaje"
                          value={tarifaActual}
                          onChange={e => setTarifas(prev => ({ ...prev, [viaje.codigo]: e.target.value }))}
                        />
                      </div>
                    )}

                    {/* BOTÓN PASAJERO + TIEMPO */}
                    {viaje.lat_pasajeros && viaje.lng_pasajeros && (
                      <div className="oferta-campo-grupo">
                        <button
                          className="btn-maps"
                          onClick={() => window.open(
                            `https://www.google.com/maps/dir/${conductor.lat},${conductor.lng}/${viaje.lat_pasajeros},${viaje.lng_pasajeros}`,
                            '_blank'
                          )}
                        >
                          📍 Ver ubicación del pasajero
                        </button>
                        <p className="oferta-campo-hint">Para calcular cuánto tardas en llegar</p>
                        <input
                          className="tarifa-input"
                          type="number"
                          min="1"
                          placeholder="Minutos para llegar"
                          value={tiempos[viaje.codigo] || ''}
                          onChange={e => setTiempos(prev => ({ ...prev, [viaje.codigo]: e.target.value }))}
                        />
                      </div>
                    )}

                    {/* BOTONES ENVIAR OFERTA E IGNORAR */}
                    {segs > 0 && conductor.estado === 'disponible' && (
                      <div className="oferta-section" style={{ marginTop: '16px' }}>
                        <button
                          className="btn-enviar-oferta"
                          onClick={() => handleEnviarOferta(viaje)}
                          disabled={enviandoOferta}
                          style={{ width: '100%' }}
                        >
                          {enviandoOferta ? '...' : 'Enviar oferta'}
                        </button>
                      </div>
                    )}

                    {segs === 0 && <p className="oferta-expirada">⏰ Tiempo para ofertar expirado</p>}

                    {conductor.estado !== 'disponible' && (
                      <p style={{ fontSize: '0.75rem', color: '#666', textAlign: 'center' }}>
                        Márcate como disponible para enviar ofertas.
                      </p>
                    )}

                    <button
                      className="btn-rechazar"
                      onClick={() => {
                        detenerAlarma()
                        setViajesIgnorados(prev => [...prev, viaje.codigo])
                      }}
                    >
                      Ignorar
                    </button>
                  </div>
                )
              })
            )}
          </div>
        )}
      </div>
    </div>
  )
}