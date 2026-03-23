import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { getAsociacionesCercanas } from '../services/api'
import '../styles/DirectorioTaxis.css'

export default function DirectorioTaxis() {
  const { ciudad } = useParams()
  const navigate = useNavigate()

  const [gpsEstado, setGpsEstado] = useState('idle')
  const [sindicatos, setSindicatos] = useState([])
  const [error, setError] = useState(null)
  const gpsTimeoutRef = useRef(null)

  const detectarUbicacion = () => {
    if (!navigator.geolocation) {
      setGpsEstado('error')
      setError('Tu dispositivo no soporta geolocalización.')
      return
    }

    setGpsEstado('detectando')

    gpsTimeoutRef.current = setTimeout(() => {
      setGpsEstado('error')
      setError('No se pudo detectar tu ubicación. Intenta de nuevo.')
    }, 8000)

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        clearTimeout(gpsTimeoutRef.current)
        const { latitude, longitude } = position.coords

        try {
          const cercanos = await getAsociacionesCercanas(latitude, longitude, 'taxi')
          setSindicatos(cercanos)
          setGpsEstado('detectado')
        } catch (err) {
          setGpsEstado('error')
          setError('No hay sindicatos de taxis cercanos a tu ubicación.')
        }
      },
      () => {
        clearTimeout(gpsTimeoutRef.current)
        setGpsEstado('error')
        setError('No se pudo acceder a tu ubicación. Verifica los permisos.')
      },
      { timeout: 8000, enableHighAccuracy: false }
    )
  }

  useEffect(() => {
    return () => clearTimeout(gpsTimeoutRef.current)
  }, [])

  return (
    <div className="directorio-app">

      <div className="directorio-header">
        <span className="directorio-header-icon">🚕</span>
        <div>
          <h1 className="directorio-header-titulo">Pedir Taxi</h1>
          <p className="directorio-header-sub">{ciudad || 'El Alto'}</p>
        </div>
      </div>

      <div className="directorio-body">

        {gpsEstado === 'idle' && (
          <button className="directorio-btn-gps" onClick={detectarUbicacion}>
            📍 Detectar mi ubicación
            <span className="directorio-btn-gps-sub">
              Usamos tu ubicación solo para encontrar taxis cercanos
            </span>
          </button>
        )}

        {gpsEstado === 'detectando' && (
          <div className="directorio-detectando">
            <div className="directorio-spinner" />
            <p>Detectando ubicación...</p>
          </div>
        )}

        {gpsEstado === 'error' && (
          <div className="directorio-error">
            <p>{error}</p>
            <button className="directorio-btn-reintentar" onClick={() => {
              setGpsEstado('idle')
              setError(null)
            }}>
              Reintentar
            </button>
          </div>
        )}

        {gpsEstado === 'detectado' && sindicatos.length > 0 && (
          <>
            <p className="directorio-subtitulo">Sindicatos cercanos a ti</p>
            {sindicatos.map(s => (
              <div key={s.asociacion_id} className="directorio-sindicato-card">
                <div className="directorio-sindicato-info">
                  <span className="directorio-sindicato-nombre">{s.asociacion_nombre}</span>
                  <span className="directorio-sindicato-distancia">
                    📍 A {s.distancia_metros === 0 ? 'menos de 100' : s.distancia_metros} metros
                  </span>
                </div>
                <button
                  className="directorio-btn-elegir"
                  onClick={() => navigate(`/taxi/${ciudad}/${s.asociacion_id}`, {
                    state: { sindicato: s }
                  })}
                >
                  Elegir →
                </button>
              </div>
            ))}
          </>
        )}

      </div>
    </div>
  )
}