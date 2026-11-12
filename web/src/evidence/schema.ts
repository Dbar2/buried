import Ajv2020 from 'ajv/dist/2020.js';
import type { ErrorObject, ValidateFunction } from 'ajv';
import addFormats from 'ajv-formats';
import schemaJson from '../../../data/schema/evidence.schema.json';
import type { ContractFiles } from './types.generated';

/** The name of a `$defs` entry in the Schema: featureCollection, sourceRegistry, project, ... */
export type DefName = keyof ContractFiles;
/** The type a `$defs` entry describes. */
export type ContractOf<K extends DefName> = NonNullable<ContractFiles[K]>;

export const SCHEMA_ID: string = schemaJson.$id;

let ajv: Ajv2020 | undefined;
const compiled = new Map<DefName, ValidateFunction>();

function instance(): Ajv2020 {
  if (!ajv) {
    // strictTypes is off because the Schema's conditional blocks (if/then) carry no `type`;
    // strictRequired is off because `then: { required: [...] }` names properties the `then`
    // block itself does not define (they are defined in the enclosing object).
    ajv = new Ajv2020({
      strict: true,
      strictTypes: false,
      strictRequired: false,
      allErrors: true,
      allowUnionTypes: true,
    });
    addFormats(ajv);
    ajv.addSchema(schemaJson as object);
  }
  return ajv;
}

function validatorFor(def: DefName): ValidateFunction {
  let fn = compiled.get(def);
  if (!fn) {
    const found = instance().getSchema(`${SCHEMA_ID}#/$defs/${def}`);
    if (!found) throw new Error(`The Schema has no definition named ${def}`);
    fn = found;
    compiled.set(def, fn);
  }
  return fn;
}

export type ValidationResult =
  | { ok: true; errors: [] }
  | { ok: false; errors: ErrorObject[] };

/** Validate `value` against one `$defs` entry with Ajv (draft 2020-12, formats on). */
export function validate(def: DefName, value: unknown): ValidationResult {
  const fn = validatorFor(def);
  if (fn(value)) return { ok: true, errors: [] };
  return { ok: false, errors: [...(fn.errors ?? [])] };
}

/** Narrowing form of `validate`. */
export function isValid<K extends DefName>(def: K, value: unknown): value is ContractOf<K> {
  return validate(def, value).ok;
}

/** The `$defs` names in the Schema, sorted. */
export function definitionNames(): string[] {
  return Object.keys(schemaJson.$defs).sort();
}
