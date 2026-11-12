import type { ErrorObject } from 'ajv';
import { validate } from './schema';
import type { ContractOf, DefName } from './schema';

/** A contract file could not be read or does not match the Schema. */
export class EvidenceLoadError extends Error {
  readonly fileName: string;
  readonly def: string;
  readonly errors: ErrorObject[];

  constructor(fileName: string, def: string, message: string, errors: ErrorObject[] = []) {
    super(`${fileName}: ${message}`);
    this.name = 'EvidenceLoadError';
    this.fileName = fileName;
    this.def = def;
    this.errors = errors;
  }
}

function describe(e: ErrorObject): string {
  const where = e.instancePath === '' ? '/' : e.instancePath;
  const extra = e.params && 'additionalProperty' in e.params ? ` (${String(e.params.additionalProperty)})` : '';
  return `${where} ${e.message ?? 'is invalid'}${extra}`;
}

/** Parse JSON text and validate it against one `$defs` entry. Throws EvidenceLoadError. */
export function parseContract<K extends DefName>(
  def: K,
  text: string,
  fileName: string,
): ContractOf<K> {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch (cause) {
    const reason = cause instanceof Error ? cause.message : String(cause);
    throw new EvidenceLoadError(fileName, def, `is not valid JSON: ${reason}`);
  }
  return checkContract(def, value, fileName);
}

/** Validate an already-parsed value. Throws EvidenceLoadError. */
export function checkContract<K extends DefName>(
  def: K,
  value: unknown,
  fileName: string,
): ContractOf<K> {
  const result = validate(def, value);
  if (!result.ok) {
    const shown = result.errors.slice(0, 5).map(describe).join('; ');
    const more = result.errors.length > 5 ? `; and ${result.errors.length - 5} more` : '';
    throw new EvidenceLoadError(
      fileName,
      def,
      `does not match ${def} in the Schema: ${shown}${more}`,
      result.errors,
    );
  }
  return value as ContractOf<K>;
}

export const parseEvidenceFile = (text: string, fileName: string) =>
  parseContract('featureCollection', text, fileName);
export const parseSourceRegistry = (text: string, fileName: string) =>
  parseContract('sourceRegistry', text, fileName);
export const parseProject = (text: string, fileName: string) =>
  parseContract('project', text, fileName);
