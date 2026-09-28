import { Link, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import ApiStatusBanner from './components/ApiStatusBanner.jsx';
import Layout from './components/Layout.jsx';
import { useAuth } from './context/AuthContext.jsx';
import { isAdminRoleName } from './navConfig.js';
import Beheer from './pages/Beheer.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Ik from './pages/Ik.jsx';
import Inschrijven from './pages/Inschrijven.jsx';
import Instellingen from './pages/Instellingen.jsx';
import Login from './pages/Login.jsx';
import Meer from './pages/Meer.jsx';
import Planning from './pages/Planning.jsx';
import Ruilen from './pages/Ruilen.jsx';
import TeamDashboard from './pages/TeamDashboard.jsx';
import Privacy from './pages/Privacy.jsx';
import Uitnodiging from './pages/Uitnodiging.jsx';
import WachtwoordReset from './pages/WachtwoordReset.jsx';
import WachtwoordVergeten from './pages/WachtwoordVergeten.jsx';
import Wedstrijden from './pages/Wedstrijden.jsx';

function Protected({ children, feature, adminOnly = false }) {
  const { isLoggedIn, loading, can, homePath, user } = useAuth();
  if (loading) {
    return <p className="text-center text-sm text-gray-600">Laden…</p>;
  }
  if (!isLoggedIn) return <Navigate to="/login" replace />;
  if (adminOnly && !isAdminRoleName(user?.role)) {
    return <Navigate to={homePath} replace />;
  }
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
  const { isLoggedIn, loading, homePath } = useAuth();
  if (loading) return <p className="text-center text-sm text-gray-600">Laden…</p>;
  if (!isLoggedIn) return <Navigate to="/login" replace />;
  return <Navigate to={homePath} replace />;
}

function LegacyInschrijven() {
  const location = useLocation();
  const mine = new URLSearchParams(location.search).get('filter') === 'mine';
  return <Navigate to={mine ? '/mijn-diensten' : '/diensten'} replace />;
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
              <Route path="/" element={<Protected><RoleHome /></Protected>} />
              <Route path="/inschrijven" element={<Protected feature="inschrijven"><LegacyInschrijven /></Protected>} />
              <Route path="/diensten" element={<Protected feature="inschrijven"><Inschrijven mode="open" /></Protected>} />
              <Route path="/mijn-diensten" element={<Protected feature="inschrijven"><Inschrijven mode="mine" /></Protected>} />
              <Route path="/open" element={<Protected feature="dashboard"><Dashboard /></Protected>} />
              <Route path="/rooster" element={<Protected feature="planning"><Planning /></Protected>} />
              <Route path="/planning" element={<Protected feature="planning"><Navigate to="/rooster" replace /></Protected>} />
              <Route path="/wedstrijden" element={<Protected feature="wedstrijden"><Wedstrijden /></Protected>} />
              <Route path="/ruilen" element={<Protected><Ruilen scope="mine" /></Protected>} />
              <Route path="/mijn-ruilen" element={<Protected><Ruilen scope="mine" title="Mijn ruilen" /></Protected>} />
              <Route path="/voorkeuren" element={<Protected><Navigate to="/ik" replace /></Protected>} />
              <Route path="/ik" element={<Protected><Ik /></Protected>} />
              <Route path="/mensen" element={<Protected feature="beheer"><Beheer onlyTab="personen" /></Protected>} />
              <Route path="/instellingen" element={<Protected feature="beheer" adminOnly><Instellingen /></Protected>} />
              <Route path="/meer" element={<Protected feature="beheer"><Meer /></Protected>} />
              <Route path="/beheer" element={<Protected feature="beheer"><Beheer mode="full" /></Protected>} />
              <Route path="/team" element={<Protected feature="teams"><TeamDashboard /></Protected>} />
              <Route path="/teams" element={<Protected feature="teams"><Navigate to="/team" replace /></Protected>} />
              <Route path="/uitnodigen" element={<Protected feature="beheer"><Beheer mode="invite" /></Protected>} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Layout>
        }
      />
    </Routes>
  );
}
