import React, { Suspense, lazy } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Sidebar from './components/Sidebar';
import Login from './pages/Login';
import ErrorBoundary from './components/ErrorBoundary';
import { useAuth } from './context/AuthContext';

// Carga diferida por página: el mapa, los gráficos y la exportación a Excel no se descargan hasta que se necesitan.
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Horometer = lazy(() => import('./pages/Horometer'));
const Fleet = lazy(() => import('./pages/Fleet'));
const Telemetry = lazy(() => import('./pages/Telemetry'));
const Maintenance = lazy(() => import('./pages/Maintenance'));
const SettingsPage = lazy(() => import('./pages/Settings'));

const Loading = ({ text = 'Cargando...' }) => (
  <div className="loading-screen" role="status" aria-live="polite">
    <span className="spinner" aria-hidden="true"></span>
    <span>{text}</span>
  </div>
);

const App = () => {
  const { user, loading } = useAuth();

  if (loading) return <Loading text="Cargando sesión..." />;

  if (!user) {
    return <Login />;
  }

  return (
    <Router>
      <a className="skip-link" href="#contenido">Saltar al contenido</a>
      <div className="app-container">
        <Sidebar />
        <main className="main-content" id="contenido" tabIndex={-1}>
          <ErrorBoundary>
            <Suspense fallback={<Loading />}>
              <Routes>
                <Route path="/" element={<Navigate to="/dashboard" replace />} />
                <Route path="/dashboard" element={<Dashboard />} />
                <Route path="/horometers" element={<Horometer />} />
                <Route path="/horometers/:id" element={<Horometer />} />
                <Route path="/horometer/:id" element={<Horometer />} />
                <Route path="/fleet" element={<Fleet />} />
                <Route path="/telemetry" element={<Telemetry />} />
                <Route path="/maintenance" element={<Maintenance />} />
                <Route path="/settings" element={<SettingsPage />} />
                <Route path="*" element={<Navigate to="/dashboard" replace />} />
              </Routes>
            </Suspense>
          </ErrorBoundary>
        </main>
      </div>
    </Router>
  );
}

export default App;
