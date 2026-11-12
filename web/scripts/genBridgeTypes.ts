/**
 * Generate web/src/bridge/types.generated.ts from data/schema/bridge.schema.json.
 *
 * Run from web/:  npm run gen:bridge-types
 * The output is deterministic. src/bridge/types.test.ts regenerates in memory and fails if the
 * committed file differs, so the Bridge Schema and the types cannot drift apart.
 *
 * The Bridge Schema borrows position, featureId and sourceId from evidence.schema.json by $ref.
 * json-schema-to-typescript cannot follow an absolute URL, so those three definitions are copied
 * into the wrapper and the references rewritten to local ones.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compile } from 'json-schema-to-typescript';
import { SCHEMA_PATH as EVIDENCE_SCHEMA_PATH, forTypes } from './genTypes';

export const BRIDGE_SCHEMA_PATH = fileURLToPath(
  new URL('../../data/schema/bridge.schema.json', import.meta.url),
);
export const BRIDGE_TYPES_PATH = fileURLToPath(
  new URL('../src/bridge/types.generated.ts', import.meta.url),
);

const EVIDENCE_REF_PREFIX = 'https://buried.invalid/schema/evidence.schema.json#/$defs/';
const BORROWED = ['position', 'featureId', 'sourceId'] as const;

const BANNER = `/* eslint-disable */
/**
 * GENERATED FILE. Do not edit by hand.
 * Source: data/schema/bridge.schema.json. Regenerate with \`npm run gen:bridge-types\` (from web/).
 * All positions are EPSG:26917 metres, easting first, never longitude/latitude.
 */`;

type Schema = { $defs: Record<string, unknown> } & Record<string, unknown>;

function localiseRefs(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(localiseRefs);
  if (node === null || typeof node !== 'object') return node;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
    if (key === '$ref' && typeof value === 'string' && value.startsWith(EVIDENCE_REF_PREFIX)) {
      out[key] = `#/$defs/${value.slice(EVIDENCE_REF_PREFIX.length)}`;
    } else {
      out[key] = localiseRefs(value);
    }
  }
  return out;
}

export async function generateBridgeTypes(): Promise<string> {
  const bridge = JSON.parse(await readFile(BRIDGE_SCHEMA_PATH, 'utf8')) as Schema;
  const evidence = JSON.parse(await readFile(EVIDENCE_SCHEMA_PATH, 'utf8')) as Schema;

  const defs: Record<string, unknown> = { ...bridge.$defs };
  for (const name of BORROWED) {
    if (!(name in evidence.$defs)) throw new Error(`evidence.schema.json has no definition named ${name}`);
    defs[name] = evidence.$defs[name];
  }

  const typed = forTypes(localiseRefs(defs)) as Record<string, unknown>;
  const names = Object.keys(typed).sort();
  const wrapper = {
    title: 'BridgeSchemaTypes',
    description: 'One property per definition in the Bridge Schema.',
    type: 'object',
    additionalProperties: false,
    properties: Object.fromEntries(names.map((n) => [n, { $ref: `#/$defs/${n}` }])),
    $defs: typed,
  };

  return compile(wrapper as never, 'BridgeSchemaTypes', {
    bannerComment: BANNER,
    additionalProperties: false,
    unreachableDefinitions: true,
    style: { singleQuote: true, semi: true, printWidth: 100 },
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const text = await generateBridgeTypes();
  await mkdir(dirname(BRIDGE_TYPES_PATH), { recursive: true });
  await writeFile(BRIDGE_TYPES_PATH, text, 'utf8');
  console.log(`wrote ${BRIDGE_TYPES_PATH}`);
}
