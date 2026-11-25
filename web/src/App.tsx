import { lazy, Suspense } from 'react';
import { routeFor } from './place/placeLink';
import { Header } from './shell/Header';
import { Loading } from './shell/Mark';
import { SetPageTitle } from './shell/SetPageTitle';

// The Explorer is loaded on demand: the lot check pages never pull in the Explorer, the bridge or Unity.
const Explorer = lazy(() => import('./explorer/Explorer').then((m) => ({ default: m.Explorer })));
// The lot check pages (spec 08): the Landing, the Result and the How page load none of the Explorer, the bridge
// or Unity, and create no WebGL context.
const LandingPage = lazy(() => import('./lotcheck/LandingPage').then((m) => ({ default: m.LandingPage })));
const LotPage = lazy(() => import('./lotcheck/LotPage').then((m) => ({ default: m.LotPage })));
const HowPage = lazy(() => import('./lotcheck/HowPage').then((m) => ({ default: m.HowPage })));
// The Block page placeholder does not load the Explorer, the bridge or Unity.
const BlockPage = lazy(() => import('./block/BlockPage').then((m) => ({ default: m.BlockPage })));
// The Sources page does not need the Explorer, the bridge or Unity.
const SourcesPage = lazy(() => import('./sources/SourcesPage').then((m) => ({ default: m.SourcesPage })));
// The Studio is loaded on demand too: the Explorer and the Sources page never pull it in.
const StudioPage = lazy(() => import('./studio/StudioPage').then((m) => ({ default: m.StudioPage })));
// The Report never loads the Explorer, the bridge or Unity.
const ReportRoute = lazy(() => import('./report/ReportRoute').then((m) => ({ default: m.ReportRoute })));

/**
 * Routes (`routeFor`, spec 08 requirement 1.1): `/` is the Landing, `/lot/<id>` and `/place?lot=` the Result,
 * `/how` the How page, `/block` and `/find/<slug>` the Block page, `/explorer` the Explorer on its own (so is
 * `/` with a query, as the Studio's links use), `/studio` the Studio, `/report` the Report (the print and
 * share target), `/sources` the Sources page. `/walk` is parked and not routed. No router library: a full
 * page load per route is enough.
 */
export function App() {
  const route = routeFor(window.location.pathname, window.location.search);
  switch (route) {
    case 'landing':
      return (
        <div className="page lotcheck-page">
          <SetPageTitle page="landing" />
          <Header current="landing" />
          <div className="page-scroll lotcheck-scroll">
            <Suspense fallback={<Loading text="Loading." />}>
              <LandingPage />
            </Suspense>
          </div>
        </div>
      );
    case 'lot':
      return (
        <div className="page lotcheck-page">
          <Header current="lot" />
          <div className="page-scroll lotcheck-scroll">
            <Suspense fallback={<Loading text="Loading the check." />}>
              <LotPage />
            </Suspense>
          </div>
        </div>
      );
    case 'how':
      return (
        <div className="page lotcheck-page">
          <SetPageTitle page="how" />
          <Header current="how" />
          <div className="page-scroll lotcheck-scroll">
            <Suspense fallback={<Loading text="Loading." />}>
              <HowPage />
            </Suspense>
          </div>
        </div>
      );
    case 'block':
      return (
        <div className="page">
          <Header current="block" />
          <Suspense fallback={<Loading text="Loading." />}>
            <BlockPage />
          </Suspense>
        </div>
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
          <SetPageTitle page="studio" />
          <Header current="studio" />
          <Suspense fallback={<Loading text="Loading the Studio." />}>
            <StudioPage />
          </Suspense>
        </div>
      );
    case 'sources':
      return (
        <div className="page">
          <SetPageTitle page="sources" />
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
          <SetPageTitle page="explorer" />
          <Header current="explorer" />
          <Suspense fallback={<Loading text="Loading." />}>
            <Explorer />
          </Suspense>
        </div>
      );
  }
}
