import api from './api';

export async function listPurchaseRequestVariances(pharmacyId) {
  const res = await api.get(`/price-variance/purchase-requests?pharmacy_id=${pharmacyId}`);
  return res.data;
}

export async function listStockReceiptApprovals(pharmacyId, status) {
  const url = status
    ? `/price-variance/stock-receipts?pharmacy_id=${pharmacyId}&status=${status}`
    : `/price-variance/stock-receipts?pharmacy_id=${pharmacyId}`;
  const res = await api.get(url);
  return res.data;
}

export async function approveStockReceipt(pharmacyId, id, approve) {
  const res = await api.patch(`/price-variance/stock-receipts/${id}/approve?pharmacy_id=${pharmacyId}`, { approve });
  return res.data;
}