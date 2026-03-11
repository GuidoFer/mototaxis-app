import { useState, useEffect, useRef } from 'react'
import { useParams } from 'react-router-dom'
import { getUvs, crearViaje, getViaje, getConductor, getAsociacionesCercanas } from '../services/api'
import '../styles/SolicitudViaje.css'

const POLLING_INTERVAL = 10000
const TIMEOUT_SIN_CONDUCTOR = 60000
const GPS_TIMEOUT = 8000

export default function SolicitudViaje() {

const { ciudad } = useParams()

const [uvs,setUvs] = useState([])
const [cargandoUvs,setCargandoUvs] = useState(true)

const [uvOrigen,setUvOrigen] = useState('')
const [referenciaOrigen,setReferenciaOrigen] = useState('')
const [destinoReferencia,setDestinoReferencia] = useState('')
const [tipoServicio,setTipoServicio] = useState('normal')
const [celularPasajero,setCelularPasajero] = useState('')

const [gpsEstado,setGpsEstado] = useState('idle')
const [asociacionesCercanas,setAsociacionesCercanas] = useState([])
const [coordenadas,setCoordenadas] = useState(null)
const [zonaNombre,setZonaNombre] = useState('')

const [cargando,setCargando] = useState(false)
const [mensaje,setMensaje] = useState(null)

const [solicitudExitosa,setSolicitudExitosa] = useState(null)
const [conductorAsignado,setConductorAsignado] = useState(null)

const [viajeCompletado,setViajeCompletado] = useState(false)
const [sinConductor,setSinConductor] = useState(false)
const [conductorCancelo,setConductorCancelo] = useState(false)

const [segundosRestantes,setSegundosRestantes] = useState(0)

const timerRef = useRef(null)
const pollingRef = useRef(null)
const timeoutRef = useRef(null)
const gpsTimeoutRef = useRef(null)

useEffect(()=>{

getUvs()
.then(data=>setUvs(data))
.catch(()=>setMensaje({tipo:'error',texto:'No se pudieron cargar las zonas.'}))
.finally(()=>setCargandoUvs(false))

},[])


useEffect(()=>{

const guardado = sessionStorage.getItem('solicitudActiva')
// ===== MEJORA: Recuperar asociaciones guardadas del GPS =====
const asociacionesGuardadas = sessionStorage.getItem('asociacionesGps')

if(asociacionesGuardadas){
  try{
    setAsociacionesCercanas(JSON.parse(asociacionesGuardadas))
  }catch(e){
    console.log('Error al recuperar asociaciones GPS', e)
  }
}
// ===========================================================

if(guardado){

try{

const data = JSON.parse(guardado)

setSolicitudExitosa(data.solicitud)
setUvOrigen(data.uvOrigen || '')
setReferenciaOrigen(data.referenciaOrigen || '')
setDestinoReferencia(data.destinoReferencia || '')
setCelularPasajero(data.celularPasajero || '')
setTipoServicio(data.tipoServicio || 'normal')

}catch(e){

sessionStorage.removeItem('solicitudActiva')

}

}

},[])


useEffect(()=>{

window.history.pushState(null,'',window.location.href)

const handlePopState = ()=>{

const confirmar = window.confirm('¿Deseas salir de la app?')

if(confirmar){

sessionStorage.removeItem('solicitudActiva')
window.history.back()

}else{

window.history.pushState(null,'',window.location.href)

}

}

window.addEventListener('popstate',handlePopState)

return ()=>window.removeEventListener('popstate',handlePopState)

},[])


useEffect(()=>{

if(segundosRestantes<=0) return

timerRef.current=setTimeout(()=>{

setSegundosRestantes(s=>s-1)

},1000)

return ()=>clearTimeout(timerRef.current)

},[segundosRestantes])


useEffect(()=>{

if(!solicitudExitosa || conductorAsignado || viajeCompletado || conductorCancelo) return

timeoutRef.current=setTimeout(()=>{

setSinConductor(true)

},TIMEOUT_SIN_CONDUCTOR)

pollingRef.current=setInterval(async()=>{

try{

const viaje = await getViaje(solicitudExitosa.codigo)

if(viaje.estado==='asignado' && viaje.conductor_id){

clearInterval(pollingRef.current)
clearTimeout(timeoutRef.current)

const conductor = await getConductor(viaje.conductor_id)

setConductorAsignado(conductor)
setSinConductor(false)

}

if(viaje.estado==='completado'){

clearInterval(pollingRef.current)
clearTimeout(timeoutRef.current)

setViajeCompletado(true)
setConductorAsignado(null)

sessionStorage.removeItem('solicitudActiva')

}

if(viaje.estado==='cancelado_conductor'){

clearInterval(pollingRef.current)
clearTimeout(timeoutRef.current)

setConductorCancelo(true)

sessionStorage.removeItem('solicitudActiva')

}

if(viaje.estado==='cancelado_pasajero'){

clearInterval(pollingRef.current)
clearTimeout(timeoutRef.current)

sessionStorage.removeItem('solicitudActiva')

resetear()

}

}catch(e){

console.log('Polling error',e)

}

},POLLING_INTERVAL)

return ()=>{

clearInterval(pollingRef.current)
clearTimeout(timeoutRef.current)

}

},[solicitudExitosa,conductorAsignado,viajeCompletado,conductorCancelo])


const detectarUbicacion=()=>{

if(!navigator.geolocation){

setGpsEstado('fallback')
return

}

setGpsEstado('detectando')

gpsTimeoutRef.current=setTimeout(()=>{

setGpsEstado('fallback')

},GPS_TIMEOUT)

navigator.geolocation.getCurrentPosition(

async(position)=>{

clearTimeout(gpsTimeoutRef.current)

const {latitude,longitude}=position.coords

setCoordenadas({lat:latitude,lng:longitude})

try{

const cercanas = await getAsociacionesCercanas(latitude,longitude)

// ===== MEJORA: Guardar asociaciones en sessionStorage =====
sessionStorage.setItem('asociacionesGps', JSON.stringify(cercanas))
// ==========================================================

setAsociacionesCercanas(cercanas)

const nombre = cercanas[0]?.color_chaleco
? `Chaleco ${cercanas[0].color_chaleco}`
: cercanas[0]?.asociacion_nombre

setZonaNombre(nombre)

setGpsEstado('detectado')

}catch(err){

setGpsEstado('fallback')

}

},

()=>{

clearTimeout(gpsTimeoutRef.current)
setGpsEstado('fallback')

},

{timeout:GPS_TIMEOUT,enableHighAccuracy:false}

)

}


const handleSolicitar = async()=>{

setMensaje(null)

// ===== MEJORA: Logs para depuración =====
console.log('gpsEstado:', gpsEstado)
console.log('asociacionesCercanas:', asociacionesCercanas)
// ========================================

const celular = celularPasajero.replace(/\D/g,'')

if(celular.length<8){

return setMensaje({tipo:'error',texto:'Número de celular inválido'})

}

// ===== MEJORA: Obtener asociaciones guardadas =====
const asociacionesGuardadas = JSON.parse(sessionStorage.getItem('asociacionesGps') || '[]')
// =================================================

// ===== MEJORA: Lógica mejorada para detectar si tenemos datos GPS =====
const tieneGps = (gpsEstado === 'detectado' && asociacionesCercanas.length > 0) 
  || (gpsEstado === 'fallback' && asociacionesGuardadas.length > 0)
// =====================================================================

const tieneFallback = gpsEstado === 'fallback' && uvOrigen && !tieneGps

if(!tieneGps && !tieneFallback){

return setMensaje({tipo:'error',texto:'Debes seleccionar o detectar tu zona.'})

}

if(!referenciaOrigen.trim()) return setMensaje({tipo:'error',texto:'Ingresa referencia.'})
if(!destinoReferencia.trim()) return setMensaje({tipo:'error',texto:'Ingresa destino.'})

// ===== MEJORA: Determinar qué ID enviar =====
let idEnviar

if(tieneGps){
  // Priorizar las asociaciones actuales, si no, usar las guardadas
  if(asociacionesCercanas.length > 0){
    idEnviar = asociacionesCercanas[0].asociacion_id
  } else if(asociacionesGuardadas.length > 0){
    idEnviar = asociacionesGuardadas[0].asociacion_id
  }
} else {
  // Modo fallback puro: enviar el ID de la UV seleccionada
  idEnviar = uvOrigen
}

console.log('uv_origen que se enviará:', idEnviar)
// =============================================

setCargando(true)

try{

const resultado = await crearViaje({

celular_pasajero:celular,

uv_origen: idEnviar,

tipo_vehiculo:'moto',

tipo_servicio:tipoServicio,

referencia_origen:referenciaOrigen.trim(),

destino_referencia:destinoReferencia.trim(),

lat_pasajero:coordenadas?.lat || '',
lng_pasajero:coordenadas?.lng || ''

})

setSolicitudExitosa(resultado)

setSegundosRestantes(30)

sessionStorage.setItem('solicitudActiva',JSON.stringify({

solicitud:resultado,
uvOrigen,
referenciaOrigen,
destinoReferencia,
celularPasajero:celular,
tipoServicio

}))

}catch(err){

setMensaje({tipo:'error',texto:err.message})

}finally{

setCargando(false)

}

}


const irAWhatsApp=()=>{

const celular = String(conductorAsignado.celular).replace(/\D/g,'')

const numero = celular.startsWith('591') ? celular : `591${celular}`

window.open(`https://wa.me/${numero}`,'_blank')

}


const resetear=()=>{

clearInterval(pollingRef.current)
clearTimeout(timeoutRef.current)
clearTimeout(gpsTimeoutRef.current)

// ===== MEJORA: Limpiar asociaciones guardadas =====
sessionStorage.removeItem('solicitudActiva')
sessionStorage.removeItem('asociacionesGps')
// =================================================

setSolicitudExitosa(null)
setConductorAsignado(null)
setViajeCompletado(false)
setSinConductor(false)
setConductorCancelo(false)

setMensaje(null)

setUvOrigen('')
setReferenciaOrigen('')
setDestinoReferencia('')
setCelularPasajero('')
setTipoServicio('normal')

setGpsEstado('idle')
setAsociacionesCercanas([])
setCoordenadas(null)
setZonaNombre('')

}


if(viajeCompletado){

return(

<div className="app">
<div className="header">
<span className="header-icon">🏍️</span>
<div className="header-texto">
<h1>Mototaxis</h1>
<p>{ciudad || 'Warnes'}</p>
</div>
</div>
<div className="exito-screen">
<div className="exito-icon">⭐</div>
<h2 className="exito-titulo">¡Llegaste!</h2>
<p className="exito-desc">Tu viaje fue completado. Gracias por usar el servicio.</p>
<div className="exito-codigo">{solicitudExitosa?.codigo}</div>
<button className="btn-solicitar" onClick={resetear}>
Pedir otro mototaxi
</button>
</div>
</div>

)

}


if(conductorCancelo){

return(

<div className="app">
<div className="header">
<span className="header-icon">🏍️</span>
<div className="header-texto">
<h1>Mototaxis</h1>
<p>{ciudad || 'Warnes'}</p>
</div>
</div>
<div className="exito-screen">
<div className="exito-icon">😔</div>
<h2 className="exito-titulo">El conductor canceló</h2>
<p className="exito-desc">El conductor no pudo completar el viaje. Puedes solicitar uno nuevo.</p>
<button className="btn-solicitar" onClick={resetear}>
🔄 Pedir otro mototaxi
</button>
</div>
</div>

)

}


if(conductorAsignado){

return(

<div className="app">
<div className="header">
<span className="header-icon">🏍️</span>
<div className="header-texto">
<h1>Mototaxis</h1>
<p>{ciudad || 'Warnes'}</p>
</div>
</div>
<div className="exito-screen">
<div className="exito-icon">🏍️</div>
<h2 className="exito-titulo">¡Un mototaxista aceptó tu viaje!</h2>
<p className="exito-desc">
Te llegará un mensaje a tu WhatsApp con los detalles y la tarifa.
</p>

<div className="conductor-info-pasajero">
<div className="conductor-info-fila">
<span className="conductor-info-label">Conductor</span>
<span className="conductor-info-valor">{conductorAsignado.nombre}</span>
</div>
<div className="conductor-info-fila">
<span className="conductor-info-label">Chaleco</span>
<span className="conductor-info-valor" style={{textTransform:'capitalize'}}>
{conductorAsignado.color_chaleco}
</span>
</div>
<div className="conductor-info-fila">
<span className="conductor-info-label">Solicitud</span>
<span className="conductor-info-valor" style={{color:'#e85d04'}}>
{solicitudExitosa.codigo}
</span>
</div>
</div>

<button className="btn-whatsapp" onClick={irAWhatsApp}>
💬 Ir a WhatsApp
</button>

<p className="exito-desc" style={{fontSize:'0.78rem'}}>
¿Necesitas cancelar? Usa el link que te enviará el conductor en el mensaje de WhatsApp.
</p>
</div>
</div>

)

}


if(solicitudExitosa){

return(

<div className="app">
<div className="header">
<span className="header-icon">🏍️</span>
<div className="header-texto">
<h1>Mototaxis</h1>
<p>{ciudad || 'Warnes'}</p>
</div>
</div>
<div className="exito-screen">
{sinConductor ? (
<>
<div className="exito-icon">😕</div>
<h2 className="exito-titulo">Sin conductores disponibles</h2>
<p className="exito-desc">
Todos están ocupados. Seguimos buscando automáticamente.
</p>
<div className="buscando-indicator">
<span className="buscando-dot" />
<span className="buscando-dot" />
<span className="buscando-dot" />
</div>
<button className="btn-cancelar" onClick={resetear}>
Cancelar y volver al inicio
</button>
</>
) : (
<>
<div className="exito-icon">✅</div>
<h2 className="exito-titulo">¡Solicitud enviada!</h2>
<p className="exito-desc">Buscando conductor en tu zona...</p>
<div className="exito-codigo">{solicitudExitosa.codigo}</div>
<div className="buscando-indicator">
<span className="buscando-dot" />
<span className="buscando-dot" />
<span className="buscando-dot" />
</div>
<p className="exito-desc" style={{fontSize:'0.8rem'}}>
Esta pantalla se actualiza automáticamente.
</p>
<button className="btn-cancelar" onClick={resetear}>
Cancelar solicitud
</button>
</>
)}
</div>
</div>

)

}


return(

<div className="app">

<div className="header">
<span className="header-icon">🏍️</span>
<div className="header-texto">
<h1>Pedir Mototaxi</h1>
<p>{ciudad || 'Warnes'} · Bs. 4</p>
</div>
</div>

<div className="form">

{/* GPS IDLE */}
{gpsEstado==='idle' && (
<button className="btn-gps" onClick={detectarUbicacion}>
📍 Detectar mi ubicación
<span className="btn-gps-sub">Usamos tu ubicación solo para encontrar mototaxis cercanos</span>
</button>
)}

{/* GPS DETECTANDO */}
{gpsEstado==='detectando' && (
<div className="gps-detectando">
<div className="spinner" />
<p>Detectando ubicación... puede tardar unos segundos.</p>
</div>
)}

{/* GPS DETECTADO */}
{gpsEstado==='detectado' && (
<div className="gps-confirmado">
<span className="gps-confirmado-icon">📍</span>
<div className="gps-confirmado-texto">
<strong>Zona detectada: {zonaNombre}</strong>
<button className="btn-cambiar-zona" onClick={()=>setGpsEstado('fallback')}>
Cambiar zona
</button>
</div>
</div>
)}

{/* GPS FALLBACK */}
{gpsEstado==='fallback' && (
<div className="campo">
<label>Selecciona tu zona manualmente</label>
{cargandoUvs ? (
<div className="skeleton" />
) : (
<div className="select-wrap">
<select className="select" value={uvOrigen} onChange={e=>setUvOrigen(e.target.value)}>
<option value="">Selecciona tu zona / UV...</option>
{uvs.map(uv=>(
<option key={uv.id} value={uv.id}>{uv.nombre}</option>
))}
</select>
</div>
)}
<button className="btn-reintentar-gps" onClick={detectarUbicacion}>
📍 Reintentar ubicación automática
</button>
</div>
)}

{/* FORMULARIO COMPLETO (solo si hay zona) */}
{(gpsEstado==='detectado' || gpsEstado==='fallback') && (
<>

<div className="campo">
<label>¿En qué referencia estás?</label>
<input
className="input"
type="text"
placeholder="Ej: Frente a la farmacia Chávez"
value={referenciaOrigen}
onChange={e=>setReferenciaOrigen(e.target.value)}
/>
</div>

<div className="campo">
<label>¿A dónde vas?</label>
<input
className="input"
type="text"
placeholder="Ej: Mercado central, Terminal"
value={destinoReferencia}
onChange={e=>setDestinoReferencia(e.target.value)}
/>
</div>

<hr className="divider" />

{/* SELECTOR DE TIPO SERVICIO */}
<div className="campo">
<label>Tipo de servicio</label>
<div className="servicio-group">
<button
className={`servicio-btn ${tipoServicio === 'normal' ? 'activo' : ''}`}
onClick={()=>setTipoServicio('normal')}
>
<span className="sv-titulo">Normal</span>
<span className="sv-desc">Bs. 4 · Conductor disponible</span>
</button>
<button
className={`servicio-btn ${tipoServicio === 'premium' ? 'activo' : ''}`}
onClick={()=>setTipoServicio('premium')}
>
<span className="sv-titulo">⭐ Premium</span>
<span className="sv-desc">Bs. 5 · Prioridad de despacho</span>
</button>
</div>
</div>

<div className="tarifa-badge">
<span>💰</span>
<span>Tarifa base: <strong>Bs. {tipoServicio==='premium'?'5':'4'}</strong> — El conductor puede ajustar si el destino es lejano.</span>
</div>

<hr className="divider" />

<div className="campo">
<label>Tu número de celular</label>
<input
className="input"
type="tel"
placeholder="Ej: 70000000"
value={celularPasajero}
onChange={e=>setCelularPasajero(e.target.value)}
/>
{celularPasajero.replace(/\D/g,'').length >= 8 && (
<p className="celular-confirmacion">
¿Tu número es <strong>{celularPasajero.replace(/\D/g,'')}</strong>? Verifica antes de continuar.
</p>
)}
</div>

{mensaje && (
<div className={`mensaje ${mensaje.tipo}`}>{mensaje.texto}</div>
)}

<button
className="btn-solicitar"
onClick={handleSolicitar}
disabled={cargando || segundosRestantes>0}
>
{cargando ? (
<><span className="spinner" />Enviando solicitud...</>
) : segundosRestantes > 0 ? (
`Espera ${segundosRestantes} seg...`
) : (
'🏍️ Solicitar Mototaxi'
)}
</button>

{segundosRestantes > 0 && (
<p className="countdown">Puedes volver a solicitar en <span>{segundosRestantes}s</span></p>
)}

</>
)}

</div>
</div>

)

}