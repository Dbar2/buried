import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { beginLensDrag, isInsideLens, moveLensDrag } from './lensDrag';
import type { CanvasRect, Lens } from './lensDrag';

const rect: CanvasRect = { left: 100, top: 50, width: 1000, height: 600 };
const lens: Lens = { center: { x: 0.5, y: 0.5 }, radius: 0.18 };
// Centre (600, 350), radius 108 px.

describe('lensDrag', () => {
  it('knows inside from outside', () => {
    expect(isInsideLens({ x: 600, y: 350 }, rect, lens)).toBe(true);
    expect(isInsideLens({ x: 700, y: 350 }, rect, lens)).toBe(true);
    expect(isInsideLens({ x: 708, y: 350 }, rect, lens)).toBe(true);
    expect(isInsideLens({ x: 709, y: 350 }, rect, lens)).toBe(false);
    expect(isInsideLens({ x: 680, y: 430 }, rect, lens)).toBe(false); // a corner of the lens's own square
    expect(isInsideLens({ x: 600, y: 350 }, { ...rect, width: 0 }, lens)).toBe(false);
  });

  it('gives the camera a drag that starts outside', () => {
    expect(beginLensDrag({ x: 200, y: 100 }, rect, lens)).toBeNull();
    expect(beginLensDrag({ x: 650, y: 380 }, rect, lens)).toEqual({ dx: 50, dy: 30 });
  });

  it('moves the lens with the pointer, keeping the grip, and keeps it on the canvas', () => {
    const grab = beginLensDrag({ x: 650, y: 380 }, rect, lens)!;
    expect(moveLensDrag(grab, { x: 650, y: 380 }, rect, lens.center)).toEqual({ x: 0.5, y: 0.5 });
    const moved = moveLensDrag(grab, { x: 750, y: 380 }, rect, lens.center);
    expect(moved.x).toBeCloseTo(0.6, 10);
    expect(moved.y).toBeCloseTo(0.5, 10);
    expect(moveLensDrag(grab, { x: -500, y: 9000 }, rect, lens.center)).toEqual({ x: 0, y: 1 });
    expect(moveLensDrag(grab, { x: 700, y: 400 }, { ...rect, height: 0 }, lens.center)).toEqual(lens.center);
  });

  it('property: a started drag stays on the canvas, and a pointer at its grip leaves the lens where it is', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0, max: 1, noNaN: true }),
        fc.double({ min: 0, max: 1, noNaN: true }),
        fc.double({ min: -2000, max: 3000, noNaN: true }),
        fc.double({ min: -2000, max: 3000, noNaN: true }),
        (cx, cy, px, py) => {
          const l: Lens = { center: { x: cx, y: cy }, radius: 0.18 };
          const start = { x: rect.left + cx * rect.width + 20, y: rect.top + cy * rect.height - 10 };
          const grab = beginLensDrag(start, rect, l);
          expect(grab).not.toBeNull();
          const at = moveLensDrag(grab!, start, rect, l.center);
          expect(at.x).toBeCloseTo(cx, 9);
          expect(at.y).toBeCloseTo(cy, 9);
          const there = moveLensDrag(grab!, { x: px, y: py }, rect, l.center);
          expect(there.x).toBeGreaterThanOrEqual(0);
          expect(there.x).toBeLessThanOrEqual(1);
          expect(there.y).toBeGreaterThanOrEqual(0);
          expect(there.y).toBeLessThanOrEqual(1);
        },
      ),
    );
  });
});
