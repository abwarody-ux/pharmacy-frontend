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
import PrescriptionsPage from './pages/modules/PrescriptionsPage';
import ProformasPage from './pages/modules/ProformasPage';
import PriceRevaluationsPage from './pages/modules/PriceRevaluationsPage';
import ExpensesPage from './pages/modules/ExpensesPage';
import ReportsPage from './pages/modules/ReportsPage';
import AnalyticsPage from './pages/modules/AnalyticsPage';
import AiPage from './pages/modules/AiPage';

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
        <Route path="ordonnances" element={<PrescriptionsPage />} />
        <Route path="proformas" element={<ProformasPage />} />
        <Route path="reevaluations" element={<PriceRevaluationsPage />} />
        <Route path="charges" element={<ExpensesPage />} />
        <Route path="rapports" element={<ReportsPage />} />
        <Route path="analytics" element={<AnalyticsPage />} />
        <Route path="ia" element={<AiPage />} />
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