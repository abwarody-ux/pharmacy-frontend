import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const res = await api.post('/auth/login', { email, password });
      const { token, user, pharmacy_id } = res.data;
      login(token, user, pharmacy_id);
      navigate('/');
    } catch (err) {
      setError(
        err.response?.data?.message || 'Identifiants incorrects. Veuillez reessayer.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="login-screen">
      <form onSubmit={handleSubmit} className="login-form">
        <h1>KASMOK Pharmacy</h1>
        <p className="login-sub">Connexion a votre espace pharmacie</p>

        {error && <div className="login-error">{error}</div>}

        <label htmlFor="email">Email</label>
        <input
          id="email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoComplete="username"
        />

        <label htmlFor="password">Mot de passe</label>
        <input
          id="password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          autoComplete="current-password"
        />

        <button type="submit" disabled={submitting}>
          {submitting ? 'Connexion...' : 'Se connecter'}
        </button>
      </form>
    </div>
  );
}