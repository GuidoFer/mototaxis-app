// ================================================
// api.js — Servicio central de comunicación con Apps Script
// Todos los componentes importan desde aquí
// ================================================

const API_URL = import.meta.env.VITE_API_URL;

/**
 * GET genérico
 */
async function apiGet(params = {}) {
  const query = new URLSearchParams(params).toString();
  const response = await fetch(`${API_URL}?${query}`);

  if (!response.ok) {
    throw new Error(`HTTP error: ${response.status}`);
  }

  const data = await response.json();

  if (!data.success) {
    throw new Error(data.error || 'Error en el servidor');
  }

  return data.data;
}

/**
 * POST genérico
 */
async function apiPost(body = {}) {
  const response = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`HTTP error: ${response.status}`);
  }

  const data = await response.json();

  if (!data.success) {
    throw new Error(data.error || 'Error en el servidor');
  }

  return data.data;
}

// ================================================
// ENDPOINTS
// ================================================

export const getUvs = () =>
  apiGet({ get: 'uvs' });

export const getAsociacion = (asociacionId) =>
  apiGet({ asociacion: asociacionId });

export const getConductoresActivos = (sheetId) =>
  apiGet({ get: 'conductores_activos', sheet_id: sheetId });

export const getViajesHoy = (asociacionId) =>
  apiGet({ get: 'viajes_hoy', asociacion_id: asociacionId });

export const getEncomiendasHoy = (asociacionId) =>
  apiGet({ get: 'encomiendas_hoy', asociacion_id: asociacionId });

export const getConductor = (conductorId) =>
  apiGet({ get: 'conductor', conductor_id: conductorId });

export const crearViaje = (datos) =>
  apiPost({ action: 'crearViaje', ...datos });

export const crearEncomienda = (datos) =>
  apiPost({ action: 'crearEncomienda', ...datos });

export const aceptarSolicitud = (codigo, conductorId, asociacionId) =>
  apiPost({
    action: 'aceptarSolicitud',
    codigo,
    conductor_id: conductorId,
    asociacion_id: asociacionId
  });

export const cancelarSolicitud = (codigo, tipo) =>
  apiPost({
    action: 'cancelarSolicitud',
    codigo,
    tipo
  });

export const actualizarEstadoConductor = (conductorId, sheetId, nuevoEstado) =>
  apiPost({
    action: 'actualizarEstadoConductor',
    conductor_id: conductorId,
    sheet_id: sheetId,
    nuevo_estado: nuevoEstado
  });

export const completarViaje = (codigo, tarifaFinal, sheetIdConductor) =>
  apiPost({
    action: 'completarViaje',
    codigo,
    tarifa_final: tarifaFinal,
    sheet_id_conductor: sheetIdConductor
  });