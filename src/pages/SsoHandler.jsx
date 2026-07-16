import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';

export default function SsoHandler() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { login } = useAuth();

  useEffect(() => {
    const token = searchParams.get('token');
    const pharmacyId = searchParams.get('pharmacy_id');

    if (!token) {
      navigate('/login', { replace: true });
      return;
    }

    localStorage.setItem('kasmok_pharmacy_token', token);

    api.get('/auth/me')
      .then((res) => {
        login(token, res.data, pharmacyId);
        navigate('/', { replace: true });
      })
      .catch(() => {
        localStorage.removeItem('kasmok_pharmacy_token');
        navigate('/login', { replace: true });
      });
  }, [searchParams, navigate, login]);

  return null;
}