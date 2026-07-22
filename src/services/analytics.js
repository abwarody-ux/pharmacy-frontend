import api from './api';

export async function getDashboard(pharmacyId) {
  const res = await api.get(`/analytics/dashboard?pharmacy_id=${pharmacyId}`);
  return res.data;
}

export async function getDemandVsSales(pharmacyId) {
  const res = await api.get(`/analytics/demand-vs-sales?pharmacy_id=${pharmacyId}`);
  return res.data;
}

export async function getUnmetDemand(pharmacyId) {
  const res = await api.get(`/analytics/unmet-demand?pharmacy_id=${pharmacyId}`);
  return res.data;
}

export async function getStockoutForecast(pharmacyId, productId) {
  const res = await api.get(`/analytics/forecast/stockout/${productId}?pharmacy_id=${pharmacyId}`);
  return res.data;
}