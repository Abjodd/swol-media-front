// Page opener: a quiet breadcrumb, then "Good afternoon, / Name." in large display type —
// each line slides up out of a mask — then one line about today.
const partOfDay = () => {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
};
const today = () => new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' });

export default function Greeting({ name = '', crumbs = [], line }) {
  const first = name.split(' ')[0] || 'there';
  return (
    <section className="greet">
      {crumbs.length > 0 && (
        <p className="greet-crumbs">
          {crumbs.map((c, i) => (
            <span key={i} className={i === 0 ? 'on' : ''}>
              {c}
            </span>
          ))}
        </p>
      )}
      <h1>
        <span className="gr-line">
          <span>{partOfDay()},</span>
        </span>
        <span className="gr-line">
          <span>
            <span className="greet-name">{first}</span>
            <span className="greet-dot">.</span>
          </span>
        </span>
      </h1>
      <p className="greet-line">
        It’s {today()}. {line}
      </p>
    </section>
  );
}
