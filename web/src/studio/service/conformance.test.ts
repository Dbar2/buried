/**
 * The Service API fixtures against the TypeScript validator (the pipeline lane runs the Python
 * side). Each folder under `valid/` and `invalid/` is named for a `$defs` entry of the Schema; every
 * file in a `valid/` folder must pass it and every file in an `invalid/` folder must fail it.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { studioValidator } from './schema';

const ROOT = fileURLToPath(new URL('../../../../data/schema/studio_api_fixtures/', import.meta.url));

type Case = { def: string; file: string; text: string };

function casesIn(kind: 'valid' | 'invalid'): Case[] {
  const out: Case[] = [];
  for (const def of readdirSync(`${ROOT}${kind}`).sort()) {
    for (const file of readdirSync(`${ROOT}${kind}/${def}`).sort()) {
      if (file.endsWith('.json')) out.push({ def, file, text: readFileSync(`${ROOT}${kind}/${def}/${file}`, 'utf8') });
    }
  }
  return out;
}

describe('the Service API fixtures', () => {
  for (const kind of ['valid', 'invalid'] as const) {
    for (const c of casesIn(kind)) {
      it(`${kind}/${c.def}/${c.file} is ${kind === 'valid' ? 'accepted' : 'refused'}`, () => {
        const validate = studioValidator(c.def);
        const ok = validate(JSON.parse(c.text));
        if (kind === 'valid') expect(ok, JSON.stringify(validate.errors)).toBe(true);
        else expect(ok).toBe(false);
      });
    }
  }

  it('includes the four land-use fixtures', () => {
    const land = [...casesIn('valid'), ...casesIn('invalid')].filter((c) => c.text.includes('"land_use"')).map((c) => c.file);
    expect(land.sort()).toEqual(['land_use_trace.json', 'land_use_trace_as_line.json', 'land_use_trace_without_crop.json', 'land_use_trace_without_use.json']);
  });
});
