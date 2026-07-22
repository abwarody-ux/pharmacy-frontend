import { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { listPatients } from '../../services/patients';
import {
  createPrescription, getPrescriptionsByPatient, validatePrescription,
  uploadPrescriptionImage, getPrescriptionImageUrl,
} from '../../services/prescriptions';
import { searchProducts } from '../../services/products';

const PRESCRIPTION_ROLES = ['PHARMACY_ADMIN', 'PHARMACY_TITULAIRE'];

const STATUS_LABELS = {
  PENDING_VALIDATION: 'En attente de validation', VALIDATED: 'Validee', REJECTED: 'Rejetee',
};

function StatusBadge({ status }) {
  const cls = {
    PENDING_VALIDATION: 'badge-status warn', VALIDATED: 'badge-status ok', REJECTED: 'badge-status danger',
  }[status] || 'badge-status';
  return <span className={cls}>{STATUS_LABELS[status] || status}</span>;
}

function formatDateTime(dateStr) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleString('fr-FR', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

// Redimensionne et recompresse une image cote navigateur avant envoi, pour rester sous
// la limite du bucket (2 Mo) meme avec une photo brute de telephone. Les PDF ne sont pas
// recompresses (juste verifies), l'API Canvas ne s'applique qu'aux images.
const MAX_UPLOAD_BYTES = 2 * 1024 * 1024;
function compressImage(file, maxDimension = 1600, startQuality = 0.8) {
  return new Promise((resolve, reject) => {
    if (file.type === 'application/pdf') {
      if (file.size > MAX_UPLOAD_BYTES) reject(new Error('Le PDF depasse 2 Mo.'));
      else resolve(file);
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (width > maxDimension || height > maxDimension) {
          if (width > height) { height = Math.round(height * (maxDimension / width)); width = maxDimension; }
          else { width = Math.round(width * (maxDimension / height)); height = maxDimension; }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        canvas.getContext('2d').drawImage(img, 0, 0, width, height);

        const tryQuality = (q) => {
          canvas.toBlob((blob) => {
            if (!blob) { reject(new Error('Compression echouee.')); return; }
            if (blob.size > MAX_UPLOAD_BYTES && q > 0.3) {
              tryQuality(q - 0.15);
            } else {
              resolve(new File([blob], file.name.replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg' }));
            }
          }, 'image/jpeg', q);
        };
        tryQuality(startQuality);
      };
      img.onerror = () => reject(new Error("Impossible de lire l'image."));
      img.src = e.target.result;
    };
    reader.onerror = () => reject(new Error('Lecture du fichier echouee.'));
    reader.readAsDataURL(file);
  });
}

const emptyLineForm = { product_id: '', product_name: '', dci_text: '', dosage: '', posology: '', duration: '', quantity: '' };

export default function PrescriptionsPage() {
  const { activePharmacyId, user } = useAuth();
  const canManage = PRESCRIPTION_ROLES.includes(user?.role);

  const [patients, setPatients] = useState([]);
  const [patientQuery, setPatientQuery] = useState('');
  const [selectedPatient, setSelectedPatient] = useState(null);
  const [prescriptions, setPrescriptions] = useState([]);
  const [loadingPrescriptions, setLoadingPrescriptions] = useState(false);
  const [resultMessage, setResultMessage] = useState('');

  // Creation
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createLines, setCreateLines] = useState([]);
  const [imagePath, setImagePath] = useState('');
  const [imagePreviewName, setImagePreviewName] = useState('');
  const [uploadingImage, setUploadingImage] = useState(false);
  const [imageError, setImageError] = useState('');
  const [ocrText, setOcrText] = useState('');
  const [showLineForm, setShowLineForm] = useState(false);
  const [lineForm, setLineForm] = useState(emptyLineForm);
  const [editingLineIndex, setEditingLineIndex] = useState(null);
  const [productSearchQuery, setProductSearchQuery] = useState('');
  const [productSearchResults, setProductSearchResults] = useState([]);
  const [createError, setCreateError] = useState('');
  const [submittingCreate, setSubmittingCreate] = useState(false);

  // Detail / validation
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [activePrescription, setActivePrescription] = useState(null);
  const [detailLines, setDetailLines] = useState([]);
  const [detailError, setDetailError] = useState('');
  const [submittingValidation, setSubmittingValidation] = useState(false);
  const [loadingImageUrl, setLoadingImageUrl] = useState(false);

  useEffect(() => {
    if (!activePharmacyId) return;
    listPatients(activePharmacyId).then(setPatients).catch(() => {});
  }, [activePharmacyId]);

  const filteredPatients = patientQuery.trim()
    ? patients.filter((p) => p.full_name.toLowerCase().includes(patientQuery.trim().toLowerCase()))
    : [];

  const selectPatient = (patient) => {
    setSelectedPatient(patient);
    setPatientQuery('');
    loadPrescriptions(patient.id);
  };

  const loadPrescriptions = (patientId) => {
    setLoadingPrescriptions(true);
    getPrescriptionsByPatient(activePharmacyId, patientId)
      .then(setPrescriptions)
      .catch(() => {})
      .finally(() => setLoadingPrescriptions(false));
  };

  // --- Creation ---

  const openCreateModal = () => {
    setCreateLines([]);
    setImagePath('');
    setImagePreviewName('');
    setImageError('');
    setOcrText('');
    setShowLineForm(false);
    setLineForm(emptyLineForm);
    setEditingLineIndex(null);
    setCreateError('');
    setShowCreateModal(true);
  };

  const handleImageSelect = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImageError('');
    setImagePath('');
    setUploadingImage(true);
    try {
      const compressed = await compressImage(file);
      const result = await uploadPrescriptionImage(activePharmacyId, compressed);
      setImagePath(result.path);
      setImagePreviewName(file.name);
    } catch (err) {
      setImageError(err.response?.data?.message || err.message || "Erreur lors de l'envoi de l'image.");
    } finally {
      setUploadingImage(false);
    }
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
    setProductSearchQuery(createLines[index].product_name || '');
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
    setLineForm({ ...lineForm, product_id: product.id, product_name: product.name, dci_text: lineForm.dci_text || product.dci || product.name });
    setProductSearchQuery(product.name);
    setProductSearchResults([]);
  };

  const handleLineFieldChange = (field) => (e) => setLineForm({ ...lineForm, [field]: e.target.value });

  const handleLineSubmit = (e) => {
    e.preventDefault();
    if (!lineForm.dci_text.trim() || !lineForm.quantity) return;
    const newLine = { ...lineForm, quantity: Number(lineForm.quantity) };
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

  const handleCreateSubmit = async () => {
    setCreateError('');
    if (createLines.length === 0) { setCreateError('Ajoutez au moins une ligne.'); return; }
    setSubmittingCreate(true);
    try {
      await createPrescription(activePharmacyId, {
        patient_id: selectedPatient.id,
        image_url: imagePath || undefined,
        ocr_raw_text: ocrText.trim() || undefined,
        lines: createLines.map((l) => ({
          product_id: l.product_id || undefined,
          dci_text: l.dci_text.trim(),
          dosage: l.dosage.trim() || undefined,
          posology: l.posology.trim() || undefined,
          duration: l.duration.trim() || undefined,
          quantity: l.quantity,
        })),
      });
      setShowCreateModal(false);
      setResultMessage('Ordonnance creee, en attente de validation.');
      loadPrescriptions(selectedPatient.id);
    } catch (err) {
      setCreateError(err.response?.data?.message || "Erreur lors de la creation de l'ordonnance.");
    } finally {
      setSubmittingCreate(false);
    }
  };

  // --- Detail / validation ---

  const openDetailModal = (prescription) => {
    setActivePrescription(prescription);
    setDetailLines((prescription.prescription_lines || []).map((l) => ({ ...l })));
    setDetailError('');
    setShowDetailModal(true);
  };

  const handleViewImage = async () => {
    setLoadingImageUrl(true);
    setDetailError('');
    try {
      const result = await getPrescriptionImageUrl(activePharmacyId, activePrescription.id);
      if (result.signed_url) {
        window.open(result.signed_url, '_blank');
      } else {
        setDetailError('Aucune image associee a cette ordonnance.');
      }
    } catch (err) {
      setDetailError(err.response?.data?.message || "Erreur lors de l'ouverture de l'image.");
    } finally {
      setLoadingImageUrl(false);
    }
  };

  const updateDetailLine = (index, field) => (e) => {
    const value = e.target.value;
    setDetailLines((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
  };

  const submitValidation = async (approve) => {
    setDetailError('');
    setSubmittingValidation(true);
    try {
      const editable = activePrescription.status === 'PENDING_VALIDATION' && canManage;
      await validatePrescription(activePharmacyId, activePrescription.id, {
        approve,
        corrected_lines: editable ? detailLines.map((l) => ({
          id: l.id,
          product_id: l.product_id || null,
          dci_text: l.dci_text,
          dosage: l.dosage,
          posology: l.posology,
          duration: l.duration,
          quantity: Number(l.quantity),
        })) : undefined,
      });
      setShowDetailModal(false);
      setResultMessage(approve ? 'Ordonnance validee.' : 'Ordonnance rejetee.');
      loadPrescriptions(selectedPatient.id);
    } catch (err) {
      setDetailError(err.response?.data?.message || 'Erreur lors de la validation.');
    } finally {
      setSubmittingValidation(false);
    }
  };

  return (
    <div>
      <div className="module-header">
        <div className="module-title-block">
          <span className="tag mono">MOD-07</span>
          <h2>Ordonnances</h2>
        </div>
      </div>

      {resultMessage && <div className="info-banner">{resultMessage}</div>}

      <div className="form-field full" style={{ position: 'relative', marginBottom: '20px' }}>
        <label>Rechercher un patient</label>
        <input
          type="text"
          value={selectedPatient ? selectedPatient.full_name : patientQuery}
          onChange={(e) => { setSelectedPatient(null); setPatientQuery(e.target.value); setPrescriptions([]); }}
          placeholder="Tapez le nom du patient..."
          autoComplete="off"
        />
        {filteredPatients.length > 0 && !selectedPatient && (
          <div style={{
            position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 20,
            background: 'var(--panel-bg, #1a1a1a)', border: '1px solid var(--border-color, #333)',
            borderRadius: '6px', marginTop: '4px', maxHeight: '220px', overflowY: 'auto',
          }}>
            {filteredPatients.map((p) => (
              <div
                key={p.id} onClick={() => selectPatient(p)}
                style={{ padding: '8px 12px', cursor: 'pointer', color: '#f0f0f0' }}
                onMouseEnter={(e) => e.currentTarget.style.background = '#2a2a2a'}
                onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
              >
                {p.full_name} {p.phone ? '- ' + p.phone : ''}
              </div>
            ))}
          </div>
        )}
      </div>

      {selectedPatient && (
        <div>
          <div className="module-header">
            <h3 style={{ fontSize: '15px' }}>Ordonnances de {selectedPatient.full_name}</h3>
            {canManage && (
              <button className="module-primary-btn" onClick={openCreateModal}>+ Nouvelle ordonnance</button>
            )}
          </div>

          <div className="data-table-wrap">
            {loadingPrescriptions ? null : prescriptions.length === 0 ? (
              <div className="empty-state">Aucune ordonnance pour ce patient.</div>
            ) : (
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Statut</th>
                    <th>Substance controlee</th>
                    <th className="num">Lignes</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {prescriptions.map((p) => (
                    <tr key={p.id}>
                      <td>{formatDateTime(p.created_at)}</td>
                      <td><StatusBadge status={p.status} /></td>
                      <td>{p.is_controlled_substance ? <span className="badge-status warn">Oui</span> : 'Non'}</td>
                      <td className="num">{(p.prescription_lines || []).length}</td>
                      <td className="row-actions">
                        <button type="button" className="table-link-btn accent" onClick={() => openDetailModal(p)}>
                          {p.status === 'PENDING_VALIDATION' && canManage ? 'Examiner' : 'Voir'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {showCreateModal && (
        <div className="modal-overlay" onClick={() => setShowCreateModal(false)}>
          <div className="modal-panel" style={{ minWidth: '620px' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-drag-handle" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3>Nouvelle ordonnance - {selectedPatient?.full_name}</h3>
              <button type="button" className="table-link-btn accent" onClick={openAddLine}>+ Ligne</button>
            </div>

            {createError && <div className="form-error">{createError}</div>}

            <div className="data-table-wrap">
              {createLines.length === 0 ? (
                <div className="empty-state">Aucune ligne. Cliquez sur "+ Ligne" pour commencer.</div>
              ) : (
                <table className="data-table">
                  <thead>
                    <tr><th>DCI</th><th>Produit</th><th>Posologie</th><th className="num">Quantite</th><th></th></tr>
                  </thead>
                  <tbody>
                    {createLines.map((l, index) => (
                      <tr key={index}>
                        <td>{l.dci_text}{l.dosage ? ' (' + l.dosage + ')' : ''}</td>
                        <td>{l.product_name || '—'}</td>
                        <td>{l.posology || '—'}{l.duration ? ' - ' + l.duration : ''}</td>
                        <td className="num">{l.quantity}</td>
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
                    <label>Produit (optionnel)</label>
                    <input
                      type="text" placeholder="Rechercher un produit..."
                      value={productSearchQuery} onChange={handleProductSearch} autoComplete="off"
                    />
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
                  <div className="form-field full">
                    <label>DCI</label>
                    <input value={lineForm.dci_text} onChange={handleLineFieldChange('dci_text')} required />
                  </div>
                  <div className="form-field">
                    <label>Dosage</label>
                    <input value={lineForm.dosage} onChange={handleLineFieldChange('dosage')} placeholder="ex: 500mg" />
                  </div>
                  <div className="form-field">
                    <label>Quantite</label>
                    <input type="number" min="1" value={lineForm.quantity} onChange={handleLineFieldChange('quantity')} required />
                  </div>
                  <div className="form-field">
                    <label>Posologie</label>
                    <input value={lineForm.posology} onChange={handleLineFieldChange('posology')} placeholder="ex: 1 comprime x3/jour" />
                  </div>
                  <div className="form-field">
                    <label>Duree</label>
                    <input value={lineForm.duration} onChange={handleLineFieldChange('duration')} placeholder="ex: 7 jours" />
                  </div>
                </div>
                <div className="modal-actions">
                  <button type="button" className="modal-cancel" onClick={() => setShowLineForm(false)}>Annuler</button>
                  <button type="submit" className="module-primary-btn">
                    {editingLineIndex !== null ? 'Enregistrer la ligne' : 'Ajouter la ligne'}
                  </button>
                </div>
              </form>
            )}

            {!showLineForm && (
              <>
                <div className="form-grid" style={{ marginTop: '16px' }}>
                  <div className="form-field full">
                    <label>Photo/scan de l'ordonnance (optionnel - image ou PDF, max 2 Mo)</label>
                    <input type="file" accept="image/*,application/pdf" onChange={handleImageSelect} disabled={uploadingImage} />
                    {uploadingImage && <span className="hint-text">Compression et envoi en cours...</span>}
                    {imageError && <div className="form-error">{imageError}</div>}
                    {imagePath && !uploadingImage && <span className="hint-text">Fichier envoye : {imagePreviewName}</span>}
                  </div>
                  <div className="form-field full">
                    <label>Texte brut (optionnel)</label>
                    <input value={ocrText} onChange={(e) => setOcrText(e.target.value)} placeholder="notes ou texte OCR" />
                  </div>
                </div>
                <div className="modal-actions">
                  <button type="button" className="modal-cancel" onClick={() => setShowCreateModal(false)}>Annuler</button>
                  <button type="button" className="module-primary-btn" disabled={submittingCreate || uploadingImage} onClick={handleCreateSubmit}>
                    {submittingCreate ? 'Envoi...' : 'Creer l\'ordonnance'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {showDetailModal && activePrescription && (
        <div className="modal-overlay" onClick={() => setShowDetailModal(false)}>
          <div className="modal-panel" style={{ minWidth: '620px' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-drag-handle"><h3>Ordonnance - {formatDateTime(activePrescription.created_at)}</h3></div>
            <p className="modal-subtext">
              Statut : <StatusBadge status={activePrescription.status} /><br />
              Substance controlee : {activePrescription.is_controlled_substance ? 'Oui' : 'Non'}
            </p>
            {activePrescription.image_url && (
              <button type="button" className="table-link-btn accent" disabled={loadingImageUrl} onClick={handleViewImage} style={{ marginBottom: '12px' }}>
                {loadingImageUrl ? 'Ouverture...' : "Voir la photo/scan de l'ordonnance"}
              </button>
            )}
            {detailError && <div className="form-error">{detailError}</div>}

            {(() => {
              const editable = activePrescription.status === 'PENDING_VALIDATION' && canManage;
              return (
                <div className="data-table-wrap">
                  <table className="data-table">
                    <thead>
                      <tr><th>DCI</th><th>Dosage</th><th>Posologie</th><th>Duree</th><th className="num">Quantite</th></tr>
                    </thead>
                    <tbody>
                      {detailLines.map((l, index) => (
                        <tr key={l.id || index}>
                          {editable ? (
                            <>
                              <td><input value={l.dci_text || ''} onChange={updateDetailLine(index, 'dci_text')} style={{ width: '120px' }} /></td>
                              <td><input value={l.dosage || ''} onChange={updateDetailLine(index, 'dosage')} style={{ width: '80px' }} /></td>
                              <td><input value={l.posology || ''} onChange={updateDetailLine(index, 'posology')} style={{ width: '120px' }} /></td>
                              <td><input value={l.duration || ''} onChange={updateDetailLine(index, 'duration')} style={{ width: '80px' }} /></td>
                              <td><input type="number" min="1" value={l.quantity || ''} onChange={updateDetailLine(index, 'quantity')} style={{ width: '60px' }} /></td>
                            </>
                          ) : (
                            <>
                              <td>{l.dci_text}</td>
                              <td>{l.dosage || '—'}</td>
                              <td>{l.posology || '—'}</td>
                              <td>{l.duration || '—'}</td>
                              <td className="num">{l.quantity}</td>
                            </>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              );
            })()}

            <div className="modal-actions">
              <button type="button" className="modal-cancel" onClick={() => setShowDetailModal(false)}>Fermer</button>
              {activePrescription.status === 'PENDING_VALIDATION' && canManage && (
                <>
                  <button type="button" className="table-link-btn warn" disabled={submittingValidation} onClick={() => submitValidation(false)}>
                    Rejeter
                  </button>
                  <button type="button" className="module-primary-btn" disabled={submittingValidation} onClick={() => submitValidation(true)}>
                    {submittingValidation ? 'Envoi...' : 'Valider'}
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