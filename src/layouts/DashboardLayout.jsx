import { useEffect, useRef, useState } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { roleLabel } from '../config/dashboards.jsx';
import { LOGO_SRC } from '../components/Logo.jsx';
import Icon from '../components/Icon.jsx';
import Avatar from '../components/Avatar.jsx';
import PillNav from '../components/PillNav.jsx';
import '../dashboard.css';

const PROFILE_TAB = { path: 'profile', label: 'Profile', icon: 'user', subtitle: 'Your details, photo and password' };

// Shared shell for every dashboard: brand pill, a black pill nav built from the role's tab config
// (top on desktop, bottom on phones) and an account pill, then the page header and the page itself.
export default function DashboardLayout({ dashboard }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [menu, setMenu] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const menuRef = useRef(null);

  const tabs = dashboard.tabs;
  // the tab is the first segment after /dashboard (so /dashboard/campaigns/123 → Campaigns)
  const section = pathname.split('/')[2];
  const current = [...tabs, PROFILE_TAB].find((t) => t.path === section) || tabs[0];
  const isSubPage = pathname.split('/').filter(Boolean).length > 2;

  useEffect(() => setMenu(false), [pathname]);
  useEffect(() => {
    const onDown = (e) => menuRef.current && !menuRef.current.contains(e.target) && setMenu(false);
    const onKey = (e) => e.key === 'Escape' && setMenu(false);
    const onScroll = () => setScrolled(window.scrollY > 16);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', onScroll);
    };
  }, []);

  const onLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  return (
    <div className="app app-pill">
      {/* Three floating pills: brand · sections (black capsule) · you */}
      <div className={`nv-wrap ${tabs.length < 2 ? 'single' : ''} ${scrolled ? 'scrolled' : ''}`}>
        <header className="nv-bar">
          <Link to="/" className="nv-brand" title="Swol Media">
            <span className="nv-brand-mark">
              <img src={LOGO_SRC} alt="" />
            </span>
            <span className="nv-brand-name">
              Swol <em>Media</em>
            </span>
            {user.role !== 'internal' && user.company && (
              <span className="nv-org" title={user.company}>
                {user.company}
              </span>
            )}
          </Link>

          <nav className="nv-center" aria-label="Main">
            <PillNav items={tabs} active={current.path} />
          </nav>

          <div className="nv-end">
            <div className="nv-me" ref={menuRef}>
              <button
                className={`nv-me-btn ${menu ? 'open' : ''} ${current.path === 'profile' ? 'here' : ''}`}
                onClick={() => setMenu((m) => !m)}
                aria-haspopup="menu"
                aria-label="Account"
              >
                <Avatar user={user} size={32} />
                <span className="nv-me-meta">
                  <strong>{user.name.split(' ')[0]}</strong>
                  <span>{user.role === 'internal' ? 'Swol Media team' : roleLabel(user.role)}</span>
                </span>
              </button>

              {menu && (
                <div className="tb-menu-pop nv-menu" role="menu">
                  <div className="tb-menu-head">
                    <Avatar user={user} size={44} />
                    <div>
                      <strong>{user.name}</strong>
                      <span>{user.email}</span>
                      <em className={`role-chip role-${user.role}`}>{roleLabel(user.role)}</em>
                    </div>
                  </div>
                  <Link to="profile" className="tb-menu-item" role="menuitem">
                    <Icon name="user" size={17} /> My profile
                  </Link>
                  <Link to="profile#security" className="tb-menu-item" role="menuitem">
                    <Icon name="lock" size={17} /> Change password
                  </Link>
                </div>
              )}
            </div>
            <button className="nv-out" onClick={onLogout} title="Sign out" aria-label="Sign out">
              <Icon name="logout" size={16} />
            </button>
          </div>
        </header>
      </div>

      <main className="app-content">
        <div className={`pg-head ${current.hero && !isSubPage ? 'is-hidden' : ''}`}>
          <p className="pg-eyebrow">
            {dashboard.workspace}
            {current.label && !isSubPage ? <span> / {current.label}</span> : null}
          </p>
          {!isSubPage && <h1 className="pg-title" key={current.path}>{current.label}</h1>}
          {current.subtitle && !isSubPage && <p className="page-sub">{current.subtitle}</p>}
        </div>
        <Outlet />
      </main>
    </div>
  );
}
