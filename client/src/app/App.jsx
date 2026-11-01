import { useCallback, useEffect, useState } from 'react';
import DashboardPage from '../features/dashboard/DashboardPage.jsx';

function resolveRoute(pathname) {
  const path = pathname.replace(/\/+$/, '') || '/';
  if (path === '/') return { page: 'overview' };
  if (path === '/analyses') return { page: 'analyses' };
  const match = path.match(/^\/analyses\/([^/]+)$/);
  if (match) {
    try {
      const analysisId = decodeURIComponent(match[1]);
      if (/^[a-z\d_-]{1,128}$/i.test(analysisId)) return { page: 'review', analysisId };
    } catch { /* Invalid URL escapes belong on the not-found page. */ }
  }
  return { page: 'not-found' };
}

function App() {
  const [pathname, setPathname] = useState(() => typeof window === 'undefined' ? '/' : window.location.pathname);
  const navigate = useCallback(path => {
    const destination = new URL(path, window.location.origin);
    if (destination.origin !== window.location.origin) return;
    if (destination.pathname !== window.location.pathname) window.history.pushState(null, '', destination.pathname);
    setPathname(destination.pathname);
  }, []);

  useEffect(() => {
    // Preserve old bookmarks after replacing the one-page anchor navigation.
    if (window.location.pathname === '/' && window.location.hash === '#history') {
      window.history.replaceState(null, '', '/analyses');
      setPathname('/analyses');
    }
    const onPopState = () => setPathname(window.location.pathname);
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  useEffect(() => {
    const page = resolveRoute(pathname).page;
    document.title = `${{ overview: 'New review', analyses: 'Saved analyses', review: 'PR review', 'not-found': 'Page not found' }[page]} · PRism AI`;
    document.querySelector('main h1')?.focus({ preventScroll: true });
    window.scrollTo(0, 0);
  }, [pathname]);

  return <DashboardPage route={resolveRoute(pathname)} onNavigate={navigate} />;
}

export { resolveRoute };
export default App;
