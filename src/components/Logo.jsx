// The small logo used in headers, the login page and dashboard sidebars.
// Files live in client/public/brand/ (ring.png + arm.png power the big animated homepage logo).
export const LOGO_SRC = '/brand/logo-mark.png';

export default function Logo({ variant = 'light', showText = true, size = 42 }) {
  return (
    <span className={`logo logo-${variant}`}>
      <img className="logo-img" src={LOGO_SRC} alt="Swol Media" style={{ height: size, width: size }} />
      {showText && <span className="brand-name">Swol Media</span>}
    </span>
  );
}
