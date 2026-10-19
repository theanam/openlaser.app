import { describe, expect, it } from 'vitest';
import { contrast, inkOn, MIN_CONTRAST } from '$app/canvas/ink';

const rgb = (hex: string) =>
  [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number];

describe('inkOn', () => {
  const dark = '#121417';
  const light = '#ffffff';

  it('keeps colors that already read on the bed', () => {
    expect(inkOn('#ff0000', dark)).toBe('#ff0000');
    expect(inkOn('#000000', light)).toBe('#000000');
  });

  it('lifts black on the dark bed and darkens white on the light one', () => {
    for (const [color, bed] of [
      ['#000000', dark],
      ['#0000ff', dark],
      ['#ffffff', light],
      ['#ffff00', light],
    ] as const) {
      const ink = inkOn(color, bed);
      expect(ink).not.toBe(color);
      expect(contrast(rgb(ink), rgb(bed))).toBeGreaterThanOrEqual(MIN_CONTRAST);
    }
  });

  it('passes through colors it cannot parse', () => {
    expect(inkOn('rebeccapurple', dark)).toBe('rebeccapurple');
  });
});
