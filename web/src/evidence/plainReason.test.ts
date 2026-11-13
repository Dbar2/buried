/** Session 034: a recorded reason in plain words, with no id and no claim about who traced it. */
import { describe, expect, it } from 'vitest';
import { plainReason } from './plainWords';
import { P1911, P1935, showcaseSources } from './testing/fixtures';

const sources = showcaseSources();

describe('plainReason', () => {
  it('says "traced from the 1911 plan", not "traced by a person from <id>"', () => {
    expect(plainReason(`Area and use traced by a person from ${P1911}`, sources)).toBe('Area and use traced from the 1911 plan');
    expect(plainReason(`Traced by a person from ${P1935}.`, sources)).toBe('Traced from the 1931-35 plan.');
  });

  it('names an unregistered id as "the source" and leaves id-free text alone', () => {
    expect(plainReason('Area traced from ws_upload_0123456789ab', sources)).toBe('Area traced from the source');
    const reason = 'Footprint traced from the plate outline; storeys read from the plate lettering (2 & basement).';
    expect(plainReason(reason, sources)).toBe(reason);
  });
});
