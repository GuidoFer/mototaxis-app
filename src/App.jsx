import { BrowserRouter, Routes, Route } from 'react-router-dom'
import SolicitudViaje from './pages/SolicitudViaje'
import SolicitudEncomienda from './pages/SolicitudEncomienda'
import ConductorView from './pages/ConductorView'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Pasajero */}
        <Route path="/moto/:ciudad" element={<SolicitudViaje />} />
        <Route path="/moto/encomienda/:ciudad" element={<SolicitudEncomienda />} />

        {/* Conductor */}
        <Route path="/moto/conductor/:id" element={<ConductorView />} />

        {/* Inicio temporal */}
        <Route path="/" element={
          <div style={{ padding: 32, fontFamily: 'Arial' }}>
            <h2>🏍️ Mototaxis API — OK</h2>
            <p>Rutas disponibles:</p>
            <ul>
              <li><a href="/moto/santa-cruz">/moto/santa-cruz — Solicitar viaje</a></li>
              <li><a href="/moto/encomienda/santa-cruz">/moto/encomienda/santa-cruz — Encomienda</a></li>
              <li><a href="/moto/conductor/MOT-001">/moto/conductor/MOT-001 — Panel conductor</a></li>
            </ul>
          </div>
        } />
      </Routes>
    </BrowserRouter>
  )
}

export default App