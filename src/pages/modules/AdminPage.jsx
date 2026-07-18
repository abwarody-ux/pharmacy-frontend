import { useAuth } from '../../context/AuthContext';

export default function AdminPage() {
  const { user, activePharmacyId } = useAuth();

  return (
    <div>
      <span className="tag mono" style={{ display: 'inline-block', marginBottom: 14 }}>MOD-01</span>
      <h2 style={{ fontSize: 20, marginBottom: 20 }}>Administration</h2>
      <div className="admin-grid">
        <div className="admin-card">
          <div className="admin-card-label">Role connecte</div>
          <div className="admin-card-value" style={{ fontSize: 15 }}>{user?.role || '—'}</div>
        </div>
        <div className="admin-card">
          <div className="admin-card-label">Email</div>
          <div className="admin-card-value" style={{ fontSize: 15 }}>{user?.email || '—'}</div>
        </div>
        <div className="admin-card">
          <div className="admin-card-label">Pharmacie active</div>
          <div className="admin-card-value" style={{ fontSize: 13, fontFamily: 'IBM Plex Mono, monospace' }}>{activePharmacyId || '—'}</div>
        </div>
      </div>
    </div>
  );
}