import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  verificarConductor,
  getViajesHoy,
  crearViaje,
  enviarOferta,
  elegirOferta,
  getConductoresActivos,
  cancelarSolicitud
} from '../services/api'
import '../styles/OperadoraPanel.css'

const INTERVALO_REFRESH = 10000
const SESION_DURACION = 12 * 60 * 60 * 1000

export default function OperadoraPanel() {
  const { ciudad } = useParams()

  // ── LOGIN ─────────────────────────────────────────────────
  const [celularInput, setCelularInput] = useState('')
  const [pinInput, setPinInput] = useState('')
  const [verPin, setVerPin] = useState(false)
  const [loginCargando, setLoginCargando] = useState(false)
  const [loginError, setLoginError] = useState(null)
  const [sesionVerificada, setSesionVerificada] = useState(false)
  const [operadora, setOperadora] = useState(null)
  const [cargando, setCargando] = useState(true)

  // ── SOLICITUDES ───────────────────────────────────────────
  const [solicitudes, setSolicitudes] = useState([])
  const [cargandoSolicitudes, setCargandoSolicitudes] = useState(false)
  const [ultimoRefresh, setUltimoRefresh] = useState(null)
  const [solicitudSeleccionada, setSolicitudSeleccionada] = useState(null)

  // ── CREAR SOLICITUD MANUAL ────────────────────────────────
  const [modoCrear, setModoCrear] = useState(false)
  const [formManual, setFormManual] = useState({
    celular: '',
    referencia: '',
    destino: '',
    tipo: 'whatsapp' // whatsapp | fija
  })
  const [creando, setCreando] = useState(false)
  const [mensajeForm, setMensajeForm] = useState(null)

  // ── ASIGNAR ───────────────────────────────────────────────
  const [conductoresDisponibles, setConductoresDisponibles] = useState([])
  const [tarifaAsignar, setTarifaAsignar] = useState('')
  const [asignando, setAsignando] = useState(false)

  // ── TOAST ─────────────────────────────────────────────────
  const [toast, setToast] = useState(null)
  const toastTimeoutRef = useRef(null)
  const intervaloRef = useRef(null)

  // ── VERIFICAR SESIÓN ──────────────────────────────────────
  useEffect(() => {
    try {
      const sesionGuardada = localStorage.getItem('operadoraSesion')
      if (sesionGuardada) {
        const sesion = JSON.parse(sesionGuardada)
        if (sesion.expira > Date.now()) {
          setOperadora(sesion.operadora)
          setSesionVerificada(true)
          setCargando(false)
          return
        } else {
          localStorage.removeItem('operadoraSesion')
        }
      }
    } catch (e) {}
    setCargando(false)
  }, [])

  // ── INTERCEPTAR BOTÓN ATRÁS ───────────────────────────────
  useEffect(() => {
    if (!sesionVerificada) return
    window.history.pushState(null, '', window.location.href)
    const handlePopState = () => {
      if (modoCrear) {
        setModoCrear(false)
        window.history.pushState(null, '', window.location.href)
        return
      }
      if (solicitudSeleccionada) {
        setSolicitudSeleccionada(null)
        setConductoresDisponibles([])
        setTarifaAsignar('')
        window.history.pushState(null, '', window.location.href)
        return
      }
      const confirmar = window.confirm('¿Deseas cerrar sesión y salir del panel?')
      if (confirmar) cerrarSesion()
      else window.history.pushState(null, '', window.location.href)
    }
    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [sesionVerificada, modoCrear, solicitudSeleccionada])

  // ── LOGIN ─────────────────────────────────────────────────
  const handleLogin = async () => {
    setLoginError(null)
    if (!celularInput.trim()) return setLoginError('Ingresa tu número de celular.')
    if (!pinInput.trim()) return setLoginError('Ingresa tu PIN.')
    setLoginCargando(true)
    try {
      const data = await verificarConductor(celularInput.trim(), pinInput.trim())
      if (data.tipo_vehiculo !== 'operadora') {
        throw new Error('Este acceso es solo para operadoras.')
      }
      const sesion = { operadora: data, expira: Date.now() + SESION_DURACION }
      localStorage.setItem('operadoraSesion', JSON.stringify(sesion))
      setOperadora(data)
      setSesionVerificada(true)
    } catch (err) {
      setLoginError(err.message)
    } finally {
      setLoginCargando(false)
    }
  }

  const cerrarSesion = () => {
    localStorage.removeItem('operadoraSesion')
    setOperadora(null)
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

  // ── CARGAR SOLICITUDES ────────────────────────────────────
  const cargarSolicitudes = useCallback(async () => {
    if (!operadora) return
    setCargandoSolicitudes(true)
    try {
        const todos = await getViajesHoy(operadora.asociacion_id)
        const activas = todos.filter(v =>
          ['notificado', 'asignado', 'pendiente_operadora'].includes(v.estado) &&
          (v.asociaciones_notificadas || '').includes(operadora.asociacion_id) &&
          v.origen === 'operadora'
        )
        setSolicitudes(activas)
        setUltimoRefresh(new Date())
    } catch (err) {
        mostrarToast('error', 'Error al cargar solicitudes.')
    } finally {
        setCargandoSolicitudes(false)
    }
    }, [operadora])

  // ── AUTO REFRESH ──────────────────────────────────────────
  useEffect(() => {
    if (!operadora || !sesionVerificada) return
    cargarSolicitudes()
    intervaloRef.current = setInterval(cargarSolicitudes, INTERVALO_REFRESH)
    return () => clearInterval(intervaloRef.current)
  }, [operadora, sesionVerificada, cargarSolicitudes])

  // ── CLEANUP ───────────────────────────────────────────────
  useEffect(() => {
    return () => {
      if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current)
      clearInterval(intervaloRef.current)
    }
  }, [])

  // ── VER EN MAPS ───────────────────────────────────────────
  const verEnMaps = (lat, lng) => {
    window.open(`https://www.google.com/maps?q=${lat},${lng}`, '_blank')
  }

  // ── CREAR SOLICITUD MANUAL ────────────────────────────────
  const handleCrearManual = async () => {
    setMensajeForm(null)
    if (!formManual.referencia.trim()) return setMensajeForm({ tipo: 'error', texto: 'Ingresa la referencia del pasajero.' })
    if (!formManual.destino.trim()) return setMensajeForm({ tipo: 'error', texto: 'Ingresa el destino.' })
    if (formManual.tipo === 'whatsapp' && formManual.celular.replace(/\D/g, '').length < 8) {
      return setMensajeForm({ tipo: 'error', texto: 'Ingresa el número de celular del pasajero.' })
    }

    setCreando(true)
    try {
      // ===== GENERAR TOKEN ÚNICO PARA UBICACIÓN =====
      const token = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15)
      // ===============================================

      const resultado = await crearViaje({
        celular_pasajero: formManual.celular.replace(/\D/g, '') || '00000000',
        uv_origen: operadora.asociacion_id,
        tipo_vehiculo: 'taxi',
        tipo_servicio: 'normal',
        referencia_origen: formManual.referencia.trim(),
        destino_referencia: formManual.destino.trim(),
        origen: 'operadora',
        estado_inicial: 'pendiente_operadora',
        token_ubicacion: token  // ← AGREGADO
      })

      mostrarToast('exito', `Solicitud ${resultado.codigo} creada.`)
      setModoCrear(false)
      setFormManual({ celular: '', referencia: '', destino: '', tipo: 'whatsapp' })
      cargarSolicitudes()

      if (formManual.tipo === 'whatsapp' && formManual.celular.replace(/\D/g, '').length >= 8) {
        const celular = formManual.celular.replace(/\D/g, '')
        const celularWA = celular.startsWith('591') ? celular : `591${celular}`
        const msg = encodeURIComponent(
          `🚕 Hola, recibimos tu solicitud de taxi.\n\n` +
          `📋 Código: ${resultado.codigo}\n\n` +
          `Para que podamos recogerte, comparte tu ubicación tocando este link:\n` +
          `https://mototaxis-app.vercel.app/ubicacion/${token}\n\n` +
          `Solo toca el link y presiona un botón. ¡Es muy fácil!`
        )
        window.open(`https://wa.me/${celularWA}?text=${msg}`, '_blank')
      }

    } catch (err) {
      setMensajeForm({ tipo: 'error', texto: err.message })
    } finally {
      setCreando(false)
    }
  }

  // ===== MEJORA 3: Guard en cargarConductoresDisponibles =====
  const cargarConductoresDisponibles = async () => {
    if (!operadora) return
    console.log('cargando conductores - sheet_id:', operadora.sheet_id)
    try {
      const conductores = await getConductoresActivos(operadora.sheet_id)
      setConductoresDisponibles(conductores.filter(c =>
        c.estado === 'disponible' && c.tipo_vehiculo === 'taxi'
      ))
    } catch (err) {
      mostrarToast('error', 'Error al cargar conductores.')
    }
  }
  // ==========================================================

  // ── ASIGNAR CONDUCTOR ─────────────────────────────────────
  const handleAsignar = async (solicitud, conductorId) => {
    // ===== MEJORA 2: Validación de tarifa =====
    console.log('asignando:', solicitud.codigo, conductorId, tarifaAsignar)
    if (!tarifaAsignar || parseFloat(tarifaAsignar) <= 0) {
      return mostrarToast('error', 'Ingresa una tarifa válida mayor a 0.')
    }
    // ==========================================
    setAsignando(true)
    try {
      // Crear oferta del conductor y aceptarla directamente
      await enviarOferta(solicitud.codigo, conductorId, operadora.asociacion_id, parseFloat(tarifaAsignar))
      await elegirOferta(solicitud.codigo, conductorId)

      mostrarToast('exito', '✅ Conductor asignado correctamente.')
      setSolicitudSeleccionada(null)
      setTarifaAsignar('')
      cargarSolicitudes()
    } catch (err) {
      mostrarToast('error', err.message)
    } finally {
      setAsignando(false)
    }
  }

  // ── GUARDS ────────────────────────────────────────────────
  if (cargando) {
    return (
      <div className="operadora-app">
        <div className="operadora-loading">
          <div className="operadora-spinner" />
          <p>Cargando panel...</p>
        </div>
      </div>
    )
  }

  // ── PANTALLA LOGIN ────────────────────────────────────────
  if (!sesionVerificada) {
    return (
      <div className="operadora-app">
        <div className="operadora-header">
          <span className="operadora-header-icon">📋</span>
          <div>
            <h1>Panel Operadora</h1>
            <p>{ciudad || 'El Alto'}</p>
          </div>
        </div>
        <div className="operadora-body">
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

  // ── PANTALLA CREAR SOLICITUD MANUAL ──────────────────────
  if (modoCrear) {
    return (
      <div className="operadora-app">
        <div className="operadora-header">
          <button className="btn-cerrar-sesion" onClick={() => setModoCrear(false)}>← Volver</button>
          <h1>Nueva solicitud</h1>
        </div>
        <div className="operadora-body">
          <div className="card">

            <div className="campo-login">
              <label>Tipo de llamada</label>
              <div className="toggle-disponibilidad">
                <button
                  className={`btn-disponible ${formManual.tipo === 'whatsapp' ? 'activo' : ''}`}
                  onClick={() => setFormManual(p => ({ ...p, tipo: 'whatsapp' }))}
                >
                  💬 WhatsApp
                </button>
                <button
                  className={`btn-ocupado ${formManual.tipo === 'fija' ? 'activo' : ''}`}
                  onClick={() => setFormManual(p => ({ ...p, tipo: 'fija' }))}
                >
                  📞 Línea fija
                </button>
              </div>
            </div>

            {formManual.tipo === 'whatsapp' && (
              <div className="campo-login">
                <label>Celular del pasajero</label>
                <input
                  className="input-login"
                  type="tel"
                  placeholder="Ej: 70000000"
                  value={formManual.celular}
                  onChange={e => setFormManual(p => ({ ...p, celular: e.target.value.replace(/\D/g, '') }))}
                />
              </div>
            )}

            <div className="campo-login">
              <label>Referencia del pasajero</label>
              <input
                className="input-login"
                type="text"
                placeholder="Ej: Frente al mercado, puerta azul"
                value={formManual.referencia}
                onChange={e => setFormManual(p => ({ ...p, referencia: e.target.value }))}
              />
            </div>

            <div className="campo-login">
              <label>Destino</label>
              <input
                className="input-login"
                type="text"
                placeholder="Ej: Plaza Ballivián, Terminal"
                value={formManual.destino}
                onChange={e => setFormManual(p => ({ ...p, destino: e.target.value }))}
              />
            </div>

            {mensajeForm && <div className={`mensaje ${mensajeForm.tipo}`}>{mensajeForm.texto}</div>}

            <button className="btn-completar" onClick={handleCrearManual} disabled={creando}>
              {creando ? 'Creando...' : '✅ Crear solicitud'}
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ── PANTALLA ASIGNAR CONDUCTOR ────────────────────────────
  if (solicitudSeleccionada) {
    return (
      <div className="operadora-app">
        <div className="operadora-header">
          <button className="btn-cerrar-sesion" onClick={() => {
            setSolicitudSeleccionada(null)
            setConductoresDisponibles([])
            setTarifaAsignar('')
          }}>← Volver</button>
          <h1>Asignar conductor</h1>
        </div>
        <div className="operadora-body">

          <div className="card">
            <p className="card-titulo">{solicitudSeleccionada.codigo}</p>
            <div className="viaje-datos">
              <div className="viaje-fila">
                <span className="viaje-fila-icon">📍</span>
                <span className="viaje-fila-texto">{solicitudSeleccionada.referencia_origen}</span>
              </div>
              <div className="viaje-fila">
                <span className="viaje-fila-icon">🏁</span>
                <span className="viaje-fila-texto">{solicitudSeleccionada.destino_referencia}</span>
              </div>
              {solicitudSeleccionada.celular_pasajero && solicitudSeleccionada.celular_pasajero !== '00000000' && (
                <div className="viaje-fila">
                  <span className="viaje-fila-icon">📱</span>
                  <span className="viaje-fila-texto">{solicitudSeleccionada.celular_pasajero}</span>
                </div>
              )}
            </div>

            <div className="viaje-maps-btns">
              {solicitudSeleccionada.lat_pasajeros && solicitudSeleccionada.lng_pasajeros && (
                <button className="btn-maps" onClick={() => verEnMaps(solicitudSeleccionada.lat_pasajeros, solicitudSeleccionada.lng_pasajeros)}>
                  📍 Ver origen en Maps
                </button>
              )}
              {solicitudSeleccionada.lat_destino && solicitudSeleccionada.lng_destino && (
                <button className="btn-maps btn-maps-destino" onClick={() => verEnMaps(solicitudSeleccionada.lat_destino, solicitudSeleccionada.lng_destino)}>
                  🏁 Ver destino en Maps
                </button>
              )}
            </div>
          </div>

          <div className="campo-login">
            <label>Tarifa acordada (Bs.)</label>
            <input
              className="input-login"
              type="number"
              min="1"
              placeholder="Ej: 20"
              value={tarifaAsignar}
              onChange={e => setTarifaAsignar(e.target.value)}
            />
          </div>

          {conductoresDisponibles.length === 0 ? (
            <button className="btn-completar" onClick={cargarConductoresDisponibles}>
              🔄 Cargar conductores disponibles
            </button>
          ) : (
            <>
              <p className="seccion-titulo">Conductores disponibles</p>
              {conductoresDisponibles.map(c => (
                <div key={c.id} className="viaje-card">
                  <div className="viaje-datos">
                    <div className="viaje-fila">
                      <span className="viaje-fila-icon">👤</span>
                      <span className="viaje-fila-texto">
                        <strong>{c.nombre}</strong><br />
                        {c.modelo_vehiculo} — {c.color_vehiculo}<br />
                        Placa: {c.placa}
                      </span>
                    </div>
                  </div>
                  <button
                    className="btn-aceptar"
                    onClick={() => handleAsignar(solicitudSeleccionada, c.id)}
                    disabled={asignando}
                  >
                    {asignando ? '...' : 'Asignar'}
                  </button>
                </div>
              ))}
            </>
          )}

        </div>
      </div>
    )
  }

  // ── RENDER PRINCIPAL ──────────────────────────────────────
  return (
    <div className="operadora-app">

      <div className="operadora-header">
        <div className="operadora-header-left">
          <span className="operadora-header-icon">📋</span>
          <div>
            <h1>{operadora.nombre}</h1>
            <p>{operadora.asociacion_nombre}</p>
          </div>
        </div>
        <button className="btn-cerrar-sesion" onClick={cerrarSesion}>Cerrar sesión</button>
      </div>

      <div className="operadora-body">

        {toast && <div className={`mensaje-toast ${toast.tipo}`}>{toast.texto}</div>}

        {/* DASHBOARD */}
        <div className="operadora-dashboard">
          <div className="dashboard-item">
            <span className="dashboard-numero">{solicitudes.filter(s => s.estado === 'notificado').length}</span>
            <span className="dashboard-label">Pendientes</span>
          </div>
          <div className="dashboard-item">
            <span className="dashboard-numero">{solicitudes.filter(s => s.estado === 'asignado').length}</span>
            <span className="dashboard-label">En curso</span>
          </div>
        </div>

        {/* BOTONES ACCION */}
        <div style={{ display: 'flex', gap: '8px' }}>
          <button className="btn-completar" onClick={() => setModoCrear(true)}>
            ➕ Nueva solicitud
          </button>
          <button className="btn-refrescar" onClick={cargarSolicitudes} disabled={cargandoSolicitudes}>
            {cargandoSolicitudes ? '...' : '↻'}
          </button>
        </div>

        {ultimoRefresh && (
          <span className="ultimo-refresh">
            Actualizado: {ultimoRefresh.toLocaleTimeString('es-BO', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
          </span>
        )}

        {/* SOLICITUDES */}
        <p className="seccion-titulo">Solicitudes activas</p>

        {solicitudes.length === 0 ? (
          <div className="empty-state">
            <span className="empty-icon">📋</span>
            No hay solicitudes activas.
          </div>
        ) : (
          solicitudes.map(s => (
            <div key={s.codigo} className={`viaje-card ${s.estado === 'asignado' ? 'asignado' : ''}`}>
              <div className="viaje-card-header">
                <span className="viaje-codigo">{s.codigo}</span>
                <span className={`estado-badge ${s.estado}`}>{s.estado}</span>
              </div>
              <div className="viaje-datos">
                <div className="viaje-fila">
                  <span className="viaje-fila-icon">📍</span>
                  <span className="viaje-fila-texto">{s.referencia_origen}</span>
                </div>
                <div className="viaje-fila">
                  <span className="viaje-fila-icon">🏁</span>
                  <span className="viaje-fila-texto">{s.destino_referencia}</span>
                </div>
              </div>

              <div className="viaje-maps-btns">
                {s.lat_pasajeros && s.lng_pasajeros && (
                  <button className="btn-maps" onClick={() => verEnMaps(s.lat_pasajeros, s.lng_pasajeros)}>
                    📍 Ver origen en Maps
                  </button>
                )}
                {s.lat_destino && s.lng_destino && (
                  <button className="btn-maps btn-maps-destino" onClick={() => verEnMaps(s.lat_destino, s.lng_destino)}>
                    🏁 Ver destino en Maps
                  </button>
                )}
              </div>

              {['notificado', 'pendiente_operadora'].includes(s.estado) && (
                <button
                  className="btn-aceptar"
                  onClick={() => {
                    setSolicitudSeleccionada(s)
                    cargarConductoresDisponibles()
                  }}
                >
                  👤 Asignar conductor
                </button>
              )}

              {['notificado', 'pendiente_operadora'].includes(s.estado) && (
                <button
                  className="btn-cancelar-viaje"
                  onClick={async () => {
                    const confirmar = window.confirm(`¿Cancelar el viaje ${s.codigo}?`)
                    if (!confirmar) return
                    try {
                      await cancelarSolicitud(s.codigo, 'conductor')
                      mostrarToast('exito', 'Viaje cancelado.')
                      cargarSolicitudes()
                    } catch (err) {
                      mostrarToast('error', err.message)
                    }
                  }}
                >
                  ❌ Cancelar
                </button>
              )}

              {s.estado === 'asignado' && (
                <p style={{ fontSize: '0.78rem', color: '#2dc653', textAlign: 'center' }}>
                  Conductor asignado: {s.conductor_id}
                </p>
              )}
            </div>
          ))
        )}

      </div>
    </div>
  )
}