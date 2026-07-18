import api from './api';

export async function getActivePharmacy(pharmacyId) {
  if (!pharmacyId) return null;
  const res = await api.get(`/pharmacy/${pharmacyId}`);
  return res.data;
}