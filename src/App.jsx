import { BrowserRouter, Routes, Route } from 'react-router-dom'
import SolicitudViaje from './pages/SolicitudViaje'
import SolicitudEncomienda from './pages/SolicitudEncomienda'
import ConductorView from './pages/ConductorView'
import CancelarViaje from './pages/CancelarViaje'
import DirectorioTaxis from './pages/DirectorioTaxis'
import SindicatoDetalle from './pages/SindicatoDetalle'
import ConductorTaxis from './pages/ConductorTaxis'
import OperadoraPanel from './pages/OperadoraPanel'
import UbicacionPasajero from './pages/UbicacionPasajero'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Mototaxis */}
        <Route path="/moto/:ciudad" element={<SolicitudViaje />} />
        <Route path="/moto/encomienda/:ciudad" element={<SolicitudEncomienda />} />
        <Route path="/moto/conductor" element={<ConductorView />} />

        {/* Taxis — rutas literales PRIMERO, dinámicas DESPUÉS */}
        <Route path="/taxi/:ciudad" element={<DirectorioTaxis />} />
        <Route path="/taxi/:ciudad/conductor" element={<ConductorTaxis />} />
        <Route path="/taxi/:ciudad/operadora" element={<OperadoraPanel />} />
        <Route path="/taxi/:ciudad/:asociacionId" element={<SindicatoDetalle />} />

        {/* Otros */}
        <Route path="/cancelar/:codigo" element={<CancelarViaje />} />
        <Route path="/ubicacion/:token" element={<UbicacionPasajero />} />

        {/* Inicio limpio */}
        <Route path="/" element={
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', fontFamily: 'Arial' }}>
            <h2>PIDE</h2>
          </div>
        } />
      </Routes>
    </BrowserRouter>
  )
}

export default App