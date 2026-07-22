import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import {
  listPurchaseRequests, createPurchaseRequestBatch, decidePurchaseRequestBatch,
  listPurchaseOrders, receivePurchaseOrder, receiveBonus,
} from '../../services/purchases';
import { listProducts, searchProducts } from '../../services/products';
import { listStockReceiptApprovals, approveStockReceipt } from '../../services/priceVariance';
import { getActivePharmacy } from '../../services/pharmacy';
import { connectPharmacySocket, getPharmacySocket } from '../../sockets/pharmacySocket';
import PurchaseOrderPreviewModal from '../../components/PurchaseOrderPreviewModal';

const emptyReceiveForm = {
  lot_number: '', manufacture_date: '', expiry_date: '',
  quantity_received: '', unit_cost: '', quality_control_passed: false, discrepancy_comment: '',
  bonus_quantity: '', bonus_unit_cost: '0',
};
const emptyBonusForm = {
  lot_number: '', manufacture_date: '', expiry_date: '',
  quantity: '', unit_cost: '0', quality_control_passed: false, notes: '',
};

const BONUS_GRACE_PERIOD_MS = 60 * 60 * 1000;
const FINANCE_ROLES = ['PHARMACY_ADMIN', 'PHARMACY_FINANCE'];
const PURCHASE_ROLES = ['PHARMACY_ADMIN', 'PHARMACY_TITULAIRE', 'PHARMACY_ACHATS'];

const STATUS_LABELS = {
  PENDING: 'En attente', APPROVED: 'Approuvee', REJECTED: 'Rejetee', MIXED: 'Partiellement approuvee',
  SENT: 'Envoyee', PARTIALLY_RECEIVED: 'Partiellement receptionnee', RECEIVED: 'Receptionnee',
  PENDING_APPROVAL: 'En attente Finance',
};

function StatusBadge({ status }) {
  const cls = {
    PENDING: 'badge-status warn', APPROVED: 'badge-status ok', REJECTED: 'badge-status danger', MIXED: 'badge-status warn',
    SENT: 'badge-status info', PARTIALLY_RECEIVED: 'badge-status warn', RECEIVED: 'badge-status ok',
    PENDING_APPROVAL: 'badge-status warn',
  }[status] || 'badge-status';
  return <span className={cls}>{STATUS_LABELS[status] || status}</span>;
}

// Bonus tardif : uniquement pour une commande deja entierement receptionnee, dans la
// fenetre de grace. Pour SENT/PARTIALLY_RECEIVED, le bonus se saisit desormais dans
// la meme boite que Receptionner (bouton "+ Ajouter un bonus").
function canShowStandaloneBonusButton(order) {
  if (order.status === 'RECEIVED' && order.received_at) {
    const elapsed = Date.now() - new Date(order.received_at).getTime();
    return elapsed < BONUS_GRACE_PERIOD_MS;
  }
  return false;
}

function aggregateOrderGroupStatus(groupOrders) {
  const statuses = groupOrders.map((o) => o.status);
  if (statuses.every((s) => s === 'RECEIVED')) return 'RECEIVED';
  if (statuses.some((s) => s === 'PARTIALLY_RECEIVED') || (statuses.some((s) => s === 'RECEIVED') && statuses.some((s) => s === 'SENT'))) {
    return 'PARTIALLY_RECEIVED';
  }
  return 'SENT';
}

function aggregateRequestStatus(lines) {
  const statuses = lines.map((l) => l.status);
  if (statuses.every((s) => s === 'APPROVED')) return 'APPROVED';
  if (statuses.every((s) => s === 'REJECTED')) return 'REJECTED';
  if (statuses.some((s) => s === 'PENDING')) return 'PENDING';
  return 'MIXED';
}

function formatDate(dateStr) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('fr-FR', { year: 'numeric', month: 'long', day: 'numeric' });
}
function formatDateTime(dateStr) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleString('fr-FR', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' });
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

  const [showReceiveModal, setShowReceiveModal] = useState(false);
  const [receivingOrder, setReceivingOrder] = useState(null);
  const [receiveForm, setReceiveForm] = useState(emptyReceiveForm);
  const [receiveError, setReceiveError] = useState('');
  const [submittingReceive, setSubmittingReceive] = useState(false);
  const [showBonusSection, setShowBonusSection] = useState(false);

  const [showBonusModal, setShowBonusModal] = useState(false);
  const [bonusOrder, setBonusOrder] = useState(null);
  const [bonusForm, setBonusForm] = useState(emptyBonusForm);
  const [bonusError, setBonusError] = useState('');
  const [submittingBonus, setSubmittingBonus] = useState(false);

  // Bons de commande groupes par batch (panier) : "Ouvrir" affiche le detail avec
  // Receptionner / Reception bonus sur chaque ligne de produit
  const [showOrderGroupModal, setShowOrderGroupModal] = useState(false);
  const [activeOrderGroup, setActiveOrderGroup] = useState(null);

  // Demandes d'achat groupees par panier : "Ouvrir" affiche le detail. La Finance peut
  // modifier quantite/prix par ligne avant d'Approuver ou Rejeter le panier entier.
  const [showDecisionModal, setShowDecisionModal] = useState(false);
  const [activeRequestGroup, setActiveRequestGroup] = useState(null);
  const [decisionLines, setDecisionLines] = useState([]); // copie editable {id, product_id, quantity, estimated_unit_price}
  const [decisionComment, setDecisionComment] = useState('');
  const [decisionError, setDecisionError] = useState('');
  const [submittingDecision, setSubmittingDecision] = useState(false);

  // Nouvelle demande d'achat : une seule boite de dialogue. "+ Produit" (en haut a droite)
  // ouvre une recherche ; choisir un produit ajoute IMMEDIATEMENT une ligne au tableau, avec
  // ses champs quantite/prix editables directement sur la ligne (pas de formulaire separe,
  // pas de fenetre empilee). Une fois validee, la ligne passe en lecture seule avec Modifier/Supprimer.
  const [showNewRequestModal, setShowNewRequestModal] = useState(false);
  const [cart, setCart] = useState([]);
  const [lineLocalErrors, setLineLocalErrors] = useState({});
  const [cartErrors, setCartErrors] = useState({});
  const [cartGlobalError, setCartGlobalError] = useState('');
  const [submittingCart, setSubmittingCart] = useState(false);
  const [showProductSearch, setShowProductSearch] = useState(false);
  const [productSearchQuery, setProductSearchQuery] = useState('');
  const [productSearchResults, setProductSearchResults] = useState([]);

  const [previewBatchId, setPreviewBatchId] = useState(null);

  const [dragPos, setDragPos] = useState({ x: 0, y: 0 });
  const dragState = useRef({ dragging: false, startX: 0, startY: 0, originX: 0, originY: 0 });

  const productName = (id) => products.find((p) => p.id === id)?.name || id;

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

  // Regroupement des commandes par bon de commande (batch_id issu de la demande d'origine)
  const orderGroups = (() => {
    const map = new Map();
    orders.forEach((o) => {
      const batchId = o.purchase_requests?.batch_id || o.id;
      if (!map.has(batchId)) map.set(batchId, []);
      map.get(batchId).push(o);
    });
    return Array.from(map.entries()).map(([batchId, groupOrders]) => ({
      batchId,
      reference: 'BC-' + batchId.slice(0, 8).toUpperCase(),
      date: groupOrders[0]?.purchase_requests?.created_at || groupOrders[0]?.created_at,
      requester: groupOrders[0]?.purchase_requests?.requester?.name || '—',
      status: aggregateOrderGroupStatus(groupOrders),
      total: groupOrders.reduce((sum, o) => sum + o.quantity * o.unit_price, 0),
      orders: groupOrders,
    })).sort((a, b) => new Date(b.date) - new Date(a.date));
  })();

  // Regroupement des demandes d'achat par panier
  const requestGroups = (() => {
    const map = new Map();
    requests.forEach((r) => {
      const batchId = r.batch_id || r.id;
      if (!map.has(batchId)) map.set(batchId, []);
      map.get(batchId).push(r);
    });
    return Array.from(map.entries()).map(([batchId, lines]) => {
      const sorted = [...lines].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
      const submissionDate = sorted[0]?.created_at;
      const processedDates = lines.filter((l) => l.processed_at).map((l) => new Date(l.processed_at).getTime());
      const validationDate = processedDates.length > 0 ? new Date(Math.max(...processedDates)).toISOString() : null;
      return {
        batchId,
        description: "Demande d'achat du " + formatDateTime(submissionDate),
        total: lines.reduce((sum, l) => sum + Number(l.estimated_total), 0),
        varianceCount: lines.filter((l) => l.price_variance).length,
        status: aggregateRequestStatus(lines),
        submissionDate,
        validationDate,
        comment: lines[0]?.notes || '',
        requestedBy: lines[0]?.requested_by,
        approverRole: lines[0]?.approver?.role || null,
        lines,
      };
    })
      // Le panier ne quitte Demandes d'achat que si l'approbation a ete faite par la
      // Finance specifiquement (meme sans ecart de prix) - une approbation par
      // Titulaire/Achats reste visible ici. Les rejetes restent toujours visibles.
      .filter((g) => !(g.status === 'APPROVED' && FINANCE_ROLES.includes(g.approverRole)))
      .sort((a, b) => new Date(b.submissionDate) - new Date(a.submissionDate));
  })();

  const openOrderGroup = (group) => {
    setActiveOrderGroup(group);
    setShowOrderGroupModal(true);
  };

  const openRequestGroup = (group) => {
    setActiveRequestGroup(group);
    setDecisionLines(group.lines.map((l) => ({
      id: l.id,
      product_id: l.product_id,
      quantity: String(l.quantity),
      estimated_unit_price: String(l.estimated_unit_price),
    })));
    setDecisionComment('');
    setDecisionError('');
    setShowDecisionModal(true);
  };

  // Reprend les lignes d'un panier rejete dans la boite "Nouvelle demande" pour correction
  // et resoumission - cree un tout nouveau batch_id, le panier rejete reste intact comme trace.
  const startResubmit = (group) => {
    setShowDecisionModal(false);
    const newCart = group.lines.map((l) => ({
      product_id: l.product_id,
      product_name: productName(l.product_id),
      quantity: String(l.quantity),
      estimated_unit_price: String(l.estimated_unit_price),
      display_currency: 'CDF',
      confirmed: true,
    }));
    setCart(newCart);
    setLineLocalErrors({});
    setCartErrors({});
    setCartGlobalError('');
    setShowProductSearch(false);
    setProductSearchQuery('');
    setProductSearchResults([]);
    setDragPos({ x: 0, y: 0 });
    setShowNewRequestModal(true);
  };

  const updateDecisionLineField = (index, field) => (e) => {
    const value = e.target.value;
    setDecisionLines((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
  };

  const submitDecision = async (approve) => {
    if (!activeRequestGroup) return;
    setDecisionError('');
    if (!approve && !decisionComment.trim()) {
      setDecisionError('Un commentaire de justification est requis pour rejeter ce panier.');
      return;
    }
    setSubmittingDecision(true);
    try {
      const payload = { approve, decision_comment: decisionComment.trim() || undefined };
      if (isFinance) {
        payload.lines = decisionLines.map((l) => ({
          id: l.id,
          quantity: Number(l.quantity),
          estimated_unit_price: Number(l.estimated_unit_price),
        }));
      }
      await decidePurchaseRequestBatch(activePharmacyId, activeRequestGroup.batchId, payload);
      setShowDecisionModal(false);
      setResultMessage(approve ? 'Panier approuve.' : 'Panier rejete.');
      load(true);
    } catch (err) {
      setDecisionError(err.response?.data?.message || 'Erreur lors de la decision.');
    } finally {
      setSubmittingDecision(false);
    }
  };

  const openNewRequestModal = () => {
    setCart([]);
    setLineLocalErrors({});
    setCartErrors({});
    setCartGlobalError('');
    setShowProductSearch(false);
    setProductSearchQuery('');
    setProductSearchResults([]);
    setDragPos({ x: 0, y: 0 });
    setShowNewRequestModal(true);
  };

  // Auto-remplissage : quantite = reste a recevoir, cout unitaire = prix de reference
  // produit (converti en CDF). L'utilisateur peut toujours ajuster avant de soumettre.
  const openReceiveModal = (order) => {
    const remaining = order.quantity - (order.quantity_received_total || 0);
    const product = products.find((p) => p.id === order.product_id);
    let defaultUnitCost = '';
    if (product?.purchase_price) {
      defaultUnitCost = product.currency === 'USD'
        ? Math.round(Number(product.purchase_price) * usdRate)
        : Number(product.purchase_price);
    }
    setReceivingOrder(order);
    setReceiveForm({
      ...emptyReceiveForm,
      quantity_received: String(remaining),
      unit_cost: defaultUnitCost !== '' ? String(defaultUnitCost) : '',
    });
    setShowBonusSection(false);
    setReceiveError('');
    setResultMessage('');
    setDragPos({ x: 0, y: 0 });
    setShowReceiveModal(true);
  };

  const handleReceiveChange = (field) => (e) => {
    const value = field === 'quality_control_passed' ? e.target.checked : e.target.value;
    setReceiveForm({ ...receiveForm, [field]: value });
  };

  const toggleBonusSection = () => {
    if (showBonusSection) {
      setReceiveForm({ ...receiveForm, bonus_quantity: '', bonus_unit_cost: '0' });
    }
    setShowBonusSection(!showBonusSection);
  };

  // Justification obligatoire (champ commentaire partage) si le cout unitaire saisi
  // s'ecarte du prix de reference produit, ou si un bonus est ajoute a la reception.
  const receiveHasVariance = () => {
    const product = products.find((p) => p.id === receivingOrder?.product_id);
    if (!product?.purchase_price || !receiveForm.unit_cost) return false;
    const referencePrice = product.currency === 'USD' ? Number(product.purchase_price) * usdRate : Number(product.purchase_price);
    return Math.abs(referencePrice - Number(receiveForm.unit_cost)) > 0.01;
  };

  const handleReceiveSubmit = async (e) => {
    e.preventDefault();
    setReceiveError('');
    if (!receiveForm.quality_control_passed) {
      setReceiveError('Le controle qualite doit etre valide avant toute soumission.');
      return;
    }
    const hasBonus = showBonusSection && Number(receiveForm.bonus_quantity) > 0;
    if ((receiveHasVariance() || hasBonus) && !receiveForm.discrepancy_comment.trim()) {
      setReceiveError("Un commentaire justificatif est requis en cas d'ecart de prix ou de bonus.");
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
      if (hasBonus) {
        await receiveBonus(activePharmacyId, receivingOrder.id, {
          lot_number: receiveForm.lot_number,
          manufacture_date: receiveForm.manufacture_date || undefined,
          expiry_date: receiveForm.expiry_date,
          quantity: Number(receiveForm.bonus_quantity),
          unit_cost: Number(receiveForm.bonus_unit_cost) || 0,
          quality_control_passed: true,
          notes: receiveForm.discrepancy_comment || undefined,
        });
      }
      setShowReceiveModal(false);
      setResultMessage(hasBonus ? result.message + ' Bonus ajoute.' : result.message);
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
      // recherche silencieuse : pas de blocage de la saisie en cas d'echec reseau ponctuel
    }
  };

  const handleProductPick = (product) => {
    let defaultPrice = '';
    if (product?.purchase_price) {
      const priceInCdf = product.currency === 'USD' ? Number(product.purchase_price) * usdRate : Number(product.purchase_price);
      defaultPrice = (priceInCdf / usdRate).toFixed(2);
    }
    const newLine = {
      product_id: product.id,
      product_name: product.name,
      quantity: '',
      estimated_unit_price: defaultPrice,
      display_currency: 'USD',
      confirmed: false,
    };
    setCart((prev) => [...prev, newLine]);
    setShowProductSearch(false);
    setProductSearchQuery('');
    setProductSearchResults([]);
  };

  const updateLineField = (index, field) => (e) => {
    const value = e.target.value;
    setCart((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
  };

  const toggleLineCurrency = (index, currency) => {
    setCart((prev) => {
      const next = [...prev];
      const line = next[index];
      if (currency === line.display_currency) return prev;
      let converted = line.estimated_unit_price;
      if (line.estimated_unit_price) {
        const value = Number(line.estimated_unit_price);
        converted = currency === 'USD' ? (value / usdRate).toFixed(2) : Math.round(value * usdRate);
      }
      next[index] = { ...line, display_currency: currency, estimated_unit_price: converted };
      return next;
    });
  };

  const confirmLine = (index) => {
    const line = cart[index];
    if (!line.quantity || Number(line.quantity) <= 0) {
      setLineLocalErrors((prev) => ({ ...prev, [index]: 'Quantite requise.' }));
      return;
    }
    if (line.estimated_unit_price === '' || Number(line.estimated_unit_price) < 0) {
      setLineLocalErrors((prev) => ({ ...prev, [index]: 'Prix requis.' }));
      return;
    }
    setLineLocalErrors((prev) => {
      const next = { ...prev };
      delete next[index];
      return next;
    });
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
    setLineLocalErrors((prev) => {
      const next = { ...prev };
      delete next[index];
      return next;
    });
    setCartErrors((prev) => {
      const next = { ...prev };
      delete next[index];
      return next;
    });
  };

  const lineTotalCdf = (line) => {
    if (!line.quantity || line.estimated_unit_price === '') return 0;
    const priceInCdf = line.display_currency === 'USD'
      ? Number(line.estimated_unit_price) * usdRate
      : Number(line.estimated_unit_price);
    return Number(line.quantity) * priceInCdf;
  };

  const cartTotalCdf = cart.reduce((sum, line) => sum + lineTotalCdf(line), 0);
  const allLinesConfirmed = cart.length > 0 && cart.every((l) => l.confirmed);

  const handleCartSubmit = async () => {
    if (!allLinesConfirmed) return;
    setCartGlobalError('');
    setCartErrors({});
    setSubmittingCart(true);
    try {
      const result = await createPurchaseRequestBatch(activePharmacyId, {
        lines: cart.map((line) => {
          const priceInCdf = line.display_currency === 'USD'
            ? Math.round(Number(line.estimated_unit_price) * usdRate)
            : Number(line.estimated_unit_price);
          return {
            product_id: line.product_id,
            quantity: Number(line.quantity),
            estimated_unit_price: priceInCdf,
          };
        }),
      });
      setShowNewRequestModal(false);
      setCart([]);
      setResultMessage((result.requests?.length || 0) + ' demande(s) d\'achat creee(s).');
      load(true);
      if (result.batch_id) {
        setPreviewBatchId(result.batch_id);
      }
    } catch (err) {
      const data = err.response?.data;
      if (data?.errors?.length) {
        const byLine = {};
        data.errors.forEach((e) => { byLine[e.line] = e.error; });
        setCartErrors(byLine);
        setCartGlobalError(data.message || 'Demande invalide, aucune demande creee.');
      } else {
        setCartGlobalError(data?.message || 'Erreur lors de la soumission de la demande.');
      }
    } finally {
      setSubmittingCart(false);
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
    dragState.current = {
      dragging: true, startX: e.clientX, startY: e.clientY,
      originX: dragPos.x, originY: dragPos.y,
    };
    window.addEventListener('mousemove', handleDragMove);
    window.addEventListener('mouseup', handleDragEnd);
  };

  // Toute demande d'achat exige une validation Finance explicite - Titulaire/Achats ne
  // peuvent plus approuver, meme sans ecart de prix (regle metier confirmee explicitement)
  const canDecide = (group) => group.status === 'PENDING' && group.requestedBy !== user?.id && isFinance;

  return (
    <div>
      <div className="module-header">
        <div className="module-title-block">
          <span className="tag mono">MOD-03</span>
          <h2>Achats</h2>
        </div>
        <button className="module-primary-btn" onClick={openNewRequestModal}>
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
        {isFinance && (
          <button className={tab === 'finance' ? 'tab-btn active' : 'tab-btn'} onClick={() => setTab('finance')}>
            Approbations Finance {stockApprovals.length > 0 ? '(' + stockApprovals.length + ')' : ''}
          </button>
        )}
      </div>

      {tab === 'requests' && (
        <div className="data-table-wrap">
          {loading ? null : requestGroups.length === 0 ? (
            <div className="empty-state">Aucune demande d'achat.</div>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Description</th>
                  <th className="num">Total</th>
                  <th>Ecart de prix</th>
                  <th>Statut</th>
                  <th>Date soumission</th>
                  <th>Date validation</th>
                  <th>Commentaire</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {requestGroups.map((group) => (
                  <tr key={group.batchId}>
                    <td>{group.description}</td>
                    <td className="num">{group.total.toLocaleString('fr-FR')} CDF</td>
                    <td>{group.varianceCount > 0 ? <span className="badge-status danger">{group.varianceCount} produit(s)</span> : '—'}</td>
                    <td><StatusBadge status={group.status} /></td>
                    <td>{formatDate(group.submissionDate)}</td>
                    <td>{group.validationDate ? formatDate(group.validationDate) : '—'}</td>
                    <td>{group.comment || '—'}</td>
                    <td className="row-actions">
                      <button type="button" className="table-link-btn accent" onClick={() => openRequestGroup(group)}>
                        Ouvrir
                      </button>
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
          {loading ? null : orderGroups.length === 0 ? (
            <div className="empty-state">Aucun bon de commande.</div>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Reference</th>
                  <th>Date</th>
                  <th>Demandeur</th>
                  <th className="num">Total</th>
                  <th>Statut</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {orderGroups.map((group) => (
                  <tr key={group.batchId}>
                    <td className="mono">{group.reference}</td>
                    <td>{formatDate(group.date)}</td>
                    <td>{group.requester}</td>
                    <td className="num">{group.total.toLocaleString('fr-FR')} CDF</td>
                    <td><StatusBadge status={group.status} /></td>
                    <td className="row-actions">
                      <button type="button" className="table-link-btn accent" onClick={() => openOrderGroup(group)}>
                        Ouvrir
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
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
                      <button type="button" className="table-link-btn accent" onClick={() => approveStockReceipt(activePharmacyId, a.id, true).then(() => load(true))}>
                        Approuver
                      </button>
                      <button type="button" className="table-link-btn warn" onClick={() => approveStockReceipt(activePharmacyId, a.id, false).then(() => load(true))}>
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

      {previewBatchId && (
        <PurchaseOrderPreviewModal
          batchId={previewBatchId}
          pharmacyId={activePharmacyId}
          onClose={() => setPreviewBatchId(null)}
        />
      )}

      {showDecisionModal && activeRequestGroup && (
        <div className="modal-overlay" onClick={() => setShowDecisionModal(false)}>
          <div
            className="modal-panel"
            style={{ transform: `translate(${dragPos.x}px, ${dragPos.y}px)`, minWidth: '620px' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-drag-handle" onMouseDown={handleDragStart}>
              <h3>{activeRequestGroup.description}</h3>
            </div>
            <p className="modal-subtext">
              Statut : <StatusBadge status={activeRequestGroup.status} /><br />
              Date soumission : {formatDate(activeRequestGroup.submissionDate)}<br />
              {activeRequestGroup.validationDate && <>Date validation : {formatDate(activeRequestGroup.validationDate)}<br /></>}
              {activeRequestGroup.comment && <>Commentaire : {activeRequestGroup.comment}<br /></>}
              {activeRequestGroup.varianceCount > 0 && <>Ecart de prix sur {activeRequestGroup.varianceCount} produit(s).<br /></>}
              {isFinance && activeRequestGroup.status === 'PENDING' && <span className="hint-text">Vous pouvez ajuster quantite/prix avant de decider.</span>}
            </p>

            {decisionError && <div className="form-error">{decisionError}</div>}

            <div className="data-table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Produit</th>
                    <th className="num">Quantite</th>
                    <th className="num">Prix unitaire</th>
                    <th>Statut</th>
                  </tr>
                </thead>
                <tbody>
                  {activeRequestGroup.lines.map((line, index) => {
                    const editable = isFinance && activeRequestGroup.status === 'PENDING';
                    return (
                      <tr key={line.id}>
                        <td>{productName(line.product_id)}</td>
                        <td className="num">
                          {editable ? (
                            <input
                              type="number" min="1" style={{ width: '70px' }}
                              value={decisionLines[index]?.quantity ?? ''}
                              onChange={updateDecisionLineField(index, 'quantity')}
                            />
                          ) : line.quantity}
                        </td>
                        <td className="num">
                          {editable ? (
                            <input
                              type="number" min="0" step="0.01" style={{ width: '100px' }}
                              value={decisionLines[index]?.estimated_unit_price ?? ''}
                              onChange={updateDecisionLineField(index, 'estimated_unit_price')}
                            />
                          ) : Number(line.estimated_unit_price).toLocaleString('fr-FR') + ' CDF'}
                        </td>
                        <td><StatusBadge status={line.status} /></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {canDecide(activeRequestGroup) && (
              <div className="form-field full" style={{ marginTop: '12px' }}>
                <label>Commentaire de decision {'(obligatoire en cas de rejet)'}</label>
                <input
                  value={decisionComment}
                  onChange={(e) => setDecisionComment(e.target.value)}
                  placeholder="ex: budget depasse, produit non prioritaire, en double avec un autre panier..."
                />
              </div>
            )}

            <div className="modal-actions">
              <button type="button" className="modal-cancel" onClick={() => setShowDecisionModal(false)}>Fermer</button>
              {activeRequestGroup.status === 'REJECTED' && activeRequestGroup.requestedBy === user?.id && (
                <button type="button" className="table-link-btn accent" onClick={() => startResubmit(activeRequestGroup)}>
                  Modifier et resoumettre
                </button>
              )}
              {canDecide(activeRequestGroup) && (
                <>
                  <button type="button" className="table-link-btn warn" disabled={submittingDecision} onClick={() => submitDecision(false)}>
                    Rejeter le panier
                  </button>
                  <button type="button" className="module-primary-btn" disabled={submittingDecision} onClick={() => submitDecision(true)}>
                    {submittingDecision ? 'Envoi...' : 'Approuver le panier'}
                  </button>
                </>
              )}
              {activeRequestGroup.status === 'PENDING' && !canDecide(activeRequestGroup) && activeRequestGroup.requestedBy === user?.id && (
                <span className="hint-text">En attente de validation Finance</span>
              )}
              {activeRequestGroup.status === 'PENDING' && !canDecide(activeRequestGroup) && activeRequestGroup.requestedBy !== user?.id && !isFinance && (
                <span className="hint-text">Validation Finance uniquement</span>
              )}
            </div>
          </div>
        </div>
      )}

      {showOrderGroupModal && activeOrderGroup && (
        <div className="modal-overlay" onClick={() => setShowOrderGroupModal(false)}>
          <div
            className="modal-panel"
            style={{ transform: `translate(${dragPos.x}px, ${dragPos.y}px)`, minWidth: '620px' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-drag-handle" onMouseDown={handleDragStart}>
              <h3>Bon de commande {activeOrderGroup.reference}</h3>
            </div>
            <p className="modal-subtext">
              Date : {formatDate(activeOrderGroup.date)}<br />
              Demandeur : {activeOrderGroup.requester}
            </p>
            <div className="data-table-wrap">
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
                  {activeOrderGroup.orders.map((o) => {
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
                          {canShowStandaloneBonusButton(o) && (
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
            </div>
            <div className="modal-actions">
              <button type="button" className="modal-cancel" onClick={() => setShowOrderGroupModal(false)}>Fermer</button>
            </div>
          </div>
        </div>
      )}

      {showNewRequestModal && (
        <div className="modal-overlay" onClick={() => setShowNewRequestModal(false)}>
          <div
            className="modal-panel"
            style={{ transform: `translate(${dragPos.x}px, ${dragPos.y}px)`, minWidth: '620px' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-drag-handle" onMouseDown={handleDragStart} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3>Nouvelle demande d'achat</h3>
              <div style={{ position: 'relative' }}>
                <button type="button" className="table-link-btn accent" onClick={openProductSearch}>
                  + Produit
                </button>
                {showProductSearch && (
                  <div style={{
                    position: 'absolute', top: '100%', right: 0, zIndex: 20, width: '280px',
                    background: 'var(--panel-bg, #1a1a1a)', border: '1px solid var(--border-color, #333)',
                    borderRadius: '6px', marginTop: '6px', padding: '8px',
                  }}>
                    <input
                      type="text"
                      autoFocus
                      placeholder="Rechercher un produit..."
                      value={productSearchQuery}
                      onChange={handleProductSearchChange}
                      autoComplete="off"
                      style={{ width: '100%', marginBottom: '6px' }}
                    />
                    <div style={{ maxHeight: '200px', overflowY: 'auto' }}>
                      {productSearchResults.map((p) => (
                        <div
                          key={p.id}
                          onClick={() => handleProductPick(p)}
                          style={{ padding: '8px 10px', cursor: 'pointer', color: '#f0f0f0', borderRadius: '4px' }}
                          onMouseEnter={(e) => e.currentTarget.style.background = '#2a2a2a'}
                          onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                        >
                          {p.name}
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

            {cartGlobalError && <div className="form-error">{cartGlobalError}</div>}

            <div className="data-table-wrap" style={{ marginTop: '16px' }}>
              {cart.length === 0 ? (
                <div className="empty-state">Aucun produit ajoute. Cliquez sur "+ Produit" pour commencer.</div>
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
                          {lineLocalErrors[index] && <div className="form-error">{lineLocalErrors[index]}</div>}
                        </td>
                        {line.confirmed ? (
                          <>
                            <td className="num">{line.quantity}</td>
                            <td className="num">{Math.round(lineTotalCdf(line) / (line.quantity || 1)).toLocaleString('fr-FR')} CDF</td>
                            <td className="num">{lineTotalCdf(line).toLocaleString('fr-FR')} CDF</td>
                            <td className="row-actions">
                              <button type="button" className="table-link-btn" onClick={() => editLine(index)}>
                                Modifier
                              </button>
                              <button type="button" className="table-link-btn warn" onClick={() => removeLine(index)}>
                                Supprimer
                              </button>
                            </td>
                          </>
                        ) : (
                          <>
                            <td>
                              <input
                                type="number" min="1" style={{ width: '70px' }}
                                value={line.quantity}
                                onChange={updateLineField(index, 'quantity')}
                              />
                            </td>
                            <td>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                <input
                                  type="number" min="0" step="0.01" style={{ width: '90px' }}
                                  value={line.estimated_unit_price}
                                  onChange={updateLineField(index, 'estimated_unit_price')}
                                />
                                <span className="currency-toggle">
                                  <button type="button" className={line.display_currency === 'USD' ? 'currency-btn active' : 'currency-btn'} onClick={() => toggleLineCurrency(index, 'USD')}>USD</button>
                                  <button type="button" className={line.display_currency === 'CDF' ? 'currency-btn active' : 'currency-btn'} onClick={() => toggleLineCurrency(index, 'CDF')}>CDF</button>
                                </span>
                              </div>
                            </td>
                            <td className="num">{lineTotalCdf(line).toLocaleString('fr-FR')} CDF</td>
                            <td className="row-actions">
                              <button type="button" className="table-link-btn accent" onClick={() => confirmLine(index)}>
                                Valider
                              </button>
                              <button type="button" className="table-link-btn warn" onClick={() => removeLine(index)}>
                                Supprimer
                              </button>
                            </td>
                          </>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            <div className="modal-actions" style={{ justifyContent: 'space-between', marginTop: '16px' }}>
              <span className="hint-text">Total : {cartTotalCdf.toLocaleString('fr-FR')} CDF</span>
              <div>
                <button type="button" className="modal-cancel" onClick={() => setShowNewRequestModal(false)}>Annuler</button>
                <button type="button" className="module-primary-btn" disabled={!allLinesConfirmed || submittingCart} onClick={handleCartSubmit}>
                  {submittingCart ? 'Envoi...' : 'Soumettre la demande (' + cart.length + ')'}
                </button>
              </div>
            </div>
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
                  {!showBonusSection ? (
                    <button type="button" className="table-link-btn accent" onClick={toggleBonusSection}>
                      + Ajouter un bonus
                    </button>
                  ) : (
                    <div style={{ border: '1px solid var(--line, #ddd)', borderRadius: '6px', padding: '10px', marginBottom: '4px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                        <strong style={{ fontSize: '13px' }}>Bonus fournisseur (hors commande)</strong>
                        <button type="button" className="table-link-btn warn" onClick={toggleBonusSection}>Retirer</button>
                      </div>
                      <div className="form-grid">
                        <div className="form-field">
                          <label>Quantite bonus</label>
                          <input type="number" min="1" value={receiveForm.bonus_quantity} onChange={handleReceiveChange('bonus_quantity')} />
                        </div>
                        <div className="form-field">
                          <label>Cout unitaire bonus (0 = gratuit)</label>
                          <input type="number" min="0" value={receiveForm.bonus_unit_cost} onChange={handleReceiveChange('bonus_unit_cost')} />
                        </div>
                      </div>
                    </div>
                  )}
                </div>
                <div className="form-field full">
                  <label>
                    Commentaire
                    {(receiveHasVariance() || (showBonusSection && Number(receiveForm.bonus_quantity) > 0)) && (
                      <span className="badge-status danger" style={{ marginLeft: '8px' }}>Requis</span>
                    )}
                  </label>
                  <input
                    value={receiveForm.discrepancy_comment}
                    onChange={handleReceiveChange('discrepancy_comment')}
                    placeholder="ex: livraison partielle, ecart negocie avec le fournisseur, bonus commercial..."
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