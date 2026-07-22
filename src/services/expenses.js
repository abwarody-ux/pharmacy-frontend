import api from './api';

export async function listExpenses(pharmacyId, category) {
  const url = category
    ? `/expenses?pharmacy_id=${pharmacyId}&category=${category}`
    : `/expenses?pharmacy_id=${pharmacyId}`;
  const res = await api.get(url);
  return res.data;
}

export async function recordExpense(pharmacyId, payload) {
  const res = await api.post(`/expenses?pharmacy_id=${pharmacyId}`, payload);
  return res.data;
}

export async function listRecurringExpenses(pharmacyId) {
  const res = await api.get(`/expenses/recurring?pharmacy_id=${pharmacyId}`);
  return res.data;
}

export async function createRecurringExpense(pharmacyId, payload) {
  const res = await api.post(`/expenses/recurring?pharmacy_id=${pharmacyId}`, payload);
  return res.data;
}

export async function payRecurringExpense(pharmacyId, id, expenseDate) {
  const res = await api.post(`/expenses/recurring/${id}/pay?pharmacy_id=${pharmacyId}`, { expense_date: expenseDate });
  return res.data;
}