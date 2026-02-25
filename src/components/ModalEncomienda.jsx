import { useState } from 'react'
import { crearEncomienda } from '../services/api'

export default function ModalEncomienda({ uvs, celularPasajero, onCerrar }) {

  const [uvOrigen, setUvOrigen] = useState('')
  const [referenciaOrigen, setReferenciaOrigen] = useState('')
  const [uvDestino, setUvDestino] = useState('')
  const [referenciaDestino, setReferenciaDestino] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [peso, setPeso] = useState('liviano')
  const [requiereConfirmacion, setRequiereConfirmacion] = useState(false)
  const [celularDestinatario, setCelularDestinatario] = useState('')
  const [celularReferencia, setCelularReferencia] = useState('')
  const [celularRemitente, setCelularRemitente] = useState(celularPasajero || '')

  const [cargando, setCargando] = useState(false)
  const [mensaje, setMensaje] = useState(null)
  const [exitosa, setExitosa] = useState(null)

  const handleEnviar = async () => {
    setMensaje(null)

    if (!uvOrigen) return setMensaje({ tipo: 'error', texto: 'Selecciona la zona de origen.' })
    if (!referenciaOrigen.trim()) return setMensaje({ tipo: 'error', texto: 'Ingresa la referencia de origen.' })
    if (!referenciaDestino.trim()) return setMensaje({ tipo: 'error', texto: 'Ingresa la referencia de destino.' })
    if (!descripcion.trim()) return setMensaje({ tipo: 'error', texto: 'Describe el objeto a enviar.' })
    if (!celularRemitente.trim()) return setMensaje({ tipo: 'error', texto: 'Ingresa tu número de celular.' })
    if (!celularDestinatario.trim()) return setMensaje({ tipo: 'error', texto: 'Ingresa el celular del destinatario.' })

    setCargando(true)
    try {
      const resultado = await crearEncomienda({
        celular_remitente: celularRemitente.trim(),
        uv_origen: uvOrigen,
        uv_destino: uvDestino || 'No especificada',
        tipo_vehiculo: 'moto',
        descripcion_objeto: descripcion.trim(),
        peso_estimado: peso,
        requiere_confirmacion: requiereConfirmacion,
        referencia_origen: referenciaOrigen.trim(),
        referencia_destino: referenciaDestino.trim(),
        celular_destinatario: celularDestinatario.trim(),
        celular_referencia: celularReferencia.trim(),
      })
      setExitosa(resultado)
    } catch (err) {
      setMensaje({ tipo: 'error', texto: err.message })
    } finally {
      setCargando(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onCerrar()}>
      <div className="modal">

        <div className="modal-header">
          <h2>📦 Enviar Encomienda</h2>
          <button className="modal-cerrar" onClick={onCerrar}>✕</button>
        </div>

        <div className="modal-body">

          {exitosa ? (
            <div className="exito-encomienda">
              <div className="exito-icon">📦</div>
              <h3 className="exito-titulo">¡Encomienda registrada!</h3>
              <p style={{ color: '#888', fontSize: '0.88rem' }}>
                Un conductor recogerá tu paquete en breve.
              </p>
              <div className="exito-codigo">{exitosa.codigo}</div>
              <button className="btn-solicitar" onClick={onCerrar}>
                Cerrar
              </button>
            </div>
          ) : (
            <>
              {/* ORIGEN */}
              <div className="campo">
                <label>Zona de origen</label>
                <div className="select-wrap">
                  <select className="select" value={uvOrigen} onChange={e => setUvOrigen(e.target.value)}>
                    <option value="">Selecciona la zona donde está el paquete...</option>
                    {uvs.map(uv => (
                      <option key={uv.id} value={uv.nombre}>{uv.nombre}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="campo">
                <label>Referencia de origen</label>
                <input
                  className="input"
                  type="text"
                  placeholder="Ej: Casa esquina calle 5, portón azul"
                  value={referenciaOrigen}
                  onChange={e => setReferenciaOrigen(e.target.value)}
                />
              </div>

              <hr className="divider" />

              {/* DESTINO */}
              <div className="campo">
                <label>Zona de destino <span style={{ color: '#555', fontWeight: 400 }}>(opcional)</span></label>
                <div className="select-wrap">
                  <select className="select" value={uvDestino} onChange={e => setUvDestino(e.target.value)}>
                    <option value="">Selecciona si conoces la zona destino...</option>
                    {uvs.map(uv => (
                      <option key={uv.id} value={uv.nombre}>{uv.nombre}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="campo">
                <label>Referencia de destino</label>
                <input
                  className="input"
                  type="text"
                  placeholder="Ej: Farmacia del barrio UV3, frente al parque"
                  value={referenciaDestino}
                  onChange={e => setReferenciaDestino(e.target.value)}
                />
              </div>

              <hr className="divider" />

              {/* OBJETO */}
              <div className="campo">
                <label>¿Qué vas a enviar?</label>
                <input
                  className="input"
                  type="text"
                  placeholder="Ej: Documento, ropa, comida, medicamento"
                  value={descripcion}
                  onChange={e => setDescripcion(e.target.value)}
                />
              </div>

              <div className="campo">
                <label>Peso estimado</label>
                <div className="peso-group">
                  {[
                    { valor: 'liviano', label: 'Liviano', icon: '🪶' },
                    { valor: 'mediano', label: 'Mediano', icon: '📦' },
                    { valor: 'pesado', label: 'Pesado', icon: '🏋️' },
                  ].map(p => (
                    <button
                      key={p.valor}
                      className={`peso-btn ${peso === p.valor ? 'activo' : ''}`}
                      onClick={() => setPeso(p.valor)}
                    >
                      <span className="peso-icon">{p.icon}</span>
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="campo">
                <label>¿El conductor debe llamar antes de recoger?</label>
                <div className="confirmacion-group">
                  <button
                    className={`confirmacion-btn ${requiereConfirmacion ? 'activo' : ''}`}
                    onClick={() => setRequiereConfirmacion(true)}
                  >
                    ✅ Sí, que llame
                  </button>
                  <button
                    className={`confirmacion-btn ${!requiereConfirmacion ? 'activo' : ''}`}
                    onClick={() => setRequiereConfirmacion(false)}
                  >
                    🚀 No, que vaya directo
                  </button>
                </div>
              </div>

              <hr className="divider" />

              {/* CELULARES */}
              <div className="campo">
                <label>Tu celular (remitente)</label>
                <input
                  className="input"
                  type="tel"
                  placeholder="Ej: 70000000"
                  value={celularRemitente}
                  onChange={e => setCelularRemitente(e.target.value)}
                />
              </div>

              <div className="campo">
                <label>Celular del destinatario</label>
                <input
                  className="input"
                  type="tel"
                  placeholder="Ej: 71111111"
                  value={celularDestinatario}
                  onChange={e => setCelularDestinatario(e.target.value)}
                />
              </div>

              <div className="campo">
                <label>Celular de referencia <span style={{ color: '#555', fontWeight: 400 }}>(opcional)</span></label>
                <input
                  className="input"
                  type="tel"
                  placeholder="Otro número si hay dudas"
                  value={celularReferencia}
                  onChange={e => setCelularReferencia(e.target.value)}
                />
              </div>

              {mensaje && (
                <div className={`mensaje ${mensaje.tipo}`}>{mensaje.texto}</div>
              )}

              <button
                className="btn-solicitar"
                onClick={handleEnviar}
                disabled={cargando}
              >
                {cargando
                  ? <><span className="spinner" />Registrando encomienda...</>
                  : '📦 Enviar Encomienda'
                }
              </button>
            </>
          )}

        </div>
      </div>
    </div>
  )
}