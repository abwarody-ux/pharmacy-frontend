import { createContext, useContext, useState, useEffect } from 'react';
import api from '../services/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [activePharmacyId, setActivePharmacyId] = useState(
    localStorage.getItem('kasmok_active_pharmacy_id') || null
  );
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('kasmok_pharmacy_token');
    if (!token) {
      setLoading(false);
      return;
    }
    api.get('/auth/me')
      .then((res) => setUser(res.data))
      .catch(() => {
        localStorage.removeItem('kasmok_pharmacy_token');
      })
      .finally(() => setLoading(false));
  }, []);

  const login = (token, userData, pharmacyId) => {
    localStorage.setItem('kasmok_pharmacy_token', token);
    if (pharmacyId) {
      localStorage.setItem('kasmok_active_pharmacy_id', pharmacyId);
      setActivePharmacyId(pharmacyId);
    }
    setUser(userData);
  };

  const logout = () => {
    localStorage.removeItem('kasmok_pharmacy_token');
    localStorage.removeItem('kasmok_active_pharmacy_id');
    setUser(null);
    setActivePharmacyId(null);
  };

  return (
    <AuthContext.Provider value={{ user, activePharmacyId, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);