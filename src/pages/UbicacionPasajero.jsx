import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { getViajePorToken, guardarUbicacionToken } from '../services/api'
import '../styles/UbicacionPasajero.css'

export default function UbicacionPasajero() {
  const { token } = useParams()

  const [estado, setEstado] = useState('cargando') // cargando | listo | detectando | completado | error
  const [viaje, setViaje] = useState(null)
  const [mensaje, setMensaje] = useState(null)

  useEffect(() => {
    getViajePorToken(token)
      .then(data => {
        setViaje(data)
        // Si ya tiene ubicación guardada
        if (data.lat_pasajero && data.lng_pasajero) {
          setEstado('completado')
        } else {
          setEstado('listo')
        }
      })
      .catch(() => setEstado('error'))
  }, [token])

  const handleCompartirUbicacion = () => {
    if (!navigator.geolocation) {
      setMensaje('Tu dispositivo no soporta geolocalización.')
      return
    }

    setEstado('detectando')

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords
        try {
          await guardarUbicacionToken(token, latitude, longitude)
          setEstado('completado')
        } catch (err) {
          setEstado('listo')
          setMensaje('Error al guardar ubicación. Intenta de nuevo.')
        }
      },
      () => {
        setEstado('listo')
        setMensaje('No se pudo acceder a tu ubicación. Verifica los permisos.')
      },
      { timeout: 10000, enableHighAccuracy: true }
    )
  }

  return (
    <div className="ubicacion-app">

      <div className="ubicacion-header">
        <span className="ubicacion-header-icon">🚕</span>
        <div>
          <h1>Compartir ubicación</h1>
          {viaje && <p>{viaje.asociacion_nombre || 'Radio Taxi'}</p>}
        </div>
      </div>

      <div className="ubicacion-body">

        {estado === 'cargando' && (
          <div className="ubicacion-estado">
            <div className="ubicacion-spinner" />
            <p>Verificando solicitud...</p>
          </div>
        )}

        {estado === 'error' && (
          <div className="ubicacion-estado">
            <div className="ubicacion-icon">⚠️</div>
            <h2>Link no válido</h2>
            <p>Este link no existe o ya expiró. Contacta a tu operadora.</p>
          </div>
        )}

        {estado === 'listo' && (
          <div className="ubicacion-estado">
            <div className="ubicacion-icon">📍</div>
            <h2>¿Dónde estás?</h2>
            <p>Toca el botón para compartir tu ubicación con el conductor.</p>
            {viaje && (
              <div className="ubicacion-viaje-info">
                <span>📋 Código: <strong>{viaje.codigo}</strong></span>
                {viaje.destino_referencia && (
                  <span>🏁 Destino: <strong>{viaje.destino_referencia}</strong></span>
                )}
              </div>
            )}
            {mensaje && <p className="ubicacion-error">{mensaje}</p>}
            <button className="ubicacion-btn" onClick={handleCompartirUbicacion}>
              📍 Compartir mi ubicación
              <span className="ubicacion-btn-sub">Solo toca este botón — es rápido y fácil</span>
            </button>
          </div>
        )}

        {estado === 'detectando' && (
          <div className="ubicacion-estado">
            <div className="ubicacion-spinner" />
            <p>Detectando tu ubicación...</p>
            <p style={{ fontSize: '0.8rem', color: '#888' }}>Puede tardar unos segundos.</p>
          </div>
        )}

        {estado === 'completado' && (
          <div className="ubicacion-estado">
            <div className="ubicacion-icon">✅</div>
            <h2>¡Ubicación compartida!</h2>
            <p>El conductor ya sabe dónde recogerte. Espera su mensaje por WhatsApp.</p>
            {viaje && (
              <div className="ubicacion-viaje-info">
                <span>📋 Código: <strong>{viaje.codigo}</strong></span>
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  )
}