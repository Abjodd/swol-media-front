import Icon from './Icon.jsx';

// Placeholder for sections that ship in a later phase.
export default function WorkInProgress({ title, text, icon = 'rocket' }) {
  return (
    <section className="wip-x">
      <div className="wip-icon-x">
        <Icon name={icon} size={38} stroke={1.6} />
      </div>
      <span className="wip-badge-x">
        In development
      </span>
      <h2>{title}</h2>
      <p>{text || `This section is under development and will be available in an upcoming release.`}</p>
      <div className="wip-steps">
        <span className="done">
          <Icon name="check" size={14} /> Accounts &amp; access
        </span>
        <span className="now">
          <Icon name="sparkles" size={14} /> {title}
        </span>
      </div>
    </section>
  );
}
