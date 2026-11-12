import { lazy, Suspense } from 'react';
import { Explorer } from './explorer/Explorer';

// The Sources page does not need the Explorer, the bridge or Unity.
const SourcesPage = lazy(() => import('./sources/SourcesPage').then((m) => ({ default: m.SourcesPage })));

/**
 * Routes: `/` is the Explorer, `/sources` the Sources page. The Report route is added by its spec.
 * No router library: a full page load per route is enough for two routes.
 */
export function App() {
  const path = window.location.pathname.replace(/\/+$/, '') || '/';
  if (path === '/sources') {
    return (
      <Suspense fallback={<p className="muted">Loading the Sources page.</p>}>
        <SourcesPage />
      </Suspense>
    );
  }
  return <Explorer />;
}
