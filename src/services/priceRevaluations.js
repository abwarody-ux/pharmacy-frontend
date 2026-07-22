import api from './api';

export async function listRevaluations(pharmacyId) {
  const res = await api.get(`/price-revaluations?pharmacy_id=${pharmacyId}`);
  return res.data;
}

export async function proposeRevaluation(pharmacyId, payload) {
  const res = await api.post(`/price-revaluations/preview?pharmacy_id=${pharmacyId}`, payload);
  return res.data;
}

export async function getRevaluation(pharmacyId, id) {
  const res = await api.get(`/price-revaluations/${id}?pharmacy_id=${pharmacyId}`);
  return res.data;
}

export async function approveRevaluation(pharmacyId, id, approve) {
  const res = await api.patch(`/price-revaluations/${id}/approve?pharmacy_id=${pharmacyId}`, { approve });
  return res.data;
}