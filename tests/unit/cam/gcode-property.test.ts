import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { DEFAULT_GCODE_OPTIONS, emitGcode, type EmitSettings, MAX_LINE_LENGTH } from '$lib/cam/gcode/emit';
import type { Toolpath, ToolpathRun } from '$lib/cam/types';
import { interpretGcode } from './gcode-interpreter';

// Coarse grid so repeated coordinates, powers and feeds (the optimizer's cases) happen often.
const coord = fc.integer({ min: -2000, max: 2000 }).map((v) => v / 8);
const power = fc.constantFrom(0, 0, 10, 50, 50, 100, 33.3);
const run: fc.Arbitrary<ToolpathRun> = fc
  .array(fc.tuple(coord, coord), { minLength: 2, maxLength: 8 })
  .chain((pts) =>
    fc.oneof(
      power.map((p) => ({ points: pts.flat(), power: p })),
      fc
        .array(power, { minLength: pts.length - 1, maxLength: pts.length - 1 })
        .map((ps) => ({ points: pts.flat(), power: ps })),
    ),
  );
const toolpath: fc.Arbitrary<Toolpath> = fc.record({
  layerId: fc.constantFrom('a', 'b'),
  feed: fc.constantFrom(300, 1000, 1000, 6000),
  runs: fc.array(run, { minLength: 1, maxLength: 5 }),
  airAssist: fc.boolean(),
  laserMode: fc.constantFrom<'dynamic' | 'constant' | undefined>(undefined, 'dynamic', 'constant'),
});

const settings = (optimize: boolean, leadingZero: boolean): EmitSettings => ({
  maxS: 1000,
  header: '',
  footer: '',
  airAssist: false,
  returnTo: { x: 0, y: 0 },
  start: { x: 0, y: 0 },
  options: { ...DEFAULT_GCODE_OPTIONS, optimize, leadingZero },
});

describe('G-code optimizer', () => {
  it('produces the same machine moves as unoptimized output', () => {
    fc.assert(
      fc.property(
        fc.array(toolpath, { minLength: 1, maxLength: 4 }),
        fc.boolean(),
        (toolpaths, leadingZero) => {
          const optimized = emitGcode(toolpaths, settings(true, leadingZero)).lines;
          const full = emitGcode(toolpaths, settings(false, leadingZero)).lines;
          expect(interpretGcode(optimized)).toEqual(interpretGcode(full));
          expect(optimized.length).toBe(full.length);
          for (const line of [...optimized, ...full]) expect(line.length).toBeLessThan(MAX_LINE_LENGTH);
        },
      ),
      { numRuns: 300 },
    );
  });

  it('matches the moves the emitter reports', () => {
    fc.assert(
      fc.property(fc.array(toolpath, { minLength: 1, maxLength: 3 }), (toolpaths) => {
        const { lines, moves } = emitGcode(toolpaths, settings(true, true));
        const interpreted = interpretGcode(lines);
        expect(interpreted.map((m) => [m.x1, m.y1, m.rapid, m.s])).toEqual(
          moves.map((m) => [m.x1, m.y1, m.rapid, m.s]),
        );
      }),
      { numRuns: 150 },
    );
  });
});
