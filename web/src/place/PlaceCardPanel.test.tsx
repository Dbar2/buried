/** Session 034: the card's two scan buttons, "Show the scan under this building" and "View original scan". */
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeAll, describe, expect, it } from 'vitest';
import { loadData } from '../data/loadData';
import { buildGateModel } from '../explorer/gateModel';
import type { GateModel } from '../explorer/gateModel';
import { diskFetch, REPOSITORY_DATA } from '../explorer/testing/diskFetch';
import { buildPlaceCard } from './placeCard';
import { PlaceCard } from './PlaceCardPanel';

let html: (over: Partial<Parameters<typeof PlaceCard>[0]>) => string;

beforeAll(async () => {
  const model: GateModel = buildGateModel(await loadData(diskFetch(REPOSITORY_DATA)));
  const entry = [...model.lists.values()].flatMap((l) => l.features)[0]!;
  const card = buildPlaceCard(entry, model.features.get(entry.id)!, model.sources, model.tiles);
  html = (over) =>
    renderToStaticMarkup(
      <PlaceCard
        card={card}
        confidence={entry.confidence}
        onClose={() => {}}
        canViewOriginal
        original={false}
        onToggleOriginal={() => {}}
        canShowEvidence
        evidenceShown={false}
        onToggleEvidence={() => {}}
        {...over}
      />,
    );
});

describe('the card scan buttons', () => {
  it('has both, side by side, with the evidence toggle first and not pressed', () => {
    const out = html({});
    expect(out).toMatch(/data-testid="show-evidence"/);
    expect(out).toContain('Show the scan under this building');
    expect(out).toMatch(/aria-pressed="false"[^>]*data-testid="show-evidence"/);
    expect(out.indexOf('show-evidence')).toBeLessThan(out.indexOf('view-original'));
    expect(out).toContain('View original scan');
  });

  it('says in words, not only by style, when the scan is shown', () => {
    const out = html({ evidenceShown: true });
    expect(out).toContain('Hide the scan under this building');
    expect(out).toMatch(/aria-pressed="true"[^>]*data-testid="show-evidence"/);
  });

  it('leaves out the evidence toggle when there is nothing to show, and keeps the other', () => {
    const out = html({ canShowEvidence: false });
    expect(out).not.toContain('show-evidence');
    expect(out).toContain('view-original');
  });

  it('leaves out both when the scene has nothing to switch', () => {
    const out = html({ canShowEvidence: false, canViewOriginal: false });
    expect(out).not.toContain('show-evidence');
    expect(out).not.toContain('view-original');
  });
});
