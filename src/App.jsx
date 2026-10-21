import { Suspense, lazy } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './context/AuthContext.jsx';
import Login from './pages/Login.jsx';
import { DASHBOARDS } from './config/dashboards.jsx';

// the landing page (with its intro animation) and the dashboards are separate downloads
const Home = lazy(() => import('./pages/Home.jsx'));
const DashboardLayout = lazy(() => import('./layouts/DashboardLayout.jsx'));
const Profile = lazy(() => import('./pages/Profile.jsx'));

function Loader() {
  return <div className="page-loader">Loading Swol Media…</div>;
}

// Picks the dashboard for the signed-in user's role and renders its tabs as routes.
function Dashboard() {
  const { user, loading } = useAuth();
  if (loading) return <Loader />;
  if (!user) return <Navigate to="/login" replace />;

  const dash = DASHBOARDS[user.role];
  if (!dash) return <Navigate to="/" replace />;

  return (
    <Routes>
      <Route element={<DashboardLayout dashboard={dash} />}>
        <Route index element={<Navigate to={dash.tabs[0].path} replace />} />
        {dash.tabs.map((t) => (
          <Route key={t.path} path={`${t.path}/*`} element={t.element} />
        ))}
        <Route path="profile" element={<Profile />} />
        <Route path="*" element={<Navigate to={dash.tabs[0].path} replace />} />
      </Route>
    </Routes>
  );
}

export default function App() {
  return (
    <Suspense fallback={<Loader />}>
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/login" element={<Login />} />
      <Route path="/dashboard/*" element={<Dashboard />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
    </Suspense>
  );
}
