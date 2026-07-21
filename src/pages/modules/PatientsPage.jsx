import { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import {
  listPatients, createPatient, getPatientUnifiedProfile,
  updateNotificationPreference, listPendingReminders,
} from '../../services/patients';

const CRM_ROLES = ['PHARMACY_ADMIN', 'PHARMACY_TITULAIRE', 'PHARMACY_CAISSIER'];
const SENSITIVE_ROLES = ['PHARMACY_ADMIN', 'PHARMACY_TITULAIRE'];

const CHANNEL_LABELS = { SMS: 'SMS', WHATSAPP: 'WhatsApp', EMAIL: 'Email', NONE: 'Aucun' };
const SALE_STATUS_LABELS = { COMPLETED: 'Completee', CANCELLED: 'Annulee' };
const PRESCRIPTION_STATUS_LABELS = { PENDING: 'En attente', VALIDATED: 'Validee', REJECTED: 'Rejetee', EXPIRED: 'Expiree' };

function formatDate(dateStr) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('fr-FR', { year: 'numeric', month: 'long', day: 'numeric' });
}

const emptyPatientForm = { full_name: '', phone: '', date_of_birth: '' };
const emptyPrefForm = { notification_channel: 'SMS', notification_opt_in: true };

export default function PatientsPage() {
  const { activePharmacyId, user } = useAuth();
  const canView = SENSITIVE_ROLES.includes(user?.role);
  const canManage = CRM_ROLES.includes(user?.role);

  const [tab, setTab] = useState('patients');
  const [patients, setPatients] = useState([]);
  const [reminders, setReminders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [resultMessage, setResultMessage] = useState('');

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [patientForm, setPatientForm] = useState(emptyPatientForm);
  const [createError, setCreateError] = useState('');
  const [submittingCreate, setSubmittingCreate] = useState(false);

  const [showPrefModal, setShowPrefModal] = useState(false);
  const [prefPatient, setPrefPatient] = useState(null);
  const [prefForm, setPrefForm] = useState(emptyPrefForm);
  const [prefError, setPrefError] = useState('');
  const [submittingPref, setSubmittingPref] = useState(false);

  const [showProfileModal, setShowProfileModal] = useState(false);
  const [profileData, setProfileData] = useState(null);
  const [loadingProfile, setLoadingProfile] = useState(false);
  const [profileError, setProfileError] = useState('');

  const load = (silent = false) => {
    if (!activePharmacyId) return;
    if (!silent) setLoading(true);
    const calls = [listPatients(activePharmacyId)];
    if (canView) calls.push(listPendingReminders(activePharmacyId));

    Promise.all(calls)
      .then(([patientsData, remindersData]) => {
        setPatients(patientsData);
        if (remindersData) setReminders(remindersData);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [activePharmacyId]);

  const openCreateModal = () => {
    setPatientForm(emptyPatientForm);
    setCreateError('');
    setShowCreateModal(true);
  };

  const handleCreateChange = (field) => (e) => setPatientForm({ ...patientForm, [field]: e.target.value });

  const handleCreateSubmit = async (e) => {
    e.preventDefault();
    setCreateError('');
    setSubmittingCreate(true);
    try {
      await createPatient(activePharmacyId, {
        full_name: patientForm.full_name.trim(),
        phone: patientForm.phone.trim() || undefined,
        date_of_birth: patientForm.date_of_birth || undefined,
      });
      setShowCreateModal(false);
      setResultMessage('Patient enregistre.');
      load(true);
    } catch (err) {
      setCreateError(err.response?.data?.message || "Erreur lors de la creation du patient.");
    } finally {
      setSubmittingCreate(false);
    }
  };

  const openPrefModal = (patient) => {
    setPrefPatient(patient);
    setPrefForm({
      notification_channel: patient.notification_channel || 'SMS',
      notification_opt_in: patient.notification_opt_in !== false,
    });
    setPrefError('');
    setShowPrefModal(true);
  };

  const handlePrefSubmit = async (e) => {
    e.preventDefault();
    setPrefError('');
    setSubmittingPref(true);
    try {
      await updateNotificationPreference(activePharmacyId, prefPatient.id, prefForm);
      setShowPrefModal(false);
      setResultMessage('Preferences mises a jour.');
      load(true);
    } catch (err) {
      setPrefError(err.response?.data?.message || 'Erreur lors de la mise a jour.');
    } finally {
      setSubmittingPref(false);
    }
  };

  const openProfileModal = async (patient) => {
    setShowProfileModal(true);
    setLoadingProfile(true);
    setProfileError('');
    setProfileData(null);
    try {
      const data = await getPatientUnifiedProfile(activePharmacyId, patient.id);
      setProfileData(data);
    } catch (err) {
      setProfileError(err.response?.data?.message || 'Erreur lors du chargement de la fiche.');
    } finally {
      setLoadingProfile(false);
    }
  };

  return (
    <div>
      <div className="module-header">
        <div className="module-title-block">
          <span className="tag mono">MOD-06</span>
          <h2>Patients</h2>
        </div>
        {canManage && (
          <button className="module-primary-btn" onClick={openCreateModal}>
            + Nouveau patient
          </button>
        )}
      </div>

      {resultMessage && <div className="info-banner">{resultMessage}</div>}

      <div className="tab-bar">
        <button className={tab === 'patients' ? 'tab-btn active' : 'tab-btn'} onClick={() => setTab('patients')}>Patients</button>
        {canView && (
          <button className={tab === 'reminders' ? 'tab-btn active' : 'tab-btn'} onClick={() => setTab('reminders')}>
            Rappels {reminders.length > 0 ? '(' + reminders.length + ')' : ''}
          </button>
        )}
      </div>

      {tab === 'patients' && (
        <div className="data-table-wrap">
          {loading ? null : patients.length === 0 ? (
            <div className="empty-state">Aucun patient enregistre.</div>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Nom complet</th>
                  <th>Telephone</th>
                  <th>Date de naissance</th>
                  <th>Canal notification</th>
                  <th>Opt-in</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {patients.map((p) => (
                  <tr key={p.id}>
                    <td>{p.full_name}</td>
                    <td>{p.phone || '—'}</td>
                    <td>{p.date_of_birth ? formatDate(p.date_of_birth) : '—'}</td>
                    <td>{CHANNEL_LABELS[p.notification_channel] || '—'}</td>
                    <td>{p.notification_opt_in ? <span className="badge-status ok">Oui</span> : <span className="badge-status danger">Non</span>}</td>
                    <td className="row-actions">
                      {canView && (
                        <button type="button" className="table-link-btn accent" onClick={() => openProfileModal(p)}>Voir fiche</button>
                      )}
                      {canManage && (
                        <button type="button" className="table-link-btn" onClick={() => openPrefModal(p)}>Preferences</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {tab === 'reminders' && canView && (
        <div className="data-table-wrap">
          {reminders.length === 0 ? (
            <div className="empty-state">Aucun rappel de renouvellement en attente.</div>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Patient</th>
                  <th>Telephone</th>
                  <th>Canal</th>
                  <th>Opt-in</th>
                  <th>Echeance</th>
                </tr>
              </thead>
              <tbody>
                {reminders.map((r) => (
                  <tr key={r.id}>
                    <td>{r.patients?.full_name || '—'}</td>
                    <td>{r.patients?.phone || '—'}</td>
                    <td>{CHANNEL_LABELS[r.patients?.notification_channel] || '—'}</td>
                    <td>{r.patients?.notification_opt_in ? <span className="badge-status ok">Oui</span> : <span className="badge-status danger">Non</span>}</td>
                    <td>{formatDate(r.due_date)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {showCreateModal && (
        <div className="modal-overlay" onClick={() => setShowCreateModal(false)}>
          <div className="modal-panel" onClick={(e) => e.stopPropagation()}>
            <div className="modal-drag-handle"><h3>Nouveau patient</h3></div>
            {createError && <div className="form-error">{createError}</div>}
            <form onSubmit={handleCreateSubmit}>
              <div className="form-grid">
                <div className="form-field full">
                  <label>Nom complet</label>
                  <input value={patientForm.full_name} onChange={handleCreateChange('full_name')} required />
                </div>
                <div className="form-field">
                  <label>Telephone</label>
                  <input value={patientForm.phone} onChange={handleCreateChange('phone')} placeholder="optionnel" />
                </div>
                <div className="form-field">
                  <label>Date de naissance</label>
                  <input type="date" value={patientForm.date_of_birth} onChange={handleCreateChange('date_of_birth')} />
                </div>
              </div>
              <div className="modal-actions">
                <button type="button" className="modal-cancel" onClick={() => setShowCreateModal(false)}>Annuler</button>
                <button type="submit" className="module-primary-btn" disabled={submittingCreate}>
                  {submittingCreate ? 'Enregistrement...' : 'Enregistrer'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showPrefModal && (
        <div className="modal-overlay" onClick={() => setShowPrefModal(false)}>
          <div className="modal-panel" onClick={(e) => e.stopPropagation()}>
            <div className="modal-drag-handle"><h3>Preferences de notification - {prefPatient?.full_name}</h3></div>
            {prefError && <div className="form-error">{prefError}</div>}
            <form onSubmit={handlePrefSubmit}>
              <div className="form-grid">
                <div className="form-field full">
                  <label>Canal</label>
                  <select value={prefForm.notification_channel} onChange={(e) => setPrefForm({ ...prefForm, notification_channel: e.target.value })}>
                    <option value="SMS">SMS</option>
                    <option value="WHATSAPP">WhatsApp</option>
                    <option value="EMAIL">Email</option>
                    <option value="NONE">Aucun</option>
                  </select>
                </div>
                <div className="form-field full checkbox-field">
                  <label>
                    <input
                      type="checkbox"
                      checked={prefForm.notification_opt_in}
                      onChange={(e) => setPrefForm({ ...prefForm, notification_opt_in: e.target.checked })}
                    />
                    Le patient accepte de recevoir des notifications
                  </label>
                </div>
              </div>
              <div className="modal-actions">
                <button type="button" className="modal-cancel" onClick={() => setShowPrefModal(false)}>Annuler</button>
                <button type="submit" className="module-primary-btn" disabled={submittingPref}>
                  {submittingPref ? 'Enregistrement...' : 'Enregistrer'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showProfileModal && (
        <div className="modal-overlay" onClick={() => setShowProfileModal(false)}>
          <div className="modal-panel" style={{ minWidth: '620px' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-drag-handle"><h3>Fiche patient</h3></div>
            {loadingProfile ? (
              <div className="empty-state">Chargement...</div>
            ) : profileError ? (
              <div className="form-error">{profileError}</div>
            ) : profileData ? (
              <>
                <p className="modal-subtext">
                  <strong>{profileData.patient.full_name}</strong><br />
                  {profileData.patient.phone && <>Telephone : {profileData.patient.phone}<br /></>}
                  {profileData.patient.date_of_birth && <>Date de naissance : {formatDate(profileData.patient.date_of_birth)}<br /></>}
                  {profileData.patient.chronic_conditions && <>Pathologies chroniques : {profileData.patient.chronic_conditions}<br /></>}
                  Solde fidelite : {profileData.loyalty_balance} points
                </p>

                <h4 style={{ fontSize: '14px', margin: '16px 0 8px' }}>Historique des ventes</h4>
                <div className="data-table-wrap">
                  {profileData.sales_history.length === 0 ? (
                    <div className="empty-state">Aucune vente.</div>
                  ) : (
                    <table className="data-table">
                      <thead><tr><th>Date</th><th className="num">Total</th><th>Statut</th></tr></thead>
                      <tbody>
                        {profileData.sales_history.map((s) => (
                          <tr key={s.id}>
                            <td>{formatDate(s.created_at)}</td>
                            <td className="num">{Number(s.total_amount).toLocaleString('fr-FR')} CDF</td>
                            <td>{SALE_STATUS_LABELS[s.status] || s.status}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>

                <h4 style={{ fontSize: '14px', margin: '16px 0 8px' }}>Historique des ordonnances</h4>
                <div className="data-table-wrap">
                  {profileData.prescriptions_history.length === 0 ? (
                    <div className="empty-state">Aucune ordonnance.</div>
                  ) : (
                    <table className="data-table">
                      <thead><tr><th>Date</th><th>Statut</th><th>Substance controlee</th></tr></thead>
                      <tbody>
                        {profileData.prescriptions_history.map((p) => (
                          <tr key={p.id}>
                            <td>{formatDate(p.created_at)}</td>
                            <td>{PRESCRIPTION_STATUS_LABELS[p.status] || p.status}</td>
                            <td>{p.is_controlled_substance ? 'Oui' : 'Non'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </>
            ) : null}
            <div className="modal-actions">
              <button type="button" className="modal-cancel" onClick={() => setShowProfileModal(false)}>Fermer</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}