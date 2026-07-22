import { NavLink } from 'react-router-dom';

const MODULES = [
  { code: 'MOD-01', label: 'Administration', path: '/administration', status: 'built' },
  { code: 'MOD-02', label: 'Referentiel Produits', path: '/produits', status: 'built' },
  { code: 'MOD-03', label: 'Achats', path: '/achats', status: 'built' },
  { code: 'MOD-04', label: 'Stocks', path: '/stocks', status: 'built' },
  { code: 'MOD-05', label: 'Point de Vente', path: '/pos', status: 'built' },
  { code: 'MOD-06', label: 'Patients', path: '/patients', status: 'built' },
  { code: 'MOD-07', label: 'Ordonnances', path: '/ordonnances', status: 'built' },
];

export default function Sidebar({ pharmacyName }) {
  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <span className="sidebar-brand-mark">KASMOK</span>
        <span className="sidebar-brand-sub">Pharmacy</span>
      </div>
      {pharmacyName && (
        <div className="sidebar-pharmacy">
          <span className="sidebar-pharmacy-label">Agence</span>
          <span className="sidebar-pharmacy-name">{pharmacyName}</span>
        </div>
      )}
      <nav className="sidebar-nav">
        {MODULES.map((mod) => (
          <NavLink
            key={mod.code}
            to={mod.path}
            className={({ isActive }) => 'sidebar-link' + (isActive ? ' active' : '')}
          >
            <span className="sidebar-link-tag mono">{mod.code}</span>
            <span className="sidebar-link-label">{mod.label}</span>
            <span className={'sidebar-link-status ' + mod.status} title={mod.status === 'built' ? 'Disponible' : 'A construire'} />
          </NavLink>
        ))}
      </nav>
      <div className="sidebar-footer">
        <span className="mono">BRS-KASMOK-PHARMACY-P1</span>
      </div>
    </aside>
  );
}