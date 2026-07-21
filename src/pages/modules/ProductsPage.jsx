import { useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { listProducts, searchProducts, createProduct, updateProduct } from '../../services/products';
import { getActivePharmacy } from '../../services/pharmacy';
import { printBarcodeLabel } from '../../utils/barcode';

const FIXED_VAT_RATE = 16;
const VAT_MULTIPLIER = 1 + FIXED_VAT_RATE / 100;

const emptyForm = {
  name: '', dci: '', category: '', barcode: '',
  galenic_form: '', dosage: '', purchase_price: '', sale_price: '', currency: 'CDF',
};

const CATEGORIES = [
  'Antalgique', 'Antibiotique', 'Antipaludeen', 'Anti-inflammatoire', 'Antiparasitaire',
  'Antiseptique', 'Vitamines & Complements', 'Cardiovasculaire', 'Digestif', 'Respiratoire',
  'Dermatologie', 'Gynecologie', 'Ophtalmologie', 'Autre',
];

const GALENIC_FORMS = [
  'Comprime', 'Comprime effervescent', 'Gelule', 'Sirop', 'Suspension buvable',
  'Solution injectable', 'Pommade', 'Creme', 'Suppositoire', 'Poudre', 'Sachet', 'Goutte',
];

const CATEGORY_DCI_MAP = {
  'Antalgique': ['Paracetamol', 'Ibuprofene', 'Aspirine', 'Diclofenac'],
  'Antibiotique': ['Amoxicilline', 'Ampicilline', 'Ciprofloxacine', 'Metronidazole', 'Cotrimoxazole'],
  'Antipaludeen': ['Artemether/Lumefantrine', 'Quinine', 'Chloroquine', 'Sulfadoxine-Pyrimethamine'],
  'Anti-inflammatoire': ['Diclofenac', 'Ibuprofene'],
  'Antiparasitaire': ['Mebendazole', 'Albendazole'],
  'Antiseptique': ['Chlorhexidine', 'Povidone iodee', 'Alcool 70%'],
  'Vitamines & Complements': ['Vitamine C', 'Multivitamines', 'Fer + Acide folique'],
  'Cardiovasculaire': ['Amlodipine', 'Enalapril', 'Furosemide'],
  'Digestif': ['Omeprazole', 'Ranitidine', 'Sels de Rehydratation Orale'],
  'Respiratoire': ['Salbutamol'],
  'Dermatologie': ['Betamethasone', 'Acide fusidique'],
  'Gynecologie': ['Metronidazole', 'Clotrimazole'],
  'Ophtalmologie': ['Tetracycline (collyre)', 'Chloramphenicol (collyre)'],
};

const ALL_DCI = Array.from(new Set(Object.values(CATEGORY_DCI_MAP).flat())).sort();

const PRODUCT_PRESETS = {
  'doliprane': { category: 'Antalgique', dci: 'Paracetamol', galenic_form: 'Comprime', dosage: '500mg' },
  'efferalgan': { category: 'Antalgique', dci: 'Paracetamol', galenic_form: 'Comprime effervescent', dosage: '500mg' },
  'paracetamol': { category: 'Antalgique', dci: 'Paracetamol', galenic_form: 'Comprime', dosage: '500mg' },
  'ibuprofene': { category: 'Antalgique', dci: 'Ibuprofene', galenic_form: 'Comprime', dosage: '400mg' },
  'amoxicilline': { category: 'Antibiotique', dci: 'Amoxicilline', galenic_form: 'Gelule', dosage: '500mg' },
  'ciprofloxacine': { category: 'Antibiotique', dci: 'Ciprofloxacine', galenic_form: 'Comprime', dosage: '500mg' },
  'flagyl': { category: 'Antibiotique', dci: 'Metronidazole', galenic_form: 'Comprime', dosage: '500mg' },
  'metronidazole': { category: 'Antibiotique', dci: 'Metronidazole', galenic_form: 'Comprime', dosage: '500mg' },
  'coartem': { category: 'Antipaludeen', dci: 'Artemether/Lumefantrine', galenic_form: 'Comprime', dosage: '20mg/120mg' },
  'quinine': { category: 'Antipaludeen', dci: 'Quinine', galenic_form: 'Comprime', dosage: '300mg' },
  'omeprazole': { category: 'Digestif', dci: 'Omeprazole', galenic_form: 'Gelule', dosage: '20mg' },
};

export default function ProductsPage() {
  const { activePharmacyId } = useAuth();
  const [products, setProducts] = useState([]);
  const [usdRate, setUsdRate] = useState(2800);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [togglingId, setTogglingId] = useState(null);

  const [dragPos, setDragPos] = useState({ x: 0, y: 0 });
  const dragState = useRef({ dragging: false, startX: 0, startY: 0, originX: 0, originY: 0 });

  const load = (silent = false) => {
    if (!activePharmacyId) return;
    if (!silent) setLoading(true);
    listProducts(activePharmacyId)
      .then(setProducts)
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

  const dciOptions = useMemo(() => {
    if (!form.category || !CATEGORY_DCI_MAP[form.category]) return ALL_DCI;
    return CATEGORY_DCI_MAP[form.category];
  }, [form.category]);

  const salePriceTtc = useMemo(() => {
    if (!form.sale_price) return null;
    return Number(form.sale_price) * VAT_MULTIPLIER;
  }, [form.sale_price]);

  const toUsd = (amount, currency) => {
    if (!amount) return null;
    if (currency === 'USD') return Number(amount);
    return Number(amount) / usdRate;
  };

  const handleSearch = async (e) => {
    const value = e.target.value;
    setQuery(value);
    if (!activePharmacyId) return;
    if (value.trim() === '') {
      load(true);
      return;
    }
    try {
      const results = await searchProducts(activePharmacyId, value);
      setProducts(results);
    } catch {
      // recherche silencieuse : aucune donnee affichee en cas d'erreur reseau ponctuelle
    }
  };

  const handleFormChange = (field) => (e) => {
    const value = e.target.value;
    if (field === 'category') {
      const newOptions = value && CATEGORY_DCI_MAP[value] ? CATEGORY_DCI_MAP[value] : ALL_DCI;
      setForm({ ...form, category: value, dci: newOptions.includes(form.dci) ? form.dci : '' });
      return;
    }
    setForm({ ...form, [field]: value });
  };

  const handleNameBlur = () => {
    if (editingId) return;
    const preset = PRODUCT_PRESETS[form.name.trim().toLowerCase()];
    if (!preset) return;
    setForm((f) => ({
      ...f,
      category: f.category || preset.category,
      dci: f.dci || preset.dci,
      galenic_form: f.galenic_form || preset.galenic_form,
      dosage: f.dosage || preset.dosage,
    }));
  };

  const openCreateModal = () => {
    setEditingId(null);
    setForm(emptyForm);
    setFormError('');
    setDragPos({ x: 0, y: 0 });
    setShowModal(true);
  };

  const openEditModal = (product) => {
    setEditingId(product.id);
    setForm({
      name: product.name || '',
      dci: product.dci || '',
      category: product.category || '',
      barcode: product.barcode || '',
      galenic_form: product.galenic_form || '',
      dosage: product.dosage || '',
      purchase_price: product.purchase_price ?? '',
      sale_price: product.sale_price ?? '',
      currency: product.currency || 'CDF',
    });
    setFormError('');
    setDragPos({ x: 0, y: 0 });
    setShowModal(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormError('');
    setSubmitting(true);
    try {
      const payload = {
        ...form,
        purchase_price: form.purchase_price ? Number(form.purchase_price) : undefined,
        sale_price: form.sale_price ? Number(form.sale_price) : undefined,
        vat_rate: FIXED_VAT_RATE,
      };
      if (editingId) {
        await updateProduct(activePharmacyId, editingId, payload);
      } else {
        await createProduct(activePharmacyId, payload);
      }
      setShowModal(false);
      setForm(emptyForm);
      setEditingId(null);
      load(true);
    } catch (err) {
      setFormError(err.response?.data?.message || "Erreur lors de l'enregistrement du produit.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleStatus = async (product) => {
    setTogglingId(product.id);
    const newStatus = product.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
    try {
      await updateProduct(activePharmacyId, product.id, { status: newStatus });
      load(true);
    } catch {
      // silencieux : la liste reste inchangee si l'appel echoue, pas de blocage de l'UI
    } finally {
      setTogglingId(null);
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
      dragging: true,
      startX: e.clientX,
      startY: e.clientY,
      originX: dragPos.x,
      originY: dragPos.y,
    };
    window.addEventListener('mousemove', handleDragMove);
    window.addEventListener('mouseup', handleDragEnd);
  };

  return (
    <div>
      <div className="module-header">
        <div className="module-title-block">
          <span className="tag mono">MOD-02</span>
          <h2>Referentiel Produits</h2>
        </div>
        <button className="module-primary-btn" onClick={openCreateModal}>
          + Nouveau produit
        </button>
      </div>

      <div className="search-bar">
        <input
          type="text"
          placeholder="Rechercher un produit..."
          value={query}
          onChange={handleSearch}
        />
      </div>

      <div className="data-table-wrap">
        {loading ? null : products.length === 0 ? (
          <div className="empty-state">Aucun produit trouve.</div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Nom</th>
                <th>DCI</th>
                <th>Categorie</th>
                <th>Code-barres</th>
                <th className="num">Prix vente HT</th>
                <th className="num">Prix vente TTC</th>
                <th className="num">TTC (USD)</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {products.map((p) => {
                const currency = p.currency || 'CDF';
                const ttc = p.sale_price ? Number(p.sale_price) * VAT_MULTIPLIER : null;
                const usdValue = toUsd(ttc, currency);
                const suspended = p.status && p.status !== 'ACTIVE';
                return (
                  <tr key={p.id} className={suspended ? 'row-suspended' : ''}>
                    <td>
                      {p.name}
                      {suspended && <span className="badge-suspended">Suspendu</span>}
                    </td>
                    <td>{p.dci || '—'}</td>
                    <td>{p.category || '—'}</td>
                    <td className="mono">{p.barcode || '—'}</td>
                    <td className="num">
                      {p.sale_price ? Number(p.sale_price).toLocaleString('fr-FR') : '—'}
                      {p.sale_price ? ` ${currency}` : ''}
                    </td>
                    <td className="num">
                      {ttc !== null ? ttc.toLocaleString('fr-FR', { maximumFractionDigits: 0 }) : '—'}
                      {ttc !== null ? ` ${currency}` : ''}
                    </td>
                    <td className="num mono">
                      {usdValue !== null ? `$${usdValue.toFixed(2)}` : '—'}
                    </td>
                    <td className="row-actions">
                      <button type="button" className="table-link-btn" onClick={() => openEditModal(p)}>
                        Editer
                      </button>
                      <button
                        type="button"
                        className={suspended ? 'table-link-btn accent' : 'table-link-btn warn'}
                        disabled={togglingId === p.id}
                        onClick={() => handleToggleStatus(p)}
                      >
                        {suspended ? 'Reactiver' : 'Suspendre'}
                      </button>
                      <button
                        type="button"
                        className="table-link-btn"
                        disabled={!p.barcode}
                        onClick={() => printBarcodeLabel(p)}
                      >
                        Etiquette
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div
            className="modal-panel"
            style={{ transform: `translate(${dragPos.x}px, ${dragPos.y}px)` }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-drag-handle" onMouseDown={handleDragStart}>
              <h3>{editingId ? 'Modifier le produit' : 'Nouveau produit'}</h3>
            </div>
            {formError && <div className="form-error">{formError}</div>}
            <form onSubmit={handleSubmit}>
              <div className="form-grid">
                <div className="form-field full">
                  <label>Nom</label>
                  <input
                    value={form.name}
                    onChange={handleFormChange('name')}
                    onBlur={handleNameBlur}
                    required
                  />
                </div>
                <div className="form-field">
                  <label>Categorie</label>
                  <select value={form.category} onChange={handleFormChange('category')}>
                    <option value="">—</option>
                    {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div className="form-field">
                  <label>DCI</label>
                  <select value={form.dci} onChange={handleFormChange('dci')}>
                    <option value="">—</option>
                    {dciOptions.map((d) => <option key={d} value={d}>{d}</option>)}
                  </select>
                </div>
                <div className="form-field">
                  <label>Forme galenique</label>
                  <select value={form.galenic_form} onChange={handleFormChange('galenic_form')}>
                    <option value="">—</option>
                    {GALENIC_FORMS.map((f) => <option key={f} value={f}>{f}</option>)}
                  </select>
                </div>
                <div className="form-field">
                  <label>Dosage</label>
                  <input value={form.dosage} onChange={handleFormChange('dosage')} placeholder="ex: 500mg" />
                </div>
                <div className="form-field">
                  <label>Code-barres (scanner l'emballage du fabricant)</label>
                  <input
                    value={form.barcode}
                    onChange={handleFormChange('barcode')}
                    placeholder="Scanner ou saisir le code-barres"
                  />
                </div>
                <div className="form-field">
                  <label>Prix d'achat</label>
                  <input type="number" value={form.purchase_price} onChange={handleFormChange('purchase_price')} />
                </div>
                <div className="form-field">
                  <label>Devise</label>
                  <select value={form.currency} onChange={handleFormChange('currency')}>
                    <option value="CDF">CDF (Franc Congolais)</option>
                    <option value="USD">USD (Dollar)</option>
                  </select>
                </div>
                <div className="form-field">
                  <label>Prix de vente (HT)</label>
                  <input type="number" value={form.sale_price} onChange={handleFormChange('sale_price')} />
                </div>
                <div className="form-field">
                  <label>Prix de vente + taxe (TTC)</label>
                  <div className="fixed-value">
                    {salePriceTtc !== null
                      ? `${salePriceTtc.toLocaleString('fr-FR', { maximumFractionDigits: 0 })} ${form.currency}`
                      : '—'}
                  </div>
                </div>
                <div className="form-field">
                  <label>TVA</label>
                  <div className="fixed-value">16% (fixe, RDC)</div>
                </div>
              </div>
              <div className="modal-actions">
                <button type="button" className="modal-cancel" onClick={() => setShowModal(false)}>Annuler</button>
                <button type="submit" className="module-primary-btn" disabled={submitting}>
                  {submitting ? 'Enregistrement...' : editingId ? 'Enregistrer les modifications' : 'Creer le produit'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}