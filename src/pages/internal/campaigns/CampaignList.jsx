import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { api } from '../../../api.js';
import Icon from '../../../components/Icon.jsx';
import { CAMPAIGN_STATUS, Empty, useToast } from '../../../components/ui.jsx';
import NewCampaign from './NewCampaign.jsx';
import CampaignRow from '../../../components/CampaignRow.jsx';

const FILTERS = [
  ['all', 'All'],
  ['draft', 'Draft'],
  ['sourcing', 'Sourcing'],
  ['internal_review', 'Review'],
  ['client_review', 'With client'],
  ['live', 'Live'],
  ['completed', 'Completed'],
];

export default function CampaignList() {
  const navigate = useNavigate();
  const [items, setItems] = useState(null);
  const [filter, setFilter] = useState('all');
  const [q, setQ] = useState('');
  const [creating, setCreating] = useState(false);
  const [toast, toastNode] = useToast();
  const location = useLocation();

  useEffect(() => {
    api
      .listCampaigns()
      .then((d) => setItems(d.items))
      .catch((e) => toast(e.message, true));
    if (location.state?.toast) {
      toast(location.state.toast);
      navigate(location.pathname, { replace: true, state: null });
    }
  }, []);

  const counts = useMemo(() => {
    const c = { all: items?.length || 0 };
    (items || []).forEach((i) => (c[i.status] = (c[i.status] || 0) + 1));
    return c;
  }, [items]);

  const shown = (items || []).filter(
    (c) =>
      (filter === 'all' || c.status === filter) &&
      `${c.name} ${c.code} ${c.client?.name}`.toLowerCase().includes(q.toLowerCase())
  );

  return (
    <div className="page">
      <div className="page-bar">
        <div className="search-x">
          <Icon name="search" size={18} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search campaigns, codes, clients" />
        </div>
        <button className="btn primary" onClick={() => setCreating(true)}>
          <Icon name="plus" size={18} /> New campaign
        </button>
      </div>
      <div className="seg scroll">
        {FILTERS.map(([k, l]) => (
          <button key={k} className={filter === k ? 'on' : ''} onClick={() => setFilter(k)}>
            {l} <span>{counts[k] || 0}</span>
          </button>
        ))}
      </div>

      {items === null ? (
        <div className="c-rows">
          {[1, 2, 3].map((i) => (
            <div key={i} className="skel" style={{ height: 120 }} />
          ))}
        </div>
      ) : shown.length === 0 ? (
        <Empty
          icon="campaigns"
          title={items.length ? 'No campaigns here' : 'No campaigns yet'}
          text={items.length ? 'Try another filter or search.' : 'Create your first campaign — add the brief, NDA and letter, then assign vendors.'}
          action={
            !items.length && (
              <button className="btn primary" onClick={() => setCreating(true)}>
                <Icon name="plus" size={18} /> New campaign
              </button>
            )
          }
        />
      ) : (
        <div className="c-rows">
          {shown.map((c, i) => (
            <CampaignRow key={c._id} c={c} i={i} to={c._id} />
          ))}
        </div>
      )}

      {creating && (
        <NewCampaign
          onClose={() => setCreating(false)}
          onCreated={(item, failed) => {
            setCreating(false);
            navigate(item._id, {
              state: {
                toast: failed.length ? `Campaign created — the ${failed.join(' & ')} didn’t upload, try again below` : `${item.name} created`,
              },
            });
          }}
        />
      )}
      {toastNode}
    </div>
  );
}

export { CAMPAIGN_STATUS };
