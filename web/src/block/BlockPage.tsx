import { useEffect, useMemo, useState } from 'react';
import { findSlugFor } from '../place/placeLink';
import { hasWebGL2 } from '../explorer/webgl';
import { BlockStage } from './BlockStage';
import type { LotFinder } from './blockModel';
import { useBlockData, useStillMeta } from './useBlockData';
import './block.css';

export { BLOCK_CAPTION, BLOCK_HEADLINE, BLOCK_LINE, NOT_FOUND_NOTICE } from './BlockStage';
export { RAISE_LABEL } from './raiseState';

/**
 * The Block page (`/` and `/find/<slug>`, spec 06): the Still at once, then the Player once the page has painted,
 * with the headline and "Raise the past" over the scene. It reads the records and `data/finds.json`, and hands
 * everything to `BlockStage`, which owns the load states, the tags, the card, the ruler and the Lantern. It shows no
 * search field and none of the Report's wording before a card is open (requirements 1.3, 1.4).
 */
export function BlockPage() {
  const data = useBlockData();
  const still = useStillMeta();
  const [lotFor, setLotFor] = useState<LotFinder | null>(null);
  useEffect(() => {
    // "Full record" needs the geometry library, which comes after first paint.
    let cancelled = false;
    void import('../report/search').then((m) => {
      if (!cancelled) setLotFor(() => m.lotForPoint);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  const routeSlug = useMemo(() => findSlugFor(window.location.pathname), []);
  const webgl2 = useMemo(() => hasWebGL2(), []);
  const reducedMotion = useMemo(() => typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches, []);
  return (
    <BlockStage
      data={data}
      still={still}
      routeSlug={routeSlug}
      siteOrigin={window.location.origin}
      webgl2={webgl2}
      reducedMotion={reducedMotion}
      lotFor={lotFor}
    />
  );
}
