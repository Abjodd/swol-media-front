import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.jsx';
import { AuthProvider } from './context/AuthContext.jsx';
import './fonts.css';
import './styles.css';

// After a new deploy, a tab that was already open may ask for a page file that no longer exists:
// reload once to pick up the new version instead of showing a broken page.
window.addEventListener('vite:preloadError', (e) => {
  e.preventDefault();
  if (sessionStorage.getItem('swol.reloadedFor') === location.pathname) return;
  try {
    sessionStorage.setItem('swol.reloadedFor', location.pathname);
  } catch {
    /* private mode */
  }
  location.reload();
});

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
);
