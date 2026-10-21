import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api.js';
import Icon from '../../components/Icon.jsx';
import CreatorForm from '../../components/CreatorForm.jsx';
import { CreatorPhoto, FetchingTag, Shimmer, Verified, isFetching } from '../../components/SwipeDeck.jsx';
import { Empty, PLATFORM_LABEL, SUB_STATUS, fmtCompact, fmtINR, fmtNum, useShowMore, useToast } from '../../components/ui.jsx';

// The creator database — every profile added to any campaign, by vendors or by our team.
export default function Creators() {
  const [data, setData] = useState(null);
  const [q, setQ] = useState('');
  const [platform, setPlatform] = useState('');
  const [editing, setEditing] = useState(null);
  const [ig, setIg] = useState(null); // HikerAPI status: { enabled, queued } — new creators are fetched once, in the background

  useEffect(() => {
    api.instagramStatus().then(setIg).catch(() => {});
  }, []);
  // while lookups run in the background, refresh the list every few seconds
  useEffect(() => {
    if (!ig?.queued) return undefined;
    const t = setInterval(() => {
      if (document.hidden) return; // nobody is looking — check again next time
      api.instagramStatus().then(setIg).catch(() => {});
      api.listCreators({ q, platform }).then(setData).catch(() => {});
    }, 6000);
    return () => clearInterval(t);
  }, [ig?.queued, q, platform]);

  const [toast, toastNode] = useToast();
  // draw 60 rows, more as you scroll
  const [rows, moreRows] = useShowMore(data?.items || [], { resetKey: `${q}|${platform}` });

  useEffect(() => {
    const t = setTimeout(() => {
      api
        .listCreators({ q, platform })
        .then(setData)
        .catch((e) => toast(e.message, true));
    }, 220);
    return () => clearTimeout(t);
  }, [q, platform]);

  return (
    <div className="page">
      <div className="page-bar">
        <div className="search-x">
          <Icon name="search" size={18} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, handle or city" />
        </div>
        <select className="cr-platform" value={platform} onChange={(e) => setPlatform(e.target.value)} aria-label="Platform">
          <option value="">All platforms</option>
          {Object.entries(PLATFORM_LABEL).map(([k, l]) => (
            <option key={k} value={k}>
              {l}
            </option>
          ))}
        </select>
      </div>

      {data === null ? (
        <div className="skel" style={{ height: 300 }} />
      ) : data.items.length === 0 ? (
        <Empty
          icon="creators"
          title={q || platform ? 'No creators match' : 'No creators yet'}
          text={q || platform ? 'Try another search.' : 'Creators appear here as soon as they are added to a campaign — by a vendor or by your team.'}
        />
      ) : (
        <section className="card cs">
          <p className="cs-count">
            {fmtNum(data.total)} creator{data.total === 1 ? '' : 's'} in the database
          </p>
          <div className="cs-scroll">
          <div
            className="cs-table cr-table cs-wide"
            role="table"
            style={{ '--cols': 'minmax(210px, 1.6fr) 84px 100px 110px minmax(120px, 1fr) minmax(90px, 0.8fr) minmax(90px, 0.8fr) minmax(100px, 0.9fr) minmax(96px, 0.9fr) minmax(190px, 1.5fr) 44px' }}
          >
            <div className="cs-row cs-head" role="row">
              <span>Name / username</span>
              <span>Followers</span>
              <span>Cost</span>
              <span>Price</span>
              <span>Vendor</span>
              <span>State</span>
              <span>City</span>
              <span>District</span>
              <span>Genre</span>
              <span>Campaigns</span>
              <span />
            </div>
            {rows.map((c) => (
              <div key={c._id} className="cs-row" role="row">
                <div className="cs-who">
                  <CreatorPhoto creator={c} className="cs-av" />
                  <div>
                    {c.profileUrl ? (
                      <a href={c.profileUrl} target="_blank" rel="noreferrer" className="cs-link" title={`Open ${PLATFORM_LABEL[c.platform]} profile`}>
                        <strong>
                          {c.name || `@${c.handle}`} <Verified k={c} />
                        </strong>
                        <span className="cs-handle">@{c.handle}</span>
                      </a>
                    ) : (
                      <>
                        <strong>{c.name || `@${c.handle}`}</strong>
                        <span>@{c.handle}</span>
                      </>
                    )}
                    {isFetching(c) ? <FetchingTag k={c} /> : <span className="cs-plat">{PLATFORM_LABEL[c.platform]}</span>}
                  </div>
                </div>
                <span className="cs-cell" data-label="Followers">
                  {!c.followers && isFetching(c) ? <Shimmer w={44} /> : fmtCompact(c.followers)}
                </span>
                <span className="cs-cell" data-label="Cost">
                  <b className="cr-v" title={c.commercial || ''}>{fmtINR(c.rate?.amount)}</b>
                </span>
                <span className="cs-cell" data-label="Price">
                  {(() => {
                    const last = [...c.campaigns].sort((a, b) => new Date(b.at) - new Date(a.at)).find((x) => x.clientCost);
                    return last ? (
                      <>
                        <b className="cr-v cr-client">{fmtINR(last.clientCost)}</b>
                        <small>{last.code}</small>
                      </>
                    ) : (
                      '—'
                    );
                  })()}
                </span>
                <span className="cs-cell" data-label="Vendor">
                  {c.sourcedBy?.name || <em>Swol Media</em>}
                </span>
                <span className="cs-cell" data-label="State">
                  {c.state || '—'}
                </span>
                <span className="cs-cell" data-label="City">
                  {c.city || '—'}
                </span>
                <span className="cs-cell" data-label="District">
                  {c.district || '—'}
                </span>
                <span className="cs-cell cs-genre" data-label="Genre">
                  {c.categories?.length ? c.categories.join(', ') : '—'}
                </span>
                <span className="cs-cell cr-camps" data-label="Campaigns">
                  {c.campaigns.length
                    ? c.campaigns.map((x) => (
                        <Link key={x._id} to={`../campaigns/${x._id}`} title={`${x.name} — ${SUB_STATUS[x.status]}${x.vendorCost ? ` · cost ${fmtINR(x.vendorCost)}` : ''}${x.clientCost ? ` · client cost ${fmtINR(x.clientCost)}` : ''}`}>
                          {x.code} <small>{SUB_STATUS[x.status]}</small>
                        </Link>
                      ))
                    : '—'}
                </span>
                <span className="cs-act">
                  <button type="button" className="icon-btn" onClick={() => setEditing(c)} title="Edit details and stats" aria-label="Edit creator">
                    <Icon name="edit" size={15} />
                  </button>
                </span>
              </div>
            ))}
          </div>
          </div>
          {moreRows}
        </section>
      )}
      {editing && (
        <CreatorForm
          creator={editing}
          onClose={() => setEditing(null)}
          onFetched={(item) => setData((d) => ({ ...d, items: d.items.map((x) => (x._id === item._id ? { ...x, ...item, sourcedBy: x.sourcedBy, campaigns: x.campaigns } : x)) }))}
          onSaved={(item) => {
            setEditing(null);
            setData((d) => ({ ...d, items: d.items.map((x) => (x._id === item._id ? { ...x, ...item, sourcedBy: x.sourcedBy, campaigns: x.campaigns } : x)) }));
            toast(`${item.name || '@' + item.handle} updated`);
          }}
        />
      )}
      {toastNode}
    </div>
  );
}
