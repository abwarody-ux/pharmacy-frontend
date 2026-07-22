import { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import {
  generateRestockRecommendations, detectAdjustmentAnomalies,
  listRecommendations, reviewRecommendation,
} from '../../services/ai';

const AI_ROLES = ['PHARMACY_ADMIN', 'PHARMACY_TITULAIRE', 'PHARMACY_ACHATS'];
const AUDIT_ROLES = ['PHARMACY_ADMIN', 'PHARMACY_TITULAIRE', 'PHARMACY_AUDITEUR'];

const TYPE_LABELS = { RESTOCK: 'Reapprovisionnement', ANOMALY: 'Anomalie' };
const STATUS_LABELS = { PENDING: 'En attente', REVIEWED: 'Revue', DISMISSED: 'Ecartee' };

function StatusBadge({ status }) {
  const cls = {
    PENDING: 'badge-status warn', REVIEWED: 'badge-status ok', DISMISSED: 'badge-status danger',
  }[status] || 'badge-status';
  return <span className={cls}>{STATUS_LABELS[status] || status}</span>;
}

function formatDateTime(dateStr) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleString('fr-FR', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function AiPage() {
  const { activePharmacyId, user } = useAuth();
  const canGenerateRestock = AI_ROLES.includes(user?.role);
  const canDetectAnomalies = AUDIT_ROLES.includes(user?.role);
  const canView = AI_ROLES.includes(user?.role) || user?.role === 'PHARMACY_AUDITEUR';
  const canReview = AI_ROLES.includes(user?.role);

  const [recommendations, setRecommendations] = useState([]);
  const [statusFilter, setStatusFilter] = useState('PENDING');
  const [loading, setLoading] = useState(true);
  const [resultMessage, setResultMessage] = useState('');
  const [generatingRestock, setGeneratingRestock] = useState(false);
  const [detectingAnomalies, setDetectingAnomalies] = useState(false);

  const load = (silent = false) => {
    if (!activePharmacyId || !canView) return;
    if (!silent) setLoading(true);
    listRecommendations(activePharmacyId, statusFilter || undefined)
      .then(setRecommendations)
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [activePharmacyId, statusFilter]);

  const handleGenerateRestock = async () => {
    setGeneratingRestock(true);
    try {
      const result = await generateRestockRecommendations(activePharmacyId);
      setResultMessage(result.generated + ' nouvelle(s) recommandation(s) de reapprovisionnement generee(s).');
      load(true);
    } catch (err) {
      setResultMessage(err.response?.data?.message || 'Erreur lors de la generation.');
    } finally {
      setGeneratingRestock(false);
    }
  };

  const handleDetectAnomalies = async () => {
    setDetectingAnomalies(true);
    try {
      const result = await detectAdjustmentAnomalies(activePharmacyId);
      setResultMessage(result.anomalies_detected + ' anomalie(s) detectee(s).');
      load(true);
    } catch (err) {
      setResultMessage(err.response?.data?.message || 'Erreur lors de la detection.');
    } finally {
      setDetectingAnomalies(false);
    }
  };

  const handleReview = async (rec, decision) => {
    try {
      await reviewRecommendation(activePharmacyId, rec.id, decision);
      load(true);
    } catch (err) {
      alert(err.response?.data?.message || 'Erreur lors de la revue.');
    }
  };

  if (!canView) {
    return (
      <div>
        <div className="module-header">
          <div className="module-title-block">
            <span className="tag mono">MOD-13</span>
            <h2>IA</h2>
          </div>
        </div>
        <div className="empty-state">Acces reserve a l'Admin, au Titulaire, aux Achats et a l'Auditeur.</div>
      </div>
    );
  }

  return (
    <div>
      <div className="module-header">
        <div className="module-title-block">
          <span className="tag mono">MOD-13</span>
          <h2>IA - Recommandations</h2>
        </div>
        <div>
          {canGenerateRestock && (
            <button className="table-link-btn accent" style={{ marginRight: '8px' }} disabled={generatingRestock} onClick={handleGenerateRestock}>
              {generatingRestock ? 'Generation...' : 'Generer reappro'}
            </button>
          )}
          {canDetectAnomalies && (
            <button className="module-primary-btn" disabled={detectingAnomalies} onClick={handleDetectAnomalies}>
              {detectingAnomalies ? 'Detection...' : 'Detecter anomalies'}
            </button>
          )}
        </div>
      </div>

      <p className="modal-subtext" style={{ marginBottom: '16px' }}>
        Aucune commande n'est jamais emise automatiquement : chaque recommandation reste une suggestion soumise a revue humaine.
      </p>

      {resultMessage && <div className="info-banner">{resultMessage}</div>}

      <div className="form-field" style={{ maxWidth: '220px', marginBottom: '16px' }}>
        <label>Filtrer par statut</label>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="">Tous</option>
          <option value="PENDING">En attente</option>
          <option value="REVIEWED">Revue</option>
          <option value="DISMISSED">Ecartee</option>
        </select>
      </div>

      <div className="data-table-wrap">
        {loading ? null : recommendations.length === 0 ? (
          <div className="empty-state">Aucune recommandation.</div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Type</th><th>Produit</th><th className="num">Qte suggeree</th>
                <th>Justification</th><th>Statut</th><th>Revu par</th><th>Date</th><th></th>
              </tr>
            </thead>
            <tbody>
              {recommendations.map((r) => (
                <tr key={r.id}>
                  <td><span className={r.recommendation_type === 'ANOMALY' ? 'badge-status warn' : 'badge-status info'}>{TYPE_LABELS[r.recommendation_type] || r.recommendation_type}</span></td>
                  <td>{r.products?.name || '—'}</td>
                  <td className="num">{r.suggested_quantity ?? '—'}</td>
                  <td style={{ maxWidth: '320px' }}>{r.rationale}</td>
                  <td><StatusBadge status={r.status} /></td>
                  <td>{r.reviewer?.name || '—'}</td>
                  <td>{formatDateTime(r.created_at)}</td>
                  <td className="row-actions">
                    {r.status === 'PENDING' && canReview && (
                      <>
                        <button type="button" className="table-link-btn accent" onClick={() => handleReview(r, 'REVIEWED')}>Marquer revue</button>
                        <button type="button" className="table-link-btn warn" onClick={() => handleReview(r, 'DISMISSED')}>Ecarter</button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}