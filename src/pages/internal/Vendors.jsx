import { useEffect, useMemo, useState } from 'react';
import { api } from '../../api.js';
import Icon from '../../components/Icon.jsx';
import VendorForm from '../../components/VendorForm.jsx';
import { Empty, Num, fmtNum, useToast } from '../../components/ui.jsx';

export default function Vendors() {
  const [items, setItems] = useState(null);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('active');
  const [editing, setEditing] = useState(null); // vendor object, {} for new, null closed
  const [toast, toastNode] = useToast();

  const load = () =>
    api
      .listVendors()
      .then((d) => setItems(d.items))
      .catch((e) => toast(e.message, true));
  useEffect(() => {
    load();
  }, []);

  const shown = useMemo(
    () =>
      (items || []).filter(
        (v) =>
          (status === 'all' || v.status === status) &&
          `${v.name} ${v.contact?.name} ${v.contact?.email} ${v.city}`.toLowerCase().includes(q.toLowerCase())
      ),
    [items, q, status]
  );
  const counts = useMemo(() => {
    const c = { all: items?.length || 0, active: 0, inactive: 0 };
    (items || []).forEach((v) => (c[v.status] = (c[v.status] || 0) + 1));
    return c;
  }, [items]);

  const openEdit = async (v) => {
    // fetch the full record (includes bank details for internal users)
    try {
      const d = await api.getVendor(v._id);
      setEditing(d.item);
    } catch (e) {
      toast(e.message, true);
    }
  };

  return (
    <div className="page">
      <div className="page-bar">
        <div className="search-x">
          <Icon name="search" size={18} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search vendors, contacts, cities" />
        </div>
        <div className="seg">
          {['active', 'inactive', 'all'].map((s) => (
            <button key={s} className={status === s ? 'on' : ''} onClick={() => setStatus(s)}>
              {s[0].toUpperCase() + s.slice(1)} <span>{counts[s] || 0}</span>
            </button>
          ))}
        </div>
        <button className="btn primary" onClick={() => setEditing({})}>
          <Icon name="plus" size={18} /> Add vendor
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
          icon="vendors"
          title={items.length ? 'No vendors match' : 'No vendors yet'}
          text={items.length ? 'Try a different search or filter.' : 'Add your first vendor partner — their contact, tax and bank details live here.'}
          action={
            !items.length && (
              <button className="btn primary" onClick={() => setEditing({})}>
                <Icon name="plus" size={18} /> Add vendor
              </button>
            )
          }
        />
      ) : (
        <div className="v-grid">
          {shown.map((v) => (
            <article key={v._id} className="v-card" onClick={() => openEdit(v)} tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && openEdit(v)}>
              <header>
                <span className="v-mono">{v.name.slice(0, 2).toUpperCase()}</span>
                <div className="v-title">
                  <h3>{v.name}</h3>
                  <span>
                    {v.contact?.name || 'No contact yet'}
                    {v.city ? `, ${v.city}` : ''}
                  </span>
                </div>
                {v.status === 'inactive' && <em className="v-off">Inactive</em>}
                <Icon name="edit" size={16} className="v-edit" />
              </header>

              <div className="v-score">
                <div className="v-big">
                  <strong><Num value={v.selected} /></strong>
                  <span>
                    creator{v.selected === 1 ? '' : 's'} selected
                    <br />
                    out of {fmtNum(v.given)} given
                  </span>
                </div>
                <div className="v-ring" style={{ '--p': v.given ? v.selected / v.given : 0 }} title="Selection rate">
                  <b>{v.given ? Math.round((v.selected / v.given) * 100) : 0}%</b>
                </div>
              </div>

              {v.byCampaign?.length ? (
                <ul className="v-camps">
                  {v.byCampaign.slice(0, 4).map((c) => (
                    <li key={c._id}>
                      <span className="v-camp-name">
                        <em>{c.code}</em>
                        {c.name}
                      </span>
                      <span className="v-camp-fig">
                        <b>{fmtNum(c.selected)}</b>/{fmtNum(c.given)}
                      </span>
                      <i style={{ '--w': `${c.given ? (c.selected / c.given) * 100 : 0}%` }} />
                    </li>
                  ))}
                  {v.byCampaign.length > 4 && <li className="v-more">+{v.byCampaign.length - 4} more campaigns</li>}
                </ul>
              ) : (
                <p className="v-none">{v.campaigns ? `On ${fmtNum(v.campaigns)} campaign${v.campaigns === 1 ? '' : 's'} — no creators given yet` : 'Not on any campaign yet'}</p>
              )}
            </article>
          ))}
        </div>
      )}

      {editing && (
        <VendorForm
          vendor={editing}
          onClose={() => setEditing(null)}
          onSaved={(item, wasEdit) => {
            setEditing(null);
            toast(wasEdit ? `${item.name} updated` : `${item.name} added`);
            load();
          }}
        />
      )}
      {toastNode}
    </div>
  );
}
