import { describe, expect, it } from 'vitest';
import { anchorPoint, compileJob, jobBounds, MAX_LINE_LENGTH, objectBounds } from '$lib/cam';
import { originOffset } from '$lib/cam/origin';
import { multiply, rotation, scaling, translation } from '$lib/geometry/mat2d';
import { interpretGcode } from './gcode-interpreter';
import {
  compileInput,
  DEFAULT_JOB_SETTINGS,
  imageObject,
  layer,
  polyPath,
  profile,
  project,
  rectPath,
  vectorObject,
} from './fixtures';

const bounds = { minX: 10, minY: 20, maxX: 30, maxY: 60 };

describe('anchorPoint', () => {
  it('maps anchors on a bottom-left origin machine', () => {
    expect(anchorPoint(bounds, 'bl')).toEqual({ x: 10, y: 20 });
    expect(anchorPoint(bounds, 'tr')).toEqual({ x: 30, y: 60 });
    expect(anchorPoint(bounds, 'c')).toEqual({ x: 20, y: 40 });
    expect(anchorPoint(bounds, 't')).toEqual({ x: 20, y: 60 });
    expect(anchorPoint(bounds, 'l')).toEqual({ x: 10, y: 40 });
  });

  it('follows the screen orientation of other origin corners', () => {
    expect(anchorPoint(bounds, 'tl', 'tl')).toEqual({ x: 10, y: 20 });
    expect(anchorPoint(bounds, 'tl', 'tr')).toEqual({ x: 30, y: 20 });
    expect(anchorPoint(bounds, 'bl', 'br')).toEqual({ x: 30, y: 20 });
  });
});

describe('originOffset', () => {
  it('is zero for absolute jobs', () => {
    expect(originOffset(bounds, DEFAULT_JOB_SETTINGS, profile(), { x: 5, y: 5 })).toEqual({ x: 0, y: 0 });
  });

  it('moves the anchor to the machine position or user origin', () => {
    const current = { ...DEFAULT_JOB_SETTINGS, origin: 'current-position' as const, anchor: 'c' as const };
    expect(originOffset(bounds, current, profile(), { x: 100, y: 100 })).toEqual({ x: 80, y: 60 });
    const user = { ...DEFAULT_JOB_SETTINGS, origin: 'user-origin' as const, userOrigin: { x: 0, y: 0 } };
    expect(originOffset(bounds, user, profile(), undefined)).toEqual({ x: -10, y: -20 });
  });
});

describe('objectBounds / jobBounds', () => {
  it('bounds vector and image objects in bed space', () => {
    const v = vectorObject('v', 'l', [rectPath(0, 0, 10, 10)], multiply(translation(5, 5), scaling(2)));
    expect(objectBounds(v)).toEqual({ minX: 5, minY: 5, maxX: 25, maxY: 25 });
    const img = imageObject('i', 'l', 'asset', 40, 20, translation(100, 0));
    expect(objectBounds(img)).toEqual({ minX: 100, minY: 0, maxX: 140, maxY: 20 });
    const rotated = objectBounds(vectorObject('r', 'l', [rectPath(0, 0, 10, 10)], rotation(90)))!;
    expect(rotated.minX).toBeCloseTo(-10);
  });

  it('includes only visible objects on output layers', () => {
    const p = project(
      [layer({ id: 'a' }), layer({ id: 'b', output: false })],
      [
        vectorObject('in', 'a', [rectPath(0, 0, 10, 10)]),
        { ...vectorObject('hidden', 'a', [rectPath(0, 0, 100, 100)]), visible: false },
        vectorObject('off', 'b', [rectPath(0, 0, 200, 200)]),
      ],
    );
    expect(jobBounds(p)).toEqual({ minX: 0, minY: 0, maxX: 10, maxY: 10 });
  });
});

describe('compileJob', () => {
  it('compiles a line layer to G-code with stats and bounds', () => {
    const plan = compileJob(
      compileInput(
        project(
          [layer({ id: 'cut', speed: 600, power: 80 })],
          [vectorObject('r', 'cut', [rectPath(10, 10, 30, 20)])],
        ),
      ),
    );
    expect(plan.warnings).toEqual([]);
    expect(plan.gcode[0]).toBe('G90');
    expect(plan.gcode).toContain('G1 X40 F600 S800');
    expect(plan.bounds).toEqual({ minX: 10, minY: 10, maxX: 40, maxY: 30 });
    expect(plan.stats.burnDistance).toBeCloseTo(100);
    expect(plan.stats.travelDistance).toBeCloseTo(Math.hypot(10, 10));
    expect(plan.stats.lineCount).toBe(plan.gcode.length);
    expect(plan.stats.byteCount).toBe(plan.gcode.join('\n').length + 1);
    expect(plan.stats.estimatedSeconds).toBeGreaterThan(10);
    for (const line of plan.gcode) expect(line.length).toBeLessThan(MAX_LINE_LENGTH);
  });

  it('runs layers in order, repeats passes and skips layers without output', () => {
    const p = project(
      [layer({ id: 'b', passes: 2 }), layer({ id: 'a' }), layer({ id: 'off', output: false })],
      [
        vectorObject('ra', 'a', [rectPath(0, 0, 10, 10)]),
        vectorObject('rb', 'b', [rectPath(50, 50, 10, 10)]),
        vectorObject('roff', 'off', [rectPath(100, 100, 10, 10)]),
      ],
    );
    const plan = compileJob(compileInput(p));
    expect(plan.toolpaths.map((t) => t.layerId)).toEqual(['b', 'a']);
    expect(plan.toolpaths[0].runs).toHaveLength(2);
    expect(plan.bounds).toEqual({ minX: 0, minY: 0, maxX: 60, maxY: 60 });
  });

  it('ignores the layer visible flag but skips hidden objects', () => {
    const p = project(
      [layer({ id: 'a', visible: false })],
      [
        vectorObject('shown', 'a', [rectPath(0, 0, 10, 10)]),
        { ...vectorObject('hidden', 'a', [rectPath(0, 0, 50, 50)]), visible: false },
      ],
    );
    expect(compileJob(compileInput(p)).bounds).toEqual({ minX: 0, minY: 0, maxX: 10, maxY: 10 });
  });

  it('translates the job for a current-position origin and returns there', () => {
    const p = project([layer({ id: 'a' })], [vectorObject('r', 'a', [rectPath(10, 10, 20, 20)])], {
      origin: 'current-position',
      anchor: 'c',
      returnToOrigin: true,
    });
    const plan = compileJob(compileInput(p, { machinePosition: { x: 100, y: 50 } }));
    expect(plan.bounds).toEqual({ minX: 90, minY: 40, maxX: 110, maxY: 60 });
    // The canvas shows a ghost of the design moved by this while the job runs.
    expect(plan.offset).toEqual({ x: 80, y: 30 });
    expect(compileJob(compileInput(project([layer({ id: 'a' })], p.objects))).offset).toEqual({ x: 0, y: 0 });
    expect(plan.gcode[plan.gcode.length - 1]).toBe('G0 X100 Y50');
  });

  it('warns about moves outside the bed with a blocking warning', () => {
    const p = project([layer({ id: 'a' })], [vectorObject('r', 'a', [rectPath(390, 10, 20, 20)])]);
    const plan = compileJob(compileInput(p));
    expect(plan.warnings).toEqual([expect.objectContaining({ code: 'out-of-bounds', blocking: true })]);
  });

  it('counts fill overscan as a move that must stay on the bed', () => {
    const fill = layer({
      id: 'f',
      mode: 'fill',
      fill: { interval: 1, angle: 0, bidirectional: true, overscan: 5, crossHatch: false },
    });
    const plan = compileJob(
      compileInput(project([fill], [vectorObject('r', 'f', [rectPath(1, 1, 10, 10)])])),
    );
    expect(plan.warnings.map((w) => w.code)).toEqual(['out-of-bounds']);
    expect(plan.bounds).toEqual({ minX: 1, minY: 1.5, maxX: 11, maxY: 10.5 });
  });

  it('warns about speeds above the machine max rate without blocking', () => {
    const p = project([layer({ id: 'a', speed: 9000 })], [vectorObject('r', 'a', [rectPath(0, 0, 10, 10)])]);
    const plan = compileJob(compileInput(p, { limits: { maxRateX: 8000, maxRateY: 6000 } }));
    expect(plan.warnings).toEqual([
      expect.objectContaining({ code: 'speed-exceeds-max', blocking: false, layerId: 'a' }),
    ]);
    expect(compileJob(compileInput(p)).warnings).toEqual([]);
  });

  it('reports an empty job', () => {
    const plan = compileJob(compileInput(project([layer({ id: 'a' })], [])));
    expect(plan.gcode).toEqual([]);
    expect(plan.bounds).toBeNull();
    expect(plan.warnings).toEqual([expect.objectContaining({ code: 'empty-job', blocking: true })]);
  });

  it('burns text through its cached outlines', () => {
    const outlined = {
      id: 'tx',
      layerId: 'l',
      name: 'Label',
      locked: false,
      visible: true,
      transform: [1, 0, 0, 1, 20, 30] as [number, number, number, number, number, number],
      kind: 'text' as const,
      text: 'O',
      fontFamily: 'x',
      fontSize: 10,
      fontWeight: 400,
      italic: false,
      align: 'left' as const,
      lineHeight: 1.2,
      letterSpacing: 0,
      paths: [rectPath(0, 0, 6, 8)],
    };
    const plan = compileJob(compileInput(project([layer({ id: 'l', mode: 'line' })], [outlined])));
    expect(plan.warnings).toEqual([]);
    expect(plan.bounds).toEqual({ minX: 20, minY: 30, maxX: 26, maxY: 38 });
  });

  it('marks text without outlines as blocking and open fill paths as warnings', () => {
    const text = {
      id: 't',
      layerId: 'f',
      name: 'Hello',
      locked: false,
      visible: true,
      transform: [1, 0, 0, 1, 0, 0] as [number, number, number, number, number, number],
      kind: 'text' as const,
      text: 'Hi',
      fontFamily: 'x',
      fontSize: 5,
      fontWeight: 400,
      italic: false,
      align: 'left' as const,
      lineHeight: 1.2,
      letterSpacing: 0,
      paths: [],
    };
    const p = project(
      [layer({ id: 'f', mode: 'fill' })],
      [
        text,
        vectorObject('mixed', 'f', [
          rectPath(10, 10, 5, 5),
          polyPath(
            [
              [0, 0],
              [5, 5],
            ],
            false,
          ),
        ]),
      ],
    );
    const plan = compileJob(compileInput(p));
    expect(plan.warnings.map((w) => w.code)).toEqual(['text-not-ready', 'open-path-fill']);
    expect(plan.warnings[0].blocking).toBe(true);
    expect(plan.bounds).not.toBeNull();
  });

  it('emits air assist only when the profile supports it', () => {
    const p = project(
      [layer({ id: 'a', airAssist: true })],
      [vectorObject('r', 'a', [rectPath(0, 0, 10, 10)])],
    );
    expect(compileJob(compileInput(p)).gcode).not.toContain('M8');
    const lines = compileJob(compileInput(p, { profile: profile({ supportsAirAssist: true }) })).gcode;
    expect(lines).toContain('M8');
    expect(lines).toContain('M9');
  });

  it('orders inner contours first only when optimizeOrder is on', () => {
    const objects = [
      vectorObject('outer', 'a', [rectPath(0, 0, 50, 50)]),
      vectorObject('inner', 'a', [rectPath(20, 20, 10, 10)]),
    ];
    const firstBurn = (optimizeOrder: boolean) => {
      const plan = compileJob(compileInput(project([layer({ id: 'a' })], objects, { optimizeOrder })));
      return interpretGcode(plan.gcode).find((m) => m.s > 0)!;
    };
    expect(firstBurn(true).x0).toBe(20);
    expect(firstBurn(false).x0).toBe(0);
  });

  it('is deterministic', () => {
    const p = project(
      [
        layer({
          id: 'f',
          mode: 'fill',
          fill: { interval: 0.5, angle: 30, bidirectional: true, overscan: 1, crossHatch: true },
        }),
        layer({ id: 'a' }),
      ],
      [vectorObject('r', 'f', [rectPath(10, 10, 20, 20)]), vectorObject('c', 'a', [rectPath(5, 5, 40, 40)])],
    );
    expect(compileJob(compileInput(p))).toEqual(compileJob(compileInput(p)));
  });
});

describe('constant power (CO₂)', () => {
  it('burns with M3 from the start and never switches to M4', () => {
    const input = compileInput(
      project(
        [layer({ id: 'cut', speed: 600, power: 80 })],
        [vectorObject('r', 'cut', [rectPath(10, 10, 30, 20)])],
      ),
    );
    const plan = compileJob({ ...input, profile: profile({ constantPower: true }) });
    expect(plan.gcode.slice(0, 3)).toEqual(['G90', 'G21', 'M3 S0']);
    expect(plan.gcode.some((l) => l.startsWith('M4'))).toBe(false);
    expect(compileJob(input).gcode[2]).toBe('M4 S0');
  });
});
