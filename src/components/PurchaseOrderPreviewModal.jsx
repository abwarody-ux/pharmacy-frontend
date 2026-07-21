import { useEffect, useState } from 'react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { getRequestsByBatch } from '../services/purchases';
import { getActivePharmacy } from '../services/pharmacy';

const STATUS_LABELS = {
  PENDING: 'En attente', APPROVED: 'Approuvee', REJECTED: 'Rejetee',
};

function formatDate(dateStr) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('fr-FR', { year: 'numeric', month: 'long', day: 'numeric' });
}

// Bon de commande imprimable : numero derive du batch_id, total impose en CDF uniquement
// (regulateur RDC), chaque ligne garde son propre statut et approbateur puisque chaque
// demande du panier est validee independamment (voir purchases.service.ts)
export default function PurchaseOrderPreviewModal({ batchId, pharmacyId, onClose }) {
  const [lines, setLines] = useState([]);
  const [pharmacyName, setPharmacyName] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!batchId || !pharmacyId) return;
    setLoading(true);
    Promise.all([
      getRequestsByBatch(pharmacyId, batchId),
      getActivePharmacy(pharmacyId).catch(() => null),
    ])
      .then(([data, pharmacy]) => {
        setLines(data);
        if (pharmacy?.name) setPharmacyName(pharmacy.name);
      })
      .catch(() => setError("Impossible de charger le bon de commande."))
      .finally(() => setLoading(false));
  }, [batchId, pharmacyId]);

  const orderNumber = 'BC-' + (batchId || '').slice(0, 8).toUpperCase();
  const requesterName = lines[0]?.requester?.name || '—';
  const createdAt = lines[0]?.created_at;
  const totalCdf = lines.reduce((sum, l) => sum + Number(l.estimated_total || 0), 0);

  const buildRows = () => lines.map((l) => [
    l.products?.name || l.product_id,
    String(l.quantity),
    Number(l.estimated_unit_price).toLocaleString('fr-FR') + ' CDF',
    Number(l.estimated_total).toLocaleString('fr-FR') + ' CDF',
    STATUS_LABELS[l.status] || l.status,
    l.approver?.name || '—',
  ]);

  const handlePrint = () => {
    const rows = buildRows();
    const win = window.open('', '_blank', 'width=800,height=900');
    if (!win) return;
    win.document.write(`
      <html>
        <head>
          <title>${orderNumber}</title>
          <style>
            body { font-family: sans-serif; padding: 32px; color: #111; }
            h1 { font-size: 20px; margin-bottom: 4px; }
            .meta { margin-bottom: 24px; font-size: 14px; color: #444; }
            .meta div { margin-bottom: 2px; }
            table { width: 100%; border-collapse: collapse; margin-top: 16px; }
            th, td { border: 1px solid #ccc; padding: 8px 10px; font-size: 13px; text-align: left; }
            th { background: #f2f2f2; }
            .total-row td { font-weight: bold; }
          </style>
        </head>
        <body>
          <h1>Bon de commande ${orderNumber}</h1>
          <div class="meta">
            ${pharmacyName ? `<div>Pharmacie : ${pharmacyName}</div>` : ''}
            <div>Date : ${formatDate(createdAt)}</div>
            <div>Demandeur : ${requesterName}</div>
          </div>
          <table>
            <thead>
              <tr><th>Produit</th><th>Quantite</th><th>Prix unitaire</th><th>Total</th><th>Statut</th><th>Approuve par</th></tr>
            </thead>
            <tbody>
              ${rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join('')}</tr>`).join('')}
              <tr class="total-row"><td colspan="3">Total</td><td>${totalCdf.toLocaleString('fr-FR')} CDF</td><td></td><td></td></tr>
            </tbody>
          </table>
        </body>
      </html>
    `);
    win.document.close();
    win.focus();
    win.print();
  };

  const handleDownloadPdf = () => {
    const doc = new jsPDF();
    doc.setFontSize(16);
    doc.text('Bon de commande ' + orderNumber, 14, 18);
    doc.setFontSize(10);
    let y = 28;
    if (pharmacyName) { doc.text('Pharmacie : ' + pharmacyName, 14, y); y += 6; }
    doc.text('Date : ' + formatDate(createdAt), 14, y); y += 6;
    doc.text('Demandeur : ' + requesterName, 14, y); y += 4;

    autoTable(doc, {
      startY: y + 6,
      head: [['Produit', 'Quantite', 'Prix unitaire', 'Total', 'Statut', 'Approuve par']],
      body: buildRows(),
      foot: [['Total', '', '', totalCdf.toLocaleString('fr-FR') + ' CDF', '', '']],
      styles: { fontSize: 9 },
      headStyles: { fillColor: [40, 40, 40] },
    });

    doc.save(orderNumber + '.pdf');
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-panel" onClick={(e) => e.stopPropagation()}>
        <div className="modal-drag-handle">
          <h3>Bon de commande {orderNumber}</h3>
        </div>

        {loading ? (
          <div className="empty-state">Chargement...</div>
        ) : error ? (
          <div className="form-error">{error}</div>
        ) : (
          <>
            <p className="modal-subtext">
              {pharmacyName && <>Pharmacie : {pharmacyName}<br /></>}
              Date : {formatDate(createdAt)}<br />
              Demandeur : {requesterName}
            </p>
            <div className="data-table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Produit</th>
                    <th className="num">Quantite</th>
                    <th className="num">Prix unitaire</th>
                    <th className="num">Total</th>
                    <th>Statut</th>
                    <th>Approuve par</th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((l) => (
                    <tr key={l.id}>
                      <td>{l.products?.name || l.product_id}</td>
                      <td className="num">{l.quantity}</td>
                      <td className="num">{Number(l.estimated_unit_price).toLocaleString('fr-FR')} CDF</td>
                      <td className="num">{Number(l.estimated_total).toLocaleString('fr-FR')} CDF</td>
                      <td>{STATUS_LABELS[l.status] || l.status}</td>
                      <td>{l.approver?.name || '—'}</td>
                    </tr>
                  ))}
                  <tr>
                    <td colSpan={3} style={{ fontWeight: 'bold' }}>Total</td>
                    <td className="num" style={{ fontWeight: 'bold' }}>{totalCdf.toLocaleString('fr-FR')} CDF</td>
                    <td></td>
                    <td></td>
                  </tr>
                </tbody>
              </table>
            </div>
          </>
        )}

        <div className="modal-actions">
          <button type="button" className="modal-cancel" onClick={onClose}>Fermer</button>
          <button type="button" className="table-link-btn accent" disabled={loading || !!error} onClick={handlePrint}>
            Imprimer
          </button>
          <button type="button" className="module-primary-btn" disabled={loading || !!error} onClick={handleDownloadPdf}>
            Telecharger en PDF
          </button>
        </div>
      </div>
    </div>
  );
}