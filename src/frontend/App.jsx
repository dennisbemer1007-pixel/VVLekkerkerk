import { Link, Navigate, Route, Routes } from 'react-router-dom';
import ApiStatusBanner from './components/ApiStatusBanner.jsx';
import Layout from './components/Layout.jsx';
import { useAuth } from './context/AuthContext.jsx';
import Beheer from './pages/Beheer.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Inschrijven from './pages/Inschrijven.jsx';
import Login from './pages/Login.jsx';
import Planning from './pages/Planning.jsx';
import Ruilen from './pages/Ruilen.jsx';
import TeamDashboard from './pages/TeamDashboard.jsx';
import Privacy from './pages/Privacy.jsx';
import Uitnodiging from './pages/Uitnodiging.jsx';
import Voorkeuren from './pages/Voorkeuren.jsx';
import WachtwoordReset from './pages/WachtwoordReset.jsx';
import WachtwoordVergeten from './pages/WachtwoordVergeten.jsx';
import Wedstrijden from './pages/Wedstrijden.jsx';

function Protected({ children, feature }) {
  const { isLoggedIn, loading, can, homePath } = useAuth();
  if (loading) {
    return <p className="text-center text-sm text-gray-600">Laden…</p>;
  }
  if (!isLoggedIn) return <Navigate to="/login" replace />;
  if (feature && !can(feature)) {
    return (
      <div className="vvl-card space-y-2">
        <h1 className="font-heading text-xl font-black uppercase">Geen toegang</h1>
        <p className="text-sm text-gray-700">Met jouw rol heb je hier geen recht op.</p>
        <Link to={homePath} className="vvl-btn-outline inline-flex text-xs">
          Terug
        </Link>
      </div>
    );
  }
  return children;
}

function RoleHome() {
  const { isLoggedIn, loading, can } = useAuth();
  if (loading) {
    return <p className="text-center text-sm text-gray-600">Laden…</p>;
  }
  if (!isLoggedIn) return <Navigate to="/login" replace />;
  if (can('dashboard')) return <Dashboard />;
  if (can('inschrijven')) return <Navigate to="/inschrijven" replace />;
  if (can('beheer')) return <Navigate to="/beheer" replace />;
  return <Navigate to="/login" replace />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/privacy" element={<Privacy />} />
      <Route path="/wachtwoord-vergeten" element={<WachtwoordVergeten />} />
      <Route path="/wachtwoord/:token" element={<WachtwoordReset />} />
      <Route path="/uitnodiging/:token" element={<Uitnodiging />} />
      <Route
        path="/*"
        element={
          <Layout>
            <ApiStatusBanner />
            <Routes>
              <Route
                path="/"
                element={
                  <Protected>
                    <RoleHome />
                  </Protected>
                }
              />
              <Route
                path="/inschrijven"
                element={
                  <Protected feature="inschrijven">
                    <Inschrijven />
                  </Protected>
                }
              />
              <Route
                path="/planning"
                element={
                  <Protected feature="planning">
                    <Planning />
                  </Protected>
                }
              />
              <Route
                path="/wedstrijden"
                element={
                  <Protected feature="wedstrijden">
                    <Wedstrijden />
                  </Protected>
                }
              />
              <Route
                path="/ruilen"
                element={
                  <Protected feature="ruilen">
                    <Ruilen />
                  </Protected>
                }
              />
              <Route
                path="/voorkeuren"
                element={
                  <Protected>
                    <Voorkeuren />
                  </Protected>
                }
              />
              <Route
                path="/beheer"
                element={
                  <Protected feature="beheer">
                    <Beheer mode="full" />
                  </Protected>
                }
              />
              <Route
                path="/teams"
                element={
                  <Protected feature="teams">
                    <TeamDashboard />
                  </Protected>
                }
              />
              <Route
                path="/uitnodigen"
                element={
                  <Protected feature="beheer">
                    <Beheer mode="invite" />
                  </Protected>
                }
              />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Layout>
        }
      />
    </Routes>
  );
}
