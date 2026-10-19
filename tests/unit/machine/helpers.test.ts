import { describe, expect, it } from 'vitest';
import { continuousJogDelta } from '$lib/machine/grbl/continuous-jog';
import { buildJogCommand, formatNumber } from '$lib/machine/grbl/gcode-format';
import { deriveBedSizeMismatch, deriveLaserModeOff } from '$lib/machine/grbl/handshake';
import { isManualLaserOnCommand } from '$lib/machine/grbl/laser-safety';
import { initialMachineState } from '$lib/machine/grbl/machine-state';
import { buildFrameGcode } from '$lib/machine/job/frame';
import { prepareGcodeLines, streamLineProblem } from '$lib/machine/job/gcode-lines';
import { estimateRemainingMs } from '$lib/machine/job/remaining-time';
import { writable } from '$lib/machine/store';
import { testProfile } from './helpers';

describe('formatting', () => {
  it('formats numbers with fixed precision and no trailing zeros', () => {
    expect(formatNumber(12.5)).toBe('12.5');
    expect(formatNumber(3)).toBe('3');
    expect(formatNumber(1.23456)).toBe('1.235');
    expect(formatNumber(-0.0001)).toBe('0');
    expect(formatNumber(2999.6, 0)).toBe('3000');
  });

  it('builds incremental jog commands', () => {
    expect(buildJogCommand({ x: 10, y: -0.1 }, 3000)).toBe('$J=G91 G21 X10 Y-0.1 F3000');
    expect(buildJogCommand({ y: 5, z: 0 }, 1200.4)).toBe('$J=G91 G21 Y5 F1200');
    expect(() => buildJogCommand({}, 1000)).toThrow(RangeError);
    expect(() => buildJogCommand({ x: 1 }, 0)).toThrow(RangeError);
  });
});

describe('isManualLaserOnCommand', () => {
  it.each([
    ['M3 S1000', true],
    ['m4 s10', true],
    ['G1 X10 M03 S200', true],
    ['M3 S0', false],
    ['M5 S1000', false],
    ['M30', false],
    ['G1 X10 S1000', false],
    ['$32=1', false],
    ['(M3 S1000) G0 X0', false],
  ])('%s → %s', (line, expected) => {
    expect(isManualLaserOnCommand(line)).toBe(expected);
  });

  it('uses the modal S when the line has none', () => {
    expect(isManualLaserOnCommand('M3', 500)).toBe(true);
    expect(isManualLaserOnCommand('M3', 0)).toBe(false);
  });
});

describe('handshake derivations', () => {
  it('flags laser mode off unless $32=1', () => {
    expect(deriveLaserModeOff({ 32: '1' })).toBe(false);
    expect(deriveLaserModeOff({ 32: '0' })).toBe(true);
    expect(deriveLaserModeOff({})).toBe(true);
  });

  it('flags bed size differences over 5 mm', () => {
    const profile = testProfile({ bedWidth: 400, bedHeight: 400 });
    expect(deriveBedSizeMismatch({ 130: '404.000', 131: '396.000' }, profile)).toBeNull();
    expect(deriveBedSizeMismatch({ 130: '410.000', 131: '400.000' }, profile)).toEqual({
      width: 410,
      height: 400,
    });
    expect(deriveBedSizeMismatch({ 130: '400.000' }, profile)).toBeNull();
  });
});

describe('buildFrameGcode', () => {
  const bounds = { minX: 10, minY: 20, maxX: 110.5, maxY: 70 };

  it('traces the bounds with the laser off at frame speed by default', () => {
    expect(buildFrameGcode(bounds, testProfile({ frameSpeed: 2400 }))).toEqual([
      'G90',
      'G21',
      'M5 S0',
      'G0 X10 Y20',
      'G1 X110.5 Y20 F2400 S0',
      'G1 X110.5 Y70',
      'G1 X10 Y70',
      'G1 X10 Y20',
      'M5 S0',
    ]);
  });

  it('uses M3 at the frame power, clamped to 5 %, and M5 right after', () => {
    const lines = buildFrameGcode(bounds, testProfile({ framePowerPercent: 20, maxS: 1000 }));
    expect(lines).toContain('M3 S50');
    expect(lines.at(-1)).toBe('M5 S0');
    expect(lines.filter((l) => l.includes('S0') && l.startsWith('G1'))).toEqual([]);
    expect(buildFrameGcode(bounds, testProfile({ framePowerPercent: 2, maxS: 255 }))).toContain('M3 S5');
  });
});

describe('G-code line preparation', () => {
  it('strips comments, blank lines and program markers', () => {
    expect(prepareGcodeLines('%\nG21 (units?)\n\n; pause!\nG1 X1 ; go~\r\nM5\r')).toEqual([
      'G21',
      'G1 X1',
      'M5',
    ]);
  });

  it('rejects lines that would confuse the stream', () => {
    expect(streamLineProblem('G1 X1', 128)).toBeNull();
    expect(streamLineProblem('G1 X1 ?', 128)).toMatch(/realtime/);
    expect(streamLineProblem('G1 X1 °', 128)).toMatch(/ASCII/);
    expect(streamLineProblem('G1'.padEnd(127, ' '), 128)).toMatch(/longer/);
  });
});

describe('estimateRemainingMs', () => {
  it('uses the CAM estimate before enough lines are acknowledged', () => {
    expect(estimateRemainingMs({ total: 1000, acked: 0, activeMs: 0, estimatedMs: 60_000 })).toBe(60_000);
    expect(estimateRemainingMs({ total: 1000, acked: 5, activeMs: 100, estimatedMs: null })).toBeNull();
  });

  it('blends towards the observed rate as the job progresses', () => {
    // Observed: 10 ms per line; estimate says 20 ms per line.
    const half = estimateRemainingMs({ total: 1000, acked: 500, activeMs: 5000, estimatedMs: 20_000 });
    expect(half).toBeCloseTo(0.5 * 10_000 + 0.5 * 5000);
    expect(estimateRemainingMs({ total: 1000, acked: 1000, activeMs: 9000, estimatedMs: 20_000 })).toBe(0);
  });
});

describe('continuousJogDelta', () => {
  const state = { ...initialMachineState(), settings: { 130: '400.000', 131: '300.000' } };

  it('jogs the full travel when not homed', () => {
    expect(continuousJogDelta({ x: 1 }, state, { x: 1, y: 1 })).toEqual({ x: 400 });
  });

  it('stops at the soft limit when homed', () => {
    const homed = { ...state, homed: true, mpos: { x: 100, y: 50, z: 0 } };
    expect(continuousJogDelta({ x: 1, y: -1 }, homed, { x: 1, y: 1 })).toEqual({ x: 300, y: -50 });
    const negativeSpace = { ...state, homed: true, mpos: { x: -100, y: -50, z: 0 } };
    expect(continuousJogDelta({ x: 1, y: -1 }, negativeSpace, { x: 1, y: 1 })).toEqual({ x: 100, y: -250 });
  });

  it('returns nothing when already at the limit', () => {
    const atLimit = { ...state, homed: true, mpos: { x: 400, y: 0, z: 0 } };
    expect(continuousJogDelta({ x: 1 }, atLimit, { x: 1, y: 1 })).toEqual({});
  });
});

describe('writable', () => {
  it('calls subscribers immediately and on change, Svelte-style', () => {
    const store = writable(1);
    const seen: number[] = [];
    const unsubscribe = store.subscribe((v) => seen.push(v));
    store.set(2);
    store.update((v) => v + 1);
    unsubscribe();
    store.set(9);
    expect(seen).toEqual([1, 2, 3]);
    expect(store.get()).toBe(9);
  });
});
