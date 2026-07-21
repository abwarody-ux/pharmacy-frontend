import api from './api';

export async function getAvailability(pharmacyId, productId) {
  const res = await api.get(`/stock/availability/${productId}?pharmacy_id=${pharmacyId}`);
  return res.data;
}

export async function getLotsByProduct(pharmacyId, productId) {
  const res = await api.get(`/stock/lots/${productId}?pharmacy_id=${pharmacyId}`);
  return res.data;
}

export async function getAllLotsWithStatus(pharmacyId) {
  const res = await api.get(`/stock/lots-status?pharmacy_id=${pharmacyId}`);
  return res.data;
}

export async function listStockMovements(pharmacyId) {
  const res = await api.get(`/stock/movements?pharmacy_id=${pharmacyId}`);
  return res.data;
}

export async function getExpiryAlerts(pharmacyId) {
  const res = await api.get(`/stock/expiry-alerts?pharmacy_id=${pharmacyId}`);
  return res.data;
}

export async function listAdjustments(pharmacyId) {
  const res = await api.get(`/stock/adjustments?pharmacy_id=${pharmacyId}`);
  return res.data;
}

export async function createAdjustment(pharmacyId, payload) {
  const res = await api.post(`/stock/adjustments?pharmacy_id=${pharmacyId}`, payload);
  return res.data;
}

export async function approveAdjustment(pharmacyId, id, approve) {
  const res = await api.patch(`/stock/adjustments/${id}/approve?pharmacy_id=${pharmacyId}`, { approve });
  return res.data;
}

export async function listDiscountProposals(pharmacyId) {
  const res = await api.get(`/stock/discounts?pharmacy_id=${pharmacyId}`);
  return res.data;
}

export async function proposeDiscount(pharmacyId, payload) {
  const res = await api.post(`/stock/discounts/propose?pharmacy_id=${pharmacyId}`, payload);
  return res.data;
}

export async function approveDiscount(pharmacyId, id, approve) {
  const res = await api.patch(`/stock/discounts/${id}/approve?pharmacy_id=${pharmacyId}`, { approve });
  return res.data;
}