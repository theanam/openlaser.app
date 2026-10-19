import { describe, expect, it } from 'vitest';
import { DEFAULT_GCODE_OPTIONS, emitGcode, type EmitSettings, MAX_LINE_LENGTH } from '$lib/cam/gcode/emit';
import { formatCoordinate, formatInteger, powerToS, userLines } from '$lib/cam/gcode/format';
import type { Toolpath } from '$lib/cam/types';

const settings = (partial: Partial<EmitSettings> = {}): EmitSettings => ({
  maxS: 1000,
  header: '',
  footer: '',
  airAssist: false,
  returnTo: null,
  start: { x: 0, y: 0 },
  options: DEFAULT_GCODE_OPTIONS,
  ...partial,
});
const square: Toolpath = {
  layerId: 'cut',
  feed: 600,
  airAssist: false,
  runs: [{ points: [10, 10, 20, 10, 20, 20, 10, 20, 10, 10], power: 80 }],
};

describe('number formatting', () => {
  it('uses 3 decimals and strips trailing zeros', () => {
    expect(formatCoordinate(10)).toBe('10');
    expect(formatCoordinate(10.5)).toBe('10.5');
    expect(formatCoordinate(1.23456)).toBe('1.235');
    expect(formatCoordinate(-0.0001)).toBe('0');
    expect(formatCoordinate(0.1 + 0.2)).toBe('0.3');
  });

  it('drops the leading zero only when asked', () => {
    expect(formatCoordinate(0.5, false)).toBe('.5');
    expect(formatCoordinate(-0.25, false)).toBe('-.25');
    expect(formatCoordinate(10.5, false)).toBe('10.5');
    expect(formatCoordinate(0.5, true)).toBe('0.5');
  });

  it('formats S and F as integers and maps percent to S', () => {
    expect(formatInteger(599.6)).toBe('600');
    expect(formatInteger(-0.2)).toBe('0');
    expect(powerToS(80, 1000)).toBe(800);
    expect(powerToS(33.3, 255)).toBe(85);
    expect(powerToS(150, 1000)).toBe(1000);
    expect(powerToS(-5, 1000)).toBe(0);
  });

  it('splits user lines', () => {
    expect(userLines(' G4 P0 \r\n\nM7\n')).toEqual(['G4 P0', 'M7']);
  });
});

describe('emitGcode', () => {
  it('emits header, optimized moves and footer', () => {
    expect(emitGcode([square], settings()).lines).toEqual([
      'G90',
      'G21',
      'M4 S0',
      'G0 X10 Y10',
      'G1 X20 F600 S800',
      'Y20',
      'X10',
      'Y10',
      'M5 S0',
    ]);
  });

  it('emits full words without the optimizer', () => {
    const lines = emitGcode(
      [square],
      settings({ options: { ...DEFAULT_GCODE_OPTIONS, optimize: false } }),
    ).lines;
    expect(lines.slice(3, 6)).toEqual(['G0 X10 Y10', 'G1 X20 Y10 F600 S800', 'G1 X20 Y20 F600 S800']);
  });

  it('adds user header/footer, air assist and the return move in order', () => {
    const lines = emitGcode(
      [square],
      settings({ header: 'G4 P0.1', footer: 'M2', airAssist: true, returnTo: { x: 0, y: 0 } }),
    ).lines;
    expect(lines.slice(0, 5)).toEqual(['G90', 'G21', 'M4 S0', 'G4 P0.1', 'M8']);
    expect(lines.slice(-4)).toEqual(['M5 S0', 'M9', 'M2', 'G0 X0 Y0']);
  });

  it('uses M3 for constant-power toolpaths and returns to M4', () => {
    const frame: Toolpath = { ...square, laserMode: 'constant' };
    const lines = emitGcode([frame, { ...square, layerId: 'b' }], settings()).lines;
    expect(lines).toContain('M3 S0');
    expect(lines.indexOf('M4 S0', 3)).toBeGreaterThan(lines.indexOf('M3 S0'));
  });

  it('writes per-segment power and re-emits S only on change (S0 is modal from the header)', () => {
    const run: Toolpath = { ...square, runs: [{ points: [0, 0, 1, 0, 2, 0, 3, 0], power: [0, 50, 50] }] };
    expect(emitGcode([run], settings()).lines.slice(3, 7)).toEqual([
      'G0 X0 Y0',
      'G1 X1 F600',
      'X2 S500',
      'X3',
    ]);
  });

  it('re-emits G1 after a rapid but keeps F', () => {
    const two: Toolpath = {
      ...square,
      runs: [
        { points: [0, 0, 5, 0], power: 50 },
        { points: [10, 0, 15, 0], power: 50 },
      ],
    };
    expect(emitGcode([two], settings()).lines.slice(3, 7)).toEqual([
      'G0 X0 Y0',
      'G1 X5 F600 S500',
      'G0 X10',
      'G1 X15',
    ]);
  });

  it('skips moves that round to zero length', () => {
    const tiny: Toolpath = { ...square, runs: [{ points: [0, 0, 0.0001, 0, 1, 0], power: 50 }] };
    expect(emitGcode([tiny], settings()).lines.slice(3)).toEqual(['G0 X0 Y0', 'G1 X1 F600 S500', 'M5 S0']);
  });

  it('adds layer comments only in debug mode', () => {
    const lines = emitGcode(
      [square],
      settings({
        options: { ...DEFAULT_GCODE_OPTIONS, comments: true },
        layerNames: new Map([['cut', 'Cut (outer)']]),
      }),
    ).lines;
    expect(lines[3]).toBe('; Cut  outer ');
    expect(emitGcode([square], settings()).lines.some((l) => l.includes(';'))).toBe(false);
  });

  it('reports moves in formatted coordinates', () => {
    const { moves } = emitGcode(
      [{ ...square, runs: [{ points: [1.00049, 0, 2, 0], power: 10 }] }],
      settings(),
    );
    expect(moves[0]).toMatchObject({ x0: 0, y0: 0, x1: 1, y1: 0, rapid: true });
    expect(moves[1]).toMatchObject({ x0: 1, x1: 2, rapid: false, feed: 600, s: 100 });
  });

  it('keeps every line under 80 characters for extreme coordinates', () => {
    const big: Toolpath = {
      ...square,
      feed: 120000,
      runs: [{ points: [-12345.6789, -98765.4321, 99999.999, 88888.888], power: 100 }],
    };
    const lines = emitGcode(
      [big],
      settings({ maxS: 100000, options: { ...DEFAULT_GCODE_OPTIONS, optimize: false } }),
    ).lines;
    for (const line of lines) expect(line.length).toBeLessThan(MAX_LINE_LENGTH);
  });
});
