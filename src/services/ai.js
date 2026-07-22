import api from './api';

export async function generateRestockRecommendations(pharmacyId) {
  const res = await api.post(`/ai/recommendations/generate-restock?pharmacy_id=${pharmacyId}`);
  return res.data;
}

export async function detectAdjustmentAnomalies(pharmacyId) {
  const res = await api.post(`/ai/anomalies/detect?pharmacy_id=${pharmacyId}`);
  return res.data;
}

export async function listRecommendations(pharmacyId, status) {
  const url = status
    ? `/ai/recommendations?pharmacy_id=${pharmacyId}&status=${status}`
    : `/ai/recommendations?pharmacy_id=${pharmacyId}`;
  const res = await api.get(url);
  return res.data;
}

export async function reviewRecommendation(pharmacyId, id, decision) {
  const res = await api.patch(`/ai/recommendations/${id}/review?pharmacy_id=${pharmacyId}`, { decision });
  return res.data;
}