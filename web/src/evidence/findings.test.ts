import { describe, expect, it } from 'vitest';
import {
  checkedRecordsText,
  createFinding,
  createNotCovered,
  createNothingFound,
  statusLabel,
} from './findings';
import { HonestyError } from './text';
import { AERIAL, P1911, P1935, showcaseSources } from './testing/fixtures';

const sources = showcaseSources();

describe('statusLabel (requirement 14.1)', () => {
  it('gives the four labels', () => {
    expect(statusLabel('documented')).toBe('Documented');
    expect(statusLabel('estimated')).toBe('Estimated');
    expect(statusLabel('nothing_found')).toBe('Nothing found in these records');
    expect(statusLabel('not_covered')).toBe('Not covered');
  });
});

describe('createFinding (requirements 14.2 and 14.5)', () => {
  const input = {
    status: 'documented' as const,
    text: 'A building outline is drawn on this lot on the 1911 plate.',
    sourceIds: [P1911],
    featureIds: ['bld_fip_v3_1911_229_0001'],
    relation: { kind: 'on' } as const,
  };

  it('creates a finding with its sources, sorted and without repeats', () => {
    const f = createFinding({ ...input, sourceIds: [P1935, P1911, P1935] }, sources);
    expect(f.status).toBe('documented');
    expect(f.sourceIds).toEqual([P1911, P1935]);
    expect(f.text).toBe(input.text);
    expect(f).toMatchObject({ featureIds: ['bld_fip_v3_1911_229_0001'], relation: { kind: 'on' } });
  });

  it('keeps an Estimated status and a near relation', () => {
    const f = createFinding(
      { ...input, status: 'estimated', relation: { kind: 'near', withinM: 12 } },
      sources,
    );
    expect(f.status).toBe('estimated');
    expect(f).toMatchObject({ relation: { kind: 'near', withinM: 12 } });
  });

  it('refuses a finding with no source id', () => {
    expect(() => createFinding({ ...input, sourceIds: [] }, sources)).toThrowError(HonestyError);
    expect(() => createFinding({ ...input, sourceIds: [] }, sources)).toThrowError(/at least one source/);
  });

  it('refuses a source id that is not in the registry', () => {
    expect(() => createFinding({ ...input, sourceIds: [P1911, 'fip_v3_1999_001'] }, sources)).toThrowError(
      /fip_v3_1999_001/,
    );
  });

  it('refuses text with a banned word', () => {
    for (const text of ['The lot is safe.', 'Cleaner than before', 'It will flood', 'clean-up site']) {
      expect(() => createFinding({ ...input, text }, sources), text).toThrowError(HonestyError);
    }
  });

  it('accepts text with allowed look-alikes', () => {
    expect(() => createFinding({ ...input, text: 'Safety and cleaning notes' }, sources)).not.toThrow();
  });
});

describe('createNothingFound (requirement 14.3)', () => {
  const text = 'No building outline is drawn at this lot in the records checked.';

  it('stores every record checked with its years from the registry', () => {
    const f = createNothingFound(
      text,
      [
        { sourceId: AERIAL, visibility: 'obscured' },
        { sourceId: P1935, visibility: 'clear' },
        { sourceId: P1911, visibility: 'not_covered' },
      ],
      sources,
    );
    expect(f.status).toBe('nothing_found');
    if (f.status !== 'nothing_found') throw new Error('unreachable');
    expect(f.checked).toEqual([
      { sourceId: P1911, yearFrom: 1911, yearTo: 1914, visibility: 'not_covered' },
      { sourceId: P1935, yearFrom: 1931, yearTo: 1935, visibility: 'clear' },
      { sourceId: AERIAL, yearFrom: 1947, yearTo: 1947, visibility: 'obscured' },
    ]);
    expect(f.sourceIds).toEqual([AERIAL, P1911, P1935]);
  });

  it('lists obscured and not-covered records too', () => {
    const f = createNothingFound(
      text,
      [
        { sourceId: AERIAL, visibility: 'obscured' },
        { sourceId: P1911, visibility: 'not_covered' },
      ],
      sources,
    );
    expect(checkedRecordsText(f)).toEqual([
      `${P1911} (1911–1914, not_covered)`,
      `${AERIAL} (1947, obscured)`,
    ]);
  });

  it('requires at least one record checked', () => {
    expect(() => createNothingFound(text, [], sources)).toThrowError(/must list the records checked/);
    expect(() => createNotCovered('Not covered.', [], sources)).toThrowError(HonestyError);
  });

  it('refuses a record from an unregistered source', () => {
    expect(() =>
      createNothingFound(text, [{ sourceId: 'fip_v3_1999_001', visibility: 'clear' }], sources),
    ).toThrowError(/fip_v3_1999_001/);
  });

  it('refuses banned words in the text', () => {
    expect(() =>
      createNothingFound('Nothing found, so the lot is safe.', [{ sourceId: P1911, visibility: 'clear' }], sources),
    ).toThrowError(/banned word/);
  });

  it('lists a source once, and refuses to list it with two visibilities', () => {
    const once = createNothingFound(
      text,
      [
        { sourceId: P1911, visibility: 'clear' },
        { sourceId: P1911, visibility: 'clear' },
      ],
      sources,
    );
    expect(checkedRecordsText(once)).toEqual([`${P1911} (1911–1914, clear)`]);
    expect(() =>
      createNothingFound(
        text,
        [
          { sourceId: P1911, visibility: 'clear' },
          { sourceId: P1911, visibility: 'obscured' },
        ],
        sources,
      ),
    ).toThrowError(/both clear and obscured/);
  });

  it('refuses a source with no start year yet', () => {
    const pending = new Map(sources);
    pending.set('present_toronto_intersections_2026', {
      ...(sources.get(P1911) as NonNullable<ReturnType<typeof sources.get>>),
      id: 'present_toronto_intersections_2026',
      type: 'present_day_reference',
      year_from: null,
      year_to: 2026,
    });
    expect(() =>
      createNothingFound(text, [{ sourceId: 'present_toronto_intersections_2026', visibility: 'clear' }], pending),
    ).toThrowError(/no start year/);
  });
});

describe('createNotCovered', () => {
  it('has its own status and the same record list', () => {
    const f = createNotCovered('Not covered by the records checked.', [{ sourceId: P1935, visibility: 'not_covered' }], sources);
    expect(f.status).toBe('not_covered');
    expect(checkedRecordsText(f)).toEqual([`${P1935} (1931–1935, not_covered)`]);
  });
});

describe('checkedRecordsText', () => {
  it('gives one line per record: id, years, visibility, with a single year when they are equal', () => {
    const f = createNothingFound(
      'Nothing here.',
      [
        { sourceId: P1911, visibility: 'clear' },
        { sourceId: AERIAL, visibility: 'clear' },
      ],
      sources,
    );
    expect(checkedRecordsText(f)).toEqual([`${P1911} (1911–1914, clear)`, `${AERIAL} (1947, clear)`]);
  });

  it('is empty for a Documented finding, which lists no checked records', () => {
    const f = createFinding(
      { status: 'documented', text: 'Drawn.', sourceIds: [P1911], relation: { kind: 'on' } },
      sources,
    );
    expect(checkedRecordsText(f)).toEqual([]);
  });
});
