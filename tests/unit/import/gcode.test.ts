import { describe, expect, it } from 'vitest';
import { isGcodeFileName, parseGcode, splitGcodeLines, validateGcodeLines } from '$lib/import/gcode';
import type { MoveList } from '$lib/cam/types';

/** Moves as plain tuples [x0, y0, x1, y1, power, rapid, line] rounded for comparison. */
function moves(list: MoveList): number[][] {
  const out: number[][] = [];
  for (let i = 0; i < list.count; i++) {
    const c = Array.from(list.coords.subarray(i * 4, i * 4 + 4), (v) => Math.round(v * 1000) / 1000);
    out.push([...c, Math.round(list.power[i] * 1000) / 1000, list.rapid[i], list.line[i]]);
  }
  return out;
}

describe('parseGcode', () => {
  it('parses rapids and burns with laser-mode power', () => {
    const list = parseGcode('G90 G21\nM4 S500\nG0 X10 Y10\nG1 X20 F1000\nG1 Y20 S1000\nM5\nG1 X10\n');
    expect(moves(list)).toEqual([
      [0, 0, 10, 10, 0, 1, 2],
      [10, 10, 20, 10, 0.5, 0, 3],
      [20, 10, 20, 20, 1, 0, 4],
      [20, 20, 10, 20, 0, 0, 6],
    ]);
    expect(list.lineCount).toBe(7);
    expect(list.bounds).toEqual({ minX: 0, minY: 0, maxX: 20, maxY: 20 });
    expect(list.burnBounds).toEqual({ minX: 10, minY: 10, maxX: 20, maxY: 20 });
  });

  it('uses modal motion and honours maxS', () => {
    const list = parseGcode('M3 S255\nG1 X1\nX2\nY3', { maxS: 255 });
    expect(moves(list).map((m) => m.slice(0, 5))).toEqual([
      [0, 0, 1, 0, 1],
      [1, 0, 2, 0, 1],
      [2, 0, 2, 3, 1],
    ]);
  });

  it('supports relative distances and inches', () => {
    const list = parseGcode('G91\nG0 X1 Y1\nG0 X1\nG90 G20\nG0 X1 Y2');
    expect(moves(list).map((m) => m.slice(0, 4))).toEqual([
      [0, 0, 1, 1],
      [1, 1, 2, 1],
      [2, 1, 25.4, 50.8],
    ]);
  });

  it('ignores comments, line numbers, case and $ / % lines', () => {
    const text = '%\n$H\n(header) ; note\nn10 g0 x5 (inline) y5 ; trailing X99\n\n$J=G91 X10 F100\ng1x6y5';
    const list = parseGcode(text);
    expect(moves(list).map((m) => [...m.slice(0, 4), m[6]])).toEqual([
      [0, 0, 5, 5, 3],
      [5, 5, 6, 5, 6],
    ]);
    expect(list.lineCount).toBe(7);
  });

  it('does not treat G92/G28/G4 parameters as moves', () => {
    const list = parseGcode('G92 X100 Y100\nG28 X0 Y0\nG4 P1\nG0 X1');
    expect(list.count).toBe(1);
  });

  it('flattens I/J arcs within tolerance', () => {
    // Counter-clockwise quarter circle radius 10 from (10,0) to (0,10) around the origin.
    const list = parseGcode('G0 X10 Y0\nM4 S1000\nG3 X0 Y10 I-10 J0', { arcTolerance: 0.05 });
    expect(list.count).toBeGreaterThan(5);
    for (let i = 1; i < list.count; i++) {
      const x = list.coords[i * 4 + 2];
      const y = list.coords[i * 4 + 3];
      expect(Math.hypot(x, y)).toBeCloseTo(10, 4);
      expect(list.power[i]).toBe(1);
      expect(list.line[i]).toBe(2);
    }
    // Chord sagitta stays under the tolerance.
    const step = Math.hypot(list.coords[6] - list.coords[4], list.coords[7] - list.coords[5]);
    expect(10 - Math.sqrt(100 - (step / 2) ** 2)).toBeLessThanOrEqual(0.0501);
    expect(list.burnBounds?.maxX).toBeCloseTo(10, 4);
    expect(list.burnBounds?.maxY).toBeCloseTo(10, 4);
  });

  it('goes clockwise for G2 and draws full circles when start equals end', () => {
    const cw = parseGcode('G0 X10 Y0\nG2 X0 Y-10 I-10 J0');
    // Clockwise from (10,0) to (0,-10) stays in the fourth quadrant.
    for (let i = 1; i < cw.count; i++) expect(cw.coords[i * 4 + 3]).toBeLessThanOrEqual(1e-4);
    const circle = parseGcode('G0 X10 Y0\nG2 X10 Y0 I-10 J0');
    expect(circle.bounds?.minX).toBeCloseTo(-10, 3);
    expect(circle.bounds?.maxY).toBeCloseTo(10, 3);
  });

  it('supports the R form, with negative R for the long way round', () => {
    const short = parseGcode('G2 X10 Y0 R5', { arcTolerance: 0.01 });
    // Semicircle above the chord (clockwise from (0,0) to (10,0) with the center at (5,0)).
    expect(short.bounds?.maxY).toBeGreaterThan(4.98);
    expect(short.bounds?.maxY).toBeLessThanOrEqual(5 + 1e-6);
    const minor = parseGcode('G2 X10 Y0 R10');
    const major = parseGcode('G2 X10 Y0 R-10');
    const height = (l: MoveList) =>
      (l.bounds as NonNullable<MoveList['bounds']>).maxY - (l.bounds as NonNullable<MoveList['bounds']>).minY;
    expect(height(major)).toBeGreaterThan(height(minor) * 5);
  });

  it('returns empty bounds for files without moves', () => {
    const list = parseGcode('$$\n; nothing');
    expect(list.count).toBe(0);
    expect(list.bounds).toBeNull();
    expect(list.burnBounds).toBeNull();
    expect(list.lineCount).toBe(2);
  });

  it('parses 100k lines quickly', () => {
    const lines = ['G90 G21', 'M4 S0'];
    for (let i = 0; i < 100_000; i++)
      lines.push(`G1 X${(i % 400) / 4} Y${Math.floor(i / 400) / 10} S${i % 1000}`);
    const started = performance.now();
    const list = parseGcode(lines.join('\n'));
    expect(performance.now() - started).toBeLessThan(2000);
    expect(list.count).toBeGreaterThan(99_000);
    expect(list.coords.length).toBe(list.count * 4);
  });
});

describe('splitGcodeLines / validateGcodeLines', () => {
  it('strips comments and whitespace and drops empty lines', () => {
    expect(splitGcodeLines('  G0 X1 ; go\r\n(only comment)\n\n%\nG1 (mid) X2\n$H\n')).toEqual([
      'G0 X1',
      'G1  X2',
      '$H',
    ]);
  });

  it('reports lines of 80 characters or more without changing them', () => {
    const long = `G1 X${'1'.repeat(80)}`;
    const lines = splitGcodeLines(`G0 X1\n${long}`);
    expect(lines[1]).toBe(long);
    const issues = validateGcodeLines(lines);
    expect(issues).toHaveLength(1);
    expect(issues[0].index).toBe(1);
    expect(validateGcodeLines([`G1 X${'1'.repeat(75)}`])).toEqual([]);
  });
});

describe('isGcodeFileName', () => {
  it('accepts the sender extensions', () => {
    for (const name of ['a.gcode', 'B.NC', 'c.gc', 'd.ngc', 'e.txt'])
      expect(isGcodeFileName(name)).toBe(true);
    expect(isGcodeFileName('f.svg')).toBe(false);
  });
});
