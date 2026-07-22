import api from './api';

// FormData : ne pas fixer Content-Type manuellement, axios detecte FormData et laisse
// le navigateur poser la bonne limite (boundary) automatiquement.
export async function uploadPrescriptionImage(pharmacyId, file) {
  const formData = new FormData();
  formData.append('file', file);
  const res = await api.post(`/prescriptions/upload-image?pharmacy_id=${pharmacyId}`, formData);
  return res.data;
}

export async function getPrescriptionImageUrl(pharmacyId, id) {
  const res = await api.get(`/prescriptions/${id}/image-url?pharmacy_id=${pharmacyId}`);
  return res.data;
}

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