import api from './api';

export async function listPatients(pharmacyId) {
  const res = await api.get(`/patients?pharmacy_id=${pharmacyId}`);
  return res.data;
}

export async function createPatient(pharmacyId, payload) {
  const res = await api.post(`/patients?pharmacy_id=${pharmacyId}`, payload);
  return res.data;
}

export async function getPatient(pharmacyId, id) {
  const res = await api.get(`/patients/${id}?pharmacy_id=${pharmacyId}`);
  return res.data;
}

export async function getPatientUnifiedProfile(pharmacyId, id) {
  const res = await api.get(`/patients/${id}/profile?pharmacy_id=${pharmacyId}`);
  return res.data;
}

export async function updateNotificationPreference(pharmacyId, id, payload) {
  const res = await api.patch(`/patients/${id}/notification-preference?pharmacy_id=${pharmacyId}`, payload);
  return res.data;
}

export async function listPendingReminders(pharmacyId) {
  const res = await api.get(`/patients/reminders/pending?pharmacy_id=${pharmacyId}`);
  return res.data;
}