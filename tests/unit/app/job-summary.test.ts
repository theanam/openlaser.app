import { describe, expect, it } from 'vitest';
import type { MoveList } from '$lib/cam/types';
import { boundsKey, jobSummary, peakPower } from '$app/lib/job-summary';

function moves(powers: number[]): MoveList {
  return {
    count: powers.length,
    coords: new Float32Array(powers.length * 4),
    power: Float32Array.from(powers),
    rapid: new Uint8Array(powers.length),
    line: new Uint32Array(powers.length),
    lineCount: powers.length,
    bounds: null,
    burnBounds: null,
  };
}

describe('job summary', () => {
  it('reports size, time, peak power and lines', () => {
    const s = jobSummary(
      {
        name: 'Coaster',
        lines: ['G90', 'G1 X1'],
        moves: moves([0, 0.4, 0.8]),
        bounds: { minX: 10, minY: 20, maxX: 60, maxY: 50 },
        stats: { estimatedSeconds: 90 },
      },
      null,
    );
    expect(s).toEqual({
      name: 'Coaster',
      width: 50,
      height: 30,
      estimatedSeconds: 90,
      maxPower: 80,
      layers: null,
      lines: 2,
    });
  });

  it('finds the peak power', () => {
    expect(peakPower(moves([]))).toBe(0);
    expect(peakPower(moves([0.25, 1, 0.5]))).toBe(100);
  });

  it('keys bounds for the framed-or-not check', () => {
    expect(boundsKey({ minX: 1, minY: 2, maxX: 3.333, maxY: 4 })).toBe('1.00,2.00,3.33,4.00');
    expect(boundsKey(null)).toBe('none');
  });
});
