import { useState, useEffect, useCallback, useRef } from 'react'
import {
  verificarConductor,
  getViajesHoy,
  actualizarEstadoConductor,
  aceptarSolicitud,
  cancelarSolicitud,
  completarViaje,
} from '../services/api'
import '../styles/ConductorView.css'

const INTERVALO_BASE = 15000
const INTERVALO_ACTIVO = 10000
const SESION_DURACION = 12 * 60 * 60 * 1000 // 12 horas

export default function ConductorView() {

  // ── LOGIN ─────────────────────────────────────────────────
  const [celularInput, setCelularInput] = useState('')
  const [pinInput, setPinInput] = useState('')
  const [verPin, setVerPin] = useState(false)
  const [loginCargando, setLoginCargando] = useState(false)
  const [loginError, setLoginError] = useState(null)
  const [sesionVerificada, setSesionVerificada] = useState(false)

  const [conductor, setConductor] = useState(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState(null)

  const [viajes, setViajes] = useState([])
  const [cargandoViajes, setCargandoViajes] = useState(false)
  const [viajesIgnorados, setViajesIgnorados] = useState([])
  const [ultimoRefresh, setUltimoRefresh] = useState(null)

  const [viajeAsignado, setViajeAsignado] = useState(null)
  const [tarifaFinal, setTarifaFinal] = useState('4')
  const tarifaModificadaRef = useRef(false)

  const [actualizando, setActualizando] = useState(false)
  const [toast, setToast] = useState(null)
  const [resumenCompletado, setResumenCompletado] = useState(null)
  const [audioActivado, setAudioActivado] = useState(false)

  const toastTimeoutRef = useRef(null)
  const audioCtxRef = useRef(null)
  const alarmaIntervalRef = useRef(null)
  const viajesAnterioresRef = useRef([])
  const intervaloRef = useRef(null)

  // ── VERIFICAR SESIÓN AL MONTAR ────────────────────────────
  useEffect(() => {
    try {
      const sesionGuardada = localStorage.getItem('conductorSesion')
      if (sesionGuardada) {
        const sesion = JSON.parse(sesionGuardada)
        if (sesion.expira > Date.now()) {
          setConductor(sesion.conductor)
          setSesionVerificada(true)
          setCargando(false)
          return
        } else {
          localStorage.removeItem('conductorSesion')
        }
      }
    } catch (e) {}
    setCargando(false)
  }, [])

  // ── LOGIN ─────────────────────────────────────────────────
  const handleLogin = async () => {
    setLoginError(null)
    if (!celularInput.trim()) return setLoginError('Ingresa tu número de celular.')
    if (!pinInput.trim()) return setLoginError('Ingresa tu PIN.')

    setLoginCargando(true)
    try {
      const data = await verificarConductor(celularInput.trim(), pinInput.trim())
      const sesion = {
        conductor: data,
        expira: Date.now() + SESION_DURACION,
      }
      localStorage.setItem('conductorSesion', JSON.stringify(sesion))
      setConductor(data)
      setSesionVerificada(true)
    } catch (err) {
      setLoginError(err.message)
    } finally {
      setLoginCargando(false)
    }
  }

  const cerrarSesion = () => {
    localStorage.removeItem('conductorSesion')
    setConductor(null)
    setSesionVerificada(false)
    setCelularInput('')
    setPinInput('')
  }

  // ── TOAST ─────────────────────────────────────────────────
  const mostrarToast = (tipo, texto) => {
    setToast({ tipo, texto })
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current)
    toastTimeoutRef.current = setTimeout(() => setToast(null), 4000)
  }

  // ── ALARMA ────────────────────────────────────────────────
  const sonarAlarma = () => {
    if (!audioActivado) return
    if (navigator.vibrate) navigator.vibrate([500, 300, 500, 300, 500])
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)()
      audioCtxRef.current = ctx
      const tocar = (frecuencia, inicio, duracion) => {
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.connect(gain)
        gain.connect(ctx.destination)
        osc.type = 'square'
        osc.frequency.setValueAtTime(frecuencia, ctx.currentTime + inicio)
        gain.gain.setValueAtTime(0.3, ctx.currentTime + inicio)
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + inicio + duracion)
        osc.start(ctx.currentTime + inicio)
        osc.stop(ctx.currentTime + inicio + duracion)
      }
      tocar(880, 0, 0.2)
      tocar(1100, 0.25, 0.2)
      tocar(880, 0.5, 0.2)
      tocar(1100, 0.75, 0.2)
    } catch (e) {
      console.log('Audio no disponible:', e)
    }
  }

  const iniciarAlarma = () => {
    sonarAlarma()
    let repeticiones = 0
    alarmaIntervalRef.current = setInterval(() => {
      repeticiones++
      if (repeticiones >= 60) { detenerAlarma(); return }
      sonarAlarma()
    }, 2000)
  }

  const detenerAlarma = () => {
    if (alarmaIntervalRef.current) { clearInterval(alarmaIntervalRef.current); alarmaIntervalRef.current = null }
    if (audioCtxRef.current) { audioCtxRef.current.close(); audioCtxRef.current = null }
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
    setAudioActivado(true)
    mostrarToast('exito', '🔔 Alarma de pedidos activada')
  }

  // ── WHATSAPP ──────────────────────────────────────────────
  const avisarPasajero = (viaje) => {
    const celular = String(viaje.celular_pasajero).replace(/\D/g, '')
    const celularWA = celular.startsWith('591') ? celular : `591${celular}`
    const tarifaBase = viaje.tarifa_base || 4
    const tarifaCobrar = parseFloat(tarifaFinal) || tarifaBase
    const tarifaSubio = tarifaCobrar > tarifaBase
    const linkCancelacion = `https://mototaxis-app.vercel.app/cancelar/${viaje.codigo}`

    const msg = tarifaSubio
      ? (
        `🏍️ ¡ACEPTE TU SOLICITUD!\n` +
        `🔖 ${viaje.codigo} — Tengo Chaleco ${conductor.color_chaleco}\n\n` +
        `⚠️ TARIFA: Bs. ${tarifaCobrar} (ajustada por distancia)⚠️\n\n` +
        `1.SI ✅ ESTAS DE ACUERDO con la tarifa comparte TU UBICACION en tiempo real 📎\n\n` +
        `2.🤝 ¿NEGOCIAR Tarifa? Envía tu oferta por este chat. Recuerda Tarifa mínima Bs. 4\n\n`+
        `3.NO ❌ estas de acuerdo escribe CANCELAR \n\n` +
        `❌ ¿Necesitas cancelar despues? 👇 ${linkCancelacion}` 
        
      )
      : (
        `🏍️ ¡Voy a recogerte!\n` +
        `🔖 Solicitud: ${viaje.codigo} — Chaleco ${conductor.color_chaleco}\n` +
        `💰 TARIFA: Bs. ${tarifaCobrar}\n\n` +
        `Comparte tu ubicación en tiempo real aquí 📎\n\n` +
        `❌ Cancelar en cualquier momento: ${linkCancelacion}`
      )

    window.open(`https://wa.me/${celularWA}?text=${encodeURIComponent(msg)}`, '_blank')
  }

  // ── CARGAR VIAJES ─────────────────────────────────────────
  const cargarViajes = useCallback(async () => {
    if (!conductor) return
    setCargandoViajes(true)
    try {
      const todos = await getViajesHoy(conductor.asociacion_id)

      const pendientes = todos.filter(v =>
        v.estado === 'notificado' &&
        v.tipo_vehiculo === conductor.tipo_vehiculo &&
        (v.asociaciones_notificadas || '').includes(conductor.asociacion_id) &&
        !viajesIgnorados.includes(v.codigo)
      )

      const miViaje = todos.find(v =>
        v.conductor_id === conductor.id &&
        ['asignado', 'en_camino'].includes(v.estado)
      )

      const codigosAnteriores = viajesAnterioresRef.current.map(v => v.codigo)
      const hayNueva = pendientes.some(v => !codigosAnteriores.includes(v.codigo))
      if (hayNueva && pendientes.length > 0) {
        iniciarAlarma()
      } else if (pendientes.length === 0) {
        detenerAlarma()
      }

      viajesAnterioresRef.current = pendientes
      setViajes(pendientes)

      if (miViaje) {
        setViajeAsignado(miViaje)
        if (!tarifaModificadaRef.current) {
          setTarifaFinal(String(miViaje.tarifa_base || 4))
        }
      } else {
        setViajeAsignado(null)
        tarifaModificadaRef.current = false
      }

      setUltimoRefresh(new Date())

    } catch (err) {
      mostrarToast('error', 'Error al cargar viajes: ' + err.message)
    } finally {
      setCargandoViajes(false)
    }
  }, [conductor, viajesIgnorados, audioActivado])

  // ── AUTO REFRESH ──────────────────────────────────────────
  useEffect(() => {
    if (!conductor || !sesionVerificada) return
    cargarViajes()
    const intervalo = viajes.length > 0 ? INTERVALO_ACTIVO : INTERVALO_BASE
    intervaloRef.current = setInterval(() => {
      if (!viajeAsignado) cargarViajes()
    }, intervalo)
    return () => clearInterval(intervaloRef.current)
  }, [conductor, sesionVerificada, cargarViajes, viajeAsignado, viajes.length])

  useEffect(() => {
    if (!sesionVerificada) return
    
    window.history.pushState(null, '', window.location.href)
    
    const handlePopState = () => {
      const confirmar = window.confirm('¿Deseas cerrar sesión y salir del panel?')
      if (confirmar) {
        cerrarSesion()
      } else {
        window.history.pushState(null, '', window.location.href)
      }
    }
    
    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [sesionVerificada])

  // ── CLEANUP ───────────────────────────────────────────────
  useEffect(() => {
    return () => {
      if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current)
      detenerAlarma()
    }
  }, [])

  // ── CAMBIAR ESTADO ────────────────────────────────────────
  const cambiarEstado = async (nuevoEstado) => {
    if (actualizando) return
    setActualizando(true)
    try {
      await actualizarEstadoConductor(conductor.id, conductor.sheet_id, nuevoEstado)
      setConductor(prev => ({ ...prev, estado: nuevoEstado }))
      // Actualizar sesión en localStorage
      const sesion = JSON.parse(localStorage.getItem('conductorSesion'))
      sesion.conductor.estado = nuevoEstado
      localStorage.setItem('conductorSesion', JSON.stringify(sesion))
      mostrarToast('exito', `Estado actualizado: ${nuevoEstado}`)
    } catch (err) {
      mostrarToast('error', err.message)
    } finally {
      setActualizando(false)
    }
  }

  // ── ACEPTAR ───────────────────────────────────────────────
  const handleAceptar = async (viaje) => {
    if (actualizando) return
    detenerAlarma()
    setActualizando(true)
    try {
      await aceptarSolicitud(viaje.codigo, conductor.id, conductor.asociacion_id)
      await actualizarEstadoConductor(conductor.id, conductor.sheet_id, 'ocupado')
      setConductor(prev => ({ ...prev, estado: 'ocupado' }))
      setViajeAsignado({ ...viaje, conductor_id: conductor.id, estado: 'asignado' })
      tarifaModificadaRef.current = false
      setTarifaFinal(String(viaje.tarifa_base || 4))
      setViajes([])
      mostrarToast('exito', '¡Viaje aceptado! Avisa al pasajero por WhatsApp.')
    } catch (err) {
      if (err.message?.includes('ya_asignado')) {
        mostrarToast('error', 'Otro conductor aceptó primero.')
        cargarViajes()
      } else {
        mostrarToast('error', err.message)
      }
    } finally {
      setActualizando(false)
    }
  }

  // ── COMPLETAR ─────────────────────────────────────────────
  const handleCompletar = async () => {
    if (!viajeAsignado || actualizando) return

    const confirmar = window.confirm(
      `¿Completar el viaje?\n\nTarifa cobrada: Bs. ${tarifaFinal}\n\nAsegúrate de haber recogido al pasajero antes de confirmar.`
    )
    if (!confirmar) return

    setActualizando(true)
    try {
      const tarifa = parseFloat(tarifaFinal) || 4
      await completarViaje(viajeAsignado.codigo, tarifa, conductor.sheet_id)
      const viajesCompletados = (conductor.viajes_completados || 0) + 1
      setConductor(prev => ({ ...prev, estado: 'disponible', viajes_completados: viajesCompletados }))
      tarifaModificadaRef.current = false
      setResumenCompletado({
        codigo: viajeAsignado.codigo,
        celular: viajeAsignado.celular_pasajero,
        zona: viajeAsignado.uv_origen,
        tarifa,
        viajesHoy: viajesCompletados,
      })
      setViajeAsignado(null)
      cargarViajes()
    } catch (err) {
      mostrarToast('error', err.message)
    } finally {
      setActualizando(false)
    }
  }

  // ── CANCELAR ──────────────────────────────────────────────
  const handleCancelar = async () => {
    if (!viajeAsignado || actualizando) return
    const confirmar = window.confirm('¿Cancelar este viaje? Esto quedará registrado.')
    if (!confirmar) return

    const celular = String(viajeAsignado.celular_pasajero).replace(/\D/g, '')
    const celularWA = celular.startsWith('591') ? celular : `591${celular}`
    const mensaje = encodeURIComponent(
      `❌ Lo sentimos, el conductor no pudo tomar tu viaje.\n\n` +
      `🔖 Solicitud: ${viajeAsignado.codigo}\n\n` +
      `Por favor vuelve a solicitar un mototaxi desde la app.`
    )
    window.open(`https://wa.me/${celularWA}?text=${mensaje}`, '_blank')

    setActualizando(true)
    try {
      await cancelarSolicitud(viajeAsignado.codigo, 'conductor')
      await actualizarEstadoConductor(conductor.id, conductor.sheet_id, 'disponible')
      setConductor(prev => ({ ...prev, estado: 'disponible' }))
      tarifaModificadaRef.current = false
      setViajeAsignado(null)
      mostrarToast('error', 'Viaje cancelado.')
      cargarViajes()
    } catch (err) {
      mostrarToast('error', err.message)
    } finally {
      setActualizando(false)
    }
  }

  // ── GUARDS ────────────────────────────────────────────────
  if (cargando) {
    return (
      <div className="conductor-app">
        <div className="loading-screen">
          <div className="spinner" />
          <p>Cargando panel...</p>
        </div>
      </div>
    )
  }

  // ── PANTALLA LOGIN ────────────────────────────────────────
  if (!sesionVerificada) {
    return (
      <div className="conductor-app">
        <div className="conductor-header">
          <div className="conductor-header-left">
            <span className="conductor-header-icon">🏍️</span>
            <div>
              <h1>Panel Conductor</h1>
              <p>Ingresa tus credenciales</p>
            </div>
          </div>
        </div>

        <div className="conductor-body">
          <div className="card">
            <p className="card-titulo">Acceso al panel</p>

            <div className="campo-login">
              <label>Número de celular</label>
              <input
                className="input-login"
                type="tel"
                placeholder="Ej: 60605127"
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
                <button
                  className="btn-ver-pin"
                  onClick={() => setVerPin(v => !v)}
                  type="button"
                >
                  {verPin ? '🙈' : '👁️'}
                </button>
              </div>
            </div>

            {loginError && (
              <div className="mensaje error">{loginError}</div>
            )}

            <button
              className="btn-completar"
              onClick={handleLogin}
              disabled={loginCargando}
            >
              {loginCargando
                ? <><span className="spinner-sm" />Verificando...</>
                : '🔐 Ingresar al panel'
              }
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ── RESUMEN COMPLETADO ────────────────────────────────────
  if (resumenCompletado) {
    return (
      <div className="conductor-app">
        <div className="resumen-screen">
          <div className="resumen-icon">✅</div>
          <h2 className="resumen-titulo">¡Viaje completado!</h2>
          <div className="resumen-card">
            <div className="resumen-fila">
              <span className="resumen-label">Código</span>
              <span className="resumen-valor naranja">{resumenCompletado.codigo}</span>
            </div>
            <div className="resumen-fila">
              <span className="resumen-label">Pasajero</span>
              <span className="resumen-valor">{resumenCompletado.celular}</span>
            </div>
            <div className="resumen-fila">
              <span className="resumen-label">Zona</span>
              <span className="resumen-valor">{resumenCompletado.zona}</span>
            </div>
            <div className="resumen-fila">
              <span className="resumen-label">Tarifa cobrada</span>
              <span className="resumen-valor verde">Bs. {resumenCompletado.tarifa}</span>
            </div>
            <div className="resumen-fila">
              <span className="resumen-label">Viajes completados</span>
              <span className="resumen-valor verde">{resumenCompletado.viajesHoy}</span>
            </div>
          </div>
          <button className="btn-solicitar" onClick={() => setResumenCompletado(null)}>
            Volver al panel
          </button>
        </div>
      </div>
    )
  }

  // ── RENDER PRINCIPAL ──────────────────────────────────────
  return (
    <div className="conductor-app">

      <div className="conductor-header">
        <div className="conductor-header-left">
          <span className="conductor-header-icon">🏍️</span>
          <div>
            <h1>{conductor.nombre}</h1>
            <p>{conductor.asociacion_nombre} · {conductor.tipo_vehiculo}</p>
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
          <span className={`estado-badge ${conductor.estado}`}>
            {conductor.estado}
          </span>
          <button className="btn-cerrar-sesion" onClick={cerrarSesion}>
            Cerrar sesión
          </button>
        </div>
      </div>

      <div className="conductor-body">

        {toast && (
          <div className={`mensaje-toast ${toast.tipo}`}>{toast.texto}</div>
        )}

        {!audioActivado && (
          <button className="btn-activar-alarma" onClick={activarAudio}>
            🔔 Toca aquí para activar la alarma de pedidos
          </button>
        )}

        {/* INFO */}
        <div className="card">
          <p className="card-titulo">Mi información</p>
          <div className="conductor-info-grid">
            <div className="info-item">
              <label>ID</label>
              <span className="naranja">{conductor.id}</span>
            </div>
            <div className="info-item">
              <label>Chaleco</label>
              <span>{conductor.color_chaleco}</span>
            </div>
            <div className="info-item">
              <label>Viajes completados</label>
              <span className="verde">{conductor.viajes_completados}</span>
            </div>
            <div className="info-item">
              <label>Cancelaciones (30d)</label>
              <span>{conductor.cancelaciones_30d}</span>
            </div>
          </div>
        </div>

        {/* DISPONIBILIDAD */}
        <div className="disponibilidad-section">
          <p className="seccion-titulo">Mi disponibilidad</p>
          <div className="toggle-disponibilidad">
            <button
              className={`btn-disponible ${conductor.estado === 'disponible' ? 'activo' : ''}`}
              onClick={() => cambiarEstado('disponible')}
              disabled={actualizando || conductor.estado === 'disponible' || !!viajeAsignado}
            >
              ✅ Disponible
            </button>
            <button
              className={`btn-ocupado ${conductor.estado === 'ocupado' ? 'activo' : ''}`}
              onClick={() => cambiarEstado('ocupado')}
              disabled={actualizando || conductor.estado === 'ocupado' || !!viajeAsignado}
            >
              🔴 Ocupado
            </button>
          </div>
        </div>

        {/* VIAJE ASIGNADO */}
        {viajeAsignado && (
          <div className="viaje-asignado-card">
            <p className="viaje-asignado-titulo">🟢 Viaje en curso</p>
            <div className="viaje-datos">
              <div className="viaje-fila">
                <span className="viaje-fila-icon">📍</span>
                <span className="viaje-fila-texto">
                  <strong>{viajeAsignado.uv_origen}</strong><br />
                  {viajeAsignado.referencia_origen}
                </span>
              </div>
              {viajeAsignado.destino_referencia && (
                <div className="viaje-fila">
                  <span className="viaje-fila-icon">🏁</span>
                  <span className="viaje-fila-texto">{viajeAsignado.destino_referencia}</span>
                </div>
              )}
              <div className="viaje-fila">
                <span className="viaje-fila-icon">📱</span>
                <span className="viaje-fila-texto">{viajeAsignado.celular_pasajero}</span>
              </div>
            </div>

            <button
              className="btn-whatsapp-pasajero"
              onClick={() => avisarPasajero(viajeAsignado)}
            >
              📍 Avisar al pasajero y compartir ubicación
            </button>

            <div className="tarifa-input-group">
              <label>Tarifa final (Bs.)</label>
              <input
                className="tarifa-input"
                type="number"
                min="4"
                value={tarifaFinal}
                onChange={e => {
                  tarifaModificadaRef.current = true
                  setTarifaFinal(e.target.value)
                }}
              />
            </div>

            <button
              className="btn-completar"
              onClick={handleCompletar}
              disabled={actualizando}
            >
              {actualizando
                ? <><span className="spinner-sm" />Procesando...</>
                : '✅ Marcar como completado'
              }
            </button>
            <button
              className="btn-cancelar-viaje"
              onClick={handleCancelar}
              disabled={actualizando}
            >
              Cancelar viaje
            </button>
          </div>
        )}

        {/* VIAJES PENDIENTES */}
        {!viajeAsignado && (
          <div className="viajes-section">
            <div className="viajes-header">
              <p className="seccion-titulo">
                Solicitudes disponibles {viajes.length > 0 && `(${viajes.length})`}
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

            {cargandoViajes && viajes.length === 0 ? (
              <div className="empty-state">
                <span className="empty-icon">🔄</span>
                Buscando solicitudes...
              </div>
            ) : viajes.length === 0 ? (
              <div className="empty-state">
                <span className="empty-icon">🏍️</span>
                No hay solicitudes en tu zona ahora.<br />
                <span style={{ fontSize: '0.8rem', color: '#444' }}>
                  Última actualización: {ultimoRefresh?.toLocaleTimeString('es-BO', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) || '—'}
                </span>
              </div>
            ) : (
              viajes.map(viaje => (
                <div key={viaje.codigo} className="viaje-card">
                  <div className="viaje-card-header">
                    <span className="viaje-codigo">{viaje.codigo}</span>
                    <span className={`viaje-servicio ${viaje.tipo_servicio}`}>
                      {viaje.tipo_servicio === 'premium' ? '⭐ Premium' : 'Normal'}
                    </span>
                  </div>

                  <div className="viaje-datos">
                    <div className="viaje-fila">
                      <span className="viaje-fila-icon">📍</span>
                      <span className="viaje-fila-texto">
                        <strong>{viaje.uv_origen}</strong><br />
                        {viaje.referencia_origen}
                      </span>
                    </div>
                    {viaje.destino_referencia && (
                      <div className="viaje-fila">
                        <span className="viaje-fila-icon">🏁</span>
                        <span className="viaje-fila-texto">{viaje.destino_referencia}</span>
                      </div>
                    )}
                  </div>

                  <div className="viaje-tarifa">
                    <span>Tarifa base</span>
                    <strong>Bs. {viaje.tipo_servicio === 'premium' ? '5' : '4'}</strong>
                  </div>

                  <div className="viaje-acciones">
                    <button
                      className="btn-aceptar"
                      onClick={() => handleAceptar(viaje)}
                      disabled={actualizando || conductor.estado !== 'disponible'}
                    >
                      ✅ Aceptar
                    </button>
                    <button
                      className="btn-rechazar"
                      onClick={() => {
                        detenerAlarma()
                        setViajesIgnorados(prev => [...prev, viaje.codigo])
                      }}
                      disabled={actualizando}
                    >
                      Ignorar
                    </button>
                  </div>

                  {conductor.estado !== 'disponible' && (
                    <p style={{ fontSize: '0.75rem', color: '#666', textAlign: 'center' }}>
                      Márcate como disponible para aceptar viajes.
                    </p>
                  )}
                </div>
              ))
            )}
          </div>
        )}

      </div>
    </div>
  )
}