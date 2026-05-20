import { useState, useEffect, useRef } from 'react'
import { useParams, useLocation, useNavigate } from 'react-router-dom'
import { MapContainer, TileLayer, Marker, useMapEvents } from 'react-leaflet'
import L from 'leaflet'
import { crearViaje, getOfertasViaje, elegirOferta, cancelarSolicitud } from '../services/api'
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

function OfertasScreen({ solicitud, sindicato, ciudad, onLlamar, onVolver }) {
  const navigate = useNavigate()
  const [segundos, setSegundos] = useState(90)
  const [ofertas, setOfertas] = useState([])
  const [cargandoOfertas, setCargandoOfertas] = useState(false)
  const [elegida, setElegida] = useState(null)
  const [eligiendo, setEligiendo] = useState(false)
  const [mensaje, setMensaje] = useState(null)
  const ofertasAnterioresRef = useRef([])

  // Countdown 90 segundos
  useEffect(() => {
    if (segundos <= 0) return
    const timer = setTimeout(() => setSegundos(s => s - 1), 1000)
    return () => clearTimeout(timer)
  }, [segundos])

  // Polling cada 10 segundos mientras corre el countdown
  useEffect(() => {
    if (segundos <= 0) {
      cargarOfertas()
      return
    }
    if (segundos % 10 === 0) {
      cargarOfertas()
    }
  }, [segundos])

  const cargarOfertas = async () => {
    setCargandoOfertas(true)
    try {
      const data = await getOfertasViaje(solicitud.codigo)

      // Detectar ofertas nuevas
      const nuevas = data.filter(o =>
        !ofertasAnterioresRef.current.find(ant => ant.conductor_id === o.conductor_id)
      )

      if (nuevas.length > 0) {
        if (navigator.vibrate) navigator.vibrate([500, 200, 500, 200, 500])
        try {
          const ctx = new (window.AudioContext || window.webkitAudioContext)()
          const osc = ctx.createOscillator()
          const gain = ctx.createGain()
          osc.connect(gain)
          gain.connect(ctx.destination)
          osc.type = 'sine'
          osc.frequency.setValueAtTime(880, ctx.currentTime)
          gain.gain.setValueAtTime(0.3, ctx.currentTime)
          gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5)
          osc.start(ctx.currentTime)
          osc.stop(ctx.currentTime + 0.5)
          ctx.close()
        } catch(e) {}
      }

      ofertasAnterioresRef.current = data
      setOfertas(data)
    } catch (err) {
      setMensaje({ tipo: 'error', texto: 'Error al cargar ofertas.' })
    } finally {
      setCargandoOfertas(false)
    }
  }

  const handleElegir = async (oferta) => {
    setEligiendo(true)
    try {
      await elegirOferta(solicitud.codigo, oferta.conductor_id)
      setElegida(oferta)
    } catch (err) {
      setMensaje({ tipo: 'error', texto: err.message })
    } finally {
      setEligiendo(false)
    }
  }

  // Conductor elegido
  if (elegida) {
    return (
      <div className="sinddetalle-app">
        <div className="sinddetalle-header">
          <h1 className="sinddetalle-titulo">{sindicato.asociacion_nombre}</h1>
        </div>
        <div className="sinddetalle-exito">
          <div className="sinddetalle-exito-icon">🚕</div>
          <h2>¡Taxi confirmado!</h2>
          <div className="sinddetalle-codigo">{solicitud.codigo}</div>
          <p className="sinddetalle-exito-desc">
            Tarifa acordada: <strong>Bs. {elegida.tarifa}</strong>
          </p>
          <p className="sinddetalle-exito-desc">
            El conductor te contactará por WhatsApp con su información y tiempo de llegada.
          </p>
          <button className="sinddetalle-btn-whatsapp" onClick={onLlamar}>
            💬 Abrir WhatsApp con {sindicato.asociacion_nombre}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="sinddetalle-app">
      <div className="sinddetalle-header">
        <h1 className="sinddetalle-titulo">{sindicato.asociacion_nombre}</h1>
      </div>

      <div className="sinddetalle-body">
        <div className="sinddetalle-codigo" style={{ textAlign: 'center' }}>
          {solicitud.codigo}
        </div>

        {/* COUNTDOWN */}
        {segundos > 0 && (
          <div className="ofertas-esperando">
            <div className="ofertas-emoji">
              {segundos > 75 ? '😊' : segundos > 55 ? '🙂' : segundos > 35 ? '😐' : segundos > 15 ? '😑' : '😒'}
            </div>
            <div className="ofertas-countdown">{segundos}</div>
            <p>Esperando las mejores tarifas...</p>
            {ofertas.length === 0 && (
              <div className="buscando-indicator">
                <span className="buscando-dot" />
                <span className="buscando-dot" />
                <span className="buscando-dot" />
              </div>
            )}
          </div>
        )}

        {/* OFERTAS EN TIEMPO REAL */}
        {ofertas.length > 0 && (
          <>
            <p className="sinddetalle-subtitulo">
              {segundos > 0 ? `${ofertas.length} oferta${ofertas.length > 1 ? 's' : ''} recibida${ofertas.length > 1 ? 's' : ''}` : 'Elige tu tarifa'}
            </p>
            {ofertas.map((oferta, idx) => (
              <div key={oferta.conductor_id} className="oferta-card">
                <div className="oferta-info">
                  <span className="oferta-label">
                    {idx === 0 ? '🏆 Mejor precio' : idx === 1 ? '2da opción' : '3ra opción'}
                  </span>
                  <span className="oferta-tarifa">Bs. {oferta.tarifa}</span>
                  {oferta.tiempo_llegada && (
                    <span className="oferta-tiempo">⏱ Llega en {oferta.tiempo_llegada} min</span>
                  )}
                </div>
                <button
                  className="sinddetalle-btn-elegir"
                  onClick={() => handleElegir(oferta)}
                  disabled={eligiendo}
                >
                  {eligiendo ? '...' : 'Elegir'}
                </button>
              </div>
            ))}
          </>
        )}

        {/* SIN OFERTAS AL TERMINAR */}
        {segundos === 0 && ofertas.length === 0 && !cargandoOfertas && (
          <div className="ofertas-sin-resultados">
            <div className="sinddetalle-exito-icon">😕</div>
            <h3>Sin conductores disponibles</h3>
            <p>Ningún conductor envió una oferta. Puedes llamar directamente o buscar otro taxi movil.</p>
            <button className="sinddetalle-btn-llamar" onClick={onLlamar}>
              📞 Llamar por WhatsApp
            </button>
            <button className="sinddetalle-btn-cancelar-modo" onClick={onVolver}>
              Ver otros taxi movil
            </button>
          </div>
        )}

        {mensaje && (
          <div className={`sinddetalle-mensaje ${mensaje.tipo}`}>
            {mensaje.texto}
          </div>
        )}
        {/* BOTÓN CANCELAR */}
        <button
          className="sinddetalle-btn-cancelar-modo"
          style={{ marginTop: '16px', color: '#e63946', borderColor: '#e63946' }}
          onClick={async () => {
            const confirmar = window.confirm('¿Cancelar tu solicitud de taxi?')
            if (!confirmar) return
            try {
              await cancelarSolicitud(solicitud.codigo, 'pasajero')
              onVolver()
            } catch (err) {
              setMensaje({ tipo: 'error', texto: 'Error al cancelar. Intenta de nuevo.' })
            }
          }}
        >
          ❌ Cancelar solicitud
        </button>
      </div>
    </div>
  )
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
    if (celular.length !== 8) return setMensaje({ tipo: 'error', texto: 'El número debe tener exactamente 8 dígitos.' })
    if (!['6', '7'].includes(celular[0])) return setMensaje({ tipo: 'error', texto: 'El número debe comenzar con 6 o 7.' })
    if (!referenciaOrigen.trim()) return setMensaje({ tipo: 'error', texto: 'Ingresa una referencia.' })
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
        origen: 'app',
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
      <OfertasScreen
        solicitud={solicitudExitosa}
        sindicato={sindicato}
        ciudad={ciudad}
        onLlamar={handleLlamar}
        onVolver={() => navigate(`/taxi/${ciudad}`)}
      />
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
              <span className="sinddetalle-btn-sub">Es automatico y mas rapido</span>
            </button>
          </div>
        )}

        {modo === 'formulario' && (
          <div className="sinddetalle-formulario">

            <div className="sinddetalle-campo">
              <label>Tengo tu ubicacion ¿Dame una referencia?</label>
              <input
                className="sinddetalle-input"
                type="text"
                placeholder="Ej: Garaje rojo, Edificio Azul, Hay un arbol"
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
                  placeholder="Ej:Terminal de buses, Ceja calle 3, Aeropuerto"
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
                  Mapa
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
                onChange={e => setCelularPasajero(e.target.value.replace(/\D/g, ''))}
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