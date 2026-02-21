import { useState, useEffect, useRef } from 'react'
import { useParams } from 'react-router-dom'
import { getUvs, crearViaje } from '../services/api'
import '../styles/SolicitudViaje.css'

export default function SolicitudViaje() {
  const { ciudad } = useParams()

  const [uvs, setUvs] = useState([])
  const [cargandoUvs, setCargandoUvs] = useState(true)
  const [uvOrigen, setUvOrigen] = useState('')
  const [tipoVehiculo, setTipoVehiculo] = useState('moto')
  const [tipoServicio, setTipoServicio] = useState('normal')
  const [referenciaOrigen, setReferenciaOrigen] = useState('')
  const [destinoReferencia, setDestinoReferencia] = useState('')
  const [celularPasajero, setCelularPasajero] = useState('')
  const [cargando, setCargando] = useState(false)
  const [mensaje, setMensaje] = useState(null)
  const [solicitudExitosa, setSolicitudExitosa] = useState(null)
  const [segundosRestantes, setSegundosRestantes] = useState(0)
  const timerRef = useRef(null)

  useEffect(() => {
    getUvs()
      .then(data => setUvs(data))
      .catch(() => setMensaje({ tipo: 'error', texto: 'No se pudieron cargar las zonas. Recarga la página.' }))
      .finally(() => setCargandoUvs(false))
  }, [])

  useEffect(() => {
    if (segundosRestantes <= 0) return
    timerRef.current = setTimeout(() => setSegundosRestantes(s => s - 1), 1000)
    return () => clearTimeout(timerRef.current)
  }, [segundosRestantes])

  const btnDeshabilitado = cargando || segundosRestantes > 0

  const handleSolicitar = async () => {
    setMensaje(null)
    if (!uvOrigen) return setMensaje({ tipo: 'error', texto: 'Selecciona tu zona.' })
    if (!referenciaOrigen.trim()) return setMensaje({ tipo: 'error', texto: 'Ingresa una referencia de dónde estás.' })
    if (!celularPasajero.trim()) return setMensaje({ tipo: 'error', texto: 'Ingresa tu número de celular.' })

    setCargando(true)
    try {
      const resultado = await crearViaje({
        celular_pasajero: celularPasajero.trim(),
        uv_origen: uvOrigen,
        tipo_vehiculo: tipoVehiculo,
        tipo_servicio: tipoServicio,
        referencia_origen: referenciaOrigen.trim(),
        destino_referencia: destinoReferencia.trim(),
      })
      setSolicitudExitosa(resultado)
      setSegundosRestantes(30)
    } catch (err) {
      setMensaje({ tipo: 'error', texto: err.message })
    } finally {
      setCargando(false)
    }
  }

  const abrirWhatsApp = () => {
    const telefono = '59160605127'
    const texto = encodeURIComponent(
      `🏍️ Solicitud ${solicitudExitosa.codigo}\n` +
      `Zona: ${uvOrigen}\n` +
      `Referencia: ${referenciaOrigen}\n` +
      (destinoReferencia ? `Destino: ${destinoReferencia}\n` : '') +
      `Vehículo: ${tipoVehiculo === 'moto' ? 'Moto' : 'Torito'}\n` +
      `Servicio: ${tipoServicio === 'premium' ? '⭐ Premium' : 'Normal'}`
    )
    window.open(`https://wa.me/${telefono}?text=${texto}`, '_blank')
  }

  const resetear = () => {
    setSolicitudExitosa(null)
    setMensaje(null)
    setUvOrigen('')
    setReferenciaOrigen('')
    setDestinoReferencia('')
    setCelularPasajero('')
    setTipoVehiculo('moto')
    setTipoServicio('normal')
  }

  if (solicitudExitosa) {
    return (
      <div className="app">
        <div className="header">
          <span className="header-icon">🏍️</span>
          <div className="header-texto">
            <h1>Mototaxis</h1>
            <p>{ciudad?.replace('-', ' ') || 'Santa Cruz'}</p>
          </div>
        </div>
        <div className="exito-screen">
          <div className="exito-icon">✅</div>
          <h2 className="exito-titulo">¡Solicitud enviada!</h2>
          <p className="exito-desc">
            Estamos buscando un conductor disponible en tu zona. En unos segundos recibirás confirmación.
          </p>
          <div className="exito-codigo">{solicitudExitosa.codigo}</div>
          <p className="exito-desc" style={{ fontSize: '0.8rem' }}>
            Ahora abre WhatsApp y comparte tu <strong>ubicación en tiempo real</strong> para que el conductor te encuentre.
          </p>
          <button className="btn-whatsapp" onClick={abrirWhatsApp}>
            📍 Abrir WhatsApp y compartir ubicación
          </button>
          <button className="btn-nuevo" onClick={resetear}>
            Nueva solicitud
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="app">
      <div className="header">
        <span className="header-icon">🏍️</span>
        <div className="header-texto">
          <h1>Pedir Mototaxi</h1>
          <p>{ciudad?.replace('-', ' ') || 'Santa Cruz'} · Tarifa base Bs. 4</p>
        </div>
      </div>

      <div className="form">

        <div className="campo">
          <label>¿Dónde estás?</label>
          {cargandoUvs ? (
            <div className="skeleton" />
          ) : (
            <div className="select-wrap">
              <select className="select" value={uvOrigen} onChange={e => setUvOrigen(e.target.value)}>
                <option value="">Selecciona tu zona / UV...</option>
                {uvs.map(uv => (
                  <option key={uv.id} value={uv.nombre}>{uv.nombre}</option>
                ))}
              </select>
            </div>
          )}
        </div>

        <div className="campo">
          <label>¿En qué referencia estás?</label>
          <input
            className="input"
            type="text"
            placeholder="Ej: Frente a la farmacia Chávez"
            value={referenciaOrigen}
            onChange={e => setReferenciaOrigen(e.target.value)}
          />
        </div>

        <div className="campo">
          <label>¿A dónde vas? <span style={{ color: '#555', fontWeight: 400 }}>(opcional)</span></label>
          <input
            className="input"
            type="text"
            placeholder="Ej: Mercado central, Terminal"
            value={destinoReferencia}
            onChange={e => setDestinoReferencia(e.target.value)}
          />
        </div>

        <hr className="divider" />

        <div className="campo">
          <label>Tipo de vehículo</label>
          <div className="toggle-group">
            <button className={`toggle-btn ${tipoVehiculo === 'moto' ? 'activo' : ''}`} onClick={() => setTipoVehiculo('moto')}>
              <span className="icon">🏍️</span>Moto
            </button>
            <button className={`toggle-btn ${tipoVehiculo === 'torito' ? 'activo' : ''}`} onClick={() => setTipoVehiculo('torito')}>
              <span className="icon">🛺</span>Torito
            </button>
          </div>
        </div>

        <div className="campo">
          <label>Tipo de servicio</label>
          <div className="servicio-group">
            <button className={`servicio-btn ${tipoServicio === 'normal' ? 'activo' : ''}`} onClick={() => setTipoServicio('normal')}>
              <span className="sv-titulo">Normal</span>
              <span className="sv-desc">Bs. 4 · Conductor disponible</span>
            </button>
            <button className={`servicio-btn ${tipoServicio === 'premium' ? 'activo' : ''}`} onClick={() => setTipoServicio('premium')}>
              <span className="sv-titulo">⭐ Premium</span>
              <span className="sv-desc">Bs. 5 · Prioridad de despacho</span>
            </button>
          </div>
        </div>

        <div className="tarifa-badge">
          <span>💰</span>
          <span>Tarifa base: <strong>Bs. {tipoServicio === 'premium' ? '5' : '4'}</strong> — Si el destino es lejano, el conductor te informará el ajuste.</span>
        </div>

        <hr className="divider" />

        <div className="campo">
          <label>Tu número de celular</label>
          <input
            className="input"
            type="tel"
            placeholder="Ej: 70000000"
            value={celularPasajero}
            onChange={e => setCelularPasajero(e.target.value)}
          />
        </div>

        {mensaje && (
          <div className={`mensaje ${mensaje.tipo}`}>{mensaje.texto}</div>
        )}

        <button className="btn-solicitar" onClick={handleSolicitar} disabled={btnDeshabilitado}>
          {cargando
            ? <><span className="spinner" />Buscando conductor...</>
            : segundosRestantes > 0
              ? `Espera ${segundosRestantes} seg...`
              : '🏍️ Solicitar Mototaxi'
          }
        </button>

        {segundosRestantes > 0 && (
          <p className="countdown">Puedes volver a solicitar en <span>{segundosRestantes}s</span></p>
        )}

      </div>
    </div>
  )
}