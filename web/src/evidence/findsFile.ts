/**
 * Reads `data/finds.json` (spec 06 requirement 8) against `data/schema/finds.schema.json`. Shape only: that a
 * `feature_id` is a published feature of its source, that a crop lies inside the map area and that `id`, `slug`
 * and `order` are unique are checked by `buried validate` in the pipeline, and again, for what a page needs, by
 * `block/finds.ts` against the data it has loaded.
 */
import Ajv2020 from 'ajv/dist/2020.js';
import type { ErrorObject, ValidateFunction } from 'ajv';
import addFormats from 'ajv-formats';
import findsSchema from '../../../data/schema/finds.schema.json';
import type { FindsFile } from './finds.types.generated';
import { EvidenceLoadError } from './load';

let compiled: ValidateFunction | undefined;

function validator(): ValidateFunction {
  if (!compiled) {
    const ajv = new Ajv2020({ strict: true, strictTypes: false, allErrors: true });
    addFormats(ajv);
    compiled = ajv.compile(findsSchema as object);
  }
  return compiled;
}

function describe(e: ErrorObject): string {
  const where = e.instancePath === '' ? '/' : e.instancePath;
  const extra = e.params && 'additionalProperty' in e.params ? ` (${String(e.params.additionalProperty)})` : '';
  return `${where} ${e.message ?? 'is invalid'}${extra}`;
}

/** Parse the text of `finds.json` and validate its shape. Throws EvidenceLoadError. */
export function parseFindsFile(text: string, fileName = 'data/finds.json'): FindsFile {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch (cause) {
    throw new EvidenceLoadError(fileName, 'findsFile', `is not valid JSON: ${cause instanceof Error ? cause.message : String(cause)}`);
  }
  const fn = validator();
  if (!fn(value)) {
    const errors = [...(fn.errors ?? [])];
    const shown = errors.slice(0, 5).map(describe).join('; ');
    const more = errors.length > 5 ? `; and ${errors.length - 5} more` : '';
    throw new EvidenceLoadError(fileName, 'findsFile', `does not match the finds Schema: ${shown}${more}`, errors);
  }
  return value as FindsFile;
}
