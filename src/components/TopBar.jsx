import { useAuth } from '../context/AuthContext';

export default function TopBar() {
  const { user, logout } = useAuth();

  return (
    <header className="topbar">
      <div className="topbar-role mono">{user?.role || ''}</div>
      <div className="topbar-user">
        <span>{user?.name || user?.email}</span>
        <button className="topbar-logout" onClick={logout}>Deconnexion</button>
      </div>
    </header>
  );
}