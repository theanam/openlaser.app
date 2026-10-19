import { describe, expect, it } from 'vitest';
import { overrideSteps } from '$app/lib/overrides';

function apply(start: number, steps: string[]): number {
  let v = start;
  for (const s of steps) {
    if (s.endsWith('-100')) v = 100;
    else if (s.endsWith('+10')) v += 10;
    else if (s.endsWith('-10')) v -= 10;
    else if (s.endsWith('+1')) v += 1;
    else if (s.endsWith('-1')) v -= 1;
  }
  return v;
}

describe('override steps', () => {
  it('reaches the target with the fewest coarse steps', () => {
    expect(overrideSteps('feed', 100, 123)).toEqual(['feed+10', 'feed+10', 'feed+1', 'feed+1', 'feed+1']);
    expect(apply(100, overrideSteps('spindle', 100, 37))).toBe(37);
  });

  it('resets straight to 100', () => {
    expect(overrideSteps('feed', 150, 100)).toEqual(['feed-100']);
    expect(overrideSteps('feed', 100, 100)).toEqual([]);
  });

  it('clamps to the GRBL range', () => {
    expect(apply(100, overrideSteps('feed', 100, 500))).toBe(200);
    expect(apply(100, overrideSteps('feed', 100, 0))).toBe(10);
  });

  it('reaches any target from any start', () => {
    for (const start of [10, 57, 100, 143, 200])
      for (const target of [10, 33, 100, 171, 200]) {
        expect(apply(start, overrideSteps('feed', start, target))).toBe(target);
      }
  });
});
