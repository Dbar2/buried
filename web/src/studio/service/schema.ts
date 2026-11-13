/**
 * The Service API Schema (data/schema/studio_api.schema.json) compiled with Ajv, next to the
 * Evidence Schema it refers to. Every response the client accepts, and every request it sends, is
 * checked here.
 */
import Ajv2020 from 'ajv/dist/2020.js';
import type { ErrorObject, ValidateFunction } from 'ajv';
import addFormats from 'ajv-formats';
import evidenceSchema from '../../../../data/schema/evidence.schema.json';
import studioSchema from '../../../../data/schema/studio_api.schema.json';

export const STUDIO_SCHEMA_ID: string = studioSchema.$id;
export const API_VERSION = '1.0.0' as const;

let ajv: Ajv2020 | undefined;
const compiled = new Map<string, ValidateFunction>();

function instance(): Ajv2020 {
  if (!ajv) {
    ajv = new Ajv2020({
      strict: true,
      strictTypes: false,
      strictRequired: false,
      allErrors: true,
      allowUnionTypes: true,
    });
    addFormats(ajv);
    ajv.addSchema(evidenceSchema as object);
    ajv.addSchema(studioSchema as object);
  }
  return ajv;
}

/** A compiled validator for one `$defs` entry of the Service API Schema, such as `publishResponse`. */
export function studioValidator(def: string): ValidateFunction {
  let fn = compiled.get(def);
  if (!fn) {
    const found = instance().getSchema(`${STUDIO_SCHEMA_ID}#/$defs/${def}`);
    if (!found) throw new Error(`The Service API Schema has no definition named ${def}`);
    fn = found;
    compiled.set(def, fn);
  }
  return fn;
}

export function describeErrors(errors: readonly ErrorObject[] | null | undefined, limit = 3): string {
  if (!errors || errors.length === 0) return 'is invalid';
  const shown = errors.slice(0, limit).map((e) => `${e.instancePath === '' ? '/' : e.instancePath} ${e.message ?? 'is invalid'}`);
  return shown.join('; ') + (errors.length > limit ? `; and ${errors.length - limit} more` : '');
}
