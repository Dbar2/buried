import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseContract } from '../evidence';
import type { ControlPoint, ControlPoints } from '../evidence';
import { pickGateMarkers } from './gateMarkers';
import { REPOSITORY_DATA } from './testing/diskFetch';

function point(id: string, feature: string, e: number, n: number): ControlPoint {
  return {
    id,
    description: 'Synthetic.',
    pixel: [1, 1],
    reference: [e, n],
    reference_source: 'present_toronto_intersections_2026',
    reference_kind: 'intersection',
    reference_feature_id: feature,
  };
}

function file(source: string, points: ControlPoint[]): ControlPoints {
  return {
    schema_version: '1.0.0',
    source,
    pixel_convention: 'gdal_corner',
    points: points as ControlPoints['points'],
  };
}

describe('pickGateMarkers', () => {
  const first = file('fip_v3_1911_229', [
    point('cp_a', 'A', 632001.5, 4835001.5),
    point('cp_b', 'B', 632002.5, 4835002.5),
    point('cp_c', 'C', 632003.5, 4835003.5),
    point('cp_d', 'D', 632004.5, 4835004.5),
    point('cp_e', 'E', 632005.5, 4835005.5),
  ]);

  it('takes the first three intersections that are on both plates', () => {
    const second = file('fip_v3_1935_229', [
      point('cp_x', 'E', 1, 1),
      point('cp_y', 'B', 1, 1),
      point('cp_z', 'D', 1, 1),
      point('cp_w', 'Z', 1, 1),
    ]);
    expect(pickGateMarkers(first, second)).toEqual([
      { id: 'cp_b', position: [632002.5, 4835002.5] },
      { id: 'cp_d', position: [632004.5, 4835004.5] },
      { id: 'cp_e', position: [632005.5, 4835005.5] },
    ]);
  });

  it('falls back to the first three of the first file when fewer than three are shared', () => {
    const second = file('fip_v3_1935_229', [point('cp_x', 'E', 1, 1), point('cp_y', 'B', 1, 1), point('cp_z', 'Q', 1, 1)]);
    expect(pickGateMarkers(first, second).map((m) => m.id)).toEqual(['cp_a', 'cp_b', 'cp_c']);
    expect(pickGateMarkers(first).map((m) => m.id)).toEqual(['cp_a', 'cp_b', 'cp_c']);
  });

  it('copies the reference coordinates unchanged', () => {
    const [marker] = pickGateMarkers(first);
    expect(marker?.position).toEqual(first.points[0]?.reference);
  });
});

describe('the real gate control files', () => {
  const read = (source: string): ControlPoints | null => {
    try {
      const path = join(REPOSITORY_DATA, 'control', `${source}.json`);
      return parseContract('controlPoints', readFileSync(path, 'utf8'), path);
    } catch {
      return null;
    }
  };
  const first = read('fip_v3_1911_229');
  const second = read('fip_v3_1935_229');

  it.skipIf(first === null)('picks three intersections that appear in both files, from the 1911 file', () => {
    const markers = pickGateMarkers(first as ControlPoints, second ?? undefined);
    expect(markers).toHaveLength(3);
    const ids = new Set((first as ControlPoints).points.map((p) => p.id));
    for (const marker of markers) expect(ids.has(marker.id)).toBe(true);
    if (second) {
      const shared = new Set(second.points.map((p) => p.reference_feature_id));
      for (const marker of markers) {
        const original = (first as ControlPoints).points.find((p) => p.id === marker.id);
        expect(shared.has(original?.reference_feature_id as string)).toBe(true);
      }
    }
  });
});
