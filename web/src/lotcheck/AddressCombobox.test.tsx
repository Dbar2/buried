import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { findBannedWords } from '../evidence';
import { AddressCombobox } from './AddressCombobox';
import * as copy from './copy';

describe('AddressCombobox (markup; the keyboard is tested in the browser spec)', () => {
  const html = renderToStaticMarkup(<AddressCombobox book={{ entries: [], recorded: new Map() }} onChoose={() => undefined} message={null} onEdit={() => undefined} />);

  it('is an ARIA combobox with a listbox, closed until focused', () => {
    expect(html).toContain('role="combobox"');
    expect(html).toContain('aria-autocomplete="list"');
    expect(html).toContain('aria-expanded="false"');
    expect(html).toMatch(/aria-controls="[^"]+-list"/);
    expect(html).toContain('role="listbox"');
    expect(html).toContain('type="submit"');
  });

  it('has a label for the field and a placeholder with an example address', () => {
    expect(html).toContain('<label');
    expect(html).toContain('placeholder="Type an address, e.g. 2A Percy St"');
  });

  it('keeps every fixed suggestion text free of banned words', () => {
    for (const text of Object.values(copy.SUGGEST)) expect(findBannedWords(text), text).toEqual([]);
    expect(copy.SUGGEST.notDug).toBe('We have not dug there yet. Try one of these:');
    expect(copy.SUGGEST.tryOne).toBe('Try one of these');
  });
});
