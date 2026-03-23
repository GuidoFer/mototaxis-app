import { useState } from 'react'
import { useParams, useLocation, useNavigate } from 'react-router-dom'
import { crearViaje } from '../services/api'
import '../styles/SindicatoDetalle.css'

export default function SindicatoDetalle() {
  const { ciudad, asociacionId } = useParams()
  const { state } = useLocation()
  const navigate = useNavigate()

  const sindicato = state?.sindicato

  const [modo, setModo] = useState(null) // null | 'formulario'
  const [referenciaOrigen, setReferenciaOrigen] = useState('')
  const [destinoReferencia, setDestinoReferencia] = useState('')
  const [celularPasajero, setCelularPasajero] = useState('')
  const [cargando, setCargando] = useState(false)
  const [mensaje, setMensaje] = useState(null)
  const [solicitudExitosa, setSolicitudExitosa] = useState(null)

  if (!sindicato) {
    return (
      <div className="sinddetalle-app">
        <div className="sinddetalle-error">
          <p>No se encontró información del sindicato.</p>
          <button onClick={() => navigate(-1)}>Volver</button>
        </div>
      </div>
    )
  }

  const handleLlamar = () => {
    const celular = String(sindicato.telefono).replace(/\D/g, '')
    const numero = celular.startsWith('591') ? celular : `591${celular}`
    window.open(`https://wa.me/${numero}`, '_blank')
  }

  const handleSolicitar = async () => {
    setMensaje(null)

    const celular = celularPasajero.replace(/\D/g, '')
    if (celular.length < 8) return setMensaje({ tipo: 'error', texto: 'Número de celular inválido.' })
    if (!referenciaOrigen.trim()) return setMensaje({ tipo: 'error', texto: 'Ingresa tu referencia de ubicación.' })
    if (!destinoReferencia.trim()) return setMensaje({ tipo: 'error', texto: 'Ingresa tu destino.' })

    setCargando(true)
    try {
      const resultado = await crearViaje({
        celular_pasajero: celular,
        uv_origen: asociacionId,
        tipo_vehiculo: 'taxi',
        tipo_servicio: 'normal',
        referencia_origen: referenciaOrigen.trim(),
        destino_referencia: destinoReferencia.trim(),
      })
      setSolicitudExitosa(resultado)
    } catch (err) {
      setMensaje({ tipo: 'error', texto: err.message })
    } finally {
      setCargando(false)
    }
  }

  if (solicitudExitosa) {
    return (
      <div className="sinddetalle-app">
        <div className="sinddetalle-header">
          <button className="sinddetalle-btn-volver" onClick={() => navigate(`/taxi/${ciudad}`)}>
            ← Volver
          </button>
          <h1 className="sinddetalle-titulo">{sindicato.asociacion_nombre}</h1>
        </div>
        <div className="sinddetalle-exito">
          <div className="sinddetalle-exito-icon">✅</div>
          <h2>¡Solicitud enviada!</h2>
          <p>Tu pedido fue enviado a {sindicato.asociacion_nombre}.</p>
          <div className="sinddetalle-codigo">{solicitudExitosa.codigo}</div>
          <p className="sinddetalle-exito-desc">
            La operadora te contactará por WhatsApp con el precio y tiempo de llegada.
          </p>
          <button
            className="sinddetalle-btn-whatsapp"
            onClick={handleLlamar}
          >
            💬 Abrir WhatsApp con {sindicato.asociacion_nombre}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="sinddetalle-app">

      <div className="sinddetalle-header">
        <button className="sinddetalle-btn-volver" onClick={() => navigate(`/taxi/${ciudad}`)}>
          ← Volver
        </button>
        <h1 className="sinddetalle-titulo">{sindicato.asociacion_nombre}</h1>
      </div>

      <div className="sinddetalle-body">

        <div className="sinddetalle-info-card">
          <span className="sinddetalle-distancia">
            📍 A {sindicato.distancia_metros === 0 ? 'menos de 100' : sindicato.distancia_metros} metros de ti
          </span>
        </div>

        {modo === null && (
          <div className="sinddetalle-opciones">
            <p className="sinddetalle-subtitulo">¿Cómo quieres solicitar tu taxi?</p>

            <button className="sinddetalle-btn-llamar" onClick={handleLlamar}>
              📞 Llamar por WhatsApp
              <span className="sinddetalle-btn-sub">Habla directamente con la operadora</span>
            </button>

            <button className="sinddetalle-btn-formulario" onClick={() => setModo('formulario')}>
              📋 Solicitar por formulario
              <span className="sinddetalle-btn-sub">La operadora te contactará con el precio</span>
            </button>
          </div>
        )}

        {modo === 'formulario' && (
          <div className="sinddetalle-formulario">

            <div className="sinddetalle-campo">
              <label>¿En qué referencia estás?</label>
              <input
                className="sinddetalle-input"
                type="text"
                placeholder="Ej: Frente a la farmacia, cerca del mercado"
                value={referenciaOrigen}
                onChange={e => setReferenciaOrigen(e.target.value)}
              />
            </div>

            <div className="sinddetalle-campo">
              <label>¿A dónde vas?</label>
              <input
                className="sinddetalle-input"
                type="text"
                placeholder="Ej: Plaza Ballivián, Terminal"
                value={destinoReferencia}
                onChange={e => setDestinoReferencia(e.target.value)}
              />
            </div>

            <div className="sinddetalle-campo">
              <label>Tu número de celular</label>
              <input
                className="sinddetalle-input"
                type="tel"
                placeholder="Ej: 70000000"
                value={celularPasajero}
                onChange={e => setCelularPasajero(e.target.value)}
              />
              {celularPasajero.replace(/\D/g, '').length >= 8 && (
                <p className="sinddetalle-confirmacion">
                  ¿Tu número es <strong>{celularPasajero.replace(/\D/g, '')}</strong>? Verifica antes de continuar.
                </p>
              )}
            </div>

            {mensaje && (
              <div className={`sinddetalle-mensaje ${mensaje.tipo}`}>{mensaje.texto}</div>
            )}

            <button
              className="sinddetalle-btn-solicitar"
              onClick={handleSolicitar}
              disabled={cargando}
            >
              {cargando
                ? 'Enviando...'
                : '🚕 Enviar solicitud'
              }
            </button>

            <button
              className="sinddetalle-btn-cancelar-modo"
              onClick={() => setModo(null)}
            >
              ← Volver a opciones
            </button>

          </div>
        )}

      </div>
    </div>
  )
}