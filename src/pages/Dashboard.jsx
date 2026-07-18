import { useEffect, useState } from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from '../components/Sidebar';
import TopBar from '../components/TopBar';
import { useAuth } from '../context/AuthContext';
import { getActivePharmacy } from '../services/pharmacy';
import '../styles/dashboard.css';

export default function Dashboard() {
  const { activePharmacyId } = useAuth();
  const [pharmacy, setPharmacy] = useState(null);

  useEffect(() => {
    if (!activePharmacyId) return;
    getActivePharmacy(activePharmacyId)
      .then(setPharmacy)
      .catch(() => setPharmacy(null));
  }, [activePharmacyId]);

  return (
    <div className="dashboard-shell">
      <Sidebar pharmacyName={pharmacy?.name} />
      <div className="dashboard-main">
        <TopBar />
        <div className="dashboard-content">
          <Outlet />
        </div>
      </div>
    </div>
  );
}