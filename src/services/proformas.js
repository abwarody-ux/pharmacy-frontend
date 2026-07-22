import api from './api';

export async function listProformas(pharmacyId) {
  const res = await api.get(`/proformas?pharmacy_id=${pharmacyId}`);
  return res.data;
}

export async function createProforma(pharmacyId, payload) {
  const res = await api.post(`/proformas?pharmacy_id=${pharmacyId}`, payload);
  return res.data;
}

export async function getProforma(pharmacyId, id) {
  const res = await api.get(`/proformas/${id}?pharmacy_id=${pharmacyId}`);
  return res.data;
}

export async function updateProformaStatus(pharmacyId, id, status) {
  const res = await api.patch(`/proformas/${id}/status?pharmacy_id=${pharmacyId}`, { status });
  return res.data;
}

export async function recordProformaConversion(pharmacyId, id, lineId, quantity) {
  const res = await api.patch(`/proformas/${id}/lines/${lineId}/convert?pharmacy_id=${pharmacyId}`, { quantity });
  return res.data;
}

export async function getProformaConversionStats(pharmacyId) {
  const res = await api.get(`/proformas/stats/conversion?pharmacy_id=${pharmacyId}`);
  return res.data;
}