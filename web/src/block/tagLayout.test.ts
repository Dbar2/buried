import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { insideViewport, layoutMarkers, layoutTags, leaderLine, MARKER_LABEL_GAP, rectsOverlap, segmentHitsRect, selectedKeepOut, STRING_OFFSETS } from './tagLayout';
import type { Rect, Size, TagAnchor, TagResult } from './tagLayout';

const rect = fc.record({
  x: fc.integer({ min: -50, max: 1500 }),
  y: fc.integer({ min: -50, max: 900 }),
  w: fc.integer({ min: 1, max: 500 }),
  h: fc.integer({ min: 1, max: 400 }),
});

const anchorsArb = fc.array(
  fc.record({
    x: fc.integer({ min: -100, max: 1600 }),
    y: fc.integer({ min: -100, max: 1000 }),
    onScreen: fc.boolean(),
    size: fc.record({ w: fc.integer({ min: 40, max: 220 }), h: fc.constant(44) }),
  }),
  { minLength: 1, maxLength: 8 },
);

describe('tagLayout', () => {
  const viewport: Size = { w: 1440, h: 800 };

  it('keeps pinned tags off the selected find and the start of its leader line', () => {
    const selected = { x: 700, y: 400, onScreen: true };
    const card: Rect = { x: 1056, y: 72, w: 360, h: 740 };
    const leader = leaderLine({ anchor: selected, card, titleY: 172, phone: false });
    expect(leader).not.toBeNull();
    // A neighbour whose first free spot, with nothing protected, is right on the selected find's volume.
    const anchors: TagAnchor[] = [{ id: 'near', x: 700, y: 480, onScreen: true }];
    const sizes = new Map([['near', { w: 120, h: 44 }]]);
    const before = layoutTags({ anchors, sizes, viewport, keepOut: [] })[0]!;
    expect(before.placement).not.toBe('hidden');
    if (before.placement !== 'hidden') expect(rectsOverlap(before.placement.rect, { x: 664, y: 364, w: 72, h: 72 })).toBe(true);
    const after = layoutTags({ anchors, sizes, viewport, keepOut: selectedKeepOut(selected, leader) })[0]!;
    if (after.placement !== 'hidden') {
      for (const k of selectedKeepOut(selected, leader)) expect(rectsOverlap(after.placement.rect, k)).toBe(false);
    }
  });

  it('property: no pinned tag meets the selected anchor or the first 120 px of the leader line', () => {
    fc.assert(
      fc.property(
        anchorsArb,
        fc.record({ x: fc.integer({ min: 40, max: 1000 }), y: fc.integer({ min: 100, max: 760 }) }),
        (tags, at) => {
          const selected = { ...at, onScreen: true };
          const card: Rect = { x: 1056, y: 72, w: 360, h: 740 };
          const leader = leaderLine({ anchor: selected, card, titleY: 172, phone: false });
          const keepOut = selectedKeepOut(selected, leader);
          const anchors: TagAnchor[] = tags.map((t, i) => ({ id: `t${i}`, x: t.x, y: t.y, onScreen: t.onScreen }));
          const sizes = new Map(tags.map((t, i) => [`t${i}`, t.size]));
          const placed = layoutTags({ anchors, sizes, viewport, keepOut });
          for (const r of placed) {
            if (r.placement === 'hidden') continue;
            expect(rectsOverlap(r.placement.rect, { x: selected.x - 36, y: selected.y - 36, w: 72, h: 72 })).toBe(false);
            if (!leader) continue;
            const length = Math.hypot(leader.x2 - leader.x1, leader.y2 - leader.y1);
            for (let d = 0; d <= Math.min(120, length); d += 1) {
              const px = leader.x1 + ((leader.x2 - leader.x1) * d) / length;
              const py = leader.y1 + ((leader.y2 - leader.y1) * d) / length;
              const hit = px > r.placement.rect.x && px < r.placement.rect.x + r.placement.rect.w && py > r.placement.rect.y && py < r.placement.rect.y + r.placement.rect.h;
              expect(hit, `tag ${r.id} covers the leader line ${d} px from its start`).toBe(false);
            }
          }
        },
      ),
    );
  });

  it('protects nothing when no find is selected or its anchor is off screen', () => {
    expect(selectedKeepOut(null, null)).toEqual([]);
    expect(selectedKeepOut({ x: 10, y: 10, onScreen: false }, null)).toEqual([]);
  });

  it('puts a tag above its anchor on a 40 px string when the spot is free', () => {
    const [result] = layoutTags({
      anchors: [{ id: 'a', x: 700, y: 400, onScreen: true }],
      sizes: new Map([['a', { w: 120, h: 44 }]]),
      viewport,
      keepOut: [],
    }) as [TagResult];
    expect(result.placement).toMatchObject({ side: 'above', offset: 40, rect: { x: 640, y: 316, w: 120, h: 44 } });
    if (result.placement !== 'hidden') expect(result.placement.string).toEqual({ x1: 700, y1: 400, x2: 700, y2: 360 });
  });

  it('steps up the string, then left, then right, around a keep-out', () => {
    const sizes = new Map([['a', { w: 120, h: 44 }]]);
    const anchors: TagAnchor[] = [{ id: 'a', x: 700, y: 400, onScreen: true }];
    // A keep-out above the anchor: a tag above it would need a string through the block, so the tag goes to the side.
    const above = layoutTags({ anchors, sizes, viewport, keepOut: [{ x: 600, y: 250, w: 200, h: 100 }] });
    expect(above[0]?.placement).toMatchObject({ side: 'left', offset: 40 });
    // A string may be longer when the way up is clear: the block is beside the string, not on it.
    const longer = layoutTags({ anchors, sizes, viewport, keepOut: [{ x: 600, y: 300, w: 80, h: 100 }] });
    expect(longer[0]?.placement).toMatchObject({ side: 'above' });
    // A band across the whole width forces left.
    const left = layoutTags({ anchors, sizes, viewport, keepOut: [{ x: 0, y: 0, w: 1440, h: 370 }] });
    expect(left[0]?.placement).toMatchObject({ side: 'left', offset: 40 });
    // And a block that also covers the left side forces right.
    const right = layoutTags({ anchors, sizes, viewport, keepOut: [{ x: 0, y: 0, w: 1440, h: 370 }, { x: 0, y: 370, w: 690, h: 60 }] });
    expect(right[0]?.placement).toMatchObject({ side: 'right', offset: 40 });
  });

  it('hides a tag with no spot, an off-screen anchor, no size, or the selected find', () => {
    const sizes = new Map([['a', { w: 120, h: 44 }], ['b', { w: 120, h: 44 }], ['c', { w: 120, h: 44 }]]);
    const results = layoutTags({
      anchors: [
        { id: 'a', x: 700, y: 400, onScreen: false },
        { id: 'b', x: 700, y: 400, onScreen: true },
        { id: 'c', x: 700, y: 400, onScreen: true },
        { id: 'd', x: 700, y: 400, onScreen: true },
      ],
      sizes,
      viewport,
      keepOut: [],
      selectedId: 'b',
    });
    expect(results.map((r) => r.placement === 'hidden')).toEqual([true, true, false, true]);
    const blocked = layoutTags({ anchors: [{ id: 'c', x: 700, y: 400, onScreen: true }], sizes, viewport, keepOut: [{ x: 0, y: 0, w: 1440, h: 800 }] });
    expect(blocked[0]?.placement).toBe('hidden');
  });

  it('treats touching edges as not overlapping', () => {
    expect(rectsOverlap({ x: 0, y: 0, w: 10, h: 10 }, { x: 10, y: 0, w: 10, h: 10 })).toBe(false);
    expect(rectsOverlap({ x: 0, y: 0, w: 10, h: 10 }, { x: 9, y: 0, w: 10, h: 10 })).toBe(true);
  });

  // P2
  it('P2: no visible tag intersects the card, another keep-out, another visible tag, or the edge of the viewport', () => {
    fc.assert(
      fc.property(
        anchorsArb,
        fc.array(rect, { maxLength: 5 }),
        rect,
        fc.record({ w: fc.integer({ min: 320, max: 1920 }), h: fc.integer({ min: 480, max: 1080 }) }),
        (items, keepOuts, card, vp) => {
          const anchors = items.map((a, i) => ({ id: `t${i}`, x: a.x, y: a.y, onScreen: a.onScreen }));
          const sizes = new Map(items.map((a, i) => [`t${i}`, a.size] as const));
          const keepOut: Rect[] = [...keepOuts, card];
          const results = layoutTags({ anchors, sizes, viewport: vp, keepOut });
          const visible = results.flatMap((r) => (r.placement === 'hidden' ? [] : [r.placement]));
          visible.forEach((p, i) => {
            expect(insideViewport(p.rect, vp)).toBe(true);
            for (const k of keepOut) expect(rectsOverlap(p.rect, k)).toBe(false);
            for (const other of visible.slice(i + 1)) expect(rectsOverlap(p.rect, other.rect)).toBe(false);
            expect(STRING_OFFSETS).toContain(p.offset);
          });
          // An anchor that is not on screen never has a visible tag.
          results.forEach((r, i) => {
            if (!anchors[i]!.onScreen) expect(r.placement).toBe('hidden');
          });
        },
      ),
      { numRuns: 300 },
    );
  });
});

describe('leaderLine', () => {
  const card: Rect = { x: 1080, y: 140, w: 360, h: 600 };
  const anchor = { x: 600, y: 420, onScreen: true };

  it('runs from the anchor to the card edge at the title row', () => {
    expect(leaderLine({ anchor, card, titleY: 200, phone: false })).toEqual({ x1: 600, y1: 420, x2: 1080, y2: 200 });
  });

  it('is hidden on a phone, with no card, off screen, or under the card', () => {
    expect(leaderLine({ anchor, card, titleY: 200, phone: true })).toBeNull();
    expect(leaderLine({ anchor, card: null, titleY: 200, phone: false })).toBeNull();
    expect(leaderLine({ anchor: { ...anchor, onScreen: false }, card, titleY: 200, phone: false })).toBeNull();
    expect(leaderLine({ anchor: { x: 1200, y: 300, onScreen: true }, card, titleY: 200, phone: false })).toBeNull();
  });

  it('clamps the title row into the card and always runs rightward', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 1500 }), fc.integer({ min: 0, max: 900 }), fc.integer({ min: -500, max: 1500 }), (x, y, titleY) => {
        const line = leaderLine({ anchor: { x, y, onScreen: true }, card, titleY, phone: false });
        if (line) {
          expect(line.x1).toBeLessThan(line.x2);
          expect(line.y2).toBeGreaterThanOrEqual(card.y);
          expect(line.y2).toBeLessThanOrEqual(card.y + card.h);
        }
      }),
    );
  });
});

describe('pinned tag strings', () => {
  const viewport: Size = { w: 1440, h: 800 };
  it('property: no placed tag has a string that runs through a keep-out rectangle', () => {
    fc.assert(
      fc.property(anchorsArb, fc.array(rect, { maxLength: 4 }), (tags, keepOut) => {
        const anchors: TagAnchor[] = tags.map((t, i) => ({ id: `t${i}`, x: t.x, y: t.y, onScreen: t.onScreen }));
        const sizes = new Map(tags.map((t, i) => [`t${i}`, t.size] as const));
        for (const r of layoutTags({ anchors, sizes, viewport, keepOut })) {
          if (r.placement === 'hidden') continue;
          for (const k of keepOut) expect(segmentHitsRect(r.placement.string, k)).toBe(false);
        }
      }),
    );
  });

  it('hides a tag whose only way out runs the string through the intro (the phone landing)', () => {
    const intro: Rect = { x: 0, y: 70, w: 390, h: 330 };
    // The anchor is below the intro and its first free spot is above it: the string would cross the headline.
    const anchors: TagAnchor[] = [{ id: 'bank', x: 228, y: 430, onScreen: true }];
    const sizes = new Map([['bank', { w: 80, h: 44 }]]);
    const [result] = layoutTags({ anchors, sizes, viewport: { w: 390, h: 800 }, keepOut: [intro] });
    if (result!.placement !== 'hidden') expect(segmentHitsRect(result!.placement.string, intro)).toBe(false);
  });
});

describe('markers', () => {
  const viewport: Size = { w: 1440, h: 800 };
  const card: Rect = { x: 1056, y: 72, w: 360, h: 740 };

  it('segmentHitsRect agrees with a brute-force walk along the segment', () => {
    fc.assert(
      fc.property(
        fc.record({ x1: fc.integer({ min: 0, max: 400 }), y1: fc.integer({ min: 0, max: 400 }), x2: fc.integer({ min: 0, max: 400 }), y2: fc.integer({ min: 0, max: 400 }) }),
        rect,
        (line, r) => {
          let walked = false;
          for (let i = 0; i <= 4000 && !walked; i++) {
            const t = i / 4000;
            const x = line.x1 + (line.x2 - line.x1) * t;
            const y = line.y1 + (line.y2 - line.y1) * t;
            walked = x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
          }
          // The walk can miss a graze between two samples, never find a hit that is not there.
          if (walked) expect(segmentHitsRect(line, r)).toBe(true);
        },
      ),
    );
  });

  it('property: no marker, and no label where it would show, meets the selected find\'s leader line', () => {
    fc.assert(
      fc.property(
        anchorsArb,
        fc.record({ x: fc.integer({ min: 40, max: 1000 }), y: fc.integer({ min: 100, max: 760 }) }),
        (tags, at) => {
          const selected = { ...at, onScreen: true };
          const leader = leaderLine({ anchor: selected, card, titleY: 172, phone: false });
          const anchors: TagAnchor[] = tags.map((t, i) => ({ id: `t${i}`, x: t.x, y: t.y, onScreen: t.onScreen }));
          const sizes = new Map(tags.map((t, i) => [`t${i}`, t.size] as const));
          const results = layoutMarkers({ anchors, sizes, viewport, keepOut: [card], leader, selectedId: null });
          expect(results.length).toBe(anchors.length);
          for (const r of results) {
            if (r.placement === 'hidden') continue;
            expect(insideViewport(r.placement.hit, viewport)).toBe(true);
            expect(insideViewport(r.placement.label, viewport)).toBe(true);
            expect(rectsOverlap(r.placement.hit, card)).toBe(false);
            if (leader) {
              expect(segmentHitsRect(leader, r.placement.hit)).toBe(false);
              expect(segmentHitsRect(leader, r.placement.label)).toBe(false);
            }
          }
        },
      ),
    );
  });

  it('hides the selected find and an anchor that is off screen, and keeps a clear one with the label beside it', () => {
    const anchors: TagAnchor[] = [
      { id: 'selected', x: 500, y: 400, onScreen: true },
      { id: 'away', x: 300, y: 300, onScreen: false },
      { id: 'clear', x: 300, y: 600, onScreen: true },
    ];
    const sizes = new Map(anchors.map((a) => [a.id, { w: 100, h: 44 }] as const));
    const [selected, away, clear] = layoutMarkers({ anchors, sizes, viewport, keepOut: [], leader: null, selectedId: 'selected' });
    expect(selected!.placement).toBe('hidden');
    expect(away!.placement).toBe('hidden');
    expect(clear!.placement).not.toBe('hidden');
    if (clear!.placement !== 'hidden') {
      expect(clear!.placement.side).toBe('right');
      expect(clear!.placement.label.x).toBe(300 + MARKER_LABEL_GAP);
    }
  });

  it('hides a marker the leader line runs through, and puts a label on the side the line does not cross', () => {
    const leader = { x1: 100, y1: 100, x2: 1000, y2: 100 };
    const on = layoutMarkers({ anchors: [{ id: 'on', x: 500, y: 110, onScreen: true }], sizes: new Map([['on', { w: 100, h: 44 }]]), viewport, keepOut: [], leader, selectedId: null });
    expect(on[0]!.placement).toBe('hidden');
    // 150 px below the line: a label to the right is clear of it.
    const below = layoutMarkers({ anchors: [{ id: 'b', x: 500, y: 250, onScreen: true }], sizes: new Map([['b', { w: 100, h: 44 }]]), viewport, keepOut: [], leader, selectedId: null });
    expect(below[0]!.placement).not.toBe('hidden');
    // 50 px below: the right-hand label (22 px above and below its centre) is clear, but a label above would cross.
    const near = layoutMarkers({ anchors: [{ id: 'n', x: 500, y: 140, onScreen: true }], sizes: new Map([['n', { w: 100, h: 44 }]]), viewport, keepOut: [], leader, selectedId: null });
    if (near[0]!.placement !== 'hidden') expect(segmentHitsRect(leader, near[0]!.placement.label)).toBe(false);
  });
});
