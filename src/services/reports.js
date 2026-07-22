import api from './api';

export async function getSalesByProduct(pharmacyId, start, end) {
  const res = await api.get(`/reports/sales/by-product?pharmacy_id=${pharmacyId}&start=${start}&end=${end}`);
  return res.data;
}

export async function getSalesByPaymentMethod(pharmacyId, start, end) {
  const res = await api.get(`/reports/sales/by-payment-method?pharmacy_id=${pharmacyId}&start=${start}&end=${end}`);
  return res.data;
}

export async function getStockValuation(pharmacyId) {
  const res = await api.get(`/reports/stock/valuation?pharmacy_id=${pharmacyId}`);
  return res.data;
}

export async function getDormantProducts(pharmacyId, days) {
  const res = await api.get(`/reports/stock/dormant?pharmacy_id=${pharmacyId}&days=${days}`);
  return res.data;
}

export async function getExpiringAmm(pharmacyId) {
  const res = await api.get(`/reports/compliance/expiring-amm?pharmacy_id=${pharmacyId}`);
  return res.data;
}

export async function getControlledSubstanceSales(pharmacyId, start, end) {
  const res = await api.get(`/reports/compliance/controlled-substance-sales?pharmacy_id=${pharmacyId}&start=${start}&end=${end}`);
  return res.data;
}

export async function exportReport(pharmacyId, reportName, start, end) {
  const params = new URLSearchParams({ pharmacy_id: pharmacyId, report_name: reportName });
  if (start) params.append('start', start);
  if (end) params.append('end', end);
  const res = await api.post(`/reports/export?${params.toString()}`);
  return res.data;
}

export async function getExportHistory(pharmacyId) {
  const res = await api.get(`/reports/export-history?pharmacy_id=${pharmacyId}`);
  return res.data;
}