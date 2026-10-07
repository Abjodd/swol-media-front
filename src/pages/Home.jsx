import { useCallback, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import IntroAnimation from '../components/IntroAnimation.jsx';
import '../home.css';

// Public landing page: the intro animation, and a quiet "Sign in →" in the top-right corner.
export default function Home() {
  const { user } = useAuth();
  const [settled, setSettled] = useState(false);
  const onSettled = useCallback(() => setSettled(true), []);

  return (
    <main className="intro">
      <IntroAnimation onSettled={onSettled} />
      <Link to={user ? '/dashboard' : '/login'} className={`intro-signin ${settled ? 'show' : ''}`}>
        {user ? 'Dashboard' : 'Sign in'}
        <svg width="26" height="10" viewBox="0 0 26 10" aria-hidden="true">
          <path d="M0 5h24M20 1l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.2" />
        </svg>
      </Link>
    </main>
  );
}
