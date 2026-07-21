import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import {
  getAllLotsWithStatus, listStockMovements,
  listAdjustments, createAdjustment, approveAdjustment,
  listDiscountProposals, proposeDiscount, approveDiscount,
} from '../../services/stock';
import { connectPharmacySocket, getPharmacySocket } from '../../sockets/pharmacySocket';

const STOCK_ROLES = ['PHARMACY_ADMIN', 'PHARMACY_TITULAIRE', 'PHARMACY_ACHATS'];

const ADJUSTMENT_TYPE_LABELS = {
  ADJUSTMENT: 'Correction generale',
  EXPIRY: 'Peremption',
  DAMAGE: 'Dommage',
};

const MOVEMENT_TYPE_LABELS = {
  PURCHASE_RECEIPT: 'Reception achat',
  SUPPLIER_BONUS: 'Bonus fournisseur',
  SALE: 'Vente',
  ADJUSTMENT: 'Correction',
  EXPIRY: 'Peremption',
  DAMAGE: 'Dommage',
};

const STATUS_LABELS = {
  PENDING: 'En attente', APPROVED: 'Approuve', REJECTED: 'Rejete', PENDING_APPROVAL: 'En attente',
};

function StatusBadge({ status }) {
  const cls = {
    PENDING: 'badge-status warn', PENDING_APPROVAL: 'badge-status warn',
    APPROVED: 'badge-status ok', REJECTED: 'badge-status danger',
  }[status] || 'badge-status';
  return <span className={cls}>{STATUS_LABELS[status] || status}</span>;
}

function ExpiryBadge({ monitoring }) {
  if (!monitoring) return null;
  const labels = { EXPIRED: 'Perime', CRITICAL: 'Critique', WARNING: 'Attention', OK: 'OK' };
  const days = monitoring.days_remaining;
  const daysLabel = days < 0 ? Math.abs(days) + 'j depasse' : days + 'j restants';
  return (
    <span
      style={{
        display: 'inline-block', padding: '3px 10px', borderRadius: '999px',
        fontSize: '12px', fontWeight: 600, color: '#fff', background: monitoring.color,
      }}
    >
      {labels[monitoring.status] || monitoring.status} ({daysLabel})
    </span>
  );
}

function formatDate(dateStr) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('fr-FR', { year: 'numeric', month: 'long', day: 'numeric' });
}

const emptyAdjustmentForm = { lot_id: '', product_id: '', adjustment_type: 'ADJUSTMENT', direction: 'LOSS', quantity: '', reason: '' };
const emptyDiscountForm = { lot_id: '', product_id: '', discount_percentage: '' };

export default function StockPage() {
  const { activePharmacyId, user } = useAuth();

  const canCreateAdjustment = STOCK_ROLES.includes(user?.role);
  const canApproveAdjustment = user?.role === 'PHARMACY_ADMIN' || user?.role === 'PHARMACY_TITULAIRE';
  const canProposeDiscount = STOCK_ROLES.includes(user?.role) || user?.role === 'PHARMACY_FINANCE';
  const canApproveDiscount = user?.role === 'PHARMACY_FINANCE';

  const [tab, setTab] = useState('lots');
  const [lots, setLots] = useState([]);
  const [movements, setMovements] = useState([]);
  const [adjustments, setAdjustments] = useState([]);
  const [discounts, setDiscounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [resultMessage, setResultMessage] = useState('');

  const [showAdjustmentModal, setShowAdjustmentModal] = useState(false);
  const [adjustmentForm, setAdjustmentForm] = useState(emptyAdjustmentForm);
  const [adjustmentError, setAdjustmentError] = useState('');
  const [submittingAdjustment, setSubmittingAdjustment] = useState(false);
  const [lotLocked, setLotLocked] = useState(false);

  const [showDiscountModal, setShowDiscountModal] = useState(false);
  const [discountForm, setDiscountForm] = useState(emptyDiscountForm);
  const [discountError, setDiscountError] = useState('');
  const [submittingDiscount, setSubmittingDiscount] = useState(false);

  const [dragPos, setDragPos] = useState({ x: 0, y: 0 });
  const dragState = useRef({ dragging: false, startX: 0, startY: 0, originX: 0, originY: 0 });

  const load = (silent = false) => {
    if (!activePharmacyId) return;
    if (!silent) setLoading(true);
    Promise.all([
      getAllLotsWithStatus(activePharmacyId),
      listStockMovements(activePharmacyId),
      listAdjustments(activePharmacyId),
      listDiscountProposals(activePharmacyId),
    ])
      .then(([lotsData, movementsData, adjustmentsData, discountsData]) => {
        setLots(lotsData);
        setMovements(movementsData);
        setAdjustments(adjustmentsData);
        setDiscounts(discountsData);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, [activePharmacyId]);

  useEffect(() => {
    if (!activePharmacyId) return;
    const token = localStorage.getItem('kasmok_pharmacy_token');
    if (!token) return;
    connectPharmacySocket(token, activePharmacyId);
    const socket = getPharmacySocket();
    if (!socket) return;
    const handleUpdate = () => load(true);
    socket.on('purchase:update', handleUpdate);
    return () => socket.off('purchase:update', handleUpdate);
  }, [activePharmacyId]);

  const uniqueProducts = (() => {
    const map = new Map();
    lots.forEach((l) => {
      if (!map.has(l.product_id)) map.set(l.product_id, l.products?.name || l.product_id);
    });
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  })();

  const lotsForProduct = (productId) => lots.filter((l) => l.product_id === productId);

  const openAdjustmentModal = (lot) => {
    if (lot) {
      setAdjustmentForm({ ...emptyAdjustmentForm, lot_id: lot.id, product_id: lot.product_id });
      setLotLocked(true);
    } else {
      setAdjustmentForm(emptyAdjustmentForm);
      setLotLocked(false);
    }
    setAdjustmentError('');
    setDragPos({ x: 0, y: 0 });
    setShowAdjustmentModal(true);
  };

  const handleAdjustmentProductChange = (e) => {
    setAdjustmentForm({ ...adjustmentForm, product_id: e.target.value, lot_id: '' });
  };

  const handleAdjustmentFieldChange = (field) => (e) => {
    setAdjustmentForm({ ...adjustmentForm, [field]: e.target.value });
  };

  const handleAdjustmentSubmit = async (e) => {
    e.preventDefault();
    setAdjustmentError('');
    if (!adjustmentForm.lot_id) { setAdjustmentError('Selectionnez un lot.'); return; }
    if (!adjustmentForm.quantity || Number(adjustmentForm.quantity) <= 0) { setAdjustmentError('Quantite invalide.'); return; }
    if (!adjustmentForm.reason.trim()) { setAdjustmentError('La raison est requise.'); return; }
    setSubmittingAdjustment(true);
    try {
      const delta = adjustmentForm.direction === 'LOSS' ? -Number(adjustmentForm.quantity) : Number(adjustmentForm.quantity);
      await createAdjustment(activePharmacyId, {
        lot_id: adjustmentForm.lot_id,
        adjustment_type: adjustmentForm.adjustment_type,
        quantity_delta: delta,
        reason: adjustmentForm.reason.trim(),
      });
      setShowAdjustmentModal(false);
      setResultMessage('Ajustement soumis pour approbation.');
      load(true);
    } catch (err) {
      setAdjustmentError(err.response?.data?.message || "Erreur lors de la soumission de l'ajustement.");
    } finally {
      setSubmittingAdjustment(false);
    }
  };

  const handleApproveAdjustment = async (adjustment, approve) => {
    try {
      await approveAdjustment(activePharmacyId, adjustment.id, approve);
      load(true);
    } catch (err) {
      alert(err.response?.data?.message || "Erreur lors de l'approbation.");
    }
  };

  const openDiscountModal = (lot) => {
    if (lot) {
      setDiscountForm({ ...emptyDiscountForm, lot_id: lot.id, product_id: lot.product_id });
      setLotLocked(true);
    } else {
      setDiscountForm(emptyDiscountForm);
      setLotLocked(false);
    }
    setDiscountError('');
    setDragPos({ x: 0, y: 0 });
    setShowDiscountModal(true);
  };

  const handleDiscountProductChange = (e) => {
    setDiscountForm({ ...discountForm, product_id: e.target.value, lot_id: '' });
  };

  const handleDiscountFieldChange = (field) => (e) => {
    setDiscountForm({ ...discountForm, [field]: e.target.value });
  };

  const handleDiscountSubmit = async (e) => {
    e.preventDefault();
    setDiscountError('');
    if (!discountForm.lot_id) { setDiscountError('Selectionnez un lot.'); return; }
    const pct = Number(discountForm.discount_percentage);
    if (!pct || pct < 1 || pct > 90) { setDiscountError('Le pourcentage doit etre entre 1 et 90.'); return; }
    setSubmittingDiscount(true);
    try {
      await proposeDiscount(activePharmacyId, {
        lot_id: discountForm.lot_id,
        discount_percentage: pct,
      });
      setShowDiscountModal(false);
      setResultMessage('Proposition de rabais soumise a la Finance.');
      load(true);
    } catch (err) {
      setDiscountError(err.response?.data?.message || 'Erreur lors de la soumission de la proposition.');
    } finally {
      setSubmittingDiscount(false);
    }
  };

  const handleApproveDiscount = async (proposal, approve) => {
    try {
      await approveDiscount(activePharmacyId, proposal.id, approve);
      load(true);
    } catch (err) {
      alert(err.response?.data?.message || "Erreur lors de l'approbation.");
    }
  };

  const handleDragMove = (e) => {
    if (!dragState.current.dragging) return;
    const deltaX = e.clientX - dragState.current.startX;
    const deltaY = e.clientY - dragState.current.startY;
    setDragPos({ x: dragState.current.originX + deltaX, y: dragState.current.originY + deltaY });
  };
  const handleDragEnd = () => {
    dragState.current.dragging = false;
    window.removeEventListener('mousemove', handleDragMove);
    window.removeEventListener('mouseup', handleDragEnd);
  };
  const handleDragStart = (e) => {
    e.preventDefault();
    window.removeEventListener('mousemove', handleDragMove);
    window.removeEventListener('mouseup', handleDragEnd);
    dragState.current = { dragging: true, startX: e.clientX, startY: e.clientY, originX: dragPos.x, originY: dragPos.y };
    window.addEventListener('mousemove', handleDragMove);
    window.addEventListener('mouseup', handleDragEnd);
  };

  return (
    <div>
      <div className="module-header">
        <div className="module-title-block">
          <span className="tag mono">MOD-04</span>
          <h2>Stocks</h2>
        </div>
        <div>
          {canCreateAdjustment && (
            <button className="table-link-btn accent" style={{ marginRight: '8px' }} onClick={() => openAdjustmentModal(null)}>
              + Ajustement
            </button>
          )}
          {canProposeDiscount && (
            <button className="module-primary-btn" onClick={() => openDiscountModal(null)}>
              + Proposer un rabais
            </button>
          )}
        </div>
      </div>

      {resultMessage && <div className="info-banner">{resultMessage}</div>}

      <div className="tab-bar">
        <button className={tab === 'lots' ? 'tab-btn active' : 'tab-btn'} onClick={() => setTab('lots')}>Lots</button>
        <button className={tab === 'movements' ? 'tab-btn active' : 'tab-btn'} onClick={() => setTab('movements')}>Mouvements</button>
        <button className={tab === 'adjustments' ? 'tab-btn active' : 'tab-btn'} onClick={() => setTab('adjustments')}>
          Ajustements {adjustments.filter((a) => a.status === 'PENDING').length > 0 ? '(' + adjustments.filter((a) => a.status === 'PENDING').length + ')' : ''}
        </button>
        <button className={tab === 'discounts' ? 'tab-btn active' : 'tab-btn'} onClick={() => setTab('discounts')}>
          Remises expiration {discounts.filter((d) => d.status === 'PENDING_APPROVAL').length > 0 ? '(' + discounts.filter((d) => d.status === 'PENDING_APPROVAL').length + ')' : ''}
        </button>
      </div>

      {tab === 'lots' && (
        <div className="data-table-wrap">
          {loading ? null : lots.length === 0 ? (
            <div className="empty-state">Aucun lot en stock.</div>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Produit</th>
                  <th>Lot</th>
                  <th className="num">Quantite restante</th>
                  <th>Peremption</th>
                  <th>Statut</th>
                  <th className="num">Cout unitaire</th>
                  <th>Remise active</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {lots.map((l) => (
                  <tr key={l.id}>
                    <td>{l.products?.name || l.product_id}</td>
                    <td className="mono">{l.lot_number}</td>
                    <td className="num">{l.quantity_remaining}</td>
                    <td>{formatDate(l.expiry_date)}</td>
                    <td><ExpiryBadge monitoring={l.expiry_monitoring} /></td>
                    <td className="num">{Number(l.unit_cost).toLocaleString('fr-FR')} CDF</td>
                    <td>{l.active_discount_percentage ? l.active_discount_percentage + '% -> ' + Number(l.discounted_sale_price).toLocaleString('fr-FR') + ' CDF' : '—'}</td>
                    <td className="row-actions">
                      {canCreateAdjustment && (
                        <button type="button" className="table-link-btn" onClick={() => openAdjustmentModal(l)}>Ajuster</button>
                      )}
                      {canProposeDiscount && (
                        <button type="button" className="table-link-btn" onClick={() => openDiscountModal(l)}>Rabais</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {tab === 'movements' && (
        <div className="data-table-wrap">
          {loading ? null : movements.length === 0 ? (
            <div className="empty-state">Aucun mouvement de stock.</div>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Produit</th>
                  <th>Type</th>
                  <th>Sens</th>
                  <th className="num">Quantite</th>
                  <th>Raison</th>
                  <th>Utilisateur</th>
                </tr>
              </thead>
              <tbody>
                {movements.map((m) => (
                  <tr key={m.id}>
                    <td>{formatDate(m.created_at)}</td>
                    <td>{m.products?.name || m.product_id}</td>
                    <td>{MOVEMENT_TYPE_LABELS[m.movement_type] || m.movement_type}</td>
                    <td><span className={m.direction === 'IN' ? 'badge-status ok' : 'badge-status danger'}>{m.direction}</span></td>
                    <td className="num">{m.quantity}</td>
                    <td>{m.reason || '—'}</td>
                    <td>{m.mover?.name || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {tab === 'adjustments' && (
        <div className="data-table-wrap">
          {loading ? null : adjustments.length === 0 ? (
            <div className="empty-state">Aucun ajustement.</div>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Produit</th>
                  <th>Lot</th>
                  <th>Type</th>
                  <th className="num">Delta</th>
                  <th>Raison</th>
                  <th>Statut</th>
                  <th>Demandeur</th>
                  <th>Approbateur</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {adjustments.map((a) => (
                  <tr key={a.id}>
                    <td>{a.products?.name || a.product_id}</td>
                    <td className="mono">{a.stock_lots?.lot_number || '—'}</td>
                    <td>{ADJUSTMENT_TYPE_LABELS[a.adjustment_type] || a.adjustment_type}</td>
                    <td className="num">{a.quantity_delta > 0 ? '+' : ''}{a.quantity_delta}</td>
                    <td>{a.reason}</td>
                    <td><StatusBadge status={a.status} /></td>
                    <td>{a.requester?.name || '—'}</td>
                    <td>{a.approver?.name || '—'}</td>
                    <td className="row-actions">
                      {a.status === 'PENDING' && canApproveAdjustment && a.requested_by !== user?.id && (
                        <>
                          <button type="button" className="table-link-btn accent" onClick={() => handleApproveAdjustment(a, true)}>Approuver</button>
                          <button type="button" className="table-link-btn warn" onClick={() => handleApproveAdjustment(a, false)}>Rejeter</button>
                        </>
                      )}
                      {a.status === 'PENDING' && a.requested_by === user?.id && (
                        <span className="hint-text">En attente d'un autre validateur</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {tab === 'discounts' && (
        <div className="data-table-wrap">
          {loading ? null : discounts.length === 0 ? (
            <div className="empty-state">Aucune proposition de rabais.</div>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Produit</th>
                  <th>Lot</th>
                  <th className="num">% Remise</th>
                  <th className="num">Jours restants (proposition)</th>
                  <th>Statut</th>
                  <th>Demandeur</th>
                  <th>Approbateur</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {discounts.map((d) => (
                  <tr key={d.id}>
                    <td>{d.products?.name || d.product_id}</td>
                    <td className="mono">{d.stock_lots?.lot_number || '—'}</td>
                    <td className="num">{d.discount_percentage}%</td>
                    <td className="num">{d.days_until_expiry}</td>
                    <td><StatusBadge status={d.status} /></td>
                    <td>{d.requester?.name || '—'}</td>
                    <td>{d.approver?.name || '—'}</td>
                    <td className="row-actions">
                      {d.status === 'PENDING_APPROVAL' && canApproveDiscount && d.requested_by !== user?.id && (
                        <>
                          <button type="button" className="table-link-btn accent" onClick={() => handleApproveDiscount(d, true)}>Approuver</button>
                          <button type="button" className="table-link-btn warn" onClick={() => handleApproveDiscount(d, false)}>Rejeter</button>
                        </>
                      )}
                      {d.status === 'PENDING_APPROVAL' && d.requested_by === user?.id && (
                        <span className="hint-text">En attente d'un autre validateur</span>
                      )}
                      {d.status === 'PENDING_APPROVAL' && d.requested_by !== user?.id && !canApproveDiscount && (
                        <span className="hint-text">Finance uniquement</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {showAdjustmentModal && (
        <div className="modal-overlay" onClick={() => setShowAdjustmentModal(false)}>
          <div className="modal-panel" style={{ transform: `translate(${dragPos.x}px, ${dragPos.y}px)` }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-drag-handle" onMouseDown={handleDragStart}>
              <h3>Nouvel ajustement de stock</h3>
            </div>
            {adjustmentError && <div className="form-error">{adjustmentError}</div>}
            <form onSubmit={handleAdjustmentSubmit}>
              <div className="form-grid">
                <div className="form-field full">
                  <label>Produit</label>
                  <select value={adjustmentForm.product_id} onChange={handleAdjustmentProductChange} disabled={lotLocked} required>
                    <option value="">—</option>
                    {uniqueProducts.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
                <div className="form-field full">
                  <label>Lot</label>
                  <select
                    value={adjustmentForm.lot_id}
                    onChange={(e) => setAdjustmentForm({ ...adjustmentForm, lot_id: e.target.value })}
                    disabled={lotLocked || !adjustmentForm.product_id}
                    required
                  >
                    <option value="">—</option>
                    {lotsForProduct(adjustmentForm.product_id).map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.lot_number} - {l.quantity_remaining} restant(s) - exp. {formatDate(l.expiry_date)}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="form-field">
                  <label>Type</label>
                  <select value={adjustmentForm.adjustment_type} onChange={handleAdjustmentFieldChange('adjustment_type')}>
                    <option value="ADJUSTMENT">Correction generale</option>
                    <option value="EXPIRY">Peremption</option>
                    <option value="DAMAGE">Dommage</option>
                  </select>
                </div>
                <div className="form-field">
                  <label>Sens</label>
                  <select value={adjustmentForm.direction} onChange={handleAdjustmentFieldChange('direction')}>
                    <option value="LOSS">Perte (retire du stock)</option>
                    <option value="GAIN">Trouve (ajoute au stock)</option>
                  </select>
                </div>
                <div className="form-field">
                  <label>Quantite</label>
                  <input type="number" min="1" value={adjustmentForm.quantity} onChange={handleAdjustmentFieldChange('quantity')} required />
                </div>
                <div className="form-field full">
                  <label>Raison</label>
                  <input value={adjustmentForm.reason} onChange={handleAdjustmentFieldChange('reason')} placeholder="ex: casse au comptoir, erreur de comptage..." required />
                </div>
              </div>
              <div className="modal-actions">
                <button type="button" className="modal-cancel" onClick={() => setShowAdjustmentModal(false)}>Annuler</button>
                <button type="submit" className="module-primary-btn" disabled={submittingAdjustment}>
                  {submittingAdjustment ? 'Envoi...' : 'Soumettre'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showDiscountModal && (
        <div className="modal-overlay" onClick={() => setShowDiscountModal(false)}>
          <div className="modal-panel" style={{ transform: `translate(${dragPos.x}px, ${dragPos.y}px)` }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-drag-handle" onMouseDown={handleDragStart}>
              <h3>Proposer un rabais peremption</h3>
            </div>
            <p className="modal-subtext">Applique uniquement apres approbation de la Finance.</p>
            {discountError && <div className="form-error">{discountError}</div>}
            <form onSubmit={handleDiscountSubmit}>
              <div className="form-grid">
                <div className="form-field full">
                  <label>Produit</label>
                  <select value={discountForm.product_id} onChange={handleDiscountProductChange} disabled={lotLocked} required>
                    <option value="">—</option>
                    {uniqueProducts.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
                <div className="form-field full">
                  <label>Lot</label>
                  <select
                    value={discountForm.lot_id}
                    onChange={(e) => setDiscountForm({ ...discountForm, lot_id: e.target.value })}
                    disabled={lotLocked || !discountForm.product_id}
                    required
                  >
                    <option value="">—</option>
                    {lotsForProduct(discountForm.product_id).map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.lot_number} - {l.quantity_remaining} restant(s) - exp. {formatDate(l.expiry_date)}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="form-field full">
                  <label>Pourcentage de remise (1-90)</label>
                  <input type="number" min="1" max="90" value={discountForm.discount_percentage} onChange={handleDiscountFieldChange('discount_percentage')} required />
                </div>
              </div>
              <div className="modal-actions">
                <button type="button" className="modal-cancel" onClick={() => setShowDiscountModal(false)}>Annuler</button>
                <button type="submit" className="module-primary-btn" disabled={submittingDiscount}>
                  {submittingDiscount ? 'Envoi...' : 'Proposer'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}