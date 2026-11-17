export function resolveRoute(pathname) {
  const path = pathname.replace(/\/+$/, '') || '/';
  if (path === '/') return { page: 'landing' };
  if (path === '/demo') return { page: 'demo' };
  if (path === '/app') return { page: 'overview' };
  if (path === '/analyses') return { page: 'analyses' };
  const match = path.match(/^\/analyses\/([^/]+)$/);
  if (match) {
    try {
      const analysisId = decodeURIComponent(match[1]);
      if (/^[a-z\d_-]{1,128}$/i.test(analysisId)) return { page: 'review', analysisId };
    } catch {
      /* Invalid URL escapes belong on the not-found page. */
    }
  }
  return { page: 'not-found' };
}
