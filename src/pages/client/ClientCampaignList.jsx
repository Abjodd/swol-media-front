import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api.js';
import Icon from '../../components/Icon.jsx';
import { Empty, PLATFORM_LABEL, StatusChip, fmtDate, fmtNum, useToast } from '../../components/ui.jsx';

const DAY = 864e5;
const daysLeft = (d) => (d ? Math.ceil((new Date(d).setHours(23, 59, 59) - Date.now()) / DAY) : null);
const timing = (c) => {
  const now = Date.now();
  if (c.startDate && new Date(c.startDate) > now) {
    const n = Math.ceil((new Date(c.startDate) - now) / DAY);
    return { text: `Starts in ${n} day${n === 1 ? '' : 's'}`, pct: 0 };
  }
  const left = daysLeft(c.endDate);
  if (left === null) return { text: 'Dates to be confirmed', pct: null };
  if (left < 0) return { text: 'Ended', pct: 100 };
  const start = c.startDate ? new Date(c.startDate).getTime() : new Date(c.createdAt).getTime();
  const span = new Date(c.endDate).getTime() - start;
  return { text: left === 0 ? 'Ends today' : `${left} day${left === 1 ? '' : 's'} left`, pct: span > 0 ? Math.min(100, Math.round(((now - start) / span) * 100)) : null, soon: left <= 7 };
};

export default function ClientCampaignList() {
  const [items, setItems] = useState(null);
  const [toast, toastNode] = useToast();

  useEffect(() => {
    api
      .listCampaigns()
      .then((d) => setItems(d.items))
      .catch((e) => toast(e.message, true));
  }, []);


  return (
    <div className="page">
      {items === null ? (
        <div className="cp-grid">
          {[1, 2].map((i) => (
            <div key={i} className="skel" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <Empty icon="campaigns" title="No campaigns yet" text="When Swol Media starts a campaign for you, it shows up here with the creators shortlisted for it." />
      ) : (
        <div className="cp-grid">
          {items.map((c) => {
            const n = c.counts || {};
            const t = timing(c);
            const sel = n.approved || 0;
            return (
              <Link key={c._id} to={c._id} className="cp-card">
                <header>
                  <span className="c-code">{c.code}</span>
                  <StatusChip status={c.status} />
                </header>
                <div>
                  <h3>{c.name}</h3>
                  {c.objective && <p className="cp-obj">{c.objective}</p>}
                  <div className="cp-meta" style={{ marginTop: 8 }}>
                    {c.platforms?.length > 0 && (
                      <span>
                        <Icon name="campaigns" size={15} /> {c.platforms.map((p) => PLATFORM_LABEL[p]).join(', ')}
                      </span>
                    )}
                    {c.deliverables && (
                      <span>
                        <Icon name="file" size={15} /> {c.deliverables}
                      </span>
                    )}
                  </div>
                </div>
                <div className="cp-time">
                  <span>
                    <Icon name="calendar" size={14} /> {c.startDate || c.endDate ? `${c.startDate ? fmtDate(c.startDate) : 'TBC'} – ${c.endDate ? fmtDate(c.endDate) : 'TBC'}` : 'Dates to be confirmed'}
                  </span>
                  <b className={t.soon ? 'is-soon' : ''}>{t.text}</b>
                  {t.pct !== null && (
                    <i title={`${t.pct}% of the campaign time has passed`}>
                      <span style={{ width: `${t.pct}%` }} />
                    </i>
                  )}
                </div>
                <div className="cp-figs">
                  <div>
                    <strong>{fmtNum(c.creatorsNeeded)}</strong>
                    <span>Creators needed</span>
                  </div>
                  <div className="is-waiting">
                    <strong>{fmtNum(n.waiting)}</strong>
                    <span>To review</span>
                  </div>
                  <div className="is-selected">
                    <strong>{fmtNum(n.approved)}</strong>
                    <span>Selected</span>
                  </div>
                </div>
                <div className="cp-sel" title={`${fmtNum(sel)} of ${fmtNum(c.creatorsNeeded)} creators selected`}>
                  <span>
                    Selected <b>{fmtNum(sel)}</b> of {fmtNum(c.creatorsNeeded)}
                  </span>
                  <em>{c.creatorsNeeded ? Math.round((sel / c.creatorsNeeded) * 100) : 0}%</em>
                  <i>
                    <span style={{ width: `${c.creatorsNeeded ? Math.min(100, (sel / c.creatorsNeeded) * 100) : 0}%` }} />
                  </i>
                </div>
                <div className={`cp-cta ${n.waiting ? '' : 'is-clear'}`}>
                  <span>
                    {n.waiting
                      ? `Review ${fmtNum(n.waiting)} shortlisted creator${n.waiting === 1 ? '' : 's'}`
                      : n.saved
                        ? `${fmtNum(n.saved)} saved for later`
                        : 'Nothing to review right now'}
                  </span>
                  <Icon name="arrowRight" size={17} />
                </div>
              </Link>
            );
          })}
        </div>
      )}
      {toastNode}
    </div>
  );
}
