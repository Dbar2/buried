/**
 * The Bridge Schema (data/schema/bridge.schema.json) compiled with Ajv, next to the Evidence
 * Schema it references for position, featureId and sourceId.
 */
import Ajv2020 from 'ajv/dist/2020.js';
import type { ErrorObject, ValidateFunction } from 'ajv';
import addFormats from 'ajv-formats';
import bridgeSchema from '../../../data/schema/bridge.schema.json';
import evidenceSchema from '../../../data/schema/evidence.schema.json';

export const BRIDGE_SCHEMA_ID: string = bridgeSchema.$id;

/** The bridge version, read from the `const` in the schema so there is one place that states it. */
export const BRIDGE_VERSION: string = bridgeSchema.$defs.sceneInitPayload.properties.bridgeVersion.const;

let ajv: Ajv2020 | undefined;
const compiled = new Map<string, ValidateFunction>();

function instance(): Ajv2020 {
  if (!ajv) {
    // Same options as web/src/evidence/schema.ts: the schemas use if/then blocks with no `type`,
    // and `then: { required }` names properties defined in the enclosing object.
    ajv = new Ajv2020({
      strict: true,
      strictTypes: false,
      strictRequired: false,
      allErrors: true,
      allowUnionTypes: true,
    });
    addFormats(ajv);
    ajv.addSchema(evidenceSchema as object);
    ajv.addSchema(bridgeSchema as object);
  }
  return ajv;
}

/** A compiled validator for one `$defs` entry of the Bridge Schema, such as `sceneInitMessage`. */
export function bridgeValidator(def: string): ValidateFunction {
  let fn = compiled.get(def);
  if (!fn) {
    const found = instance().getSchema(`${BRIDGE_SCHEMA_ID}#/$defs/${def}`);
    if (!found) throw new Error(`The Bridge Schema has no definition named ${def}`);
    fn = found;
    compiled.set(def, fn);
  }
  return fn;
}

export function describeErrors(errors: readonly ErrorObject[] | null | undefined, limit = 5): string {
  if (!errors || errors.length === 0) return 'is invalid';
  const shown = errors.slice(0, limit).map((e) => `${e.instancePath === '' ? '/' : e.instancePath} ${e.message ?? 'is invalid'}`);
  const more = errors.length > limit ? `; and ${errors.length - limit} more` : '';
  return shown.join('; ') + more;
}

/** The names of the `$defs` entries, for tests. */
export function bridgeDefinitionNames(): string[] {
  return Object.keys(bridgeSchema.$defs).sort();
}
