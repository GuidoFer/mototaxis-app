import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { getViaje, cancelarSolicitud } from '../services/api'
import '../styles/CancelarViaje.css'

export default function CancelarViaje() {
  const { codigo } = useParams()
  const navigate = useNavigate()

  const [viaje, setViaje] = useState(null)
  const [cargando, setCargando] = useState(true)
  const [cancelando, setCancelando] = useState(false)
  const [cancelado, setCancelado] = useState(false)
  const [linkWhatsapp, setLinkWhatsapp] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    getViaje(codigo)
      .then(data => setViaje(data))
      .catch(() => setError('No encontramos este viaje.'))
      .finally(() => setCargando(false))
  }, [codigo])

  const handleCancelar = async () => {
    const confirmar = window.confirm('¿Seguro que quieres cancelar tu viaje?')
    if (!confirmar) return

    setCancelando(true)
    try {
      await cancelarSolicitud(codigo, 'pasajero')

      // Armar link WhatsApp directo al conductor si hay celular registrado
      if (viaje.celular_conductor) {
        const celular = String(viaje.celular_conductor).replace(/\D/g, '')
        const celularWA = celular.startsWith('591') ? celular : `591${celular}`
        const msg = encodeURIComponent(
          `❌ Cancelé el viaje ${codigo}.\n\n` +
          `Ya puedes tomar otro viaje.`
        )
        setLinkWhatsapp(`https://wa.me/${celularWA}?text=${msg}`)
      }

      setCancelado(true)
    } catch (err) {
      setError(err.message)
    } finally {
      setCancelando(false)
    }
  }

  const yaFinalizado = viaje && ['completado', 'cancelado_pasajero', 'cancelado_conductor'].includes(viaje.estado)

  return (
    <div className="cancelar-app">

      {cargando && <div className="spinner" />}

      {error && (
        <>
          <div className="cancelar-icon">⚠️</div>
          <h2 className="cancelar-titulo">Viaje no encontrado</h2>
          <p className="cancelar-desc">{error}</p>
        </>
      )}

      {!cargando && !error && cancelado && (
        <>
          <div className="cancelar-icon">✅</div>
          <h2 className="cancelar-titulo">Viaje cancelado</h2>
          <div className="cancelar-codigo">{codigo}</div>
          {linkWhatsapp && (
            <a
              href={linkWhatsapp}
              target="_blank"
              rel="noreferrer"
              className="btn-cancelar-final"
              style={{ textDecoration: 'none', textAlign: 'center', display: 'block', background: '#25d366' }}
            >
              📲 Avisar al conductor por WhatsApp
            </a>
          )}
        </>
      )}

      {!cargando && !error && !cancelado && yaFinalizado && (
        <>
          <div className="cancelar-icon">
            {viaje.estado === 'completado' ? '⭐' : '❌'}
          </div>
          <h2 className="cancelar-titulo">
            {viaje.estado === 'completado' ? '¡Viaje completado!' : 'Viaje ya cancelado'}
          </h2>
          <span className={`estado-badge ${viaje.estado === 'completado' ? 'completado' : 'ya-cancelado'}`}>
            {viaje.estado}
          </span>
          <p className="cancelar-desc">Este viaje ya no puede ser cancelado.</p>
        </>
      )}

      {!cargando && !error && !cancelado && !yaFinalizado && viaje && (
        <>
          <div className="cancelar-icon">🏍️</div>
          <h2 className="cancelar-titulo">¿Cancelar tu viaje?</h2>
          <div className="cancelar-codigo">{codigo}</div>
          <p className="cancelar-desc">
            Si cancelas, tu conductor será notificado por WhatsApp.
          </p>
          <button
            className="btn-cancelar-final"
            onClick={handleCancelar}
            disabled={cancelando}
          >
            {cancelando ? 'Cancelando...' : '❌ Sí, cancelar mi viaje'}
          </button>
          
        </>
      )}

    </div>
  )
}