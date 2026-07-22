import { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { listProducts } from '../../services/products';
import { listRevaluations, proposeRevaluation, getRevaluation, approveRevaluation } from '../../services/priceRevaluations';

const FINANCE_ROLES = ['PHARMACY_ADMIN', 'PHARMACY_FINANCE'];

const STATUS_LABELS = {
  PENDING_APPROVAL: 'En attente', APPLIED: 'Appliquee', REJECTED: 'Rejetee',
};

function StatusBadge({ status }) {
  const cls = {
    PENDING_APPROVAL: 'badge-status warn', APPLIED: 'badge-status ok', REJECTED: 'badge-status danger',
  }[status] || 'badge-status';
  return <span className={cls}>{STATUS_LABELS[status] || status}</span>;
}

function formatDateTime(dateStr) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleString('fr-FR', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function PriceRevaluationsPage() {
  const { activePharmacyId, user } = useAuth();
  const canAccess = FINANCE_ROLES.includes(user?.role);
  const canApprove = user?.role === 'PHARMACY_FINANCE';

  const [revaluations, setRevaluations] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [resultMessage, setResultMessage] = useState('');

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [percentage, setPercentage] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [createError, setCreateError] = useState('');
  const [submittingCreate, setSubmittingCreate] = useState(false);

  const [showDetailModal, setShowDetailModal] = useState(false);
  const [activeRevaluation, setActiveRevaluation] = useState(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [detailError, setDetailError] = useState('');
  const [submittingApproval, setSubmittingApproval] = useState(false);

  const load = (silent = false) => {
    if (!activePharmacyId) return;
    if (!silent) setLoading(true);
    listRevaluations(activePharmacyId)
      .then(setRevaluations)
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    if (activePharmacyId) {
      listProducts(activePharmacyId)
        .then((products) => {
          const unique = [...new Set(products.map((p) => p.category).filter(Boolean))];
          setCategories(unique);
        })
        .catch(() => {});
    }
  }, [activePharmacyId]);

  const openCreateModal = () => {
    setPercentage('');
    setCategoryFilter('');
    setCreateError('');
    setShowCreateModal(true);
  };

  const handleCreateSubmit = async (e) => {
    e.preventDefault();
    setCreateError('');
    const pct = Number(percentage);
    if (!percentage || pct < -90 || pct > 500) { setCreateError('Le pourcentage doit etre entre -90 et 500.'); return; }
    setSubmittingCreate(true);
    try {
      const result = await proposeRevaluation(activePharmacyId, {
        percentage: pct,
        category_filter: categoryFilter || undefined,
      });
      setShowCreateModal(false);
      setResultMessage(
        'Revalorisation proposee - ' + result.affected_products + ' produit(s) affecte(s), impact estime : ' +
        Math.round(result.estimated_stock_value_delta).toLocaleString('fr-FR') + ' CDF'
      );
      load(true);
    } catch (err) {
      setCreateError(err.response?.data?.message || 'Erreur lors de la proposition.');
    } finally {
      setSubmittingCreate(false);
    }
  };

  const openDetailModal = async (revaluation) => {
    setShowDetailModal(true);
    setLoadingDetail(true);
    setDetailError('');
    setActiveRevaluation(null);
    try {
      const data = await getRevaluation(activePharmacyId, revaluation.id);
      setActiveRevaluation(data);
    } catch (err) {
      setDetailError(err.response?.data?.message || 'Erreur lors du chargement.');
    } finally {
      setLoadingDetail(false);
    }
  };

  const submitApproval = async (approve) => {
    setDetailError('');
    setSubmittingApproval(true);
    try {
      await approveRevaluation(activePharmacyId, activeRevaluation.id, approve);
      setShowDetailModal(false);
      setResultMessage(approve ? 'Revalorisation appliquee.' : 'Revalorisation rejetee.');
      load(true);
    } catch (err) {
      setDetailError(err.response?.data?.message || "Erreur lors de l'approbation.");
    } finally {
      setSubmittingApproval(false);
    }
  };

  if (!canAccess) {
    return (
      <div>
        <div className="module-header">
          <div className="module-title-block">
            <span className="tag mono">MOD-09</span>
            <h2>Reevaluations de prix</h2>
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
          <span className="tag mono">MOD-09</span>
          <h2>Reevaluations de prix</h2>
        </div>
        <button className="module-primary-btn" onClick={openCreateModal}>+ Proposer une revalorisation</button>
      </div>

      {resultMessage && <div className="info-banner">{resultMessage}</div>}

      <div className="data-table-wrap">
        {loading ? null : revaluations.length === 0 ? (
          <div className="empty-state">Aucune revalorisation.</div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Date</th>
                <th className="num">Pourcentage</th>
                <th>Categorie</th>
                <th className="num">Impact estime</th>
                <th>Statut</th>
                <th>Demandeur</th>
                <th>Approbateur</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {revaluations.map((r) => (
                <tr key={r.id}>
                  <td>{formatDateTime(r.created_at)}</td>
                  <td className="num">{r.percentage > 0 ? '+' : ''}{r.percentage}%</td>
                  <td>{r.category_filter || 'Toutes'}</td>
                  <td className="num">{Math.round(Number(r.estimated_stock_value_delta)).toLocaleString('fr-FR')} CDF</td>
                  <td><StatusBadge status={r.status} /></td>
                  <td>{r.requester?.name || '—'}</td>
                  <td>{r.approver?.name || '—'}</td>
                  <td className="row-actions">
                    <button type="button" className="table-link-btn accent" onClick={() => openDetailModal(r)}>Voir</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showCreateModal && (
        <div className="modal-overlay" onClick={() => setShowCreateModal(false)}>
          <div className="modal-panel" onClick={(e) => e.stopPropagation()}>
            <div className="modal-drag-handle"><h3>Proposer une revalorisation de prix</h3></div>
            <p className="modal-subtext">
              Applique un pourcentage aux prix d'achat et de vente. L'impact sur le stock detenu est calcule automatiquement.
              Necessite une approbation Finance distincte du demandeur avant application reelle.
            </p>
            {createError && <div className="form-error">{createError}</div>}
            <form onSubmit={handleCreateSubmit}>
              <div className="form-grid">
                <div className="form-field full">
                  <label>Pourcentage (-90 a 500)</label>
                  <input type="number" min="-90" max="500" step="0.1" value={percentage} onChange={(e) => setPercentage(e.target.value)} required />
                </div>
                <div className="form-field full">
                  <label>Categorie (optionnel - toutes si vide)</label>
                  <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
                    <option value="">Toutes les categories</option>
                    {categories.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              </div>
              <div className="modal-actions">
                <button type="button" className="modal-cancel" onClick={() => setShowCreateModal(false)}>Annuler</button>
                <button type="submit" className="module-primary-btn" disabled={submittingCreate}>
                  {submittingCreate ? 'Envoi...' : 'Proposer'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showDetailModal && (
        <div className="modal-overlay" onClick={() => setShowDetailModal(false)}>
          <div className="modal-panel" style={{ minWidth: '700px' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-drag-handle"><h3>Detail de la revalorisation</h3></div>
            {loadingDetail ? (
              <div className="empty-state">Chargement...</div>
            ) : detailError ? (
              <div className="form-error">{detailError}</div>
            ) : activeRevaluation ? (
              <>
                <p className="modal-subtext">
                  Pourcentage : {activeRevaluation.percentage > 0 ? '+' : ''}{activeRevaluation.percentage}%<br />
                  Categorie : {activeRevaluation.category_filter || 'Toutes'}<br />
                  Statut : <StatusBadge status={activeRevaluation.status} /><br />
                  Demandeur : {activeRevaluation.requester?.name || '—'}<br />
                  {activeRevaluation.approver?.name && <>Approbateur : {activeRevaluation.approver.name}<br /></>}
                  Impact estime : {Math.round(Number(activeRevaluation.estimated_stock_value_delta)).toLocaleString('fr-FR')} CDF
                </p>

                <div className="data-table-wrap">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Produit</th>
                        <th className="num">Ancien achat</th>
                        <th className="num">Nouvel achat</th>
                        <th className="num">Ancien vente</th>
                        <th className="num">Nouvelle vente</th>
                        <th className="num">Stock au moment</th>
                        <th className="num">Impact</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(activeRevaluation.price_revaluation_lines || []).map((l) => (
                        <tr key={l.id}>
                          <td>{l.product_name}</td>
                          <td className="num">{Number(l.old_purchase_price).toLocaleString('fr-FR')} CDF</td>
                          <td className="num">{Number(l.new_purchase_price).toLocaleString('fr-FR')} CDF</td>
                          <td className="num">{Number(l.old_sale_price).toLocaleString('fr-FR')} CDF</td>
                          <td className="num">{Number(l.new_sale_price).toLocaleString('fr-FR')} CDF</td>
                          <td className="num">{l.stock_quantity_at_preview}</td>
                          <td className="num">{Math.round(Number(l.value_delta)).toLocaleString('fr-FR')} CDF</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            ) : null}

            <div className="modal-actions">
              <button type="button" className="modal-cancel" onClick={() => setShowDetailModal(false)}>Fermer</button>
              {activeRevaluation && activeRevaluation.status === 'PENDING_APPROVAL' && canApprove && activeRevaluation.requested_by !== user?.id && (
                <>
                  <button type="button" className="table-link-btn warn" disabled={submittingApproval} onClick={() => submitApproval(false)}>
                    Rejeter
                  </button>
                  <button type="button" className="module-primary-btn" disabled={submittingApproval} onClick={() => submitApproval(true)}>
                    {submittingApproval ? 'Envoi...' : 'Approuver et appliquer'}
                  </button>
                </>
              )}
              {activeRevaluation && activeRevaluation.status === 'PENDING_APPROVAL' && activeRevaluation.requested_by === user?.id && (
                <span className="hint-text">En attente d'un autre validateur Finance</span>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}