import { describe, expect, it } from 'vitest';
import { reviewCommand } from './keymap';
import { bandOf, undecidedInside, weaknessText } from './reviewText';
import { makeProposal } from './testing';

describe('the review keys', () => {
  it.each([
    ['a', 'accept'],
    ['A', 'accept'],
    ['r', 'reject'],
    ['j', 'next'],
    ['ArrowRight', 'next'],
    ['ArrowDown', 'next'],
    ['k', 'previous'],
    ['ArrowLeft', 'previous'],
    ['ArrowUp', 'previous'],
    ['f', 'fit'],
    ['u', 'undo'],
  ])('%s is %s', (key, command) => {
    expect(reviewCommand({ key })).toBe(command);
  });

  it('undoes and redoes with Ctrl or Cmd and Z', () => {
    expect(reviewCommand({ key: 'z', ctrlKey: true })).toBe('undo');
    expect(reviewCommand({ key: 'z', metaKey: true, shiftKey: true })).toBe('redo');
    expect(reviewCommand({ key: 'a', ctrlKey: true })).toBeNull();
  });

  it('does nothing in a text field, and ignores other keys', () => {
    expect(reviewCommand({ key: 'a', target: { tagName: 'INPUT', getAttribute: () => 'text' } })).toBeNull();
    expect(reviewCommand({ key: 'a', target: { tagName: 'TEXTAREA' } })).toBeNull();
    expect(reviewCommand({ key: 'a', target: { tagName: 'INPUT', getAttribute: () => 'checkbox' } })).toBe('accept');
    expect(reviewCommand({ key: 'a', target: { tagName: 'BUTTON' } })).toBe('accept');
    expect(reviewCommand({ key: 'x' })).toBeNull();
    expect(reviewCommand({ key: 'a', altKey: true })).toBeNull();
  });
});

describe('the review words', () => {
  it('bands a score', () => {
    expect([bandOf(0.95), bandOf(0.9), bandOf(0.89), bandOf(0.6), bandOf(0.59)]).toEqual(['high', 'high', 'medium', 'medium', 'low']);
  });

  it('puts a weakness flag in plain words, and says so for an unknown one', () => {
    expect(weaknessText('open_outline')).toMatch(/gaps/);
    expect(weaknessText('something_new')).toContain('something_new');
  });

  it('lists the undecided proposals whose centre is inside the area, and only those', () => {
    const inside = makeProposal(1, { x: 100, y: 100, width: 40, height: 40 });
    const decided = makeProposal(2, { x: 150, y: 100, width: 40, height: 40 });
    const outside = makeProposal(3, { x: 900, y: 900, width: 40, height: 40 });
    const area = { x: 90, y: 90, width: 200, height: 100 };
    expect(undecidedInside(area, [inside, decided, outside], { [decided.id]: 'accept' })).toEqual([inside.id]);
  });
});
