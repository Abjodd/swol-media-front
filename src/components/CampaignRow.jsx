import { Link } from 'react-router-dom';
import Icon from './Icon.jsx';
import { MiniPipeline } from './Pipeline.jsx';
import { StatusChip, fmtDate } from './ui.jsx';

// One campaign in a list: name, client, dates, paperwork, and its 4-stage pipeline.
export default function CampaignRow({ c, i = 0, to, hideClient }) {
  const docs = c.documents || [];
  const has = (k) => docs.some((d) => d.kind === k);
  return (
    <Link to={to} className="c-row" style={{ '--i': i }}>
      <div className="c-row-main">
        <div className="c-row-tags">
          <span className="c-code">{c.code}</span>
          <StatusChip status={c.status} />
        </div>
        <h3>{c.name}</h3>
        <p className="c-client">
          {!hideClient && (
            <>
              <Icon name="building" size={14} /> {c.client?.name}
              <span className="dot">·</span>
            </>
          )}
          <Icon name="calendar" size={14} /> {c.endDate ? `Ends ${fmtDate(c.endDate)}` : 'No end date'}
        </p>
        <div className="c-flags">
          {[['NDA', has('nda')], ['Letter', has('letter')], ['Brief', Boolean(c.brief)]].map(([l, ok]) => (
            <span key={l} className={ok ? 'ok' : ''}>
              <Icon name={ok ? 'check' : 'close'} size={12} /> {l}
            </span>
          ))}
        </div>
      </div>
      {c.pipeline && <MiniPipeline p={c.pipeline} />}
      <Icon name="arrowRight" size={18} className="c-go" />
    </Link>
  );
}
