import { describe, expect, it } from 'vitest';
import { bucketOf, headAt, mix, moveIndexForLine, POWER_BUCKETS } from '$app/canvas/preview-render';
import type { MoveList } from '$lib/cam/types';

function moves(lines: number[]): MoveList {
  const count = lines.length;
  const coords = new Float32Array(count * 4);
  for (let i = 0; i < count; i++) coords.set([i, 0, i + 1, 0], i * 4);
  return {
    count,
    coords,
    power: new Float32Array(count),
    rapid: new Uint8Array(count),
    line: Uint32Array.from(lines),
    lineCount: Math.max(0, ...lines) + 1,
    bounds: null,
    burnBounds: null,
  };
}

describe('preview helpers', () => {
  it('buckets power into shades', () => {
    expect(bucketOf(0.01)).toBe(0);
    expect(bucketOf(1)).toBe(POWER_BUCKETS - 1);
    expect(bucketOf(0.5)).toBe(Math.ceil(0.5 * POWER_BUCKETS) - 1);
  });

  it('finds the first move at or after a line', () => {
    const m = moves([3, 4, 4, 7, 9]);
    expect(moveIndexForLine(m, 0)).toBe(0);
    expect(moveIndexForLine(m, 4)).toBe(1);
    expect(moveIndexForLine(m, 5)).toBe(3);
    expect(moveIndexForLine(m, 100)).toBe(5);
  });

  it('reports the head position after n moves', () => {
    const m = moves([0, 1, 2]);
    expect(headAt(m, 0)).toBeNull();
    expect(headAt(m, 2)).toEqual({ x: 2, y: 0 });
    expect(headAt(m, 99)).toEqual({ x: 3, y: 0 });
  });

  it('mixes colors', () => {
    expect(mix('#000000', '#ffffff', 0.5)).toBe('rgb(128, 128, 128)');
  });
});
