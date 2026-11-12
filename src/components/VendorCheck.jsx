import Icon from './Icon.jsx';

// "Did you mean…?" — vendor names in a sheet that look like a vendor we already have ("abjod d" next to "abjod").
// The team picks, for each one, the existing vendor or "a new vendor". Used before an upload and before "Update from sheet".
//
// checkVendors(api, names) → [{ name, similar: [{ _id, name }] }] for the names that need an answer (exact matches and
// brand-new names don't). The answers live in `choice` = { [sheetName]: existingName | '' (new) }.
export async function checkVendors(api, names) {
  const list = [...new Set(names.map((n) => String(n || '').trim().replace(/\s+/g, ' ')).filter(Boolean))];
  if (!list.length) return [];
  const d = await api.matchVendors(list);
  return (d.items || []).filter((x) => !x.exact && x.similar?.length);
}

// apply the answers: rewrite each answered name to the vendor picked; the ones kept as new are sent as "confirmed"
export function applyVendorChoices(questions, choice) {
  const alias = {};
  const confirmed = [];
  for (const q of questions) {
    const pick = choice[q.name];
    if (pick) alias[q.name.toLowerCase()] = pick;
    else confirmed.push(q.name);
  }
  const rename = (v) => {
    const k = String(v || '').trim().replace(/\s+/g, ' ').toLowerCase();
    return alias[k] || v;
  };
  return { rename, confirmed };
}

export default function VendorCheck({ questions, choice, setChoice }) {
  if (!questions.length) return null;
  const left = questions.filter((q) => choice[q.name] === undefined).length;
  return (
    <section className="vq" aria-label="Vendor names to check">
      <header>
        <span className="vq-ic">
          <Icon name="vendors" size={16} />
        </span>
        <div>
          <strong>
            {questions.length === 1 ? 'Is this the same vendor?' : `Are these the same vendors? (${questions.length})`}
          </strong>
          <p>These names in the sheet look like vendors you already have. Pick the vendor they mean, or keep them as new vendors.</p>
        </div>
      </header>
      {questions.map((q) => (
        <div key={q.name} className="vq-row" role="radiogroup" aria-label={`Vendor “${q.name}”`}>
          <p>
            Sheet says <b>“{q.name}”</b>
          </p>
          <div className="vq-opts">
            {q.similar.map((v) => (
              <button key={v._id} type="button" role="radio" aria-checked={choice[q.name] === v.name} className={choice[q.name] === v.name ? 'on' : ''} onClick={() => setChoice({ ...choice, [q.name]: v.name })}>
                <Icon name="check" size={13} /> Same as “{v.name}”
              </button>
            ))}
            <button type="button" role="radio" aria-checked={choice[q.name] === ''} className={choice[q.name] === '' ? 'on new' : 'new'} onClick={() => setChoice({ ...choice, [q.name]: '' })}>
              <Icon name="plus" size={13} /> New vendor “{q.name}”
            </button>
          </div>
        </div>
      ))}
      {left > 0 && <small className="vq-left">Answer {left === 1 ? 'this one' : `these ${left}`} to continue.</small>}
    </section>
  );
}
