import api from './api';

export async function createPrescription(pharmacyId, payload) {
  const res = await api.post(`/prescriptions?pharmacy_id=${pharmacyId}`, payload);
  return res.data;
}

export async function getPrescriptionsByPatient(pharmacyId, patientId) {
  const res = await api.get(`/prescriptions/by-patient/${patientId}?pharmacy_id=${pharmacyId}`);
  return res.data;
}

export async function getPrescription(pharmacyId, id) {
  const res = await api.get(`/prescriptions/${id}?pharmacy_id=${pharmacyId}`);
  return res.data;
}

export async function validatePrescription(pharmacyId, id, payload) {
  const res = await api.patch(`/prescriptions/${id}/validate?pharmacy_id=${pharmacyId}`, payload);
  return res.data;
}