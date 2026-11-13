import { beforeAll, describe, expect, it } from 'vitest';
import { loadData } from '../data/loadData';
import type { LoadedData } from '../data/loadData';
import { parseFindsFile } from '../evidence';
import { diskFetch, REPOSITORY_DATA } from '../explorer/testing/diskFetch';
import { cropInTile, findBySlug, findForFeature, loadFinds, resolveFinds } from './finds';

let data: LoadedData;
const fetchText = diskFetch(REPOSITORY_DATA, {});

beforeAll(async () => {
  data = await loadData(fetchText);
});

describe('the committed finds file', () => {
  it('validates against the finds Schema and resolves every find on the committed data', async () => {
    const result = await loadFinds(fetchText, data);
    expect(result.problems).toEqual([]);
    expect(result.finds.map((f) => f.find.slug)).toEqual(['overall-factory', 'bank', 'coal-yard', 'machine-shop', 'cork-factory', 'mission-hall']);
  });

  it('opens each find on its earliest plan', async () => {
    const { finds } = await loadFinds(fetchText, data);
    const factory = findBySlug(finds, 'overall-factory')!;
    expect(factory.primary.source.id).toBe('fip_v3_1911_229');
    expect(factory.readings.map((r) => r.source.id)).toEqual(['fip_v3_1911_229', 'fip_v3_1935_229']);
    expect(findForFeature(finds, 'bld_fip_v3_1935_229_0064')).toBe(factory);
    expect(findBySlug(finds, 'no-such-find')).toBeUndefined();
  });

  it('puts every crop inside its tile', async () => {
    const { finds } = await loadFinds(fetchText, data);
    for (const f of finds) {
      for (const r of f.readings) {
        const t = r.tile!;
        const rect = r.tileRect!;
        expect(rect.x, f.find.id).toBeGreaterThanOrEqual(0);
        expect(rect.y).toBeGreaterThanOrEqual(0);
        expect(rect.x + rect.width).toBeLessThanOrEqual(t.width_px);
        expect(rect.y + rect.height).toBeLessThanOrEqual(t.height_px);
      }
    }
  });
});

describe('resolveFinds', () => {
  const file = (override: (f: Record<string, unknown>) => void) => {
    const text = JSON.parse(JSON.stringify(parseFindsFile(JSON.stringify({ schema_version: '1.0.0', finds: [oneFind()] })))) as { finds: Record<string, unknown>[] };
    override(text.finds[0]!);
    return text as unknown as { finds: ReturnType<typeof parseFindsFile>['finds'] };
  };
  const oneFind = () => ({
    id: 'find_0001',
    slug: 'bank',
    kind: 'building',
    order: 1,
    tag: 'Bank',
    noun: 'bank',
    readings: [
      {
        source: 'fip_v3_1911_229',
        feature_id: 'bld_fip_v3_1911_229_0001',
        lettered: ['Bank of Nova Scotia'],
        crop_px: { x: 3640, y: 1288, width: 276, height: 262 },
        read_by: 'A. Reader',
        read_on: '2026-11-13',
      },
    ],
  });

  it('drops a reading whose feature is not published, and the find with it', () => {
    const result = resolveFinds(
      file((f) => {
        ((f.readings as Record<string, unknown>[])[0] as Record<string, unknown>).feature_id = 'bld_fip_v3_1911_229_9999';
      }),
      data,
    );
    expect(result.finds).toEqual([]);
    expect(result.problems.join(' ')).toContain('bld_fip_v3_1911_229_9999');
  });

  it('drops a reading whose feature belongs to another source', () => {
    const result = resolveFinds(
      file((f) => {
        ((f.readings as Record<string, unknown>[])[0] as Record<string, unknown>).source = 'fip_v3_1935_229';
      }),
      data,
    );
    expect(result.finds).toEqual([]);
  });

  it('drops a reading whose crop is outside the tile', () => {
    const result = resolveFinds(
      file((f) => {
        ((f.readings as Record<string, unknown>[])[0] as Record<string, unknown>).crop_px = { x: 0, y: 0, width: 50, height: 50 };
      }),
      data,
    );
    expect(result.finds).toEqual([]);
    expect(result.problems.join(' ')).toContain('crop');
  });

  it('keeps the first of two finds with one slug', () => {
    const a = file(() => {});
    const b = file((f) => {
      f.id = 'find_0002';
      f.order = 2;
    });
    const result = resolveFinds({ finds: [...a.finds, ...b.finds] }, data);
    expect(result.finds.map((f) => f.find.id)).toEqual(['find_0001']);
  });

  it('reports a file that is missing or invalid, and gives no finds', async () => {
    const missing = await loadFinds(async () => {
      throw new Error('finds.json: HTTP 404');
    }, data);
    expect(missing.finds).toEqual([]);
    expect(missing.problems[0]).toContain('404');
    const invalid = await loadFinds(async () => '{"schema_version":"9"}', data);
    expect(invalid.finds).toEqual([]);
    expect(invalid.problems[0]).toContain('Schema');
  });
});

describe('cropInTile', () => {
  const tile = { width_px: 1000, height_px: 500, crop_px: { x: 100, y: 200, width: 2000, height: 1000 } } as never;
  it('scales a crop from source pixels to tile pixels', () => {
    expect(cropInTile({ x: 300, y: 400, width: 200, height: 100 }, tile)).toEqual({ x: 100, y: 100, width: 100, height: 50 });
  });
  it('refuses a crop that leaves the tile area, and a tile with no crop', () => {
    expect(cropInTile({ x: 50, y: 400, width: 200, height: 100 }, tile)).toBeNull();
    expect(cropInTile({ x: 300, y: 400, width: 200, height: 100 }, { width_px: 1, height_px: 1 } as never)).toBeNull();
  });
});
