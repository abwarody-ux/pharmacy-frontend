import { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import {
  listExpenses, recordExpense,
  listRecurringExpenses, createRecurringExpense, payRecurringExpense,
} from '../../services/expenses';

const FINANCE_ROLES = ['PHARMACY_ADMIN', 'PHARMACY_FINANCE'];

const CATEGORIES = ['LOYER', 'SALAIRES', 'CARBURANT', 'ELECTRICITE_EAU', 'COMMUNICATION', 'ENTRETIEN', 'TRANSPORT', 'AUTRE'];
const CATEGORY_LABELS = {
  LOYER: 'Loyer', SALAIRES: 'Salaires', CARBURANT: 'Carburant', ELECTRICITE_EAU: 'Electricite / Eau',
  COMMUNICATION: 'Communication', ENTRETIEN: 'Entretien', TRANSPORT: 'Transport', AUTRE: 'Autre',
};

const PAYMENT_METHODS = ['CASH', 'MOBILE_MONEY', 'CARD', 'BANK_TRANSFER'];
const PAYMENT_LABELS = { CASH: 'Especes', MOBILE_MONEY: 'Mobile Money', CARD: 'Carte', BANK_TRANSFER: 'Virement bancaire' };

const FREQUENCY_LABELS = { MONTHLY: 'Mensuelle', WEEKLY: 'Hebdomadaire', YEARLY: 'Annuelle' };

function formatDate(dateStr) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('fr-FR', { year: 'numeric', month: 'long', day: 'numeric' });
}

const todayISO = () => new Date().toISOString().slice(0, 10);

const emptyExpenseForm = { label: '', category: 'AUTRE', amount: '', currency: 'CDF', payment_method: 'CASH', expense_date: todayISO(), notes: '' };
const emptyRecurringForm = { label: '', category: 'AUTRE', amount: '', currency: 'CDF', frequency: 'MONTHLY', day_of_period: '' };

export default function ExpensesPage() {
  const { activePharmacyId, user } = useAuth();
  const canAccess = FINANCE_ROLES.includes(user?.role);

  const [tab, setTab] = useState('expenses');
  const [expenses, setExpenses] = useState([]);
  const [recurring, setRecurring] = useState([]);
  const [categoryFilter, setCategoryFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [resultMessage, setResultMessage] = useState('');

  const [showExpenseModal, setShowExpenseModal] = useState(false);
  const [expenseForm, setExpenseForm] = useState(emptyExpenseForm);
  const [expenseError, setExpenseError] = useState('');
  const [submittingExpense, setSubmittingExpense] = useState(false);

  const [showRecurringModal, setShowRecurringModal] = useState(false);
  const [recurringForm, setRecurringForm] = useState(emptyRecurringForm);
  const [recurringError, setRecurringError] = useState('');
  const [submittingRecurring, setSubmittingRecurring] = useState(false);

  const [showPayModal, setShowPayModal] = useState(false);
  const [payingRecurring, setPayingRecurring] = useState(null);
  const [payDate, setPayDate] = useState(todayISO());
  const [payError, setPayError] = useState('');
  const [submittingPay, setSubmittingPay] = useState(false);

  const load = (silent = false) => {
    if (!activePharmacyId || !canAccess) return;
    if (!silent) setLoading(true);
    Promise.all([
      listExpenses(activePharmacyId, categoryFilter || undefined),
      listRecurringExpenses(activePharmacyId),
    ])
      .then(([exp, rec]) => { setExpenses(exp); setRecurring(rec); })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [activePharmacyId, categoryFilter]);

  const openExpenseModal = () => {
    setExpenseForm(emptyExpenseForm);
    setExpenseError('');
    setShowExpenseModal(true);
  };

  const handleExpenseChange = (field) => (e) => setExpenseForm({ ...expenseForm, [field]: e.target.value });

  const handleExpenseSubmit = async (e) => {
    e.preventDefault();
    setExpenseError('');
    setSubmittingExpense(true);
    try {
      await recordExpense(activePharmacyId, {
        label: expenseForm.label.trim(),
        category: expenseForm.category,
        amount: Number(expenseForm.amount),
        currency: expenseForm.currency,
        payment_method: expenseForm.payment_method,
        expense_date: expenseForm.expense_date,
        notes: expenseForm.notes.trim() || undefined,
      });
      setShowExpenseModal(false);
      setResultMessage('Depense enregistree.');
      load(true);
    } catch (err) {
      setExpenseError(err.response?.data?.message || "Erreur lors de l'enregistrement.");
    } finally {
      setSubmittingExpense(false);
    }
  };

  const openRecurringModal = () => {
    setRecurringForm(emptyRecurringForm);
    setRecurringError('');
    setShowRecurringModal(true);
  };

  const handleRecurringChange = (field) => (e) => setRecurringForm({ ...recurringForm, [field]: e.target.value });

  const handleRecurringSubmit = async (e) => {
    e.preventDefault();
    setRecurringError('');
    setSubmittingRecurring(true);
    try {
      await createRecurringExpense(activePharmacyId, {
        label: recurringForm.label.trim(),
        category: recurringForm.category,
        amount: Number(recurringForm.amount),
        currency: recurringForm.currency,
        frequency: recurringForm.frequency,
        day_of_period: recurringForm.day_of_period ? Number(recurringForm.day_of_period) : undefined,
      });
      setShowRecurringModal(false);
      setResultMessage('Charge recurrente creee.');
      load(true);
    } catch (err) {
      setRecurringError(err.response?.data?.message || 'Erreur lors de la creation.');
    } finally {
      setSubmittingRecurring(false);
    }
  };

  const openPayModal = (rec) => {
    setPayingRecurring(rec);
    setPayDate(todayISO());
    setPayError('');
    setShowPayModal(true);
  };

  const handlePaySubmit = async (e) => {
    e.preventDefault();
    setPayError('');
    setSubmittingPay(true);
    try {
      await payRecurringExpense(activePharmacyId, payingRecurring.id, payDate);
      setShowPayModal(false);
      setResultMessage('Paiement enregistre comme depense.');
      load(true);
    } catch (err) {
      setPayError(err.response?.data?.message || 'Erreur lors du paiement.');
    } finally {
      setSubmittingPay(false);
    }
  };

  if (!canAccess) {
    return (
      <div>
        <div className="module-header">
          <div className="module-title-block">
            <span className="tag mono">MOD-10</span>
            <h2>Charges</h2>
          </div>
        </div>
        <div className="empty-state">Acces reserve a la Finance.</div>
      </div>
    );
  }

  return (
    <div>
      <div className="module-header">
        <div className="module-title-block">
          <span className="tag mono">MOD-10</span>
          <h2>Charges</h2>
        </div>
        {tab === 'expenses' ? (
          <button className="module-primary-btn" onClick={openExpenseModal}>+ Nouvelle depense</button>
        ) : (
          <button className="module-primary-btn" onClick={openRecurringModal}>+ Charge recurrente</button>
        )}
      </div>

      {resultMessage && <div className="info-banner">{resultMessage}</div>}

      <div className="tab-bar">
        <button className={tab === 'expenses' ? 'tab-btn active' : 'tab-btn'} onClick={() => setTab('expenses')}>Depenses</button>
        <button className={tab === 'recurring' ? 'tab-btn active' : 'tab-btn'} onClick={() => setTab('recurring')}>Charges recurrentes</button>
      </div>

      {tab === 'expenses' && (
        <div>
          <div className="form-field" style={{ maxWidth: '260px', marginBottom: '16px' }}>
            <label>Filtrer par categorie</label>
            <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
              <option value="">Toutes</option>
              {CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>)}
            </select>
          </div>

          <div className="data-table-wrap">
            {loading ? null : expenses.length === 0 ? (
              <div className="empty-state">Aucune depense.</div>
            ) : (
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Date</th><th>Libelle</th><th>Categorie</th><th className="num">Montant</th>
                    <th>Methode</th><th>Enregistre par</th><th>Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {expenses.map((e) => (
                    <tr key={e.id}>
                      <td>{formatDate(e.expense_date)}</td>
                      <td>{e.label}</td>
                      <td>{CATEGORY_LABELS[e.category] || e.category}</td>
                      <td className="num">{Number(e.amount).toLocaleString('fr-FR')} {e.currency}</td>
                      <td>{PAYMENT_LABELS[e.payment_method] || e.payment_method}</td>
                      <td>{e.recorder?.name || '—'}</td>
                      <td>{e.notes || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {tab === 'recurring' && (
        <div className="data-table-wrap">
          {loading ? null : recurring.length === 0 ? (
            <div className="empty-state">Aucune charge recurrente.</div>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Libelle</th><th>Categorie</th><th className="num">Montant</th>
                  <th>Frequence</th><th>Jour</th><th>Statut</th><th>Cree par</th><th></th>
                </tr>
              </thead>
              <tbody>
                {recurring.map((r) => (
                  <tr key={r.id}>
                    <td>{r.label}</td>
                    <td>{CATEGORY_LABELS[r.category] || r.category}</td>
                    <td className="num">{Number(r.amount).toLocaleString('fr-FR')} {r.currency}</td>
                    <td>{FREQUENCY_LABELS[r.frequency] || r.frequency}</td>
                    <td>{r.day_of_period || '—'}</td>
                    <td>{r.status === 'ACTIVE' ? <span className="badge-status ok">Active</span> : <span className="badge-status danger">Inactive</span>}</td>
                    <td>{r.creator?.name || '—'}</td>
                    <td className="row-actions">
                      <button type="button" className="table-link-btn accent" onClick={() => openPayModal(r)}>Payer maintenant</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {showExpenseModal && (
        <div className="modal-overlay" onClick={() => setShowExpenseModal(false)}>
          <div className="modal-panel" onClick={(e) => e.stopPropagation()}>
            <div className="modal-drag-handle"><h3>Nouvelle depense</h3></div>
            {expenseError && <div className="form-error">{expenseError}</div>}
            <form onSubmit={handleExpenseSubmit}>
              <div className="form-grid">
                <div className="form-field full">
                  <label>Libelle</label>
                  <input value={expenseForm.label} onChange={handleExpenseChange('label')} required />
                </div>
                <div className="form-field">
                  <label>Categorie</label>
                  <select value={expenseForm.category} onChange={handleExpenseChange('category')}>
                    {CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>)}
                  </select>
                </div>
                <div className="form-field">
                  <label>Date</label>
                  <input type="date" value={expenseForm.expense_date} onChange={handleExpenseChange('expense_date')} required />
                </div>
                <div className="form-field">
                  <label>Montant</label>
                  <input type="number" min="0" value={expenseForm.amount} onChange={handleExpenseChange('amount')} required />
                </div>
                <div className="form-field">
                  <label>Devise</label>
                  <select value={expenseForm.currency} onChange={handleExpenseChange('currency')}>
                    <option value="CDF">CDF</option>
                    <option value="USD">USD</option>
                  </select>
                </div>
                <div className="form-field full">
                  <label>Methode de paiement</label>
                  <select value={expenseForm.payment_method} onChange={handleExpenseChange('payment_method')}>
                    {PAYMENT_METHODS.map((m) => <option key={m} value={m}>{PAYMENT_LABELS[m]}</option>)}
                  </select>
                </div>
                <div className="form-field full">
                  <label>Notes (optionnel)</label>
                  <input value={expenseForm.notes} onChange={handleExpenseChange('notes')} />
                </div>
              </div>
              <div className="modal-actions">
                <button type="button" className="modal-cancel" onClick={() => setShowExpenseModal(false)}>Annuler</button>
                <button type="submit" className="module-primary-btn" disabled={submittingExpense}>
                  {submittingExpense ? 'Enregistrement...' : 'Enregistrer'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showRecurringModal && (
        <div className="modal-overlay" onClick={() => setShowRecurringModal(false)}>
          <div className="modal-panel" onClick={(e) => e.stopPropagation()}>
            <div className="modal-drag-handle"><h3>Nouvelle charge recurrente</h3></div>
            <p className="modal-subtext">Le paiement reel se declenche manuellement via "Payer maintenant", jamais automatiquement.</p>
            {recurringError && <div className="form-error">{recurringError}</div>}
            <form onSubmit={handleRecurringSubmit}>
              <div className="form-grid">
                <div className="form-field full">
                  <label>Libelle</label>
                  <input value={recurringForm.label} onChange={handleRecurringChange('label')} required />
                </div>
                <div className="form-field">
                  <label>Categorie</label>
                  <select value={recurringForm.category} onChange={handleRecurringChange('category')}>
                    {CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>)}
                  </select>
                </div>
                <div className="form-field">
                  <label>Frequence</label>
                  <select value={recurringForm.frequency} onChange={handleRecurringChange('frequency')}>
                    <option value="MONTHLY">Mensuelle</option>
                    <option value="WEEKLY">Hebdomadaire</option>
                    <option value="YEARLY">Annuelle</option>
                  </select>
                </div>
                <div className="form-field">
                  <label>Montant</label>
                  <input type="number" min="0" value={recurringForm.amount} onChange={handleRecurringChange('amount')} required />
                </div>
                <div className="form-field">
                  <label>Devise</label>
                  <select value={recurringForm.currency} onChange={handleRecurringChange('currency')}>
                    <option value="CDF">CDF</option>
                    <option value="USD">USD</option>
                  </select>
                </div>
                <div className="form-field full">
                  <label>Jour du mois/semaine (optionnel)</label>
                  <input type="number" min="1" value={recurringForm.day_of_period} onChange={handleRecurringChange('day_of_period')} placeholder="ex: 5" />
                </div>
              </div>
              <div className="modal-actions">
                <button type="button" className="modal-cancel" onClick={() => setShowRecurringModal(false)}>Annuler</button>
                <button type="submit" className="module-primary-btn" disabled={submittingRecurring}>
                  {submittingRecurring ? 'Creation...' : 'Creer'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showPayModal && (
        <div className="modal-overlay" onClick={() => setShowPayModal(false)}>
          <div className="modal-panel" onClick={(e) => e.stopPropagation()}>
            <div className="modal-drag-handle"><h3>Payer - {payingRecurring?.label}</h3></div>
            <p className="modal-subtext">
              Montant : {Number(payingRecurring?.amount).toLocaleString('fr-FR')} {payingRecurring?.currency} - Confirme un paiement reel, enregistre comme depense.
            </p>
            {payError && <div className="form-error">{payError}</div>}
            <form onSubmit={handlePaySubmit}>
              <div className="form-grid">
                <div className="form-field full">
                  <label>Date du paiement</label>
                  <input type="date" value={payDate} onChange={(e) => setPayDate(e.target.value)} required />
                </div>
              </div>
              <div className="modal-actions">
                <button type="button" className="modal-cancel" onClick={() => setShowPayModal(false)}>Annuler</button>
                <button type="submit" className="module-primary-btn" disabled={submittingPay}>
                  {submittingPay ? 'Envoi...' : 'Confirmer le paiement'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}