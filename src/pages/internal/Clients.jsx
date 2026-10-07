import { useEffect, useMemo, useState } from 'react';
import { Link, Route, Routes, useLocation, useNavigate, useParams } from 'react-router-dom';
import { api } from '../../api.js';
import Icon from '../../components/Icon.jsx';
import Avatar from '../../components/Avatar.jsx';
import ClientForm from '../../components/ClientForm.jsx';
import CampaignRow from '../../components/CampaignRow.jsx';
import NewCampaign from './campaigns/NewCampaign.jsx';
import { Empty, fmtNum, timeAgo, useToast } from '../../components/ui.jsx';

// /dashboard/clients       → every brand, with their campaigns and logins
// /dashboard/clients/:id   → one brand: details, its campaigns, its logins
export default function Clients() {
  return (
    <Routes>
      <Route index element={<ClientList />} />
      <Route path=":id" element={<ClientDetail />} />
    </Routes>
  );
}

function ClientList() {
  const [items, setItems] = useState(null);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('active');
  const [adding, setAdding] = useState(false);
  const navigate = useNavigate();
  const [toast, toastNode] = useToast();

  const load = () =>
    api
      .listClients()
      .then((d) => setItems(d.items))
      .catch((e) => toast(e.message, true));
  useEffect(() => {
    load();
  }, []);

  const counts = useMemo(() => {
    const c = { all: items?.length || 0, active: 0, inactive: 0 };
    (items || []).forEach((v) => (c[v.status] = (c[v.status] || 0) + 1));
    return c;
  }, [items]);
  const shown = (items || []).filter(
    (c) => (status === 'all' || c.status === status) && `${c.name} ${c.industry} ${c.contact?.name} ${c.contact?.email}`.toLowerCase().includes(q.toLowerCase())
  );

  return (
    <div className="page">
      <div className="page-bar">
        <div className="search-x">
          <Icon name="search" size={18} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search clients, industries, contacts" />
        </div>
        <div className="seg">
          {['active', 'inactive', 'all'].map((s) => (
            <button key={s} className={status === s ? 'on' : ''} onClick={() => setStatus(s)}>
              {s[0].toUpperCase() + s.slice(1)} <span>{counts[s] || 0}</span>
            </button>
          ))}
        </div>
        <button className="btn primary" onClick={() => setAdding(true)}>
          <Icon name="plus" size={18} /> Add client
        </button>
      </div>

      {items === null ? (
        <div className="skel-grid">
          {[1, 2, 3].map((i) => (
            <div key={i} className="skel" />
          ))}
        </div>
      ) : shown.length === 0 ? (
        <Empty
          icon="building"
          title={items.length ? 'No clients match' : 'No clients yet'}
          text={items.length ? 'Try a different search or filter.' : 'Add the brands you run campaigns for — each campaign belongs to one client.'}
          action={
            !items.length && (
              <button className="btn primary" onClick={() => setAdding(true)}>
                <Icon name="plus" size={18} /> Add client
              </button>
            )
          }
        />
      ) : (
        <div className="v-grid">
          {shown.map((c, i) => (
            <Link key={c._id} to={c._id} className="v-card cl-card" style={{ '--i': i }}>
              <header>
                <span className="v-mono">{c.name.slice(0, 2).toUpperCase()}</span>
                <div className="v-title">
                  <h3>{c.name}</h3>
                  <span>{[c.industry, c.contact?.name].filter(Boolean).join(' · ') || 'No details yet'}</span>
                </div>
                {c.status === 'inactive' && <em className="v-off">Inactive</em>}
                <Icon name="arrowRight" size={16} className="v-edit" />
              </header>
              <div className="v-stats">
                <div>
                  <strong>{fmtNum(c.campaigns)}</strong>
                  <span>Campaigns</span>
                </div>
                <div>
                  <strong>{fmtNum(c.activeCampaigns || 0)}</strong>
                  <span>Running</span>
                </div>
                <div>
                  <strong>{fmtNum(c.userCount)}</strong>
                  <span>Logins</span>
                </div>
              </div>
              <footer className="v-flags">
                <span className={c.userCount ? 'ok' : ''}>
                  <Icon name={c.userCount ? 'check' : 'close'} size={13} /> {c.userCount ? 'Has login' : 'No login yet'}
                </span>
                {c.lastActivity && <span>Updated {timeAgo(c.lastActivity)}</span>}
              </footer>
            </Link>
          ))}
        </div>
      )}

      {adding && (
        <ClientForm
          onClose={() => setAdding(false)}
          onSaved={(item) => {
            setAdding(false);
            navigate(item._id, { state: { toast: `${item.name} added` } });
          }}
        />
      )}
      {toastNode}
    </div>
  );
}

function ClientDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [data, setData] = useState(null);
  const [campaigns, setCampaigns] = useState(null);
  const [editing, setEditing] = useState(false);
  const [creating, setCreating] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [toast, toastNode] = useToast();

  const load = () =>
    api
      .getClient(id)
      .then(setData)
      .catch((e) => (e.status === 404 || e.status === 400 ? setNotFound(true) : toast(e.message, true)));
  useEffect(() => {
    load();
    api
      .listCampaigns({ client: id })
      .then((d) => setCampaigns(d.items))
      .catch((e) => toast(e.message, true));
    if (location.state?.toast) {
      toast(location.state.toast);
      navigate(location.pathname + location.search, { replace: true, state: null }); // show it once, not again on Back
    }
  }, [id]);

  if (notFound)
    return (
      <div className="page">
        <Link to=".." className="back">
          <Icon name="arrowLeft" size={16} /> All clients
        </Link>
        <p className="muted">This client doesn’t exist.</p>
      </div>
    );
  if (!data)
    return (
      <div className="page">
        <div className="skel" style={{ height: 160 }} />
      </div>
    );

  const c = data.item;
  const running = (campaigns || []).filter((x) => ['sourcing', 'internal_review', 'client_review', 'live'].includes(x.status)).length;
  const approved = (campaigns || []).reduce((a, x) => a + (x.pipeline?.approved || 0), 0);
  const needed = (campaigns || []).filter((x) => x.status !== 'cancelled').reduce((a, x) => a + (x.creatorsNeeded || 0), 0);

  return (
    <div className="page cl">
      <Link to=".." className="back">
        <Icon name="arrowLeft" size={16} /> All clients
      </Link>

      <section className="cd-hero">
        <div className="cd-hero-main">
          <div className="cd-tags">
            <span className="c-code">Client</span>
            {c.status === 'inactive' && <em className="v-off">Inactive</em>}
          </div>
          <h2>{c.name}</h2>
          <p className="cd-sub">
            {c.industry && (
              <>
                <Icon name="building" size={16} /> {c.industry}
                <span className="dot">•</span>
              </>
            )}
            <Icon name="user" size={16} /> {c.contact?.name || 'No contact'}
            {c.contact?.email && (
              <>
                <span className="dot">•</span>
                <Icon name="mail" size={16} /> {c.contact.email}
              </>
            )}
            {c.contact?.phone && (
              <>
                <span className="dot">•</span>
                <Icon name="phone" size={16} /> {c.contact.phone}
              </>
            )}
          </p>
        </div>
        <div className="cd-hero-side cl-actions">
          <button className="btn primary" onClick={() => setCreating(true)}>
            <Icon name="plus" size={17} /> New campaign
          </button>
          <button className="btn ghost sm" onClick={() => setEditing(true)}>
            <Icon name="edit" size={15} /> Edit client
          </button>
        </div>
      </section>

      <section className="tiles">
        <div className="tile">
          <span>Campaigns</span>
          <strong>{fmtNum(campaigns?.length || 0)}</strong>
          <em>{fmtNum(running)} running</em>
        </div>
        <div className="tile">
          <span>Creators needed</span>
          <strong>{fmtNum(needed)}</strong>
          <em>across their campaigns</em>
        </div>
        <div className="tile">
          <span>Approved creators</span>
          <strong>{fmtNum(approved)}</strong>
          <em>{needed ? `${Math.round((approved / needed) * 100)}% of what’s needed` : '—'}</em>
        </div>
        <div className="tile">
          <span>Logins</span>
          <strong>{fmtNum(data.users.length)}</strong>
          <em>{data.users.length ? 'can sign in' : 'none yet'}</em>
        </div>
      </section>

      <div className="vd-section-head">
        <h2>Campaigns</h2>
        <p className="muted">Every campaign run for {c.name}.</p>
      </div>
      {campaigns === null ? (
        <div className="skel" style={{ height: 140 }} />
      ) : campaigns.length === 0 ? (
        <Empty
          icon="campaigns"
          title="No campaigns yet"
          text={`Create the first campaign for ${c.name}.`}
          action={
            <button className="btn primary" onClick={() => setCreating(true)}>
              <Icon name="plus" size={18} /> New campaign
            </button>
          }
        />
      ) : (
        <div className="c-rows">
          {campaigns.map((x, i) => (
            <CampaignRow key={x._id} c={x} i={i} to={`../../campaigns/${x._id}`} hideClient />
          ))}
        </div>
      )}

      <section className="card cl-logins">
        <div className="cd-card-head">
          <div>
            <h2>Client logins</h2>
            <p className="muted">People at {c.name} who can sign in to the client portal.</p>
          </div>
          <button className="btn ghost sm" onClick={() => navigate('../../settings', { state: { role: 'client', orgId: c._id } })}>
            <Icon name="key" size={15} /> Create login
          </button>
        </div>
        {data.users.length === 0 ? (
          <p className="muted">No logins yet — create one in Settings and share the password with them.</p>
        ) : (
          <ul className="cl-users">
            {data.users.map((u) => (
              <li key={u.id}>
                <Avatar user={u} size={36} />
                <div>
                  <strong>{u.name}</strong>
                  <span>{u.email}</span>
                </div>
                <span className={`status ${u.isActive ? 'on' : 'off'}`}>{u.isActive ? 'Active' : 'Disabled'}</span>
                <span className="muted small">{u.lastLoginAt ? `Last sign-in ${timeAgo(u.lastLoginAt)}` : 'Never signed in'}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {editing && (
        <ClientForm
          client={c}
          onClose={() => setEditing(false)}
          onSaved={(item) => {
            setEditing(false);
            toast(`${item.name} updated`);
            load();
          }}
        />
      )}
      {creating && (
        <NewCampaign
          presetClient={{ _id: c._id, name: c.name }}
          onClose={() => setCreating(false)}
          onCreated={(item, failed) => {
            setCreating(false);
            navigate(`../../campaigns/${item._id}`, {
              state: { toast: failed.length ? `Campaign created — the ${failed.join(' & ')} didn’t upload, try again there` : `${item.name} created for ${c.name}` },
            });
          }}
        />
      )}
      {toastNode}
    </div>
  );
}
