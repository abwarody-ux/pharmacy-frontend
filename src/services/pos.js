import api from './api';

export async function createSale(pharmacyId, payload) {
  const res = await api.post(`/pos/sales?pharmacy_id=${pharmacyId}`, payload);
  return res.data;
}

export async function listSales(pharmacyId) {
  const res = await api.get(`/pos/sales?pharmacy_id=${pharmacyId}`);
  return res.data;
}

export async function getTodaySales(pharmacyId) {
  const res = await api.get(`/pos/sales/today?pharmacy_id=${pharmacyId}`);
  return res.data;
}

export async function requestSaleCancellation(pharmacyId, saleId, reason) {
  const res = await api.post(`/pos/sales/${saleId}/cancel?pharmacy_id=${pharmacyId}`, { reason });
  return res.data;
}

export async function listCancellations(pharmacyId) {
  const res = await api.get(`/pos/cancellations?pharmacy_id=${pharmacyId}`);
  return res.data;
}

export async function approveCancellation(pharmacyId, id, approve) {
  const res = await api.patch(`/pos/cancellations/${id}/approve?pharmacy_id=${pharmacyId}`, { approve });
  return res.data;
}