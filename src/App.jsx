import { BrowserRouter, Routes, Route } from 'react-router-dom'
import SolicitudViaje from './pages/SolicitudViaje'
import SolicitudEncomienda from './pages/SolicitudEncomienda'
import ConductorView from './pages/ConductorView'
import CancelarViaje from './pages/CancelarViaje'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Pasajero */}
        <Route path="/moto/:ciudad" element={<SolicitudViaje />} />
        <Route path="/moto/encomienda/:ciudad" element={<SolicitudEncomienda />} />

        {/* Cancelación */}
        <Route path="/cancelar/:codigo" element={<CancelarViaje />} />

        {/* Conductor */}
        <Route path="/moto/conductor/:id" element={<ConductorView />} />

        {/* Inicio */}
        <Route path="/" element={
          <div style={{ padding: 32, fontFamily: 'Arial' }}>
            <h2>🏍️ Mototaxis API — OK</h2>
            <ul>
              <li><a href="/moto/warnes">/moto/warnes — Solicitar viaje</a></li>
              <li><a href="/moto/conductor/MOT-001">/moto/conductor/MOT-001 — Panel conductor</a></li>
            </ul>
          </div>
        } />
      </Routes>
    </BrowserRouter>
  )
}

export default App