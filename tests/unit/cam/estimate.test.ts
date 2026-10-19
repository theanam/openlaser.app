import { describe, expect, it } from 'vitest';
import type { Move } from '$lib/cam/gcode/emit';
import { DEFAULT_ESTIMATE_LIMITS, estimateSeconds } from '$lib/cam/gcode/estimate';

const burn = (x0: number, y0: number, x1: number, y1: number, feed = 600): Move => ({
  x0,
  y0,
  x1,
  y1,
  rapid: false,
  feed,
  s: 500,
});

describe('estimateSeconds', () => {
  it('is zero without moves', () => {
    expect(estimateSeconds([])).toBe(0);
  });

  it('matches a closed-form trapezoid for a single long move', () => {
    // 100 mm at 600 mm/min (10 mm/s), accel 100 mm/s²: 0.1 s ramps over 0.5 mm each.
    const t = estimateSeconds([burn(0, 0, 100, 0)], { accelX: 100, accelY: 100 });
    expect(t).toBeCloseTo(0.1 + 0.1 + 99 / 10, 6);
  });

  it('uses a triangle profile when the move is too short to reach feed', () => {
    // 1 mm at accel 100: peak = sqrt(100) = 10 mm/s... use a higher feed so it cannot cruise.
    const t = estimateSeconds([burn(0, 0, 1, 0, 6000)], { accelX: 100, accelY: 100 });
    expect(t).toBeCloseTo(2 * Math.sqrt(1 / 100), 6);
  });

  it('carries speed through collinear segments', () => {
    const split = [burn(0, 0, 50, 0), burn(50, 0, 100, 0)];
    expect(estimateSeconds(split, { accelX: 100, accelY: 100 })).toBeCloseTo(
      estimateSeconds([burn(0, 0, 100, 0)], { accelX: 100, accelY: 100 }),
      6,
    );
  });

  it('slows down for sharp corners and reversals', () => {
    const straight = estimateSeconds([burn(0, 0, 10, 0, 6000), burn(10, 0, 20, 0, 6000)]);
    const corner = estimateSeconds([burn(0, 0, 10, 0, 6000), burn(10, 0, 10, 10, 6000)]);
    const reversal = estimateSeconds([burn(0, 0, 10, 0, 6000), burn(10, 0, 0, 0, 6000)]);
    expect(corner).toBeGreaterThan(straight);
    expect(reversal).toBeGreaterThan(corner);
  });

  it('caps feeds and rapids at the machine max rate', () => {
    const rapid: Move = { x0: 0, y0: 0, x1: 300, y1: 0, rapid: true, feed: 0, s: 0 };
    const unknown = estimateSeconds([rapid], { accelX: 1e9, accelY: 1e9 });
    expect(unknown).toBeCloseTo(300 / (DEFAULT_ESTIMATE_LIMITS.rapidRate / 60), 3);
    expect(estimateSeconds([rapid], { maxRateX: 6000, accelX: 1e9, accelY: 1e9 })).toBeCloseTo(3, 3);
    expect(
      estimateSeconds([burn(0, 0, 100, 0, 12000)], { maxRateX: 6000, accelX: 1e9, accelY: 1e9 }),
    ).toBeCloseTo(1, 3);
  });

  it('is slower with the conservative default acceleration than with a fast machine', () => {
    const moves = [burn(0, 0, 10, 0, 6000), burn(10, 0, 10, 10, 6000), burn(10, 10, 0, 10, 6000)];
    expect(estimateSeconds(moves)).toBeGreaterThan(estimateSeconds(moves, { accelX: 3000, accelY: 3000 }));
  });
});
