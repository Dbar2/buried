/**
 * Generate web/src/studio/service/types.generated.ts from data/schema/studio_api.schema.json.
 *
 * Run from web/:  npx tsx scripts/genStudioApiTypes.ts
 * The output is deterministic. A test that regenerates in memory and compares with the committed
 * file belongs next to the Studio client (spec 04 task 1.3); until then, run this script after any
 * change to either schema and commit the result.
 *
 * The Service API Schema refers to evidence.schema.json by `$ref`. Here the two sets of `$defs`
 * are merged into one document (a name used by both is an error) so every shape gets a type.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compile } from 'json-schema-to-typescript';
import { forTypes } from './genTypes';

export const STUDIO_SCHEMA_PATH = fileURLToPath(
  new URL('../../data/schema/studio_api.schema.json', import.meta.url),
);
export const EVIDENCE_SCHEMA_PATH = fileURLToPath(
  new URL('../../data/schema/evidence.schema.json', import.meta.url),
);
export const STUDIO_TYPES_PATH = fileURLToPath(
  new URL('../src/studio/service/types.generated.ts', import.meta.url),
);

const BANNER = `/* eslint-disable */
/**
 * GENERATED FILE. Do not edit by hand.
 * Source: data/schema/studio_api.schema.json (with the definitions it takes from
 * data/schema/evidence.schema.json). Regenerate with \`npx tsx scripts/genStudioApiTypes.ts\`
 * (from web/). All coordinates are EPSG:26917 metres, easting first, never longitude/latitude.
 */`;

type Defs = Record<string, unknown>;
type Schema = { $defs: Defs } & Record<string, unknown>;

/** Names that would shadow a global (Date) are given a different type name. */
const TYPE_NAMES: Record<string, string> = { date: 'IsoDate', dateTime: 'IsoDateTime' };

/** `evidence.schema.json#/$defs/x` becomes `#/$defs/x`; `unevaluatedProperties` has no TS form. */
function inlineRefs(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(inlineRefs);
  if (node === null || typeof node !== 'object') return node;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
    if (key === 'unevaluatedProperties') continue;
    if (key === '$ref' && typeof value === 'string') {
      out[key] = value.replace(/^evidence\.schema\.json#/, '#');
    } else {
      out[key] = inlineRefs(value);
    }
  }
  return out;
}

export function mergedDefs(studio: Schema, evidence: Schema): Defs {
  const clash = Object.keys(studio.$defs).filter((n) => n in evidence.$defs);
  if (clash.length > 0) {
    throw new Error(`definitions in both schemas: ${clash.join(', ')}`);
  }
  return { ...(evidence.$defs as Defs), ...(studio.$defs as Defs) };
}

export function wrapperSchema(studio: Schema, evidence: Schema): Record<string, unknown> {
  const defs = forTypes(inlineRefs(mergedDefs(studio, evidence))) as Record<
    string,
    Record<string, unknown>
  >;
  for (const [name, title] of Object.entries(TYPE_NAMES)) {
    if (defs[name]) defs[name] = { ...defs[name], title };
  }
  const names = Object.keys(defs).sort();
  return {
    title: 'StudioApi',
    description: 'One property per definition in the Service API Schema and the shared Schema.',
    type: 'object',
    additionalProperties: false,
    properties: Object.fromEntries(names.map((n) => [n, { $ref: `#/$defs/${n}` }])),
    $defs: defs,
  };
}

export async function generateStudioApiTypes(): Promise<string> {
  const studio = JSON.parse(await readFile(STUDIO_SCHEMA_PATH, 'utf8')) as Schema;
  const evidence = JSON.parse(await readFile(EVIDENCE_SCHEMA_PATH, 'utf8')) as Schema;
  return compile(wrapperSchema(studio, evidence) as never, 'StudioApi', {
    bannerComment: BANNER,
    additionalProperties: false,
    unreachableDefinitions: true,
    style: { singleQuote: true, semi: true, printWidth: 100 },
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const text = await generateStudioApiTypes();
  await mkdir(dirname(STUDIO_TYPES_PATH), { recursive: true });
  await writeFile(STUDIO_TYPES_PATH, text, 'utf8');
  console.log(`wrote ${STUDIO_TYPES_PATH}`);
}
