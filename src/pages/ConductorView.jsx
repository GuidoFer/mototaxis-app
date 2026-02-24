import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams } from 'react-router-dom'
import {
  getConductor,
  getViajesHoy,
  actualizarEstadoConductor,
  aceptarSolicitud,
  cancelarSolicitud,
  completarViaje,
} from '../services/api'
import '../styles/ConductorView.css'

const INTERVALO_REFRESH = 30000

export default function ConductorView() {
  const { id: conductorId } = useParams()

  const [conductor, setConductor] = useState(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState(null)

  const [viajes, setViajes] = useState([])
  const [cargandoViajes, setCargandoViajes] = useState(false)

  const [viajeAsignado, setViajeAsignado] = useState(null)
  const [tarifaFinal, setTarifaFinal] = useState('4')

  const [actualizando, setActualizando] = useState(false)
  const [toast, setToast] = useState(null)

  // FIX Punto 1: useRef para limpiar timeout correctamente
  const toastTimeoutRef = useRef(null)

  const mostrarToast = (tipo, texto) => {
    setToast({ tipo, texto })
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current)
    toastTimeoutRef.current = setTimeout(() => setToast(null), 4000)
  }

  useEffect(() => {
    return () => {
      if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current)
    }
  }, [])

  // Cargar conductor al montar
  useEffect(() => {
    getConductor(conductorId)
      .then(data => setConductor(data))
      .catch(err => setError(err.message))
      .finally(() => setCargando(false))
  }, [conductorId])

  // Cargar viajes pendientes
  const cargarViajes = useCallback(async () => {
    if (!conductor) return
    setCargandoViajes(true)
    try {
      const todos = await getViajesHoy(conductor.asociacion_id)

      // FIX Punto 2: filtrar también por tipo_vehiculo del conductor
      const pendientes = todos.filter(v =>
        v.estado === 'notificado' &&
        v.tipo_vehiculo === conductor.tipo_vehiculo &&
        (v.asociaciones_notificadas || '').includes(conductor.asociacion_id)
      )

      const miViaje = todos.find(v =>
        v.conductor_id === conductorId &&
        ['asignado', 'en_camino'].includes(v.estado)
      )

      setViajes(pendientes)
      setViajeAsignado(miViaje || null)
      if (miViaje) setTarifaFinal(String(miViaje.tarifa_base || 4))
    } catch (err) {
      mostrarToast('error', 'Error al cargar viajes: ' + err.message)
    } finally {
      setCargandoViajes(false)
    }
  }, [conductor, conductorId])

  // Auto-refresh — se detiene si hay viaje asignado
  useEffect(() => {
    if (!conductor) return
    cargarViajes()
    const intervalo = setInterval(() => {
      if (!viajeAsignado) cargarViajes()
    }, INTERVALO_REFRESH)
    return () => clearInterval(intervalo)
  }, [conductor, cargarViajes, viajeAsignado])

  // Cambiar disponibilidad
  const cambiarEstado = async (nuevoEstado) => {
    if (actualizando) return
    setActualizando(true)
    try {
      await actualizarEstadoConductor(conductorId, conductor.sheet_id, nuevoEstado)
      setConductor(prev => ({ ...prev, estado: nuevoEstado }))
      mostrarToast('exito', `Estado actualizado: ${nuevoEstado}`)
    } catch (err) {
      mostrarToast('error', err.message)
    } finally {
      setActualizando(false)
    }
  }

  // Aceptar viaje
  const handleAceptar = async (viaje) => {
    if (actualizando) return
    setActualizando(true)
    try {
      await aceptarSolicitud(viaje.codigo, conductorId, conductor.asociacion_id)
      await actualizarEstadoConductor(conductorId, conductor.sheet_id, 'ocupado')
      setConductor(prev => ({ ...prev, estado: 'ocupado' }))
      setViajeAsignado({ ...viaje, conductor_id: conductorId, estado: 'asignado' })
      setTarifaFinal(String(viaje.tarifa_base || 4))
      setViajes([])
      mostrarToast('exito', '¡Viaje aceptado! El pasajero fue notificado.')
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

  // Completar viaje
  const handleCompletar = async () => {
    if (!viajeAsignado || actualizando) return
    setActualizando(true)
    try {
      const tarifa = parseFloat(tarifaFinal) || 4
      await completarViaje(viajeAsignado.codigo, tarifa, conductor.sheet_id)
      setConductor(prev => ({ ...prev, estado: 'disponible' }))
      setViajeAsignado(null)
      mostrarToast('exito', `¡Viaje completado! Tarifa registrada: Bs. ${tarifa}`)
      cargarViajes()
    } catch (err) {
      mostrarToast('error', err.message)
    } finally {
      setActualizando(false)
    }
  }

  // Cancelar viaje
  const handleCancelar = async () => {
    if (!viajeAsignado || actualizando) return
    const confirmar = window.confirm('¿Cancelar este viaje? Esto quedará registrado.')
    if (!confirmar) return
    setActualizando(true)
    try {
      await cancelarSolicitud(viajeAsignado.codigo, 'conductor')
      await actualizarEstadoConductor(conductorId, conductor.sheet_id, 'disponible')
      setConductor(prev => ({ ...prev, estado: 'disponible' }))
      setViajeAsignado(null)
      mostrarToast('error', 'Viaje cancelado. El pasajero fue notificado.')
      cargarViajes()
    } catch (err) {
      mostrarToast('error', err.message)
    } finally {
      setActualizando(false)
    }
  }

  // ── Guards ────────────────────────────────────────────────
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

  if (error) {
    return (
      <div className="conductor-app">
        <div className="error-screen">
          <span style={{ fontSize: '2.5rem' }}>⚠️</span>
          <p>{error}</p>
          <p style={{ color: '#666', fontSize: '0.8rem' }}>Verifica tu ID de conductor.</p>
        </div>
      </div>
    )
  }

  // ── Render ────────────────────────────────────────────────
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
        <span className={`estado-badge ${conductor.estado}`}>
          {conductor.estado}
        </span>
      </div>

      <div className="conductor-body">

        {toast && (
          <div className={`mensaje-toast ${toast.tipo}`}>{toast.texto}</div>
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

            <div className="tarifa-input-group">
              <label>Tarifa final (Bs.)</label>
              <input
                className="tarifa-input"
                type="number"
                min="4"
                value={tarifaFinal}
                onChange={e => setTarifaFinal(e.target.value)}
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
              <button
                className="btn-refrescar"
                onClick={cargarViajes}
                disabled={cargandoViajes}
              >
                {cargandoViajes ? '...' : '↻ Actualizar'}
              </button>
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
                  Se actualiza automáticamente cada 30 seg.
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
                    <div className="viaje-fila">
                      <span className="viaje-fila-icon">🚗</span>
                      <span className="viaje-fila-texto" style={{ textTransform: 'capitalize' }}>
                        {viaje.tipo_vehiculo}
                      </span>
                    </div>
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
                      onClick={() => mostrarToast('error', 'Solicitud ignorada.')}
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