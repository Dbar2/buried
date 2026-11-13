import { useEffect, useState } from 'react';
import { browserFetchText, loadData } from '../data/loadData';
import { buildGateModel } from '../explorer/gateModel';
import type { GateModel } from '../explorer/gateModel';
import { loadFinds } from './finds';
import type { ResolvedFind } from './finds';
import type { StillAnchor } from './stillAnchors';

export type BlockData = { model: GateModel; finds: ResolvedFind[]; problems: string[] };

export type BlockDataState = { status: 'loading' } | { status: 'error'; message: string } | ({ status: 'ready' } & BlockData);

/** The records and the finds of the first visit, loaded once the page has painted. Canon only: no workspace. */
export function useBlockData(): BlockDataState {
  const [state, setState] = useState<BlockDataState>({ status: 'loading' });
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const data = await loadData(browserFetchText);
      const model = buildGateModel(data);
      const found = await loadFinds(browserFetchText, data);
      return { model, finds: found.finds, problems: [...data.problems, ...found.problems] };
    })()
      .then((loaded) => {
        if (!cancelled) setState({ status: 'ready', ...loaded });
      })
      .catch((error: unknown) => {
        if (!cancelled) setState({ status: 'error', message: error instanceof Error ? error.message : String(error) });
      });
    return () => {
      cancelled = true;
    };
  }, []);
  return state;
}

type RawStill = { anchors?: { feature_id: string; x: number; y: number; on_screen: boolean }[] };

/** `web/public/still/block.json` (the finds' anchors in each Still's image pixels), read into anchors keyed by feature id. Null when it is missing or malformed: no Still, no pinned tags. */
export function parseStillMeta(value: unknown): { wide: Map<string, StillAnchor>; tall: Map<string, StillAnchor> } | null {
  const record = value as { wide?: RawStill; tall?: RawStill } | null;
  if (!record || typeof record !== 'object') return null;
  const read = (raw: RawStill | undefined): Map<string, StillAnchor> | null => {
    if (!raw || !Array.isArray(raw.anchors)) return null;
    const out = new Map<string, StillAnchor>();
    for (const a of raw.anchors) {
      if (typeof a?.feature_id === 'string' && Number.isFinite(a.x) && Number.isFinite(a.y)) out.set(a.feature_id, { id: a.feature_id, x: a.x, y: a.y });
    }
    return out;
  };
  const wide = read(record.wide);
  const tall = read(record.tall);
  return wide && tall ? { wide, tall } : null;
}

export type StillAnchors = NonNullable<ReturnType<typeof parseStillMeta>>;

/** Fetches `/still/block.json`. Null when the Still is not there (the page then shows its plain backdrop). */
export function useStillMeta(): StillAnchors | null {
  const [meta, setMeta] = useState<StillAnchors | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetch('/still/block.json')
      .then((response) => (response.ok ? response.json() : null))
      .then((json) => {
        if (!cancelled) setMeta(parseStillMeta(json));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);
  return meta;
}
