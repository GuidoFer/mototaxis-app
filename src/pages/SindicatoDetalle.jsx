import { useState } from 'react'
import { useParams, useLocation, useNavigate } from 'react-router-dom'
import { MapContainer, TileLayer, Marker, useMapEvents } from 'react-leaflet'
import L from 'leaflet'
import { crearViaje } from '../services/api'
import '../styles/SindicatoDetalle.css'
import 'leaflet/dist/leaflet.css'

// Fix icono default de Leaflet
delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
})

function SelectorMapa({ onSeleccionar }) {
  useMapEvents({
    click(e) {
      onSeleccionar({ lat: e.latlng.lat, lng: e.latlng.lng })
    }
  })
  return null
}

export default function SindicatoDetalle() {
  const { ciudad, asociacionId } = useParams()
  const { state } = useLocation()
  const navigate = useNavigate()

  const sindicato = state?.sindicato
  const coordenadas = state?.coordenadas

  const [modo, setModo] = useState(null)
  const [referenciaOrigen, setReferenciaOrigen] = useState('')
  const [destinoTexto, setDestinoTexto] = useState('')
  const [destinoCoordenadas, setDestinoCoordenadas] = useState(null)
  const [mostrarMapa, setMostrarMapa] = useState(false)
  const [marcadorDestino, setMarcadorDestino] = useState(null)
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

  const handleSeleccionarDestino = (coords) => {
    setMarcadorDestino(coords)
    setDestinoCoordenadas(coords)
    setDestinoTexto('Destino marcado en mapa ✅')
  }

  const handleConfirmarMapa = () => {
    if (!marcadorDestino) return setMensaje({ tipo: 'error', texto: 'Toca el mapa para marcar tu destino.' })
    setMostrarMapa(false)
    setMensaje(null)
  }

  const handleSolicitar = async () => {
    setMensaje(null)

    const celular = celularPasajero.replace(/\D/g, '')
    if (celular.length < 8) return setMensaje({ tipo: 'error', texto: 'Número de celular inválido.' })
    if (!referenciaOrigen.trim()) return setMensaje({ tipo: 'error', texto: 'Ingresa tu referencia de ubicación.' })
    if (!destinoTexto.trim()) return setMensaje({ tipo: 'error', texto: 'Ingresa tu destino o márcalo en el mapa.' })

    setCargando(true)
    try {
      const resultado = await crearViaje({
        celular_pasajero: celular,
        uv_origen: asociacionId,
        tipo_vehiculo: 'taxi',
        tipo_servicio: 'normal',
        referencia_origen: referenciaOrigen.trim(),
        destino_referencia: destinoTexto.trim(),
        lat_pasajero: coordenadas?.lat || '',
        lng_pasajero: coordenadas?.lng || '',
        lat_destino: destinoCoordenadas?.lat || '',
        lng_destino: destinoCoordenadas?.lng || '',
      })
      setSolicitudExitosa(resultado)
    } catch (err) {
      setMensaje({ tipo: 'error', texto: err.message })
    } finally {
      setCargando(false)
    }
  }

  // ── PANTALLA MAPA ─────────────────────────────────────────
  if (mostrarMapa) {
    return (
      <div className="sinddetalle-app">
        <div className="sinddetalle-header">
          <button className="sinddetalle-btn-volver" onClick={() => setMostrarMapa(false)}>
            ← Volver
          </button>
          <h1 className="sinddetalle-titulo">Marca tu destino</h1>
        </div>
        <p className="sinddetalle-mapa-instruccion">Toca el mapa para marcar tu destino</p>
        <div className="sinddetalle-mapa-container">
          <MapContainer
            center={[sindicato.lat || -16.5009, sindicato.lng || -68.1593]}
            zoom={14}
            style={{ height: '100%', width: '100%' }}
          >
            <TileLayer
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              attribution='© OpenStreetMap'
            />
            <SelectorMapa onSeleccionar={handleSeleccionarDestino} />
            {marcadorDestino && (
              <Marker position={[marcadorDestino.lat, marcadorDestino.lng]} />
            )}
          </MapContainer>
        </div>
        <button
          className="sinddetalle-btn-confirmar-mapa"
          onClick={handleConfirmarMapa}
        >
          ✅ Confirmar destino
        </button>
      </div>
    )
  }

  // ── PANTALLA ÉXITO ────────────────────────────────────────
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
            En 30 segundos verás las tarifas disponibles.
          </p>
          <button className="sinddetalle-btn-whatsapp" onClick={handleLlamar}>
            💬 Abrir WhatsApp con {sindicato.asociacion_nombre}
          </button>
        </div>
      </div>
    )
  }

  // ── FORMULARIO ────────────────────────────────────────────
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
              <div className="sinddetalle-destino-wrap">
                <input
                  className="sinddetalle-input sinddetalle-input-destino"
                  type="text"
                  placeholder="Ej: Plaza Ballivián, Terminal"
                  value={destinoTexto}
                  onChange={e => {
                    setDestinoTexto(e.target.value)
                    setDestinoCoordenadas(null)
                  }}
                />
                <button
                  className="sinddetalle-btn-mapa-pequeno"
                  onClick={() => setMostrarMapa(true)}
                  title="Marcar en mapa"
                >
                  📍Mapa
                </button>
              </div>
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
              {cargando ? 'Enviando...' : '🚕 Enviar solicitud'}
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