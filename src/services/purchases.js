import api from './api';

export async function listPurchaseRequests(pharmacyId) {
  const res = await api.get(`/purchases/requests?pharmacy_id=${pharmacyId}`);
  return res.data;
}

export async function createPurchaseRequest(pharmacyId, payload) {
  const res = await api.post(`/purchases/requests?pharmacy_id=${pharmacyId}`, payload);
  return res.data;
}

export async function createPurchaseRequestBatch(pharmacyId, payload) {
  const res = await api.post(`/purchases/requests/batch?pharmacy_id=${pharmacyId}`, payload);
  return res.data;
}

export async function getRequestsByBatch(pharmacyId, batchId) {
  const res = await api.get(`/purchases/requests/batch/${batchId}?pharmacy_id=${pharmacyId}`);
  return res.data;
}

export async function approvePurchaseRequest(pharmacyId, id, approve) {
  const res = await api.patch(`/purchases/requests/${id}/approve?pharmacy_id=${pharmacyId}`, { approve });
  return res.data;
}

export async function listPurchaseOrders(pharmacyId) {
  const res = await api.get(`/purchases/orders?pharmacy_id=${pharmacyId}`);
  return res.data;
}

export async function receivePurchaseOrder(pharmacyId, orderId, payload) {
  const res = await api.post(`/purchases/orders/${orderId}/receive?pharmacy_id=${pharmacyId}`, payload);
  return res.data;
}

export async function receiveBonus(pharmacyId, orderId, payload) {
  const res = await api.post(`/purchases/orders/${orderId}/receive-bonus?pharmacy_id=${pharmacyId}`, payload);
  return res.data;
}