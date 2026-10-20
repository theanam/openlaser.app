/**
 * Geometry for editing text in place: a CSS box laid over the text object on the bed, so the
 * textarea moves, scales and rotates exactly with the outlines underneath. Pure.
 */
import { multiply } from '$lib/geometry/mat2d';
import type { Mat2D } from '$lib/geometry/types';
import { textPlaceholderSize } from '$lib/project/outline';
import type { TextObject } from '$lib/project/types';

/** CSS pixels per mm inside the box before its transform: large enough for crisp glyphs. */
export const TEXT_EDIT_SCALE = 4;

export interface TextEditBox {
  /** CSS `matrix()` mapping the box (CSS px, Y-down) onto the canvas. */
  transform: string;
  fontSizePx: number;
  lineHeightPx: number;
  letterSpacingEm: number;
  /**
   * CSS centres glyphs in each line box, while the outliner puts the first baseline one ascender
   * below the block top. Shifting by half the difference lines the two up.
   */
  shiftPx: number;
}

export function textEditBox(object: TextObject, toScreen: Mat2D): TextEditBox {
  const k = TEXT_EDIT_SCALE;
  const lines = Math.max(1, object.text.split('\n').length);
  const pitch = object.lineHeight * object.fontSize;
  const height = object.paths.length ? (object.blockHeight ?? 0) : textPlaceholderSize(object).height;
  const blockHeight = height > 0 ? height : object.fontSize * (1 + (lines - 1) * object.lineHeight);
  const firstLine = blockHeight - (lines - 1) * pitch;
  const [a, b, c, d, e, f] = multiply(toScreen, object.transform);
  // Box point (u, v) is object point (u / k, blockHeight − v / k).
  const m = [a / k, b / k, -c / k, -d / k, c * blockHeight + e, d * blockHeight + f];
  return {
    transform: `matrix(${m.map((n) => +n.toFixed(6)).join(', ')})`,
    fontSizePx: object.fontSize * k,
    lineHeightPx: pitch * k,
    letterSpacingEm: object.letterSpacing / 1000,
    shiftPx: ((firstLine - pitch) / 2) * k,
  };
}
