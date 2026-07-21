import api from './api';

export async function listProducts(pharmacyId) {
  const res = await api.get(`/products?pharmacy_id=${pharmacyId}`);
  return res.data;
}

export async function searchProducts(pharmacyId, query) {
  const res = await api.get(`/products/search?pharmacy_id=${pharmacyId}&q=${encodeURIComponent(query)}`);
  return res.data;
}

export async function createProduct(pharmacyId, payload) {
  const res = await api.post(`/products?pharmacy_id=${pharmacyId}`, payload);
  return res.data;
}

export async function updateProduct(pharmacyId, id, payload) {
  const res = await api.patch(`/products/${id}?pharmacy_id=${pharmacyId}`, payload);
  return res.data;
}