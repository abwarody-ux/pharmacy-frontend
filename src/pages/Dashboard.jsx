import { useAuth } from '../context/AuthContext';

export default function Dashboard() {
  const { user, logout } = useAuth();

  return (
    <div className="dashboard-screen">
      <header className="dashboard-header">
        <h1>KASMOK Pharmacy</h1>
        <button onClick={logout}>Deconnexion</button>
      </header>
      <p>Bienvenue{user?.name ? `, ${user.name}` : ''}. Tableau de bord a construire.</p>
    </div>
  );
}