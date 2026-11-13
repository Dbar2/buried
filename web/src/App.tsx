import { lazy, Suspense } from 'react';
import { Explorer } from './explorer/Explorer';
import { routeFor } from './place/placeLink';
import { Header } from './shell/Header';
import { Loading } from './shell/Mark';

// The landing and the place page load the Explorer's scene; the Sources page does not.
const Landing = lazy(() => import('./place/Landing').then((m) => ({ default: m.Landing })));
const PlacePage = lazy(() => import('./place/PlacePage').then((m) => ({ default: m.PlacePage })));
// The Sources page does not need the Explorer, the bridge or Unity.
const SourcesPage = lazy(() => import('./sources/SourcesPage').then((m) => ({ default: m.SourcesPage })));
// The Studio is loaded on demand too: the Explorer and the Sources page never pull it in.
const StudioPage = lazy(() => import('./studio/StudioPage').then((m) => ({ default: m.StudioPage })));
// The Report never loads the Explorer, the bridge or Unity.
const ReportRoute = lazy(() => import('./report/ReportRoute').then((m) => ({ default: m.ReportRoute })));

/**
 * Routes: `/` is the landing (search first), `/place` the place page (the dig and the report on one
 * screen), `/explorer` the Explorer on its own (so is `/` with a query, as the Studio's links use),
 * `/studio` the Studio, `/report` the Report (the print and share target), `/sources` the Sources
 * page. No router library: a full page load per route is enough.
 */
export function App() {
  const route = routeFor(window.location.pathname, window.location.search);
  switch (route) {
    case 'landing':
      return (
        <Suspense fallback={<Loading text="Loading." />}>
          <Landing />
        </Suspense>
      );
    case 'place':
      return (
        <Suspense fallback={<Loading text="Loading the place." />}>
          <PlacePage />
        </Suspense>
      );
    case 'report':
      return (
        <div className="page">
          <Header current="report" />
          <div className="page-scroll report-scroll">
            <Suspense fallback={<Loading text="Loading the Report." />}>
              <ReportRoute />
            </Suspense>
          </div>
        </div>
      );
    case 'studio':
      return (
        <div className="page">
          <Header current="studio" />
          <Suspense fallback={<Loading text="Loading the Studio." />}>
            <StudioPage />
          </Suspense>
        </div>
      );
    case 'sources':
      return (
        <div className="page">
          <Header current="sources" />
          <div className="page-scroll sources-scroll">
            <Suspense fallback={<Loading text="Loading the Sources page." />}>
              <SourcesPage />
            </Suspense>
          </div>
        </div>
      );
    default:
      return (
        <div className="page">
          <Header current="explorer" />
          <Explorer />
        </div>
      );
  }
}
