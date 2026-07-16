import axios from 'axios';

const api = axios.create({
  baseURL: 'https://api.kasmokgroup.com',
  headers: {
    'Content-Type': 'application/json',
  },
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('kasmok_pharmacy_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('kasmok_pharmacy_token');
      localStorage.removeItem('kasmok_active_pharmacy_id');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export default api;