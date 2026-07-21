import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import {
  listPurchaseRequests, createPurchaseRequest, createPurchaseRequestBatch, approvePurchaseRequest,
  listPurchaseOrders, receivePurchaseOrder, receiveBonus,
} from '../../services/purchases';
import { listProducts, searchProducts } from '../../services/products';
import { listStockReceiptApprovals, approveStockReceipt } from '../../services/priceVariance';
import { getActivePharmacy } from '../../services/pharmacy';
import { connectPharmacySocket, getPharmacySocket } from '../../sockets/pharmacySocket';

const emptyRequestForm = { product_id: '', quantity: '', estimated_unit_price: '', notes: '', display_currency: 'USD' };
const emptyReceiveForm = {
  lot_number: '', manufacture_date: '', expiry_date: '',
  quantity_received: '', unit_cost: '', quality_control_passed: false, discrepancy_comment: '',
};
const emptyBonusForm = {
  lot_number: '', manufacture_date: '', expiry_date: '',
  quantity: '', unit_cost: '0', quality_control_passed: false, notes: '',
};
const emptyCartLineForm = { product_id: '', product_name: '', quantity: '', estimated_unit_price: '', display_currency: 'USD' };

const BONUS_GRACE_PERIOD_MS = 60 * 60 * 1000;
const FINANCE_ROLES = ['PHARMACY_ADMIN', 'PHARMACY_FINANCE'];

const STATUS_LABELS = {
  PENDING: 'En attente', APPROVED: 'Approuvee', REJECTED: 'Rejetee',
  SENT: 'Envoyee', PARTIALLY_RECEIVED: 'Partiellement receptionnee', RECEIVED: 'Receptionnee',
  PENDING_APPROVAL: 'En attente Finance',
};

function StatusBadge({ status }) {
  const cls = {
    PENDING: 'badge-status warn', APPROVED: 'badge-status ok', REJECTED: 'badge-status danger',
    SENT: 'badge-status info', PARTIALLY_RECEIVED: 'badge-status warn', RECEIVED: 'badge-status ok',
    PENDING_APPROVAL: 'badge-status warn',
  }[status] || 'badge-status';
  return <span className={cls}>{STATUS_LABELS[status] || status}</span>;
}

function canShowBonusButton(order) {
  if (order.status === 'SENT' || order.status === 'PARTIALLY_RECEIVED') return true;
  if (order.status === 'RECEIVED' && order.received_at) {
    const elapsed = Date.now() - new Date(order.received_at).getTime();
    return elapsed < BONUS_GRACE_PERIOD_MS;
  }
  return false;
}

export default function PurchasesPage() {
  const { activePharmacyId, user } = useAuth();
  const isFinance = FINANCE_ROLES.includes(user?.role);

  const [tab, setTab] = useState('requests');
  const [requests, setRequests] = useState([]);
  const [orders, setOrders] = useState([]);
  const [products, setProducts] = useState([]);
  const [stockApprovals, setStockApprovals] = useState([]);
  const [usdRate, setUsdRate] = useState(2800);
  const [loading, setLoading] = useState(true);
  const [resultMessage, setResultMessage] = useState('');

  const [showRequestModal, setShowRequestModal] = useState(false);
  const [requestForm, setRequestForm] = useState(emptyRequestForm);
  const [requestError, setRequestError] = useState('');
  const [submittingRequest, setSubmittingRequest] = useState(false);

  const [showReceiveModal, setShowReceiveModal] = useState(false);
  const [receivingOrder, setReceivingOrder] = useState(null);
  const [receiveForm, setReceiveForm] = useState(emptyReceiveForm);
  const [receiveError, setReceiveError] = useState('');
  const [submittingReceive, setSubmittingReceive] = useState(false);

  const [showBonusModal, setShowBonusModal] = useState(false);
  const [bonusOrder, setBonusOrder] = useState(null);
  const [bonusForm, setBonusForm] = useState(emptyBonusForm);
  const [bonusError, setBonusError] = useState('');
  const [submittingBonus, setSubmittingBonus] = useState(false);

  // Panier multi-produits : chaque ligne est ajoutee localement puis soumise en un seul
  // appel batch. Le backend valide tout en dry-run avant creation - en cas d'echec, les
  // erreurs reviennent par index de ligne et restent affichees jusqu'a correction.
  const [cart, setCart] = useState([]);
  const [cartErrors, setCartErrors] = useState({});
  const [cartGlobalError, setCartGlobalError] = useState('');
  const [submittingCart, setSubmittingCart] = useState(false);
  const [showCartLineModal, setShowCartLineModal] = useState(false);
  const [editingCartIndex, setEditingCartIndex] = useState(null);
  const [cartLineForm, setCartLineForm] = useState(emptyCartLineForm);
  const [cartLineQuery, setCartLineQuery] = useState('');
  const [cartLineResults, setCartLineResults] = useState([]);

  const [dragPos, setDragPos] = useState({ x: 0, y: 0 });
  const dragState = useRef({ dragging: false, startX: 0, startY: 0, originX: 0, originY: 0 });

  const productName = (id) => products.find((p) => p.id === id)?.name || id;
  const selectedProduct = products.find((p) => p.id === requestForm.product_id);

  const load = (silent = false) => {
    if (!activePharmacyId) return;
    if (!silent) setLoading(true);
    const calls = [
      listPurchaseRequests(activePharmacyId),
      listPurchaseOrders(activePharmacyId),
      listProducts(activePharmacyId),
    ];
    if (isFinance) calls.push(listStockReceiptApprovals(activePharmacyId, 'PENDING_APPROVAL'));

    Promise.all(calls)
      .then(([reqs, ords, prods, approvals]) => {
        setRequests(reqs);
        setOrders(ords);
        setProducts(prods);
        if (approvals) setStockApprovals(approvals);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    if (activePharmacyId) {
      getActivePharmacy(activePharmacyId)
        .then((pharmacy) => {
          if (pharmacy?.usd_rate) setUsdRate(Number(pharmacy.usd_rate));
        })
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

    const handlePurchaseUpdate = () => load(true);
    socket.on('purchase:update', handlePurchaseUpdate);

    return () => {
      socket.off('purchase:update', handlePurchaseUpdate);
    };
  }, [activePharmacyId]);

  const openRequestModal = () => {
    setRequestForm(emptyRequestForm);
    setRequestError('');
    setDragPos({ x: 0, y: 0 });
    setShowRequestModal(true);
  };

  const handleProductSelect = (e) => {
    const productId = e.target.value;
    const product = products.find((p) => p.id === productId);
    let priceInDisplayCurrency = '';
    if (product?.purchase_price) {
      const priceInCdf = product.currency === 'USD' ? Number(product.purchase_price) * usdRate : Number(product.purchase_price);
      priceInDisplayCurrency = requestForm.display_currency === 'USD'
        ? (priceInCdf / usdRate).toFixed(2)
        : Math.round(priceInCdf);
    }
    setRequestForm({ ...requestForm, product_id: productId, estimated_unit_price: priceInDisplayCurrency });
  };

  const handleCurrencyToggle = (currency) => {
    if (currency === requestForm.display_currency) return;
    let converted = requestForm.estimated_unit_price;
    if (requestForm.estimated_unit_price) {
      const value = Number(requestForm.estimated_unit_price);
      converted = currency === 'USD' ? (value / usdRate).toFixed(2) : Math.round(value * usdRate);
    }
    setRequestForm({ ...requestForm, display_currency: currency, estimated_unit_price: converted });
  };

  const handleRequestChange = (field) => (e) => {
    setRequestForm({ ...requestForm, [field]: e.target.value });
  };

  const handleRequestSubmit = async (e) => {
    e.preventDefault();
    setRequestError('');
    setSubmittingRequest(true);
    try {
      const priceInCdf = requestForm.display_currency === 'USD'
        ? Math.round(Number(requestForm.estimated_unit_price) * usdRate)
        : Number(requestForm.estimated_unit_price);

      await createPurchaseRequest(activePharmacyId, {
        product_id: requestForm.product_id,
        quantity: Number(requestForm.quantity),
        estimated_unit_price: priceInCdf,
        notes: requestForm.notes || undefined,
      });
      setShowRequestModal(false);
      load(true);
    } catch (err) {
      setRequestError(err.response?.data?.message || 'Erreur lors de la creation de la demande.');
    } finally {
      setSubmittingRequest(false);
    }
  };

  const handleApprove = async (request, approve) => {
    try {
      await approvePurchaseRequest(activePharmacyId, request.id, approve);
      load(true);
    } catch (err) {
      alert(err.response?.data?.message || "Erreur lors de l'approbation.");
    }
  };

  const handleApproveStockReceipt = async (approval, approve) => {
    try {
      await approveStockReceipt(activePharmacyId, approval.id, approve);
      load(true);
    } catch (err) {
      alert(err.response?.data?.message || "Erreur lors de l'approbation.");
    }
  };

  const openReceiveModal = (order) => {
    setReceivingOrder(order);
    setReceiveForm(emptyReceiveForm);
    setReceiveError('');
    setResultMessage('');
    setDragPos({ x: 0, y: 0 });
    setShowReceiveModal(true);
  };

  const handleReceiveChange = (field) => (e) => {
    const value = field === 'quality_control_passed' ? e.target.checked : e.target.value;
    setReceiveForm({ ...receiveForm, [field]: value });
  };

  const handleReceiveSubmit = async (e) => {
    e.preventDefault();
    setReceiveError('');
    if (!receiveForm.quality_control_passed) {
      setReceiveError('Le controle qualite doit etre valide avant toute soumission.');
      return;
    }
    setSubmittingReceive(true);
    try {
      const result = await receivePurchaseOrder(activePharmacyId, receivingOrder.id, {
        lot_number: receiveForm.lot_number,
        manufacture_date: receiveForm.manufacture_date || undefined,
        expiry_date: receiveForm.expiry_date,
        quantity_received: Number(receiveForm.quantity_received),
        unit_cost: Number(receiveForm.unit_cost),
        quality_control_passed: true,
        discrepancy_comment: receiveForm.discrepancy_comment || undefined,
      });
      setShowReceiveModal(false);
      setResultMessage(result.message);
      load(true);
    } catch (err) {
      setReceiveError(err.response?.data?.message || 'Erreur lors de la soumission.');
    } finally {
      setSubmittingReceive(false);
    }
  };

  const openBonusModal = (order) => {
    setBonusOrder(order);
    setBonusForm(emptyBonusForm);
    setBonusError('');
    setResultMessage('');
    setDragPos({ x: 0, y: 0 });
    setShowBonusModal(true);
  };

  const handleBonusChange = (field) => (e) => {
    const value = field === 'quality_control_passed' ? e.target.checked : e.target.value;
    setBonusForm({ ...bonusForm, [field]: value });
  };

  const handleBonusSubmit = async (e) => {
    e.preventDefault();
    setBonusError('');
    if (!bonusForm.quality_control_passed) {
      setBonusError('Le controle qualite doit etre valide, meme pour un bonus gratuit.');
      return;
    }
    setSubmittingBonus(true);
    try {
      const result = await receiveBonus(activePharmacyId, bonusOrder.id, {
        lot_number: bonusForm.lot_number,
        manufacture_date: bonusForm.manufacture_date || undefined,
        expiry_date: bonusForm.expiry_date,
        quantity: Number(bonusForm.quantity),
        unit_cost: Number(bonusForm.unit_cost) || 0,
        quality_control_passed: true,
        notes: bonusForm.notes || undefined,
      });
      setShowBonusModal(false);
      setResultMessage(result.message);
      load(true);
    } catch (err) {
      setBonusError(err.response?.data?.message || 'Erreur lors de la reception du bonus.');
    } finally {
      setSubmittingBonus(false);
    }
  };

  // --- Panier multi-produits ---

  const openAddCartLine = () => {
    setEditingCartIndex(null);
    setCartLineForm(emptyCartLineForm);
    setCartLineQuery('');
    setCartLineResults([]);
    setDragPos({ x: 0, y: 0 });
    setShowCartLineModal(true);
  };

  const openEditCartLine = (index) => {
    const line = cart[index];
    setEditingCartIndex(index);
    setCartLineForm({
      product_id: line.product_id,
      product_name: line.product_name,
      quantity: String(line.quantity),
      estimated_unit_price: String(line.estimated_unit_price_cdf),
      display_currency: 'CDF',
    });
    setCartLineQuery(line.product_name);
    setCartLineResults([]);
    setDragPos({ x: 0, y: 0 });
    setShowCartLineModal(true);
  };

  const removeCartLine = (index) => {
    setCart(cart.filter((_, i) => i !== index));
    setCartErrors((prev) => {
      const next = { ...prev };
      delete next[index];
      return next;
    });
  };

  const handleCartLineSearch = async (e) => {
    const value = e.target.value;
    setCartLineQuery(value);
    setCartLineForm({ ...cartLineForm, product_id: '', product_name: '' });
    if (!activePharmacyId || value.trim() === '') {
      setCartLineResults([]);
      return;
    }
    try {
      const results = await searchProducts(activePharmacyId, value);
      setCartLineResults(results);
    } catch {
      // recherche silencieuse : pas de blocage de la saisie en cas d'echec reseau ponctuel
    }
  };

  const handleCartLineProductPick = (product) => {
    let priceInDisplayCurrency = '';
    if (product?.purchase_price) {
      const priceInCdf = product.currency === 'USD' ? Number(product.purchase_price) * usdRate : Number(product.purchase_price);
      priceInDisplayCurrency = cartLineForm.display_currency === 'USD'
        ? (priceInCdf / usdRate).toFixed(2)
        : Math.round(priceInCdf);
    }
    setCartLineForm({
      ...cartLineForm,
      product_id: product.id,
      product_name: product.name,
      estimated_unit_price: priceInDisplayCurrency,
    });
    setCartLineQuery(product.name);
    setCartLineResults([]);
  };

  const handleCartLineCurrencyToggle = (currency) => {
    if (currency === cartLineForm.display_currency) return;
    let converted = cartLineForm.estimated_unit_price;
    if (cartLineForm.estimated_unit_price) {
      const value = Number(cartLineForm.estimated_unit_price);
      converted = currency === 'USD' ? (value / usdRate).toFixed(2) : Math.round(value * usdRate);
    }
    setCartLineForm({ ...cartLineForm, display_currency: currency, estimated_unit_price: converted });
  };

  const handleCartLineFormChange = (field) => (e) => {
    setCartLineForm({ ...cartLineForm, [field]: e.target.value });
  };

  const handleCartLineSubmit = (e) => {
    e.preventDefault();
    if (!cartLineForm.product_id || !cartLineForm.quantity || !cartLineForm.estimated_unit_price) return;

    const priceInCdf = cartLineForm.display_currency === 'USD'
      ? Math.round(Number(cartLineForm.estimated_unit_price) * usdRate)
      : Number(cartLineForm.estimated_unit_price);

    const newLine = {
      product_id: cartLineForm.product_id,
      product_name: cartLineForm.product_name,
      quantity: Number(cartLineForm.quantity),
      estimated_unit_price_cdf: priceInCdf,
    };

    if (editingCartIndex !== null) {
      const next = [...cart];
      next[editingCartIndex] = newLine;
      setCart(next);
      setCartErrors((prev) => {
        const errs = { ...prev };
        delete errs[editingCartIndex];
        return errs;
      });
    } else {
      setCart([...cart, newLine]);
    }
    setShowCartLineModal(false);
  };

  const handleCartSubmit = async () => {
    if (cart.length === 0) return;
    setCartGlobalError('');
    setCartErrors({});
    setSubmittingCart(true);
    try {
      const result = await createPurchaseRequestBatch(activePharmacyId, {
        lines: cart.map((c) => ({
          product_id: c.product_id,
          quantity: c.quantity,
          estimated_unit_price: c.estimated_unit_price_cdf,
        })),
      });
      setCart([]);
      setResultMessage((result.requests?.length || 0) + ' demande(s) d\'achat creee(s) depuis le panier.');
      setTab('requests');
      load(true);
    } catch (err) {
      const data = err.response?.data;
      if (data?.errors?.length) {
        const byLine = {};
        data.errors.forEach((e) => { byLine[e.line] = e.error; });
        setCartErrors(byLine);
        setCartGlobalError(data.message || 'Panier invalide, aucune demande creee.');
      } else {
        setCartGlobalError(data?.message || 'Erreur lors de la soumission du panier.');
      }
    } finally {
      setSubmittingCart(false);
    }
  };

  const cartTotalCdf = cart.reduce((sum, c) => sum + c.quantity * c.estimated_unit_price_cdf, 0);

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
    dragState.current = {
      dragging: true, startX: e.clientX, startY: e.clientY,
      originX: dragPos.x, originY: dragPos.y,
    };
    window.addEventListener('mousemove', handleDragMove);
    window.addEventListener('mouseup', handleDragEnd);
  };

  return (
    <div>
      <div className="module-header">
        <div className="module-title-block">
          <span className="tag mono">MOD-03</span>
          <h2>Achats</h2>
        </div>
        <button className="module-primary-btn" onClick={openRequestModal}>
          + Nouvelle demande d'achat
        </button>
      </div>

      {resultMessage && (
        <div className="info-banner">{resultMessage}</div>
      )}

      <div className="tab-bar">
        <button className={tab === 'requests' ? 'tab-btn active' : 'tab-btn'} onClick={() => setTab('requests')}>
          Demandes d'achat
        </button>
        <button className={tab === 'orders' ? 'tab-btn active' : 'tab-btn'} onClick={() => setTab('orders')}>
          Bons de commande
        </button>
        <button className={tab === 'cart' ? 'tab-btn active' : 'tab-btn'} onClick={() => setTab('cart')}>
          Panier {cart.length > 0 ? '(' + cart.length + ')' : ''}
        </button>
        {isFinance && (
          <button className={tab === 'finance' ? 'tab-btn active' : 'tab-btn'} onClick={() => setTab('finance')}>
            Approbations Finance {stockApprovals.length > 0 ? '(' + stockApprovals.length + ')' : ''}
          </button>
        )}
      </div>

      {tab === 'requests' && (
        <div className="data-table-wrap">
          {loading ? null : requests.length === 0 ? (
            <div className="empty-state">Aucune demande d'achat.</div>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Produit</th>
                  <th className="num">Quantite</th>
                  <th className="num">Total estime</th>
                  <th>Statut</th>
                  <th>Ecart de prix</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {requests.map((r) => (
                  <tr key={r.id}>
                    <td>{productName(r.product_id)}</td>
                    <td className="num">{r.quantity}</td>
                    <td className="num">{Number(r.estimated_total).toLocaleString('fr-FR')} CDF</td>
                    <td><StatusBadge status={r.status} /></td>
                    <td>{r.price_variance ? <span className="badge-status danger">Ecart detecte</span> : '—'}</td>
                    <td className="row-actions">
                      {r.status === 'PENDING' && r.requested_by !== user?.id && (!r.price_variance || isFinance) && (
                        <>
                          <button type="button" className="table-link-btn accent" onClick={() => handleApprove(r, true)}>
                            Approuver
                          </button>
                          <button type="button" className="table-link-btn warn" onClick={() => handleApprove(r, false)}>
                            Rejeter
                          </button>
                        </>
                      )}
                      {r.status === 'PENDING' && r.requested_by !== user?.id && r.price_variance && !isFinance && (
                        <span className="hint-text">Ecart de prix - Finance uniquement</span>
                      )}
                      {r.status === 'PENDING' && r.requested_by === user?.id && (
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

      {tab === 'orders' && (
        <div className="data-table-wrap">
          {loading ? null : orders.length === 0 ? (
            <div className="empty-state">Aucun bon de commande.</div>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Produit</th>
                  <th className="num">Commande</th>
                  <th className="num">Recu</th>
                  <th className="num">Reste</th>
                  <th>Statut</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {orders.map((o) => {
                  const received = o.quantity_received_total || 0;
                  const remaining = o.quantity - received;
                  return (
                    <tr key={o.id}>
                      <td>{productName(o.product_id)}</td>
                      <td className="num">{o.quantity}</td>
                      <td className="num">{received}</td>
                      <td className="num">{remaining}</td>
                      <td><StatusBadge status={o.status} /></td>
                      <td className="row-actions">
                        {(o.status === 'SENT' || o.status === 'PARTIALLY_RECEIVED') && (
                          <button type="button" className="table-link-btn accent" onClick={() => openReceiveModal(o)}>
                            Receptionner
                          </button>
                        )}
                        {canShowBonusButton(o) && (
                          <button type="button" className="table-link-btn" onClick={() => openBonusModal(o)}>
                            Reception bonus
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {tab === 'cart' && (
        <div>
          <div className="module-header">
            <div />
            <button className="module-primary-btn" onClick={openAddCartLine}>
              + Produit
            </button>
          </div>

          {cartGlobalError && <div className="form-error">{cartGlobalError}</div>}

          <div className="data-table-wrap">
            {cart.length === 0 ? (
              <div className="empty-state">Panier vide. Ajoutez des produits pour creer plusieurs demandes d'achat en une fois.</div>
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
                        {cartErrors[index] && <div className="form-error">{cartErrors[index]}</div>}
                      </td>
                      <td className="num">{line.quantity}</td>
                      <td className="num">{line.estimated_unit_price_cdf.toLocaleString('fr-FR')} CDF</td>
                      <td className="num">{(line.quantity * line.estimated_unit_price_cdf).toLocaleString('fr-FR')} CDF</td>
                      <td className="row-actions">
                        <button type="button" className="table-link-btn" onClick={() => openEditCartLine(index)}>
                          Modifier
                        </button>
                        <button type="button" className="table-link-btn warn" onClick={() => removeCartLine(index)}>
                          Supprimer
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {cart.length > 0 && (
            <div className="modal-actions" style={{ justifyContent: 'space-between', marginTop: '16px' }}>
              <span className="hint-text">Total panier : {cartTotalCdf.toLocaleString('fr-FR')} CDF</span>
              <button type="button" className="module-primary-btn" disabled={submittingCart} onClick={handleCartSubmit}>
                {submittingCart ? 'Envoi...' : 'Soumettre le panier (' + cart.length + ')'}
              </button>
            </div>
          )}
        </div>
      )}

      {tab === 'finance' && isFinance && (
        <div className="data-table-wrap">
          {stockApprovals.length === 0 ? (
            <div className="empty-state">Aucune reception en attente d'approbation.</div>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Produit</th>
                  <th>Lot</th>
                  <th className="num">Quantite</th>
                  <th className="num">Cout unitaire</th>
                  <th className="num">Prix reference</th>
                  <th>Ecart</th>
                  <th>Commentaire</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {stockApprovals.map((a) => (
                  <tr key={a.id}>
                    <td>{a.products?.name || productName(a.product_id)}</td>
                    <td className="mono">{a.lot_number}</td>
                    <td className="num">{a.quantity_received}</td>
                    <td className="num">{Number(a.unit_cost).toLocaleString('fr-FR')} CDF</td>
                    <td className="num">{a.reference_purchase_price ? Number(a.reference_purchase_price).toLocaleString('fr-FR') + ' CDF' : '—'}</td>
                    <td>{a.has_price_variance ? <span className="badge-status danger">Ecart</span> : <span className="badge-status ok">Conforme</span>}</td>
                    <td>{a.discrepancy_comment || '—'}</td>
                    <td className="row-actions">
                      <button type="button" className="table-link-btn accent" onClick={() => handleApproveStockReceipt(a, true)}>
                        Approuver
                      </button>
                      <button type="button" className="table-link-btn warn" onClick={() => handleApproveStockReceipt(a, false)}>
                        Rejeter
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {showRequestModal && (
        <div className="modal-overlay" onClick={() => setShowRequestModal(false)}>
          <div
            className="modal-panel"
            style={{ transform: `translate(${dragPos.x}px, ${dragPos.y}px)` }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-drag-handle" onMouseDown={handleDragStart}>
              <h3>Nouvelle demande d'achat</h3>
            </div>
            {requestError && <div className="form-error">{requestError}</div>}
            <form onSubmit={handleRequestSubmit}>
              <div className="form-grid">
                <div className="form-field full">
                  <label>Produit</label>
                  <select value={requestForm.product_id} onChange={handleProductSelect} required>
                    <option value="">—</option>
                    {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
                <div className="form-field">
                  <label>Quantite</label>
                  <input type="number" value={requestForm.quantity} onChange={handleRequestChange('quantity')} required min="1" />
                </div>
                <div className="form-field">
                  <label>
                    Prix unitaire de reference
                    <span className="currency-toggle">
                      <button type="button" className={requestForm.display_currency === 'USD' ? 'currency-btn active' : 'currency-btn'} onClick={() => handleCurrencyToggle('USD')}>USD</button>
                      <button type="button" className={requestForm.display_currency === 'CDF' ? 'currency-btn active' : 'currency-btn'} onClick={() => handleCurrencyToggle('CDF')}>CDF</button>
                    </span>
                  </label>
                  <input type="number" step="0.01" value={requestForm.estimated_unit_price} onChange={handleRequestChange('estimated_unit_price')} required min="0" />
                  {selectedProduct && (
                    <span className="hint-text">Prix reference charge automatiquement. Modifiable si besoin (declenchera une approbation Finance en cas d'ecart).</span>
                  )}
                </div>
                <div className="form-field full">
                  <label>Notes</label>
                  <input value={requestForm.notes} onChange={handleRequestChange('notes')} />
                </div>
              </div>
              <div className="modal-actions">
                <button type="button" className="modal-cancel" onClick={() => setShowRequestModal(false)}>Annuler</button>
                <button type="submit" className="module-primary-btn" disabled={submittingRequest}>
                  {submittingRequest ? 'Envoi...' : 'Soumettre la demande'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showCartLineModal && (
        <div className="modal-overlay" onClick={() => setShowCartLineModal(false)}>
          <div
            className="modal-panel"
            style={{ transform: `translate(${dragPos.x}px, ${dragPos.y}px)` }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-drag-handle" onMouseDown={handleDragStart}>
              <h3>{editingCartIndex !== null ? 'Modifier la ligne' : 'Ajouter un produit au panier'}</h3>
            </div>
            <form onSubmit={handleCartLineSubmit}>
              <div className="form-grid">
                <div className="form-field full" style={{ position: 'relative' }}>
                  <label>Produit</label>
                  <input
                    type="text"
                    placeholder="Rechercher un produit..."
                    value={cartLineQuery}
                    onChange={handleCartLineSearch}
                    autoComplete="off"
                    required
                  />
                  {cartLineResults.length > 0 && (
                    <div style={{
                      position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 10,
                      background: 'var(--panel-bg, #1a1a1a)', border: '1px solid var(--border-color, #333)',
                      borderRadius: '6px', marginTop: '4px', maxHeight: '220px', overflowY: 'auto',
                    }}>
                      {cartLineResults.map((p) => (
                        <div
                          key={p.id}
                          onClick={() => handleCartLineProductPick(p)}
                          style={{ padding: '8px 12px', cursor: 'pointer' }}
                          className="table-link-btn"
                        >
                          {p.name}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <div className="form-field">
                  <label>Quantite</label>
                  <input type="number" value={cartLineForm.quantity} onChange={handleCartLineFormChange('quantity')} required min="1" />
                </div>
                <div className="form-field">
                  <label>
                    Prix unitaire
                    <span className="currency-toggle">
                      <button type="button" className={cartLineForm.display_currency === 'USD' ? 'currency-btn active' : 'currency-btn'} onClick={() => handleCartLineCurrencyToggle('USD')}>USD</button>
                      <button type="button" className={cartLineForm.display_currency === 'CDF' ? 'currency-btn active' : 'currency-btn'} onClick={() => handleCartLineCurrencyToggle('CDF')}>CDF</button>
                    </span>
                  </label>
                  <input type="number" step="0.01" value={cartLineForm.estimated_unit_price} onChange={handleCartLineFormChange('estimated_unit_price')} required min="0" />
                </div>
              </div>
              <div className="modal-actions">
                <button type="button" className="modal-cancel" onClick={() => setShowCartLineModal(false)}>Annuler</button>
                <button type="submit" className="module-primary-btn" disabled={!cartLineForm.product_id}>
                  {editingCartIndex !== null ? 'Enregistrer' : 'Ajouter au panier'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showReceiveModal && (
        <div className="modal-overlay" onClick={() => setShowReceiveModal(false)}>
          <div
            className="modal-panel"
            style={{ transform: `translate(${dragPos.x}px, ${dragPos.y}px)` }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-drag-handle" onMouseDown={handleDragStart}>
              <h3>Reception - {productName(receivingOrder?.product_id)}</h3>
            </div>
            <p className="modal-subtext">
              Reste a recevoir : {receivingOrder ? receivingOrder.quantity - (receivingOrder.quantity_received_total || 0) : 0} / {receivingOrder?.quantity}. Cette reception sera soumise a la Finance avant d'entrer en stock.
            </p>
            {receiveError && <div className="form-error">{receiveError}</div>}
            <form onSubmit={handleReceiveSubmit}>
              <div className="form-grid">
                <div className="form-field full">
                  <label>Numero de lot</label>
                  <input value={receiveForm.lot_number} onChange={handleReceiveChange('lot_number')} required />
                </div>
                <div className="form-field">
                  <label>Date de fabrication</label>
                  <input type="date" value={receiveForm.manufacture_date} onChange={handleReceiveChange('manufacture_date')} />
                </div>
                <div className="form-field">
                  <label>Date de peremption</label>
                  <input type="date" value={receiveForm.expiry_date} onChange={handleReceiveChange('expiry_date')} required />
                </div>
                <div className="form-field">
                  <label>Quantite recue</label>
                  <input type="number" value={receiveForm.quantity_received} onChange={handleReceiveChange('quantity_received')} required min="1" />
                </div>
                <div className="form-field">
                  <label>Cout unitaire</label>
                  <input type="number" value={receiveForm.unit_cost} onChange={handleReceiveChange('unit_cost')} required min="0" />
                </div>
                <div className="form-field full">
                  <label>Commentaire (justification d'un ecart, ou remarque generale)</label>
                  <input
                    value={receiveForm.discrepancy_comment}
                    onChange={handleReceiveChange('discrepancy_comment')}
                    placeholder="ex: livraison partielle, reste attendu la semaine prochaine"
                  />
                </div>
                <div className="form-field full checkbox-field">
                  <label>
                    <input type="checkbox" checked={receiveForm.quality_control_passed} onChange={handleReceiveChange('quality_control_passed')} />
                    Controle qualite valide
                  </label>
                </div>
              </div>
              <div className="modal-actions">
                <button type="button" className="modal-cancel" onClick={() => setShowReceiveModal(false)}>Annuler</button>
                <button type="submit" className="module-primary-btn" disabled={submittingReceive}>
                  {submittingReceive ? 'Envoi...' : 'Soumettre a la Finance'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showBonusModal && (
        <div className="modal-overlay" onClick={() => setShowBonusModal(false)}>
          <div
            className="modal-panel"
            style={{ transform: `translate(${dragPos.x}px, ${dragPos.y}px)` }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-drag-handle" onMouseDown={handleDragStart}>
              <h3>Reception bonus - {productName(bonusOrder?.product_id)}</h3>
            </div>
            <p className="modal-subtext">
              Geste commercial du fournisseur, hors commande. N'affecte pas le suivi du bon de commande d'origine.
            </p>
            {bonusError && <div className="form-error">{bonusError}</div>}
            <form onSubmit={handleBonusSubmit}>
              <div className="form-grid">
                <div className="form-field full">
                  <label>Numero de lot</label>
                  <input value={bonusForm.lot_number} onChange={handleBonusChange('lot_number')} required />
                </div>
                <div className="form-field">
                  <label>Date de fabrication</label>
                  <input type="date" value={bonusForm.manufacture_date} onChange={handleBonusChange('manufacture_date')} />
                </div>
                <div className="form-field">
                  <label>Date de peremption</label>
                  <input type="date" value={bonusForm.expiry_date} onChange={handleBonusChange('expiry_date')} required />
                </div>
                <div className="form-field">
                  <label>Quantite bonus</label>
                  <input type="number" value={bonusForm.quantity} onChange={handleBonusChange('quantity')} required min="1" />
                </div>
                <div className="form-field">
                  <label>Cout unitaire (0 = gratuit)</label>
                  <input type="number" value={bonusForm.unit_cost} onChange={handleBonusChange('unit_cost')} min="0" />
                </div>
                <div className="form-field full">
                  <label>Notes</label>
                  <input value={bonusForm.notes} onChange={handleBonusChange('notes')} placeholder="ex: geste commercial pour fidelite" />
                </div>
                <div className="form-field full checkbox-field">
                  <label>
                    <input type="checkbox" checked={bonusForm.quality_control_passed} onChange={handleBonusChange('quality_control_passed')} />
                    Controle qualite valide
                  </label>
                </div>
              </div>
              <div className="modal-actions">
                <button type="button" className="modal-cancel" onClick={() => setShowBonusModal(false)}>Annuler</button>
                <button type="submit" className="module-primary-btn" disabled={submittingBonus}>
                  {submittingBonus ? 'Enregistrement...' : 'Confirmer le bonus'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}