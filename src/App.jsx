import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import Login from './pages/Login';
import SsoHandler from './pages/SsoHandler';
import Dashboard from './pages/Dashboard';
import AdminPage from './pages/modules/AdminPage';
import ProductsPage from './pages/modules/ProductsPage';
import PurchasesPage from './pages/modules/PurchasesPage';
import StockPage from './pages/modules/StockPage';
import PosPage from './pages/modules/PosPage';
import PatientsPage from './pages/modules/PatientsPage';

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/sso" element={<SsoHandler />} />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <Dashboard />
          </ProtectedRoute>
        }
      >
        <Route index element={<Navigate to="/administration" replace />} />
        <Route path="administration" element={<AdminPage />} />
        <Route path="produits" element={<ProductsPage />} />
        <Route path="achats" element={<PurchasesPage />} />
        <Route path="stocks" element={<StockPage />} />
        <Route path="pos" element={<PosPage />} />
        <Route path="patients" element={<PatientsPage />} />
      </Route>
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </AuthProvider>
  );
}