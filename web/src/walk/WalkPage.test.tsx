import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { findBannedWords } from '../evidence';
import { routeFor } from '../place/placeLink';
import { NO_WEBGL_SENTENCE, NoWebGl, WALK_KICKER, WALK_LINE, WALK_TITLE, WalkIntro } from './WalkPage';

describe('the /walk route', () => {
  it('is its own page, reached only by its address', () => {
    expect(routeFor('/walk', '')).toBe('walk');
    expect(routeFor('/walk/', '?debug=1')).toBe('walk');
    expect(routeFor('/', '')).toBe('block');
  });
});

describe('the intro overlay', () => {
  it('holds the kicker, the title "1911", the line and one button', () => {
    const html = renderToStaticMarkup(<WalkIntro label="Step inside" enabled onStepInside={() => undefined} />);
    expect(WALK_KICKER).toBe('Queen Street East at River Street');
    expect(WALK_TITLE).toBe('1911');
    expect(WALK_LINE).toBe('Rebuilt from a fire-insurance plan. Walk it.');
    expect(html).toContain('Queen Street East at River Street');
    expect(html).toContain('>1911<');
    expect(html).toContain('Rebuilt from a fire-insurance plan. Walk it.');
    expect(html.match(/<button/g)).toHaveLength(1);
    expect(html).toContain('Step inside');
    expect(html).not.toContain('disabled');
  });

  it('reads "Lighting the lamp" and is disabled while the Player loads', () => {
    const html = renderToStaticMarkup(<WalkIntro label="Lighting the lamp" enabled={false} onStepInside={() => undefined} />);
    expect(html).toContain('Lighting the lamp');
    expect(html).toContain('disabled');
  });
});

describe('without WebGL', () => {
  it('says in one plain sentence what to turn on, and links to the block page', () => {
    const html = renderToStaticMarkup(<NoWebGl />);
    expect(html).toContain('3D graphics');
    expect(html).toContain('hardware acceleration');
    expect(html).toContain('href="/"');
    expect(NO_WEBGL_SENTENCE.split('. ')).toHaveLength(1);
    expect(findBannedWords(NO_WEBGL_SENTENCE)).toEqual([]);
  });
});
