import { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { listProducts, searchProducts } from '../../services/products';
import { getDashboard, getDemandVsSales, getUnmetDemand, getStockoutForecast } from '../../services/analytics';

const DIRECTION_ROLES = ['PHARMACY_ADMIN', 'PHARMACY_TITULAIRE'];
const DEMAND_ROLES = ['PHARMACY_ADMIN', 'PHARMACY_TITULAIRE', 'PHARMACY_ACHATS'];

const CONFIDENCE_LABELS = { FAIBLE: 'Faible', MOYENNE: 'Moyenne', ELEVEE: 'Elevee' };

function formatDateTime(dateStr) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleString('fr-FR', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function AnalyticsPage() {
  const { activePharmacyId, user } = useAuth();
  const canSeeDemand = DEMAND_ROLES.includes(user?.role);
  const canSeeDemandVsSales = DIRECTION_ROLES.includes(user?.role);

  const [tab, setTab] = useState('dashboard');
  const [dashboard, setDashboard] = useState(null);
  const [demandVsSales, setDemandVsSales] = useState(null);
  const [unmetDemand, setUnmetDemand] = useState(null);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(false);

  // Prevision de rupture
  const [forecastQuery, setForecastQuery] = useState('');
  const [forecastResults, setForecastResults] = useState([]);
  const [forecastProduct, setForecastProduct] = useState(null);
  const [forecast, setForecast] = useState(null);
  const [loadingForecast, setLoadingForecast] = useState(false);

  useEffect(() => {
    if (!activePharmacyId) return;
    setLoading(true);
    getDashboard(activePharmacyId).then(setDashboard).catch(() => {}).finally(() => setLoading(false));
    listProducts(activePharmacyId).then(setProducts).catch(() => {});
  }, [activePharmacyId]);

  useEffect(() => {
    if (tab === 'demand-vs-sales' && canSeeDemandVsSales && !demandVsSales) {
      getDemandVsSales(activePharmacyId).then(setDemandVsSales).catch(() => {});
    }
    if (tab === 'unmet-demand' && canSeeDemand && !unmetDemand) {
      getUnmetDemand(activePharmacyId).then(setUnmetDemand).catch(() => {});
    }
  }, [tab, activePharmacyId]);

  const productName = (id) => products.find((p) => p.id === id)?.name || id;

  const handleForecastSearch = async (e) => {
    const value = e.target.value;
    setForecastQuery(value);
    setForecastProduct(null);
    setForecast(null);
    if (!activePharmacyId || value.trim() === '') { setForecastResults([]); return; }
    try {
      const results = await searchProducts(activePharmacyId, value);
      setForecastResults(results);
    } catch {
      // recherche silencieuse
    }
  };

  const pickForecastProduct = async (product) => {
    setForecastProduct(product);
    setForecastQuery(product.name);
    setForecastResults([]);
    setLoadingForecast(true);
    try {
      const data = await getStockoutForecast(activePharmacyId, product.id);
      setForecast(data);
    } catch {
      setForecast(null);
    } finally {
      setLoadingForecast(false);
    }
  };

  return (
    <div>
      <div className="module-header">
        <div className="module-title-block">
          <span className="tag mono">MOD-12</span>
          <h2>Analytics</h2>
        </div>
      </div>

      <div className="tab-bar">
        <button className={tab === 'dashboard' ? 'tab-btn active' : 'tab-btn'} onClick={() => setTab('dashboard')}>Tableau de bord</button>
        {canSeeDemandVsSales && (
          <button className={tab === 'demand-vs-sales' ? 'tab-btn active' : 'tab-btn'} onClick={() => setTab('demand-vs-sales')}>Demande vs Ventes</button>
        )}
        {canSeeDemand && (
          <button className={tab === 'unmet-demand' ? 'tab-btn active' : 'tab-btn'} onClick={() => setTab('unmet-demand')}>Demande non satisfaite</button>
        )}
        {canSeeDemand && (
          <button className={tab === 'forecast' ? 'tab-btn active' : 'tab-btn'} onClick={() => setTab('forecast')}>Prevision de rupture</button>
        )}
      </div>

      {tab === 'dashboard' && (
        <div>
          {loading ? null : !dashboard ? null : dashboard.role_view === 'DIRECTION' ? (
            <div className="admin-grid">
              <div className="admin-card">
                <div className="admin-card-label">Chiffre d'affaires</div>
                <div className="admin-card-value">{Number(dashboard.revenue).toLocaleString('fr-FR')} CDF</div>
              </div>
              <div className="admin-card">
                <div className="admin-card-label">Valeur du stock</div>
                <div className="admin-card-value">{Number(dashboard.stock_value).toLocaleString('fr-FR')} CDF</div>
              </div>
              <div className="admin-card">
                <div className="admin-card-label">Valeur stock perime</div>
                <div className="admin-card-value" style={{ color: dashboard.expired_stock_value > 0 ? 'var(--red, #9c3f3a)' : undefined }}>
                  {Number(dashboard.expired_stock_value).toLocaleString('fr-FR')} CDF
                </div>
              </div>
              <div className="admin-card">
                <div className="admin-card-label">Taux de rupture</div>
                <div className="admin-card-value">{dashboard.stockout_rate_percent}%</div>
              </div>
            </div>
          ) : dashboard.role_view === 'ACHATS' ? (
            <div>
              <h3 style={{ fontSize: '15px', marginBottom: '8px' }}>Demandes d'achat en attente ({(dashboard.pending_purchase_requests || []).length})</h3>
              <div className="data-table-wrap" style={{ marginBottom: '20px' }}>
                {(dashboard.pending_purchase_requests || []).length === 0 ? (
                  <div className="empty-state">Aucune demande en attente.</div>
                ) : (
                  <table className="data-table">
                    <thead><tr><th>Produit</th><th className="num">Quantite</th><th className="num">Total estime</th></tr></thead>
                    <tbody>
                      {dashboard.pending_purchase_requests.map((r) => (
                        <tr key={r.id}>
                          <td>{productName(r.product_id)}</td>
                          <td className="num">{r.quantity}</td>
                          <td className="num">{Number(r.estimated_total).toLocaleString('fr-FR')} CDF</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
              <h3 style={{ fontSize: '15px', marginBottom: '8px' }}>Alertes peremption ({(dashboard.expiry_alerts || []).length})</h3>
              <div className="data-table-wrap">
                {(dashboard.expiry_alerts || []).length === 0 ? (
                  <div className="empty-state">Aucune alerte.</div>
                ) : (
                  <table className="data-table">
                    <thead><tr><th>Produit</th><th>Lot</th><th className="num">Quantite</th><th>Peremption</th></tr></thead>
                    <tbody>
                      {dashboard.expiry_alerts.map((l) => (
                        <tr key={l.id}>
                          <td>{l.products?.name || productName(l.product_id)}</td>
                          <td className="mono">{l.lot_number}</td>
                          <td className="num">{l.quantity_remaining}</td>
                          <td>{formatDateTime(l.expiry_date)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          ) : dashboard.role_view === 'AUDITEUR' ? (
            <div>
              <h3 style={{ fontSize: '15px', marginBottom: '8px' }}>Ajustements en attente ({(dashboard.pending_stock_adjustments || []).length})</h3>
              <div className="data-table-wrap" style={{ marginBottom: '20px' }}>
                {(dashboard.pending_stock_adjustments || []).length === 0 ? (
                  <div className="empty-state">Aucun ajustement en attente.</div>
                ) : (
                  <table className="data-table">
                    <thead><tr><th>Produit</th><th className="num">Delta</th><th>Raison</th></tr></thead>
                    <tbody>
                      {dashboard.pending_stock_adjustments.map((a) => (
                        <tr key={a.id}>
                          <td>{productName(a.product_id)}</td>
                          <td className="num">{a.quantity_delta > 0 ? '+' : ''}{a.quantity_delta}</td>
                          <td>{a.reason}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
              <h3 style={{ fontSize: '15px', marginBottom: '8px' }}>Approbations d'achat en attente ({(dashboard.pending_purchase_approvals || []).length})</h3>
              <div className="data-table-wrap" style={{ marginBottom: '20px' }}>
                {(dashboard.pending_purchase_approvals || []).length === 0 ? (
                  <div className="empty-state">Aucune approbation en attente.</div>
                ) : (
                  <table className="data-table">
                    <thead><tr><th>Produit</th><th className="num">Total estime</th></tr></thead>
                    <tbody>
                      {dashboard.pending_purchase_approvals.map((r) => (
                        <tr key={r.id}>
                          <td>{productName(r.product_id)}</td>
                          <td className="num">{Number(r.estimated_total).toLocaleString('fr-FR')} CDF</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
              <h3 style={{ fontSize: '15px', marginBottom: '8px' }}>Acces recents aux donnees patient/ordonnance</h3>
              <div className="data-table-wrap">
                {(dashboard.recent_patient_data_access || []).length === 0 ? (
                  <div className="empty-state">Aucun acces recent.</div>
                ) : (
                  <table className="data-table">
                    <thead><tr><th>Date</th><th>Action</th><th>Utilisateur</th></tr></thead>
                    <tbody>
                      {dashboard.recent_patient_data_access.map((a) => (
                        <tr key={a.id}>
                          <td>{formatDateTime(a.created_at)}</td>
                          <td className="mono">{a.action}</td>
                          <td>{a.user_name || a.user_id}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          ) : (
            <div className="empty-state">{dashboard.message || 'Aucun tableau de bord defini pour ce role.'}</div>
          )}
        </div>
      )}

      {tab === 'demand-vs-sales' && canSeeDemandVsSales && (
        <div className="data-table-wrap">
          {!demandVsSales ? null : demandVsSales.length === 0 ? (
            <div className="empty-state">Aucune donnee.</div>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Produit</th><th>Categorie</th><th className="num">Recherches</th>
                  <th className="num">Demande proforma</th><th className="num">Vendu</th><th className="num">Ecart non satisfait</th>
                </tr>
              </thead>
              <tbody>
                {demandVsSales.map((r) => (
                  <tr key={r.product_id}>
                    <td>{r.product_name}</td>
                    <td>{r.category || '—'}</td>
                    <td className="num">{r.search_count}</td>
                    <td className="num">{r.requested_via_proforma}</td>
                    <td className="num">{r.sold_quantity}</td>
                    <td className="num">{r.unmet_gap > 0 ? <span className="badge-status warn">{r.unmet_gap}</span> : '0'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {tab === 'unmet-demand' && canSeeDemand && (
        <div>
          <h3 style={{ fontSize: '15px', marginBottom: '8px' }}>Recherches sans resultat</h3>
          <div className="data-table-wrap" style={{ marginBottom: '20px' }}>
            {!unmetDemand ? null : unmetDemand.searches_without_results.length === 0 ? (
              <div className="empty-state">Aucune recherche sans resultat.</div>
            ) : (
              <table className="data-table">
                <thead><tr><th>Recherche</th><th>Date</th></tr></thead>
                <tbody>
                  {unmetDemand.searches_without_results.map((s, i) => (
                    <tr key={i}><td>{s.query}</td><td>{formatDateTime(s.created_at)}</td></tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
          <h3 style={{ fontSize: '15px', marginBottom: '8px' }}>Lignes proforma non disponibles</h3>
          <div className="data-table-wrap">
            {!unmetDemand ? null : unmetDemand.proforma_lines_unavailable.length === 0 ? (
              <div className="empty-state">Aucune ligne indisponible.</div>
            ) : (
              <table className="data-table">
                <thead><tr><th>Produit</th><th className="num">Quantite</th><th>Substitut propose</th></tr></thead>
                <tbody>
                  {unmetDemand.proforma_lines_unavailable.map((l, i) => (
                    <tr key={i}>
                      <td>{productName(l.product_id)}</td>
                      <td className="num">{l.quantity}</td>
                      <td>{l.substitute_product_id ? productName(l.substitute_product_id) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {tab === 'forecast' && canSeeDemand && (
        <div>
          <div className="form-field full" style={{ position: 'relative', maxWidth: '400px', marginBottom: '20px' }}>
            <label>Rechercher un produit</label>
            <input type="text" value={forecastQuery} onChange={handleForecastSearch} placeholder="Nom du produit..." autoComplete="off" />
            {forecastResults.length > 0 && (
              <div style={{
                position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 20,
                background: 'var(--panel-bg, #1a1a1a)', border: '1px solid var(--border-color, #333)',
                borderRadius: '6px', marginTop: '4px', maxHeight: '200px', overflowY: 'auto',
              }}>
                {forecastResults.map((p) => (
                  <div
                    key={p.id} onClick={() => pickForecastProduct(p)}
                    style={{ padding: '8px 12px', cursor: 'pointer', color: '#f0f0f0' }}
                    onMouseEnter={(e) => e.currentTarget.style.background = '#2a2a2a'}
                    onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                  >
                    {p.name}
                  </div>
                ))}
              </div>
            )}
          </div>

          {loadingForecast ? (
            <div className="empty-state">Calcul en cours...</div>
          ) : forecast && forecastProduct ? (
            <div className="admin-grid">
              <div className="admin-card">
                <div className="admin-card-label">Produit</div>
                <div className="admin-card-value" style={{ fontSize: '15px' }}>{forecastProduct.name}</div>
              </div>
              <div className="admin-card">
                <div className="admin-card-label">Stock actuel</div>
                <div className="admin-card-value">{forecast.current_stock}</div>
              </div>
              <div className="admin-card">
                <div className="admin-card-label">Consommation quotidienne</div>
                <div className="admin-card-value">{forecast.daily_consumption_rate}</div>
              </div>
              <div className="admin-card">
                <div className="admin-card-label">Jours avant rupture</div>
                <div className="admin-card-value">{forecast.days_until_stockout ?? '—'}</div>
              </div>
              <div className="admin-card">
                <div className="admin-card-label">Confiance</div>
                <div className="admin-card-value" style={{ fontSize: '15px' }}>
                  <span className={forecast.confidence === 'FAIBLE' ? 'badge-status warn' : 'badge-status ok'}>
                    {CONFIDENCE_LABELS[forecast.confidence] || forecast.confidence}
                  </span>
                </div>
              </div>
              {forecast.note && (
                <div className="admin-card" style={{ gridColumn: '1 / -1' }}>
                  <div className="admin-card-label">Note</div>
                  <div style={{ fontSize: '13px' }}>{forecast.note}</div>
                </div>
              )}
            </div>
          ) : (
            <div className="empty-state">Recherchez un produit pour voir sa prevision de rupture.</div>
          )}
        </div>
      )}
    </div>
  );
}