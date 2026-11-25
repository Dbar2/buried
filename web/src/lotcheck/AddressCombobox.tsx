import { forwardRef, useId, useMemo, useRef, useState } from 'react';
import type { FormEvent, KeyboardEvent } from 'react';
import * as copy from './copy';
import { defaultSuggestions, suggest } from './suggest';
import type { AddressBook, Suggestion } from './suggest';

export type AddressComboboxProps = {
  /** Null while the address points are loading. */
  book: AddressBook | null;
  /** The visitor chose an address: a click on an option, Enter on one, or Enter and "Dig" on the first match. */
  onChoose: (choice: Suggestion) => void;
  /** Said under the field: "Not reconstructed yet." */
  message: string | null;
  onEdit: () => void;
};

/**
 * The address field (spec 08 requirement 8): an ARIA combobox with a listbox. Typing lists up to seven matching
 * addresses; focused and empty it lists the addresses with something recorded under "Try one of these"; with no
 * match it says "We have not dug there yet. Try one of these:" and lists the same. Arrow keys move, Enter
 * chooses, Escape closes. The list is plain paper rows; a dot and the words "something recorded" mark a lot
 * whose plans letter a use.
 */
export const AddressCombobox = forwardRef<HTMLInputElement, AddressComboboxProps>(function AddressCombobox({ book, onChoose, message, onEdit }, ref) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const box = useRef<HTMLDivElement>(null);
  const uid = useId();
  const listId = `${uid}-list`;
  const headId = `${uid}-head`;

  const matches = useMemo(() => (book ? suggest(book, query) : []), [book, query]);
  const defaults = useMemo(() => (book ? defaultSuggestions(book) : []), [book]);
  const typed = query.trim() !== '';
  const noMatch = typed && book !== null && matches.length === 0;
  const items = typed && !noMatch ? matches : defaults;
  const heading = !typed ? copy.SUGGEST.tryOne : noMatch ? copy.SUGGEST.notDug : null;
  const shown = open && items.length > 0;
  const optionId = (i: number) => `${uid}-opt-${i}`;

  const choose = (s: Suggestion) => {
    setQuery(s.text);
    setOpen(false);
    setActive(-1);
    onChoose(s);
  };

  const onKey = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      if (items.length === 0) return;
      event.preventDefault();
      setOpen(true);
      const n = items.length;
      setActive((a) => (event.key === 'ArrowDown' ? (a + 1 >= n ? 0 : a + 1) : a <= 0 ? n - 1 : a - 1));
    } else if (event.key === 'Escape') {
      if (open) {
        event.preventDefault();
        setOpen(false);
        setActive(-1);
      }
    } else if (event.key === 'Enter' && shown && active >= 0) {
      event.preventDefault();
      const picked = items[active];
      if (picked) choose(picked);
    }
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!book) return;
    const first = typed ? matches[0] : undefined;
    if (first) choose(first);
    else setOpen(true);
  };

  return (
    <form className="lc-form" role="search" onSubmit={submit} noValidate>
      <div
        className="lc-combo"
        ref={box}
        onBlur={(e) => {
          if (!box.current?.contains(e.relatedTarget as Node | null)) {
            setOpen(false);
            setActive(-1);
          }
        }}
      >
        <label className="visually-hidden" htmlFor={`${uid}-field`}>
          {copy.LANDING.fieldLabel}
        </label>
        <input
          id={`${uid}-field`}
          ref={ref}
          className="lc-field"
          type="text"
          role="combobox"
          aria-expanded={shown}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={shown && active >= 0 ? optionId(active) : undefined}
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          placeholder={copy.LANDING.placeholder}
          value={query}
          onFocus={() => setOpen(true)}
          onClick={() => setOpen(true)}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
            setActive(-1);
            onEdit();
          }}
          onKeyDown={onKey}
          data-testid="lc-address"
        />
        {shown ? (
          <div className="lc-suggest" data-testid="lc-suggest">
            {heading ? (
              <p id={headId} className="lc-suggest-head" data-testid="lc-suggest-head">
                {heading}
              </p>
            ) : null}
            <ul id={listId} role="listbox" aria-label={heading ? undefined : copy.SUGGEST.listLabel} aria-labelledby={heading ? headId : undefined} data-testid="lc-suggestions">
              {items.map((s, i) => (
                <li
                  key={s.id}
                  id={optionId(i)}
                  role="option"
                  aria-selected={i === active}
                  className={i === active ? 'lc-option lc-option-active' : 'lc-option'}
                  // Keeping focus in the field while the pointer chooses.
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => choose(s)}
                  onMouseMove={() => setActive(i)}
                  data-testid="lc-option"
                  data-recorded={s.recorded}
                >
                  <span className="lc-option-text">{s.text}</span>
                  {s.recorded ? (
                    <>
                      <span className="lc-dot" aria-hidden="true" />
                      <span className="lc-option-note">{copy.SUGGEST.recorded}</span>
                    </>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <ul id={listId} role="listbox" aria-label={copy.SUGGEST.listLabel} hidden />
        )}
        {message ? (
          <p role="status" className="lc-status lc-status-night" data-testid="lc-message">
            {message}
          </p>
        ) : null}
      </div>
      <button type="submit" className="lc-button lc-dig-button" data-testid="lc-check">
        <span className="lc-dig-label">{copy.LANDING.button}</span>
      </button>
    </form>
  );
});
