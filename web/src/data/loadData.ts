/**
 * Loads the contract files the Explorer needs, validates each against the Schema with the Evidence
 * Library, and says what it left out.
 *
 *  - project.json and sources.json must load; without them nothing can be drawn, so a problem there throws.
 *  - Every other file that fails validation, cites a source that is not registered (or has no start
 *    year, or whose rights are not confirmed), or names a tile image that is not served, is left out
 *    whole and reported in `problems`. Nothing partial is drawn from a file (spec 03 design.md).
 *
 * `fetchText` takes a path below data/ ("project.json", "evidence/x.geojson") and returns its text.
 */
import {
  EvidenceLoadError,
  indexSources,
  parseContract,
  parseEvidenceFile,
  parseProject,
  parseSourceRegistry,
} from '../evidence';
import type {
  ControlPoints,
  FeatureCollection,
  PresentLayer,
  Project,
  SourceIndex,
  SourceRegistry,
  TileSidecar,
} from '../evidence';

export type FetchText = (path: string) => Promise<string>;

export type DataIndex = {
  evidence: string[];
  present: string[];
  tiles: string[];
  control: string[];
};

export type LoadedData = {
  project: Project;
  registry: SourceRegistry;
  sources: SourceIndex;
  /** Evidence files that passed, in file-name order. */
  evidence: FeatureCollection[];
  /** Present-day layers by source id. */
  presentLayers: Map<string, PresentLayer>;
  /** Tile sidecars that passed and whose image is served, in file-name order. */
  tiles: TileSidecar[];
  /** Control point files by source id. */
  controls: Map<string, ControlPoints>;
  /** One sentence for each file that was left out. */
  problems: string[];
};

export const browserFetchText: FetchText = async (path) => {
  const response = await fetch(`/data/${path}`);
  if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`);
  return response.text();
};

const DIRS = ['evidence', 'present', 'tiles', 'control'] as const;

export function parseIndex(text: string): DataIndex {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new EvidenceLoadError('data/index.json', 'index', 'is not valid JSON');
  }
  const record = value as Record<string, unknown> | null;
  const index = {} as DataIndex;
  for (const dir of DIRS) {
    const list = record?.[dir];
    if (!Array.isArray(list) || !list.every((n) => typeof n === 'string')) {
      throw new EvidenceLoadError('data/index.json', 'index', `has no list of file names for ${dir}`);
    }
    index[dir] = list as string[];
  }
  return index;
}

/** Why an evidence file cannot be used with this registry, or null. */
export function evidenceSourceProblem(collection: FeatureCollection, sources: SourceIndex): string | null {
  const cited = new Set<string>([collection.origin_source]);
  for (const feature of collection.features) {
    cited.add(feature.properties.provenance.origin_source);
    for (const observation of feature.properties.observations) cited.add(observation.source);
  }
  for (const id of [...cited].sort()) {
    const source = sources.get(id);
    if (!source) return `it cites ${id}, which is not in the source registry`;
    if (source.attribution_status !== 'confirmed') return `it cites ${id}, whose rights are not confirmed`;
    if (source.year_from === null) return `it cites ${id}, which has no start year yet`;
  }
  return null;
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function loadData(fetchText: FetchText): Promise<LoadedData> {
  const project = parseProject(await fetchText('project.json'), 'data/project.json');
  const registry = parseSourceRegistry(await fetchText('sources.json'), 'data/sources.json');
  const sources = indexSources(registry);
  const index = parseIndex(await fetchText('index.json'));

  const problems: string[] = [];
  const left = (path: string, reason: string) => problems.push(`The file ${path} was left out: ${reason}.`);

  const evidence: FeatureCollection[] = [];
  for (const name of index.evidence.filter((n) => n.endsWith('.geojson'))) {
    const path = `evidence/${name}`;
    try {
      const collection = parseEvidenceFile(await fetchText(path), path);
      const problem = evidenceSourceProblem(collection, sources);
      if (problem) left(path, problem);
      else evidence.push(collection);
    } catch (error) {
      left(path, describe(error));
    }
  }

  const presentLayers = new Map<string, PresentLayer>();
  for (const name of index.present.filter((n) => n.endsWith('.geojson'))) {
    const path = `present/${name}`;
    try {
      const layer = parseContract('presentLayer', await fetchText(path), path);
      if (!sources.has(layer.source)) left(path, `it is for ${layer.source}, which is not in the source registry`);
      else presentLayers.set(layer.source, layer);
    } catch (error) {
      left(path, describe(error));
    }
  }

  const served = new Set(index.tiles);
  const tiles: TileSidecar[] = [];
  for (const name of index.tiles.filter((n) => n.endsWith('.json'))) {
    const path = `tiles/${name}`;
    try {
      const tile = parseContract('tileSidecar', await fetchText(path), path);
      if (!sources.has(tile.source)) left(path, `it is for ${tile.source}, which is not in the source registry`);
      else if (!served.has(tile.image)) left(path, `its image ${tile.image} is not served`);
      else tiles.push(tile);
    } catch (error) {
      left(path, describe(error));
    }
  }

  const controls = new Map<string, ControlPoints>();
  for (const name of index.control.filter((n) => n.endsWith('.json'))) {
    const path = `control/${name}`;
    try {
      const control = parseContract('controlPoints', await fetchText(path), path);
      controls.set(control.source, control);
    } catch (error) {
      left(path, describe(error));
    }
  }

  return { project, registry, sources, evidence, presentLayers, tiles, controls, problems };
}
