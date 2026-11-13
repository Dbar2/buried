import { lazy, Suspense } from 'react';
import { Explorer } from './explorer/Explorer';
import { Header } from './shell/Header';

// The Sources page does not need the Explorer, the bridge or Unity.
const SourcesPage = lazy(() => import('./sources/SourcesPage').then((m) => ({ default: m.SourcesPage })));
// The Studio is loaded on demand too: the Explorer and the Sources page never pull it in.
const StudioPage = lazy(() => import('./studio/StudioPage').then((m) => ({ default: m.StudioPage })));
// The Report never loads the Explorer, the bridge or Unity.
const ReportRoute = lazy(() => import('./report/ReportRoute').then((m) => ({ default: m.ReportRoute })));

/**
 * Routes: `/` is the Explorer, `/studio` the Studio, `/report` the Report, `/sources` the Sources
 * page. No router library: a full page load per route is enough.
 */
export function App() {
  const path = window.location.pathname.replace(/\/+$/, '') || '/';
  if (path === '/report') {
    return (
      <div className="page">
        <Header current="report" />
        <div className="page-scroll report-scroll">
          <Suspense fallback={<p>Loading the Report.</p>}>
            <ReportRoute />
          </Suspense>
        </div>
      </div>
    );
  }
  if (path === '/studio') {
    return (
      <div className="page">
        <Header current="studio" />
        <Suspense fallback={<p className="muted">Loading the Studio.</p>}>
          <StudioPage />
        </Suspense>
      </div>
    );
  }
  if (path === '/sources') {
    return (
      <div className="page">
        <Header current="sources" />
        <div className="page-scroll">
          <Suspense fallback={<p className="muted">Loading the Sources page.</p>}>
            <SourcesPage />
          </Suspense>
        </div>
      </div>
    );
  }
  return (
    <div className="page">
      <Header current="explorer" />
      <Explorer />
    </div>
  );
}
