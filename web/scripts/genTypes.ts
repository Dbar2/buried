/**
 * Generate web/src/evidence/types.generated.ts from data/schema/evidence.schema.json.
 *
 * Run from web/:  npm run gen:types
 * The output is deterministic. src/evidence/types.test.ts regenerates in memory and fails if the
 * committed file differs, so the Schema and the types cannot drift apart.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compile } from 'json-schema-to-typescript';

export const SCHEMA_PATH = fileURLToPath(
  new URL('../../data/schema/evidence.schema.json', import.meta.url),
);
export const TYPES_PATH = fileURLToPath(
  new URL('../src/evidence/types.generated.ts', import.meta.url),
);

const BANNER = `/* eslint-disable */
/**
 * GENERATED FILE. Do not edit by hand.
 * Source: data/schema/evidence.schema.json. Regenerate with \`npm run gen:types\` (from web/).
 * All coordinates are EPSG:26917 metres, easting first, never longitude/latitude.
 */`;

type Schema = { $defs: Record<string, unknown> } & Record<string, unknown>;

/** Names that would shadow a global (Date) are given a different type name. */
const TYPE_NAMES: Record<string, string> = { date: 'IsoDate', dateTime: 'IsoDateTime' };

/**
 * The Schema reshaped for json-schema-to-typescript, which understands draft-07 tuples but not
 * draft 2020-12 `prefixItems`, and turns conditional `allOf` entries into `unknown`. Conditional
 * rules (`if`/`then`/`else`) cannot be expressed as TypeScript types; Ajv enforces them when a
 * file is loaded, so the types only describe the shape, with conditionally required fields
 * optional.
 */
export function forTypes(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(forTypes);
  if (node === null || typeof node !== 'object') return node;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
    if (key === 'if' || key === 'then' || key === 'else') continue;
    if (key === 'allOf' && Array.isArray(value)) {
      const kept = value.filter((v) => !(v && typeof v === 'object' && 'if' in v));
      if (kept.length > 0) out[key] = kept.map(forTypes);
      continue;
    }
    if (key === 'prefixItems' && Array.isArray(value)) {
      out.items = value.map(forTypes);
      const max = (node as Record<string, unknown>).maxItems;
      if (max === value.length) out.additionalItems = false;
      continue;
    }
    out[key] = forTypes(value);
  }
  return out;
}

/** A wrapper that references every $defs entry, so every shape gets a type. */
export function wrapperSchema(schema: Schema): Record<string, unknown> {
  const defs = forTypes(schema.$defs) as Record<string, Record<string, unknown>>;
  for (const [name, title] of Object.entries(TYPE_NAMES)) {
    if (defs[name]) defs[name] = { ...defs[name], title };
  }
  const names = Object.keys(defs).sort();
  return {
    title: 'ContractFiles',
    description: 'One property per contract file shape in the Schema.',
    type: 'object',
    additionalProperties: false,
    properties: Object.fromEntries(names.map((n) => [n, { $ref: `#/$defs/${n}` }])),
    $defs: defs,
  };
}

export async function generateTypes(): Promise<string> {
  const schema = JSON.parse(await readFile(SCHEMA_PATH, 'utf8')) as Schema;
  return compile(wrapperSchema(schema) as never, 'ContractFiles', {
    bannerComment: BANNER,
    additionalProperties: false,
    unreachableDefinitions: true,
    style: { singleQuote: true, semi: true, printWidth: 100 },
  });
}

/**
 * Generate web/src/evidence/finds.types.generated.ts from data/schema/finds.schema.json (spec 06
 * task P1). Same options and the same deterministic output rule as the evidence types.
 */
export const FINDS_SCHEMA_PATH = fileURLToPath(
  new URL('../../data/schema/finds.schema.json', import.meta.url),
);
export const FINDS_TYPES_PATH = fileURLToPath(
  new URL('../src/evidence/finds.types.generated.ts', import.meta.url),
);

const FINDS_BANNER = `/* eslint-disable */
/**
 * GENERATED FILE. Do not edit by hand.
 * Source: data/schema/finds.schema.json. Regenerate with \`npm run gen:types\` (from web/).
 */`;

export async function generateFindsTypes(): Promise<string> {
  const schema = JSON.parse(await readFile(FINDS_SCHEMA_PATH, 'utf8')) as Schema;
  return compile(forTypes(schema) as never, 'FindsFile', {
    bannerComment: FINDS_BANNER,
    additionalProperties: false,
    unreachableDefinitions: true,
    style: { singleQuote: true, semi: true, printWidth: 100 },
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const text = await generateTypes();
  await mkdir(dirname(TYPES_PATH), { recursive: true });
  await writeFile(TYPES_PATH, text, 'utf8');
  console.log(`wrote ${TYPES_PATH}`);
  await writeFile(FINDS_TYPES_PATH, await generateFindsTypes(), 'utf8');
  console.log(`wrote ${FINDS_TYPES_PATH}`);
}
