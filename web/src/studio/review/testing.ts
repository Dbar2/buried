/** Small proposals for the Studio's tests. Geometry is a stand-in; only ids and crops matter here. */
import type { ProposalFeature } from './reviewModel';

export function makeProposal(n: number, crop?: { x: number; y: number; width: number; height: number }): ProposalFeature {
  const hex = n.toString(16).padStart(12, '0');
  const c = crop ?? { x: (n % 10) * 100, y: Math.floor(n / 10) * 100, width: 40, height: 40 };
  return {
    type: 'Feature',
    id: `fip_v3_1911_229_p_${hex}`,
    geometry: {
      type: 'Polygon',
      coordinates: [[[632500, 4835000], [632510, 4835000], [632510, 4835010], [632500, 4835010], [632500, 4835000]]],
    },
    properties: {
      tone_class: 'mid',
      pixel_polygon: [[c.x, c.y], [c.x + c.width, c.y], [c.x + c.width, c.y + c.height], [c.x, c.y + c.height]],
      crop_px: c,
      area_m2: 20,
      quality: { score: 0.8, outline_closure: 0.9, fill_uniformity: 0.9, text_clear: 0.95, edge_clear: 1, shape_fidelity: 0.8 },
      weaknesses: [],
    },
  } as ProposalFeature;
}

export const makeProposals = (count: number): ProposalFeature[] => Array.from({ length: count }, (_, i) => makeProposal(i));
