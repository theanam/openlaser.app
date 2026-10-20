import { describe, expect, it } from 'vitest';
import { apply } from '$lib/geometry/mat2d';
import type { Mat2D } from '$lib/geometry/types';
import type { TextObject } from '$lib/project/types';
import { TEXT_EDIT_SCALE, textEditBox } from '$app/canvas/text-edit';

const text = (overrides: Partial<TextObject> = {}): TextObject => ({
  id: 't',
  kind: 'text',
  layerId: 'l',
  name: 'Text',
  locked: false,
  visible: true,
  transform: [1, 0, 0, 1, 50, 20],
  text: 'Hi',
  fontFamily: 'Geist',
  fontSize: 10,
  fontWeight: 500,
  italic: false,
  align: 'left',
  lineHeight: 1.2,
  letterSpacing: 50,
  paths: [{ closed: true, start: { x: 0, y: 0 }, segments: [] }],
  blockHeight: 12,
  ...overrides,
});

/** Applies a CSS matrix() string to a box point. */
function css(transform: string, u: number, v: number) {
  const [a, b, c, d, e, f] = transform.slice(7, -1).split(',').map(Number) as Mat2D;
  return apply([a, b, c, d, e, f], { x: u, y: v });
}

describe('textEditBox', () => {
  // A Y-up bed drawn at 2 px/mm, bed bottom at screen y = 400.
  const toScreen: Mat2D = [2, 0, 0, -2, 0, 400];

  it("puts the box's top-left on the block's top-left and its scale on the zoom", () => {
    const box = textEditBox(text(), toScreen);
    // Block top-left is object (0, 12) → bed (50, 32) → screen (100, 336).
    expect(css(box.transform, 0, 0)).toEqual({ x: 100, y: 336 });
    // 10 mm along the box (10·k CSS px) is 20 screen px.
    expect(css(box.transform, 10 * TEXT_EDIT_SCALE, 0).x).toBeCloseTo(120);
    expect(css(box.transform, 0, 10 * TEXT_EDIT_SCALE).y).toBeCloseTo(356);
    expect(box.fontSizePx).toBe(40);
    expect(box.lineHeightPx).toBe(48);
    expect(box.letterSpacingEm).toBe(0.05);
  });

  it('follows rotation', () => {
    const rotated = text({ transform: [0, 1, -1, 0, 0, 0], blockHeight: 10 });
    const box = textEditBox(rotated, [1, 0, 0, 1, 0, 0]);
    // Rotated 90° CCW: the box's x axis points up the bed.
    const p = css(box.transform, TEXT_EDIT_SCALE, 0);
    const o = css(box.transform, 0, 0);
    expect(p.x - o.x).toBeCloseTo(0);
    expect(p.y - o.y).toBeCloseTo(1);
  });

  it('lines the first baseline up with the outlines', () => {
    // One line: block 12 mm, line box 12 mm → no shift. Taller block → shift down.
    expect(textEditBox(text(), toScreen).shiftPx).toBeCloseTo(0);
    expect(textEditBox(text({ blockHeight: 14 }), toScreen).shiftPx).toBeCloseTo(4);
    // Two lines: the first line's share is the block minus one pitch.
    expect(textEditBox(text({ text: 'a\nb', blockHeight: 24 }), toScreen).shiftPx).toBeCloseTo(0);
  });

  it('uses the size estimate before outlines arrive', () => {
    const box = textEditBox(text({ paths: [], blockHeight: undefined }), toScreen);
    expect(css(box.transform, 0, 0).y).toBeCloseTo(400 - 2 * (20 + 10));
  });
});
