// Profile photo, or initials on a gradient when there's no photo yet.
import { withSession } from '../session.js';
export const initialsOf = (name = '') =>
  name
    .split(' ')
    .filter(Boolean)
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase() || '?';

// Stable gradient per person so everyone's initials bubble looks different
const GRADIENTS = [
  ['#1a1a1a', '#0a0a0a'],
  ['#2563ff', '#7aa2ff'],
  ['#1d4ed8', '#38bdf8'],
  ['#4f46e5', '#2563ff'],
  ['#0ea5e9', '#2563ff'],
  ['#1e40af', '#60a5fa'],
];
const pick = (s = '') => GRADIENTS[[...s].reduce((a, c) => a + c.charCodeAt(0), 0) % GRADIENTS.length];

export default function Avatar({ user, size = 40, ring = false, className = '' }) {
  const [a, b] = pick(user?.email || user?.name);
  const style = { width: size, height: size, fontSize: Math.max(11, size * 0.36) };
  return (
    <span className={`avatar-x ${ring ? 'ring' : ''} ${className}`} style={style}>
      {user?.avatarUrl ? (
        <img src={withSession(user.avatarUrl)} alt={user.name} />
      ) : (
        <span className="avatar-initials" style={{ background: `linear-gradient(135deg, ${a}, ${b})` }}>
          {initialsOf(user?.name)}
        </span>
      )}
    </span>
  );
}
