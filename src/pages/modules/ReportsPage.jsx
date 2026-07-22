import { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import {
  getSalesByProduct, getSalesByPaymentMethod, getStockValuation, getDormantProducts,
  getExpiringAmm, getControlledSubstanceSales, exportReport, getExportHistory,
} from '../../services/reports';

const REPORT_ROLES = ['PHARMACY_ADMIN', 'PHARMACY_TITULAIRE', 'PHARMACY_AUDITEUR'];

const PAYMENT_LABELS = { CASH: 'Especes', MOBILE_MONEY: 'Mobile Money', CARD: 'Carte' };

function formatDate(dateStr) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('fr-FR', { year: 'numeric', month: 'long', day: 'numeric' });
}
function formatDateTime(dateStr) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleString('fr-FR', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function downloadCsv(filename, headers, rows) {
  const csvContent = [headers.join(','), ...rows.map((r) => r.map((cell) => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(','))].join('\n');
  const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

const firstOfMonthISO = () => {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
};
const todayISO = () => new Date().toISOString().slice(0, 10);

export default function ReportsPage() {
  const { activePharmacyId, user } = useAuth();
  const canAccess = REPORT_ROLES.includes(user?.role);

  const [tab, setTab] = useState('sales-product');
  const [dateStart, setDateStart] = useState(firstOfMonthISO());
  const [dateEnd, setDateEnd] = useState(todayISO());
  const [dormantDays, setDormantDays] = useState(60);

  const [salesByProduct, setSalesByProduct] = useState(null);
  const [salesByPayment, setSalesByPayment] = useState(null);
  const [stockValuation, setStockValuation] = useState(null);
  const [dormantProducts, setDormantProducts] = useState(null);
  const [controlledSales, setControlledSales] = useState(null);
  const [ammNote, setAmmNote] = useState(null);
  const [exportHistory, setExportHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [resultMessage, setResultMessage] = useState('');

  useEffect(() => {
    if (!activePharmacyId || !canAccess) return;
    if (tab === 'stock-valuation' && stockValuation === null) loadStockValuation();
    if (tab === 'dormant' && dormantProducts === null) loadDormant();
    if (tab === 'amm' && ammNote === null) loadAmm();
    if (tab === 'export-history') loadExportHistory();
  }, [tab, activePharmacyId]);

  const periodStartISO = () => new Date(dateStart).toISOString();
  const periodEndISO = () => new Date(dateEnd + 'T23:59:59').toISOString();

  const loadSalesByProduct = () => {
    setLoading(true);
    getSalesByProduct(activePharmacyId, periodStartISO(), periodEndISO())
      .then(setSalesByProduct).catch(() => {}).finally(() => setLoading(false));
  };
  const loadSalesByPayment = () => {
    setLoading(true);
    getSalesByPaymentMethod(activePharmacyId, periodStartISO(), periodEndISO())
      .then(setSalesByPayment).catch(() => {}).finally(() => setLoading(false));
  };
  const loadStockValuation = () => {
    setLoading(true);
    getStockValuation(activePharmacyId).then(setStockValuation).catch(() => {}).finally(() => setLoading(false));
  };
  const loadDormant = () => {
    setLoading(true);
    getDormantProducts(activePharmacyId, dormantDays).then(setDormantProducts).catch(() => {}).finally(() => setLoading(false));
  };
  const loadAmm = () => {
    setLoading(true);
    getExpiringAmm(activePharmacyId).then(setAmmNote).catch(() => {}).finally(() => setLoading(false));
  };
  const loadControlledSales = () => {
    setLoading(true);
    getControlledSubstanceSales(activePharmacyId, periodStartISO(), periodEndISO())
      .then(setControlledSales).catch(() => {}).finally(() => setLoading(false));
  };
  const loadExportHistory = () => {
    getExportHistory(activePharmacyId).then(setExportHistory).catch(() => {});
  };

  const logExport = async (reportName, withPeriod) => {
    try {
      await exportReport(activePharmacyId, reportName, withPeriod ? dateStart : undefined, withPeriod ? dateEnd : undefined);
      setResultMessage('Export enregistre dans le journal.');
      if (tab === 'export-history') loadExportHistory();
    } catch {
      // ne bloque pas le telechargement si la journalisation echoue
    }
  };

  const exportSalesByProduct = () => {
    downloadCsv('ventes_par_produit.csv', ['Produit', 'Quantite', 'Chiffre affaires (CDF)'],
      (salesByProduct || []).map((r) => [r.product_name, r.quantity, r.revenue]));
    logExport('sales_by_product', true);
  };
  const exportSalesByPayment = () => {
    downloadCsv('ventes_par_methode.csv', ['Methode', 'Montant (CDF)'],
      Object.entries(salesByPayment || {}).map(([method, amount]) => [PAYMENT_LABELS[method] || method, amount]));
    logExport('sales_by_payment_method', true);
  };
  const exportStockValuation = () => {
    downloadCsv('valorisation_stock.csv', ['Produit', 'Quantite restante', 'Cout unitaire', 'Valeur totale'],
      (stockValuation || []).map((r) => [r.product_name, r.quantity_remaining, r.unit_cost, r.total_value]));
    logExport('stock_valuation', false);
  };
  const exportDormant = () => {
    downloadCsv('produits_dormants.csv', ['Produit'], (dormantProducts || []).map((p) => [p.name]));
    logExport('dormant_products', false);
  };
  const exportControlledSales = () => {
    downloadCsv('ventes_substances_controlees.csv', ['Date', 'Total (CDF)', 'Patient', 'Ordonnance'],
      (controlledSales || []).map((s) => [formatDateTime(s.created_at), s.total_amount, s.patient_id || '—', s.prescription_id || '—']));
    logExport('controlled_substance_sales', true);
  };

  if (!canAccess) {
    return (
      <div>
        <div className="module-header">
          <div className="module-title-block">
            <span className="tag mono">MOD-11</span>
            <h2>Rapports</h2>
          </div>
        </div>
        <div className="empty-state">Acces reserve a l'Admin, au Titulaire et a l'Auditeur.</div>
      </div>
    );
  }

  const totalRevenue = (salesByProduct || []).reduce((sum, r) => sum + r.revenue, 0);
  const totalStockValue = (stockValuation || []).reduce((sum, r) => sum + r.total_value, 0);

  return (
    <div>
      <div className="module-header">
        <div className="module-title-block">
          <span className="tag mono">MOD-11</span>
          <h2>Rapports</h2>
        </div>
      </div>

      {resultMessage && <div className="info-banner">{resultMessage}</div>}

      <div className="tab-bar">
        <button className={tab === 'sales-product' ? 'tab-btn active' : 'tab-btn'} onClick={() => setTab('sales-product')}>Ventes par produit</button>
        <button className={tab === 'sales-payment' ? 'tab-btn active' : 'tab-btn'} onClick={() => setTab('sales-payment')}>Ventes par methode</button>
        <button className={tab === 'stock-valuation' ? 'tab-btn active' : 'tab-btn'} onClick={() => setTab('stock-valuation')}>Valorisation stock</button>
        <button className={tab === 'dormant' ? 'tab-btn active' : 'tab-btn'} onClick={() => setTab('dormant')}>Produits dormants</button>
        <button className={tab === 'controlled' ? 'tab-btn active' : 'tab-btn'} onClick={() => setTab('controlled')}>Substances controlees</button>
        <button className={tab === 'amm' ? 'tab-btn active' : 'tab-btn'} onClick={() => setTab('amm')}>Conformite AMM</button>
        <button className={tab === 'export-history' ? 'tab-btn active' : 'tab-btn'} onClick={() => setTab('export-history')}>Historique exports</button>
      </div>

      {['sales-product', 'sales-payment', 'controlled'].includes(tab) && (
        <div className="form-grid" style={{ marginBottom: '16px', maxWidth: '460px' }}>
          <div className="form-field">
            <label>Du</label>
            <input type="date" value={dateStart} onChange={(e) => setDateStart(e.target.value)} />
          </div>
          <div className="form-field">
            <label>Au</label>
            <input type="date" value={dateEnd} onChange={(e) => setDateEnd(e.target.value)} />
          </div>
        </div>
      )}

      {tab === 'sales-product' && (
        <div>
          <div className="module-header">
            <button className="table-link-btn accent" onClick={loadSalesByProduct}>Charger</button>
            {salesByProduct && salesByProduct.length > 0 && (
              <button className="module-primary-btn" onClick={exportSalesByProduct}>Exporter (CSV)</button>
            )}
          </div>
          {salesByProduct && (
            <div className="data-table-wrap">
              {salesByProduct.length === 0 ? (
                <div className="empty-state">Aucune vente sur cette periode.</div>
              ) : (
                <table className="data-table">
                  <thead><tr><th>Produit</th><th className="num">Quantite</th><th className="num">Chiffre d'affaires</th></tr></thead>
                  <tbody>
                    {salesByProduct.map((r) => (
                      <tr key={r.product_id}>
                        <td>{r.product_name}</td>
                        <td className="num">{r.quantity}</td>
                        <td className="num">{Number(r.revenue).toLocaleString('fr-FR')} CDF</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr><td style={{ fontWeight: 'bold' }}>Total</td><td></td><td className="num" style={{ fontWeight: 'bold' }}>{totalRevenue.toLocaleString('fr-FR')} CDF</td></tr>
                  </tfoot>
                </table>
              )}
            </div>
          )}
        </div>
      )}

      {tab === 'sales-payment' && (
        <div>
          <div className="module-header">
            <button className="table-link-btn accent" onClick={loadSalesByPayment}>Charger</button>
            {salesByPayment && Object.keys(salesByPayment).length > 0 && (
              <button className="module-primary-btn" onClick={exportSalesByPayment}>Exporter (CSV)</button>
            )}
          </div>
          {salesByPayment && (
            <div className="data-table-wrap">
              {Object.keys(salesByPayment).length === 0 ? (
                <div className="empty-state">Aucun paiement sur cette periode.</div>
              ) : (
                <table className="data-table">
                  <thead><tr><th>Methode</th><th className="num">Montant</th></tr></thead>
                  <tbody>
                    {Object.entries(salesByPayment).map(([method, amount]) => (
                      <tr key={method}>
                        <td>{PAYMENT_LABELS[method] || method}</td>
                        <td className="num">{Number(amount).toLocaleString('fr-FR')} CDF</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </div>
      )}

      {tab === 'stock-valuation' && (
        <div>
          <div className="module-header">
            <button className="table-link-btn accent" onClick={loadStockValuation}>Actualiser</button>
            {stockValuation && stockValuation.length > 0 && (
              <button className="module-primary-btn" onClick={exportStockValuation}>Exporter (CSV)</button>
            )}
          </div>
          <div className="data-table-wrap">
            {loading && !stockValuation ? null : !stockValuation || stockValuation.length === 0 ? (
              <div className="empty-state">Aucun stock valorise.</div>
            ) : (
              <table className="data-table">
                <thead><tr><th>Produit</th><th className="num">Quantite</th><th className="num">Cout unitaire</th><th className="num">Valeur totale</th></tr></thead>
                <tbody>
                  {stockValuation.map((r, i) => (
                    <tr key={i}>
                      <td>{r.product_name}</td>
                      <td className="num">{r.quantity_remaining}</td>
                      <td className="num">{Number(r.unit_cost).toLocaleString('fr-FR')} CDF</td>
                      <td className="num">{Number(r.total_value).toLocaleString('fr-FR')} CDF</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr><td style={{ fontWeight: 'bold' }}>Total</td><td></td><td></td><td className="num" style={{ fontWeight: 'bold' }}>{totalStockValue.toLocaleString('fr-FR')} CDF</td></tr>
                </tfoot>
              </table>
            )}
          </div>
        </div>
      )}

      {tab === 'dormant' && (
        <div>
          <div className="module-header">
            <div className="form-field" style={{ maxWidth: '200px' }}>
              <label>Jours sans vente</label>
              <input type="number" min="1" value={dormantDays} onChange={(e) => setDormantDays(Number(e.target.value))} />
            </div>
            <div>
              <button className="table-link-btn accent" style={{ marginRight: '8px' }} onClick={loadDormant}>Actualiser</button>
              {dormantProducts && dormantProducts.length > 0 && (
                <button className="module-primary-btn" onClick={exportDormant}>Exporter (CSV)</button>
              )}
            </div>
          </div>
          <div className="data-table-wrap">
            {!dormantProducts ? null : dormantProducts.length === 0 ? (
              <div className="empty-state">Aucun produit dormant sur cette periode.</div>
            ) : (
              <table className="data-table">
                <thead><tr><th>Produit</th></tr></thead>
                <tbody>{dormantProducts.map((p) => <tr key={p.id}><td>{p.name}</td></tr>)}</tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {tab === 'controlled' && (
        <div>
          <div className="module-header">
            <button className="table-link-btn accent" onClick={loadControlledSales}>Charger</button>
            {controlledSales && controlledSales.length > 0 && (
              <button className="module-primary-btn" onClick={exportControlledSales}>Exporter (CSV)</button>
            )}
          </div>
          <div className="data-table-wrap">
            {!controlledSales ? null : controlledSales.length === 0 ? (
              <div className="empty-state">Aucune vente de substance controlee sur cette periode.</div>
            ) : (
              <table className="data-table">
                <thead><tr><th>Date</th><th className="num">Total</th><th>Patient</th><th>Ordonnance</th></tr></thead>
                <tbody>
                  {controlledSales.map((s) => (
                    <tr key={s.id}>
                      <td>{formatDateTime(s.created_at)}</td>
                      <td className="num">{Number(s.total_amount).toLocaleString('fr-FR')} CDF</td>
                      <td>{s.patient_id || '—'}</td>
                      <td>{s.prescription_id || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {tab === 'amm' && (
        <div className="empty-state">
          {ammNote ? ammNote.note : 'Chargement...'}
        </div>
      )}

      {tab === 'export-history' && (
        <div className="data-table-wrap">
          {exportHistory.length === 0 ? (
            <div className="empty-state">Aucun export enregistre.</div>
          ) : (
            <table className="data-table">
              <thead><tr><th>Date</th><th>Rapport</th><th>Periode</th><th>Exporte par</th></tr></thead>
              <tbody>
                {exportHistory.map((e) => (
                  <tr key={e.id}>
                    <td>{formatDateTime(e.created_at)}</td>
                    <td className="mono">{e.report_name}</td>
                    <td>{e.period_start ? formatDate(e.period_start) + ' - ' + formatDate(e.period_end) : '—'}</td>
                    <td>{e.exporter?.name || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}