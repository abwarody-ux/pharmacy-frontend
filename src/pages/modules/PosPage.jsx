import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import {
  createSale, listSales, getTodaySales,
  requestSaleCancellation, listCancellations, approveCancellation,
} from '../../services/pos';
import { searchProducts } from '../../services/products';
import { getAvailability } from '../../services/stock';
import { getActivePharmacy } from '../../services/pharmacy';
import { connectPharmacySocket, getPharmacySocket } from '../../sockets/pharmacySocket';

const PAYMENT_METHOD_LABELS = { CASH: 'Especes', MOBILE_MONEY: 'Mobile Money', CARD: 'Carte' };
const CANCEL_APPROVAL_ROLES = ['PHARMACY_ADMIN', 'PHARMACY_TITULAIRE'];

const STATUS_LABELS = {
  COMPLETED: 'Completee', CANCELLED: 'Annulee', PENDING: 'En attente', APPROVED: 'Approuvee', REJECTED: 'Rejetee',
};

function StatusBadge({ status }) {
  const cls = {
    COMPLETED: 'badge-status ok', CANCELLED: 'badge-status danger',
    PENDING: 'badge-status warn', APPROVED: 'badge-status ok', REJECTED: 'badge-status danger',
  }[status] || 'badge-status';
  return <span className={cls}>{STATUS_LABELS[status] || status}</span>;
}

function formatDateTime(dateStr) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleString('fr-FR', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function PosPage() {
  const { activePharmacyId, user } = useAuth();
  const canApproveCancellation = CANCEL_APPROVAL_ROLES.includes(user?.role);

  const [tab, setTab] = useState('sale');
  const [usdRate, setUsdRate] = useState(2800);
  const [resultMessage, setResultMessage] = useState('');

  // Vente en cours
  const [cart, setCart] = useState([]); // { product_id, product_name, quantity, unit_price, requires_controlled_prescription, confirmed }
  const [showProductSearch, setShowProductSearch] = useState(false);
  const [productSearchQuery, setProductSearchQuery] = useState('');
  const [productSearchResults, setProductSearchResults] = useState([]);
  const [availabilityHint, setAvailabilityHint] = useState(null);
  const [patientId, setPatientId] = useState('');
  const [prescriptionId, setPrescriptionId] = useState('');
  const [payments, setPayments] = useState([]); // { method, amount, provider_reference }
  const [saleError, setSaleError] = useState('');
  const [submittingSale, setSubmittingSale] = useState(false);

  // Ventes du jour / historique / annulations
  const [todaySummary, setTodaySummary] = useState({ count: 0, total_amount: 0, sales: [] });
  const [sales, setSales] = useState([]);
  const [cancellations, setCancellations] = useState([]);
  const [loading, setLoading] = useState(true);

  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancelSale, setCancelSale] = useState(null);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelError, setCancelError] = useState('');
  const [submittingCancel, setSubmittingCancel] = useState(false);

  const [dragPos, setDragPos] = useState({ x: 0, y: 0 });
  const dragState = useRef({ dragging: false, startX: 0, startY: 0, originX: 0, originY: 0 });

  const load = (silent = false) => {
    if (!activePharmacyId) return;
    if (!silent) setLoading(true);
    Promise.all([
      getTodaySales(activePharmacyId),
      listSales(activePharmacyId),
      listCancellations(activePharmacyId),
    ])
      .then(([today, allSales, cancels]) => {
        setTodaySummary(today);
        setSales(allSales);
        setCancellations(cancels);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    if (activePharmacyId) {
      getActivePharmacy(activePharmacyId)
        .then((pharmacy) => { if (pharmacy?.usd_rate) setUsdRate(Number(pharmacy.usd_rate)); })
        .catch(() => {});
    }
  }, [activePharmacyId]);

  useEffect(() => {
    if (!activePharmacyId) return;
    const token = localStorage.getItem('kasmok_pharmacy_token');
    if (!token) return;
    connectPharmacySocket(token, activePharmacyId);
    const socket = getPharmacySocket();
    if (!socket) return;
    const handleUpdate = () => load(true);
    socket.on('sale:update', handleUpdate);
    socket.on('purchase:update', handleUpdate);
    return () => {
      socket.off('sale:update', handleUpdate);
      socket.off('purchase:update', handleUpdate);
    };
  }, [activePharmacyId]);

  // --- Panier ---

  const openProductSearch = () => {
    setProductSearchQuery('');
    setProductSearchResults([]);
    setShowProductSearch(true);
  };

  const handleProductSearchChange = async (e) => {
    const value = e.target.value;
    setProductSearchQuery(value);
    if (!activePharmacyId || value.trim() === '') {
      setProductSearchResults([]);
      return;
    }
    try {
      const results = await searchProducts(activePharmacyId, value);
      setProductSearchResults(results);
    } catch {
      // recherche silencieuse
    }
  };

  const handleProductPick = async (product) => {
    let defaultPrice = '';
    if (product?.sale_price) {
      const priceInCdf = product.currency === 'USD' ? Number(product.sale_price) * usdRate : Number(product.sale_price);
      defaultPrice = Math.round(priceInCdf);
    }
    const newLine = {
      product_id: product.id,
      product_name: product.name,
      quantity: '',
      unit_price: defaultPrice !== '' ? String(defaultPrice) : '',
      requires_controlled_prescription: !!product.requires_controlled_prescription,
      confirmed: false,
    };
    setCart((prev) => [...prev, newLine]);
    setShowProductSearch(false);
    setProductSearchQuery('');
    setProductSearchResults([]);

    try {
      const availability = await getAvailability(activePharmacyId, product.id);
      setAvailabilityHint({ product_id: product.id, total_available: availability.total_available });
    } catch {
      setAvailabilityHint(null);
    }
  };

  const updateLineField = (index, field) => (e) => {
    const value = e.target.value;
    setCart((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
  };

  const confirmLine = (index) => {
    const line = cart[index];
    if (!line.quantity || Number(line.quantity) <= 0) { setSaleError('Quantite requise pour ' + line.product_name + '.'); return; }
    if (line.unit_price === '' || Number(line.unit_price) < 0) { setSaleError('Prix requis pour ' + line.product_name + '.'); return; }
    setSaleError('');
    setCart((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], confirmed: true };
      return next;
    });
  };

  const editLine = (index) => {
    setCart((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], confirmed: false };
      return next;
    });
  };

  const removeLine = (index) => {
    setCart((prev) => prev.filter((_, i) => i !== index));
  };

  const lineTotal = (line) => {
    if (!line.quantity || line.unit_price === '') return 0;
    return Number(line.quantity) * Number(line.unit_price);
  };

  const cartTotal = cart.reduce((sum, l) => sum + lineTotal(l), 0);
  const allLinesConfirmed = cart.length > 0 && cart.every((l) => l.confirmed);
  const hasControlledProduct = cart.some((l) => l.confirmed && l.requires_controlled_prescription);

  // --- Paiements ---

  const paymentsTotal = payments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
  const remainingBalance = Math.round((cartTotal - paymentsTotal) * 100) / 100;

  const addPaymentLine = () => {
    setPayments((prev) => [...prev, { method: 'CASH', amount: remainingBalance > 0 ? String(remainingBalance) : '', provider_reference: '' }]);
  };

  const updatePaymentField = (index, field) => (e) => {
    const value = e.target.value;
    setPayments((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
  };

  const removePaymentLine = (index) => {
    setPayments((prev) => prev.filter((_, i) => i !== index));
  };

  const resetSaleForm = () => {
    setCart([]);
    setPayments([]);
    setPatientId('');
    setPrescriptionId('');
    setSaleError('');
    setAvailabilityHint(null);
  };

  const handleSaleSubmit = async () => {
    setSaleError('');
    if (!allLinesConfirmed) { setSaleError('Validez toutes les lignes du panier avant encaissement.'); return; }
    if (Math.abs(remainingBalance) > 0.01) { setSaleError('Le total des paiements doit correspondre au total de la vente.'); return; }
    if (hasControlledProduct && !prescriptionId.trim()) { setSaleError('Ordonnance requise pour un produit sous controle.'); return; }

    setSubmittingSale(true);
    try {
      const result = await createSale(activePharmacyId, {
        lines: cart.map((l) => ({
          product_id: l.product_id,
          quantity: Number(l.quantity),
          unit_price: Number(l.unit_price),
        })),
        payments: payments.map((p) => ({
          method: p.method,
          amount: Number(p.amount),
          provider_reference: p.provider_reference || undefined,
        })),
        patient_id: patientId.trim() || undefined,
        prescription_id: prescriptionId.trim() || undefined,
      });
      setResultMessage('Vente enregistree - Total : ' + Number(result.total_amount).toLocaleString('fr-FR') + ' CDF');
      resetSaleForm();
      load(true);
    } catch (err) {
      setSaleError(err.response?.data?.message || "Erreur lors de l'encaissement.");
    } finally {
      setSubmittingSale(false);
    }
  };

  // --- Annulation ---

  const openCancelModal = (sale) => {
    setCancelSale(sale);
    setCancelReason('');
    setCancelError('');
    setDragPos({ x: 0, y: 0 });
    setShowCancelModal(true);
  };

  const handleCancelSubmit = async (e) => {
    e.preventDefault();
    setCancelError('');
    if (!cancelReason.trim()) { setCancelError('La raison est requise.'); return; }
    setSubmittingCancel(true);
    try {
      await requestSaleCancellation(activePharmacyId, cancelSale.id, cancelReason.trim());
      setShowCancelModal(false);
      setResultMessage("Demande d'annulation soumise.");
      load(true);
    } catch (err) {
      setCancelError(err.response?.data?.message || "Erreur lors de la demande d'annulation.");
    } finally {
      setSubmittingCancel(false);
    }
  };

  const handleApproveCancellation = async (cancellation, approve) => {
    try {
      await approveCancellation(activePharmacyId, cancellation.id, approve);
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

  const pendingCancellations = cancellations.filter((c) => c.status === 'PENDING').length;

  return (
    <div>
      <div className="module-header">
        <div className="module-title-block">
          <span className="tag mono">MOD-05</span>
          <h2>Point de Vente</h2>
        </div>
      </div>

      {resultMessage && <div className="info-banner">{resultMessage}</div>}

      <div className="tab-bar">
        <button className={tab === 'sale' ? 'tab-btn active' : 'tab-btn'} onClick={() => setTab('sale')}>Vente</button>
        <button className={tab === 'today' ? 'tab-btn active' : 'tab-btn'} onClick={() => setTab('today')}>Ventes du jour</button>
        <button className={tab === 'history' ? 'tab-btn active' : 'tab-btn'} onClick={() => setTab('history')}>Historique</button>
        <button className={tab === 'cancellations' ? 'tab-btn active' : 'tab-btn'} onClick={() => setTab('cancellations')}>
          Annulations {pendingCancellations > 0 ? '(' + pendingCancellations + ')' : ''}
        </button>
      </div>

      {tab === 'sale' && (
        <div>
          <div className="module-header">
            <div />
            <div style={{ position: 'relative' }}>
              <button type="button" className="table-link-btn accent" onClick={openProductSearch}>+ Produit</button>
              {showProductSearch && (
                <div style={{
                  position: 'absolute', top: '100%', right: 0, zIndex: 20, width: '280px',
                  background: 'var(--panel-bg, #1a1a1a)', border: '1px solid var(--border-color, #333)',
                  borderRadius: '6px', marginTop: '6px', padding: '8px',
                }}>
                  <input
                    type="text" autoFocus placeholder="Rechercher un produit..."
                    value={productSearchQuery} onChange={handleProductSearchChange} autoComplete="off"
                    style={{ width: '100%', marginBottom: '6px' }}
                  />
                  <div style={{ maxHeight: '200px', overflowY: 'auto' }}>
                    {productSearchResults.map((p) => (
                      <div
                        key={p.id} onClick={() => handleProductPick(p)}
                        style={{ padding: '8px 10px', cursor: 'pointer', color: '#f0f0f0', borderRadius: '4px' }}
                        onMouseEnter={(e) => e.currentTarget.style.background = '#2a2a2a'}
                        onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                      >
                        {p.name} {p.requires_controlled_prescription ? '(controle)' : ''}
                      </div>
                    ))}
                    {productSearchQuery.trim() !== '' && productSearchResults.length === 0 && (
                      <div className="hint-text" style={{ padding: '8px 10px' }}>Aucun resultat.</div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          {saleError && <div className="form-error">{saleError}</div>}

          <div className="data-table-wrap">
            {cart.length === 0 ? (
              <div className="empty-state">Panier vide. Cliquez sur "+ Produit" pour commencer une vente.</div>
            ) : (
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Produit</th>
                    <th className="num">Quantite</th>
                    <th className="num">Prix unitaire</th>
                    <th className="num">Total</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {cart.map((line, index) => (
                    <tr key={index}>
                      <td>
                        {line.product_name}
                        {line.requires_controlled_prescription && <span className="badge-status warn" style={{ marginLeft: '6px' }}>Controle</span>}
                        {availabilityHint?.product_id === line.product_id && (
                          <div className="hint-text">{availabilityHint.total_available} disponible(s)</div>
                        )}
                      </td>
                      {line.confirmed ? (
                        <>
                          <td className="num">{line.quantity}</td>
                          <td className="num">{Number(line.unit_price).toLocaleString('fr-FR')} CDF</td>
                          <td className="num">{lineTotal(line).toLocaleString('fr-FR')} CDF</td>
                          <td className="row-actions">
                            <button type="button" className="table-link-btn" onClick={() => editLine(index)}>Modifier</button>
                            <button type="button" className="table-link-btn warn" onClick={() => removeLine(index)}>Supprimer</button>
                          </td>
                        </>
                      ) : (
                        <>
                          <td><input type="number" min="1" style={{ width: '70px' }} value={line.quantity} onChange={updateLineField(index, 'quantity')} /></td>
                          <td><input type="number" min="0" style={{ width: '90px' }} value={line.unit_price} onChange={updateLineField(index, 'unit_price')} /></td>
                          <td className="num">{lineTotal(line).toLocaleString('fr-FR')} CDF</td>
                          <td className="row-actions">
                            <button type="button" className="table-link-btn accent" onClick={() => confirmLine(index)}>Valider</button>
                            <button type="button" className="table-link-btn warn" onClick={() => removeLine(index)}>Supprimer</button>
                          </td>
                        </>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {cart.length > 0 && (
            <>
              <div className="form-grid" style={{ marginTop: '16px' }}>
                <div className="form-field">
                  <label>Patient (optionnel)</label>
                  <input value={patientId} onChange={(e) => setPatientId(e.target.value)} placeholder="ID patient" />
                </div>
                <div className="form-field">
                  <label>Ordonnance {hasControlledProduct ? '(requise)' : '(optionnel)'}</label>
                  <input value={prescriptionId} onChange={(e) => setPrescriptionId(e.target.value)} placeholder="ID ordonnance" />
                </div>
              </div>

              <div className="module-header" style={{ marginTop: '16px' }}>
                <h3 style={{ fontSize: '15px' }}>Paiement</h3>
                <button type="button" className="table-link-btn accent" onClick={addPaymentLine}>+ Methode de paiement</button>
              </div>

              {payments.length === 0 ? (
                <div className="empty-state">Ajoutez au moins un moyen de paiement.</div>
              ) : (
                <div className="data-table-wrap">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Methode</th>
                        <th className="num">Montant</th>
                        <th>Reference</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {payments.map((p, index) => (
                        <tr key={index}>
                          <td>
                            <select value={p.method} onChange={updatePaymentField(index, 'method')}>
                              <option value="CASH">Especes</option>
                              <option value="MOBILE_MONEY">Mobile Money</option>
                              <option value="CARD">Carte</option>
                            </select>
                          </td>
                          <td><input type="number" min="0" style={{ width: '100px' }} value={p.amount} onChange={updatePaymentField(index, 'amount')} /></td>
                          <td><input value={p.provider_reference} onChange={updatePaymentField(index, 'provider_reference')} placeholder="optionnel" /></td>
                          <td className="row-actions">
                            <button type="button" className="table-link-btn warn" onClick={() => removePaymentLine(index)}>Supprimer</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <div className="modal-actions" style={{ justifyContent: 'space-between', marginTop: '16px' }}>
                <span className="hint-text">
                  Total : {cartTotal.toLocaleString('fr-FR')} CDF — Paye : {paymentsTotal.toLocaleString('fr-FR')} CDF
                  {Math.abs(remainingBalance) > 0.01 && (
                    <span style={{ color: 'var(--amber, #c1892f)' }}> — Reste {remainingBalance.toLocaleString('fr-FR')} CDF</span>
                  )}
                </span>
                <button
                  type="button" className="module-primary-btn"
                  disabled={submittingSale || !allLinesConfirmed || Math.abs(remainingBalance) > 0.01}
                  onClick={handleSaleSubmit}
                >
                  {submittingSale ? 'Encaissement...' : 'Encaisser'}
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {tab === 'today' && (
        <div>
          <div className="admin-grid" style={{ marginBottom: '20px' }}>
            <div className="admin-card">
              <div className="admin-card-label">Nombre de ventes</div>
              <div className="admin-card-value">{todaySummary.count}</div>
            </div>
            <div className="admin-card">
              <div className="admin-card-label">Total du jour</div>
              <div className="admin-card-value">{Number(todaySummary.total_amount).toLocaleString('fr-FR')} CDF</div>
            </div>
          </div>
          <div className="data-table-wrap">
            {loading ? null : (todaySummary.sales || []).length === 0 ? (
              <div className="empty-state">Aucune vente aujourd'hui.</div>
            ) : (
              <table className="data-table">
                <thead>
                  <tr><th>Heure</th><th className="num">Total</th><th>Statut</th></tr>
                </thead>
                <tbody>
                  {todaySummary.sales.map((s) => (
                    <tr key={s.id}>
                      <td>{formatDateTime(s.created_at)}</td>
                      <td className="num">{Number(s.total_amount).toLocaleString('fr-FR')} CDF</td>
                      <td><StatusBadge status={s.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {tab === 'history' && (
        <div className="data-table-wrap">
          {loading ? null : sales.length === 0 ? (
            <div className="empty-state">Aucune vente.</div>
          ) : (
            <table className="data-table">
              <thead>
                <tr><th>Date</th><th className="num">Total</th><th>Paiement</th><th>Statut</th><th></th></tr>
              </thead>
              <tbody>
                {sales.map((s) => (
                  <tr key={s.id}>
                    <td>{formatDateTime(s.created_at)}</td>
                    <td className="num">{Number(s.total_amount).toLocaleString('fr-FR')} CDF</td>
                    <td>{(s.sale_payments || []).map((p) => PAYMENT_METHOD_LABELS[p.method] || p.method).join(', ') || '—'}</td>
                    <td><StatusBadge status={s.status} /></td>
                    <td className="row-actions">
                      {s.status === 'COMPLETED' && (
                        <button type="button" className="table-link-btn warn" onClick={() => openCancelModal(s)}>
                          Demander annulation
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {tab === 'cancellations' && (
        <div className="data-table-wrap">
          {loading ? null : cancellations.length === 0 ? (
            <div className="empty-state">Aucune demande d'annulation.</div>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Vente</th><th className="num">Total</th><th>Raison</th><th>Statut</th>
                  <th>Demandeur</th><th>Approbateur</th><th></th>
                </tr>
              </thead>
              <tbody>
                {cancellations.map((c) => (
                  <tr key={c.id}>
                    <td>{formatDateTime(c.sales?.created_at)}</td>
                    <td className="num">{Number(c.sales?.total_amount || 0).toLocaleString('fr-FR')} CDF</td>
                    <td>{c.reason}</td>
                    <td><StatusBadge status={c.status} /></td>
                    <td>{c.requester?.name || '—'}</td>
                    <td>{c.approver?.name || '—'}</td>
                    <td className="row-actions">
                      {c.status === 'PENDING' && canApproveCancellation && c.requested_by !== user?.id && (
                        <>
                          <button type="button" className="table-link-btn accent" onClick={() => handleApproveCancellation(c, true)}>Approuver</button>
                          <button type="button" className="table-link-btn warn" onClick={() => handleApproveCancellation(c, false)}>Rejeter</button>
                        </>
                      )}
                      {c.status === 'PENDING' && c.requested_by === user?.id && (
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

      {showCancelModal && (
        <div className="modal-overlay" onClick={() => setShowCancelModal(false)}>
          <div className="modal-panel" style={{ transform: `translate(${dragPos.x}px, ${dragPos.y}px)` }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-drag-handle" onMouseDown={handleDragStart}>
              <h3>Demander l'annulation de la vente</h3>
            </div>
            <p className="modal-subtext">
              Total : {Number(cancelSale?.total_amount || 0).toLocaleString('fr-FR')} CDF - {formatDateTime(cancelSale?.created_at)}
            </p>
            {cancelError && <div className="form-error">{cancelError}</div>}
            <form onSubmit={handleCancelSubmit}>
              <div className="form-grid">
                <div className="form-field full">
                  <label>Raison</label>
                  <input value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} placeholder="ex: erreur de saisie, client absent..." required />
                </div>
              </div>
              <div className="modal-actions">
                <button type="button" className="modal-cancel" onClick={() => setShowCancelModal(false)}>Annuler</button>
                <button type="submit" className="module-primary-btn" disabled={submittingCancel}>
                  {submittingCancel ? 'Envoi...' : 'Soumettre'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}