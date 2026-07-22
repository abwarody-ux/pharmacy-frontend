import { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { listPatients } from '../../services/patients';
import { searchProducts } from '../../services/products';
import {
  listProformas, createProforma, updateProformaStatus,
  recordProformaConversion, getProformaConversionStats,
} from '../../services/proformas';

const PROFORMA_ROLES = ['PHARMACY_ADMIN', 'PHARMACY_TITULAIRE', 'PHARMACY_CAISSIER'];

const STATUS_LABELS = {
  ISSUED: 'Emise', PARTIALLY_CONVERTED: 'Partiellement convertie', CONVERTED: 'Convertie',
  ABANDONED: 'Abandonnee', EXPIRED: 'Expiree',
};

function StatusBadge({ status }) {
  const cls = {
    ISSUED: 'badge-status info', PARTIALLY_CONVERTED: 'badge-status warn', CONVERTED: 'badge-status ok',
    ABANDONED: 'badge-status danger', EXPIRED: 'badge-status danger',
  }[status] || 'badge-status';
  return <span className={cls}>{STATUS_LABELS[status] || status}</span>;
}

function formatDateTime(dateStr) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleString('fr-FR', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

const emptyLineForm = { product_id: '', product_name: '', quantity: '', unit_price: '' };

export default function ProformasPage() {
  const { activePharmacyId, user } = useAuth();
  const canManage = PROFORMA_ROLES.includes(user?.role);

  const [tab, setTab] = useState('proformas');
  const [proformas, setProformas] = useState([]);
  const [stats, setStats] = useState(null);
  const [patients, setPatients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [resultMessage, setResultMessage] = useState('');

  // Creation
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [patientQuery, setPatientQuery] = useState('');
  const [selectedPatient, setSelectedPatient] = useState(null);
  const [createLines, setCreateLines] = useState([]);
  const [showLineForm, setShowLineForm] = useState(false);
  const [lineForm, setLineForm] = useState(emptyLineForm);
  const [editingLineIndex, setEditingLineIndex] = useState(null);
  const [productSearchQuery, setProductSearchQuery] = useState('');
  const [productSearchResults, setProductSearchResults] = useState([]);
  const [createError, setCreateError] = useState('');
  const [submittingCreate, setSubmittingCreate] = useState(false);

  // Detail
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [activeProforma, setActiveProforma] = useState(null);
  const [conversionInputs, setConversionInputs] = useState({});
  const [detailError, setDetailError] = useState('');
  const [submittingLineId, setSubmittingLineId] = useState(null);
  const [submittingStatus, setSubmittingStatus] = useState(false);

  const load = (silent = false) => {
    if (!activePharmacyId) return;
    if (!silent) setLoading(true);
    Promise.all([listProformas(activePharmacyId), getProformaConversionStats(activePharmacyId)])
      .then(([list, statsData]) => { setProformas(list); setStats(statsData); })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    if (activePharmacyId) listPatients(activePharmacyId).then(setPatients).catch(() => {});
  }, [activePharmacyId]);

  const filteredPatients = patientQuery.trim()
    ? patients.filter((p) => p.full_name.toLowerCase().includes(patientQuery.trim().toLowerCase()))
    : [];

  // --- Creation ---

  const openCreateModal = () => {
    setSelectedPatient(null);
    setPatientQuery('');
    setCreateLines([]);
    setShowLineForm(false);
    setLineForm(emptyLineForm);
    setEditingLineIndex(null);
    setCreateError('');
    setShowCreateModal(true);
  };

  const openAddLine = () => {
    setEditingLineIndex(null);
    setLineForm(emptyLineForm);
    setProductSearchQuery('');
    setProductSearchResults([]);
    setShowLineForm(true);
  };

  const openEditLine = (index) => {
    setEditingLineIndex(index);
    setLineForm(createLines[index]);
    setProductSearchQuery(createLines[index].product_name);
    setProductSearchResults([]);
    setShowLineForm(true);
  };

  const handleProductSearch = async (e) => {
    const value = e.target.value;
    setProductSearchQuery(value);
    setLineForm({ ...lineForm, product_id: '', product_name: '' });
    if (!activePharmacyId || value.trim() === '') { setProductSearchResults([]); return; }
    try {
      const results = await searchProducts(activePharmacyId, value);
      setProductSearchResults(results);
    } catch {
      // recherche silencieuse
    }
  };

  const pickProduct = (product) => {
    let defaultPrice = product.sale_price ? Math.round(Number(product.sale_price)) : '';
    setLineForm({ ...lineForm, product_id: product.id, product_name: product.name, unit_price: lineForm.unit_price || String(defaultPrice) });
    setProductSearchQuery(product.name);
    setProductSearchResults([]);
  };

  const handleLineFieldChange = (field) => (e) => setLineForm({ ...lineForm, [field]: e.target.value });

  const handleLineSubmit = (e) => {
    e.preventDefault();
    if (!lineForm.product_id || !lineForm.quantity || lineForm.unit_price === '') return;
    const newLine = { ...lineForm, quantity: Number(lineForm.quantity), unit_price: Number(lineForm.unit_price) };
    if (editingLineIndex !== null) {
      const next = [...createLines];
      next[editingLineIndex] = newLine;
      setCreateLines(next);
    } else {
      setCreateLines([...createLines, newLine]);
    }
    setShowLineForm(false);
  };

  const removeLine = (index) => setCreateLines(createLines.filter((_, i) => i !== index));

  const createTotal = createLines.reduce((sum, l) => sum + l.quantity * l.unit_price, 0);

  const handleCreateSubmit = async () => {
    setCreateError('');
    if (createLines.length === 0) { setCreateError('Ajoutez au moins une ligne.'); return; }
    setSubmittingCreate(true);
    try {
      const result = await createProforma(activePharmacyId, {
        patient_id: selectedPatient?.id || undefined,
        lines: createLines.map((l) => ({ product_id: l.product_id, quantity: l.quantity, unit_price: l.unit_price })),
      });
      const unavailableCount = (result.lines || []).filter((l) => !l.was_available).length;
      setShowCreateModal(false);
      setResultMessage(
        'Proforma creee - Total : ' + Number(result.total_amount).toLocaleString('fr-FR') + ' CDF' +
        (unavailableCount > 0 ? ' (' + unavailableCount + ' produit(s) en rupture, substitut propose si disponible)' : '')
      );
      load(true);
    } catch (err) {
      setCreateError(err.response?.data?.message || 'Erreur lors de la creation de la proforma.');
    } finally {
      setSubmittingCreate(false);
    }
  };

  // --- Detail ---

  const openDetailModal = (proforma) => {
    setActiveProforma(proforma);
    setConversionInputs({});
    setDetailError('');
    setShowDetailModal(true);
  };

  const handleConversionInputChange = (lineId) => (e) => {
    setConversionInputs({ ...conversionInputs, [lineId]: e.target.value });
  };

  const submitConversion = async (line) => {
    const qty = Number(conversionInputs[line.id]);
    if (!qty || qty <= 0) { setDetailError('Quantite de conversion invalide.'); return; }
    setDetailError('');
    setSubmittingLineId(line.id);
    try {
      await recordProformaConversion(activePharmacyId, activeProforma.id, line.id, qty);
      setShowDetailModal(false);
      setResultMessage('Conversion enregistree.');
      load(true);
    } catch (err) {
      setDetailError(err.response?.data?.message || 'Erreur lors de la conversion.');
    } finally {
      setSubmittingLineId(null);
    }
  };

  const submitStatusChange = async (status) => {
    setDetailError('');
    setSubmittingStatus(true);
    try {
      await updateProformaStatus(activePharmacyId, activeProforma.id, status);
      setShowDetailModal(false);
      setResultMessage('Statut mis a jour.');
      load(true);
    } catch (err) {
      setDetailError(err.response?.data?.message || 'Erreur lors du changement de statut.');
    } finally {
      setSubmittingStatus(false);
    }
  };

  return (
    <div>
      <div className="module-header">
        <div className="module-title-block">
          <span className="tag mono">MOD-08</span>
          <h2>Proformas</h2>
        </div>
        {canManage && (
          <button className="module-primary-btn" onClick={openCreateModal}>+ Nouvelle proforma</button>
        )}
      </div>

      {resultMessage && <div className="info-banner">{resultMessage}</div>}

      <div className="tab-bar">
        <button className={tab === 'proformas' ? 'tab-btn active' : 'tab-btn'} onClick={() => setTab('proformas')}>Proformas</button>
        <button className={tab === 'stats' ? 'tab-btn active' : 'tab-btn'} onClick={() => setTab('stats')}>Statistiques</button>
      </div>

      {tab === 'proformas' && (
        <div className="data-table-wrap">
          {loading ? null : proformas.length === 0 ? (
            <div className="empty-state">Aucune proforma.</div>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Patient</th>
                  <th className="num">Total</th>
                  <th>Statut</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {proformas.map((p) => (
                  <tr key={p.id}>
                    <td>{formatDateTime(p.created_at)}</td>
                    <td>{p.patients?.full_name || '—'}</td>
                    <td className="num">{Number(p.total_amount).toLocaleString('fr-FR')} CDF</td>
                    <td><StatusBadge status={p.status} /></td>
                    <td className="row-actions">
                      <button type="button" className="table-link-btn accent" onClick={() => openDetailModal(p)}>Voir</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {tab === 'stats' && stats && (
        <div className="admin-grid">
          <div className="admin-card">
            <div className="admin-card-label">Total proformas</div>
            <div className="admin-card-value">{stats.total_proformas}</div>
          </div>
          <div className="admin-card">
            <div className="admin-card-label">Entierement converties</div>
            <div className="admin-card-value">{stats.fully_converted}</div>
          </div>
          <div className="admin-card">
            <div className="admin-card-label">Partiellement converties</div>
            <div className="admin-card-value">{stats.partially_converted}</div>
          </div>
          <div className="admin-card">
            <div className="admin-card-label">Taux de conversion (nombre)</div>
            <div className="admin-card-value">{stats.conversion_rate_by_count}%</div>
          </div>
          <div className="admin-card">
            <div className="admin-card-label">Taux de conversion (quantite)</div>
            <div className="admin-card-value">{stats.conversion_rate_by_quantity}%</div>
          </div>
        </div>
      )}

      {showCreateModal && (
        <div className="modal-overlay" onClick={() => setShowCreateModal(false)}>
          <div className="modal-panel" style={{ minWidth: '620px' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-drag-handle" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3>Nouvelle proforma</h3>
              <button type="button" className="table-link-btn accent" onClick={openAddLine}>+ Ligne</button>
            </div>

            {createError && <div className="form-error">{createError}</div>}

            <div className="form-field full" style={{ position: 'relative', marginBottom: '12px' }}>
              <label>Patient (optionnel)</label>
              <input
                type="text"
                value={selectedPatient ? selectedPatient.full_name : patientQuery}
                onChange={(e) => { setSelectedPatient(null); setPatientQuery(e.target.value); }}
                placeholder="Rechercher un patient..."
                autoComplete="off"
              />
              {filteredPatients.length > 0 && !selectedPatient && (
                <div style={{
                  position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 20,
                  background: 'var(--panel-bg, #1a1a1a)', border: '1px solid var(--border-color, #333)',
                  borderRadius: '6px', marginTop: '4px', maxHeight: '160px', overflowY: 'auto',
                }}>
                  {filteredPatients.map((p) => (
                    <div
                      key={p.id} onClick={() => { setSelectedPatient(p); setPatientQuery(''); }}
                      style={{ padding: '8px 12px', cursor: 'pointer', color: '#f0f0f0' }}
                      onMouseEnter={(e) => e.currentTarget.style.background = '#2a2a2a'}
                      onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                    >
                      {p.full_name}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="data-table-wrap">
              {createLines.length === 0 ? (
                <div className="empty-state">Aucune ligne. Cliquez sur "+ Ligne" pour commencer.</div>
              ) : (
                <table className="data-table">
                  <thead>
                    <tr><th>Produit</th><th className="num">Quantite</th><th className="num">Prix unitaire</th><th className="num">Total</th><th></th></tr>
                  </thead>
                  <tbody>
                    {createLines.map((l, index) => (
                      <tr key={index}>
                        <td>{l.product_name}</td>
                        <td className="num">{l.quantity}</td>
                        <td className="num">{Number(l.unit_price).toLocaleString('fr-FR')} CDF</td>
                        <td className="num">{(l.quantity * l.unit_price).toLocaleString('fr-FR')} CDF</td>
                        <td className="row-actions">
                          <button type="button" className="table-link-btn" onClick={() => openEditLine(index)}>Modifier</button>
                          <button type="button" className="table-link-btn warn" onClick={() => removeLine(index)}>Supprimer</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {showLineForm && (
              <form onSubmit={handleLineSubmit} style={{ marginTop: '16px', borderTop: '1px solid var(--border-color, #333)', paddingTop: '16px' }}>
                <div className="form-grid">
                  <div className="form-field full" style={{ position: 'relative' }}>
                    <label>Produit</label>
                    <input type="text" placeholder="Rechercher un produit..." value={productSearchQuery} onChange={handleProductSearch} autoComplete="off" required />
                    {productSearchResults.length > 0 && (
                      <div style={{
                        position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 20,
                        background: 'var(--panel-bg, #1a1a1a)', border: '1px solid var(--border-color, #333)',
                        borderRadius: '6px', marginTop: '4px', maxHeight: '180px', overflowY: 'auto',
                      }}>
                        {productSearchResults.map((p) => (
                          <div
                            key={p.id} onClick={() => pickProduct(p)}
                            style={{ padding: '8px 10px', cursor: 'pointer', color: '#f0f0f0' }}
                            onMouseEnter={(e) => e.currentTarget.style.background = '#2a2a2a'}
                            onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                          >
                            {p.name}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="form-field">
                    <label>Quantite</label>
                    <input type="number" min="1" value={lineForm.quantity} onChange={handleLineFieldChange('quantity')} required />
                  </div>
                  <div className="form-field">
                    <label>Prix unitaire</label>
                    <input type="number" min="0" value={lineForm.unit_price} onChange={handleLineFieldChange('unit_price')} required />
                  </div>
                </div>
                <div className="modal-actions">
                  <button type="button" className="modal-cancel" onClick={() => setShowLineForm(false)}>Annuler</button>
                  <button type="submit" className="module-primary-btn" disabled={!lineForm.product_id}>
                    {editingLineIndex !== null ? 'Enregistrer la ligne' : 'Ajouter la ligne'}
                  </button>
                </div>
              </form>
            )}

            {!showLineForm && (
              <div className="modal-actions" style={{ justifyContent: 'space-between', marginTop: '16px' }}>
                <span className="hint-text">Total : {createTotal.toLocaleString('fr-FR')} CDF</span>
                <div>
                  <button type="button" className="modal-cancel" onClick={() => setShowCreateModal(false)}>Annuler</button>
                  <button type="button" className="module-primary-btn" disabled={submittingCreate || createLines.length === 0} onClick={handleCreateSubmit}>
                    {submittingCreate ? 'Envoi...' : 'Creer la proforma'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {showDetailModal && activeProforma && (
        <div className="modal-overlay" onClick={() => setShowDetailModal(false)}>
          <div className="modal-panel" style={{ minWidth: '640px' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-drag-handle"><h3>Proforma - {formatDateTime(activeProforma.created_at)}</h3></div>
            <p className="modal-subtext">
              Patient : {activeProforma.patients?.full_name || '—'}<br />
              Statut : <StatusBadge status={activeProforma.status} /><br />
              Total : {Number(activeProforma.total_amount).toLocaleString('fr-FR')} CDF
            </p>
            {detailError && <div className="form-error">{detailError}</div>}

            <div className="data-table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Produit</th><th className="num">Qte demandee</th><th className="num">Converti</th>
                    <th>Disponible</th><th>Substitut</th><th></th>
                  </tr>
                </thead>
                <tbody>
                  {(activeProforma.proforma_lines || []).map((l) => {
                    const remaining = l.quantity - l.converted_quantity;
                    const canConvert = canManage && remaining > 0 && !['CONVERTED', 'ABANDONED', 'EXPIRED'].includes(activeProforma.status);
                    return (
                      <tr key={l.id}>
                        <td>{l.product?.name || l.product_id}</td>
                        <td className="num">{l.quantity}</td>
                        <td className="num">{l.converted_quantity} / {l.quantity}</td>
                        <td>{l.was_available ? <span className="badge-status ok">Oui</span> : <span className="badge-status danger">Non</span>}</td>
                        <td>{l.substitute?.name || '—'}</td>
                        <td className="row-actions">
                          {canConvert && (
                            <>
                              <input
                                type="number" min="1" max={remaining} placeholder={'max ' + remaining}
                                style={{ width: '70px', marginRight: '6px' }}
                                value={conversionInputs[l.id] || ''}
                                onChange={handleConversionInputChange(l.id)}
                              />
                              <button
                                type="button" className="table-link-btn accent"
                                disabled={submittingLineId === l.id}
                                onClick={() => submitConversion(l)}
                              >
                                Convertir
                              </button>
                            </>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="modal-actions">
              <button type="button" className="modal-cancel" onClick={() => setShowDetailModal(false)}>Fermer</button>
              {canManage && !['CONVERTED', 'ABANDONED', 'EXPIRED'].includes(activeProforma.status) && (
                <>
                  <button type="button" className="table-link-btn warn" disabled={submittingStatus} onClick={() => submitStatusChange('ABANDONED')}>
                    Marquer abandonnee
                  </button>
                  <button type="button" className="table-link-btn" disabled={submittingStatus} onClick={() => submitStatusChange('EXPIRED')}>
                    Marquer expiree
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}