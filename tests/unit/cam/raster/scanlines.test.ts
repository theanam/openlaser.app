import { describe, expect, it } from 'vitest';
import { type BedMapping, scanlineRuns, type ScanOptions } from '$lib/cam/raster/scanlines';

const FULL = (() => {
  const table = new Float64Array(256);
  for (let i = 1; i < 256; i++) table[i] = 80;
  return table;
})();

/** 1 mm pixels, bitmap top-left at bed (0, rows) so row 0 is the top row. */
const mappingFor = (rows: number): BedMapping => ({ x0: 0, dx: 1, y0: rows, dy: -1 });

const options = (overrides: Partial<ScanOptions> = {}): ScanOptions => ({
  scanAngle: 0,
  bidirectional: false,
  overscan: 0,
  powerByLevel: FULL,
  ...overrides,
});

const grid = (rows: number[][]) => ({
  levels: Uint8Array.from(rows.flat()),
  cols: rows[0].length,
  rows: rows.length,
});

describe('scanlineRuns', () => {
  it('run-length encodes equal power and trims blank ends', () => {
    const runs = scanlineRuns(grid([[0, 255, 255, 0, 255, 0, 0]]), mappingFor(1), options());
    expect(runs).toEqual([{ points: [1, 0.5, 3, 0.5, 4, 0.5, 5, 0.5], power: [80, 0, 80] }]);
  });

  it('skips fully blank rows and places rows at pixel centers', () => {
    const runs = scanlineRuns(grid([[255], [0], [255]]), mappingFor(3), options());
    expect(runs.map((r) => r.points[1])).toEqual([2.5, 0.5]);
  });

  it('adds power-0 overscan past the first and last burned pixel', () => {
    const runs = scanlineRuns(grid([[0, 255, 255, 0]]), mappingFor(1), options({ overscan: 2 }));
    expect(runs[0]).toEqual({ points: [-1, 0.5, 1, 0.5, 3, 0.5, 5, 0.5], power: [0, 80, 0] });
  });

  it('alternates direction on consecutive burned rows when bidirectional', () => {
    const levels = [
      [255, 255, 0],
      [0, 0, 0],
      [0, 255, 255],
      [255, 0, 0],
    ];
    const runs = scanlineRuns(grid(levels), mappingFor(4), options({ bidirectional: true, overscan: 1 }));
    expect(runs).toEqual([
      { points: [-1, 3.5, 0, 3.5, 2, 3.5, 3, 3.5], power: [0, 80, 0] },
      { points: [4, 1.5, 3, 1.5, 1, 1.5, 0, 1.5], power: [0, 80, 0] },
      { points: [-1, 0.5, 0, 0.5, 1, 0.5, 2, 0.5], power: [0, 80, 0] },
    ]);
  });

  it('keeps one direction when unidirectional', () => {
    const runs = scanlineRuns(
      grid([
        [255, 255],
        [255, 255],
      ]),
      mappingFor(2),
      options(),
    );
    for (const run of runs) expect(run.points[2]).toBeGreaterThan(run.points[0]);
  });

  it('scans columns along +Y for scanAngle 90', () => {
    const levels = [
      [255, 0],
      [255, 255],
      [0, 255],
    ];
    const runs = scanlineRuns(grid(levels), mappingFor(3), options({ scanAngle: 90, bidirectional: true }));
    expect(runs).toEqual([
      // Column 0 burns rows 0–1 (bed y 3 down to 1); first run travels +Y.
      { points: [0.5, 1, 0.5, 3], power: [80] },
      // Column 1 burns rows 1–2 (bed y 2 down to 0); second run travels −Y.
      { points: [1.5, 2, 1.5, 0], power: [80] },
    ]);
  });

  it('uses per-pixel power for grayscale levels', () => {
    const table = Float64Array.from({ length: 256 }, (_, i) => (i === 0 ? 0 : i / 10));
    const runs = scanlineRuns(grid([[10, 10, 20, 0, 30]]), mappingFor(1), options({ powerByLevel: table }));
    expect(runs[0].power).toEqual([1, 2, 0, 3]);
    expect(runs[0].points.filter((_, i) => i % 2 === 0)).toEqual([0, 2, 3, 4, 5]);
  });

  it('handles mirrored mappings (negative dx) and still burns forward along +X first', () => {
    const mirrored: BedMapping = { x0: 10, dx: -1, y0: 1, dy: -1 };
    const runs = scanlineRuns(
      grid([[255, 0, 128]]),
      mirrored,
      options({ powerByLevel: Float64Array.from({ length: 256 }, (_, i) => i) }),
    );
    // Pixel 2 (power 128) is at bed x 7..8, pixel 0 (power 255) at 9..10.
    expect(runs[0]).toEqual({ points: [7, 0.5, 8, 0.5, 9, 0.5, 10, 0.5], power: [128, 0, 255] });
  });
});
