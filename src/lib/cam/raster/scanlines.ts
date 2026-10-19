import type { ToolpathRun } from '../types';
import type { BurnLevels } from './dither';

/** The engraving grid: `cols × rows` burn levels, row 0 at the top of the image. */
export interface BurnGrid {
  levels: BurnLevels;
  cols: number;
  rows: number;
}

/**
 * Maps pixel boundaries to bed mm: column boundary k sits at `x0 + k·dx`, row boundary k at
 * `y0 + k·dy`. dx/dy may be negative (mirrored images, Y-up bed with row 0 at the top).
 */
export interface BedMapping {
  x0: number;
  dx: number;
  y0: number;
  dy: number;
}

export interface ScanOptions {
  scanAngle: 0 | 90;
  bidirectional: boolean;
  /** mm of laser-off travel before the first and after the last burned pixel. */
  overscan: number;
  /** Power percent per burn level (index 0..255). Level 0 must map to 0. */
  powerByLevel: Float64Array;
}

/**
 * Turns the burn grid into one run per non-blank scanline. Each run is run-length encoded
 * (adjacent pixels with equal power form one segment), trimmed to the first/last burned pixel,
 * padded with power-0 overscan, and alternates direction on consecutive burned lines when
 * bidirectional. "Forward" always means increasing bed X (rows) or bed Y (columns).
 */
export function scanlineRuns(grid: BurnGrid, mapping: BedMapping, options: ScanOptions): ToolpathRun[] {
  const alongRows = options.scanAngle === 0;
  const lineCount = alongRows ? grid.rows : grid.cols;
  const lineLength = alongRows ? grid.cols : grid.rows;
  const s0 = alongRows ? mapping.x0 : mapping.y0;
  const ds = alongRows ? mapping.dx : mapping.dy;
  const crossStart = alongRows ? mapping.y0 : mapping.x0;
  const crossStep = alongRows ? mapping.dy : mapping.dx;
  const line = new Uint8Array(lineLength);
  const runs: ToolpathRun[] = [];

  for (let i = 0; i < lineCount; i++) {
    readLine(grid, alongRows, i, line);
    let first = 0;
    while (first < lineLength && line[first] === 0) first++;
    if (first === lineLength) continue;
    let last = lineLength - 1;
    while (line[last] === 0) last--;

    const forward = !options.bidirectional || runs.length % 2 === 0;
    const travelSign = forward ? 1 : -1;
    const ascending = forward === ds > 0;
    const cross = crossStart + (i + 0.5) * crossStep;
    const run = encodeLine(line, first, last, ascending, options.powerByLevel);
    runs.push(toRun(run, s0, ds, cross, alongRows, options.overscan * travelSign));
  }
  return runs;
}

function readLine(grid: BurnGrid, alongRows: boolean, index: number, out: Uint8Array): void {
  if (alongRows) {
    out.set(grid.levels.subarray(index * grid.cols, (index + 1) * grid.cols));
    return;
  }
  for (let r = 0; r < grid.rows; r++) out[r] = grid.levels[r * grid.cols + index];
}

/** Boundary indices along the line (in travel order) and the power of each segment between them. */
interface EncodedLine {
  boundaries: number[];
  power: number[];
}

function encodeLine(
  line: Uint8Array,
  first: number,
  last: number,
  ascending: boolean,
  powerByLevel: Float64Array,
): EncodedLine {
  const boundaries: number[] = [];
  const power: number[] = [];
  if (ascending) {
    boundaries.push(first);
    let k = first;
    while (k <= last) {
      const p = powerByLevel[line[k]];
      while (k <= last && powerByLevel[line[k]] === p) k++;
      boundaries.push(k);
      power.push(p);
    }
  } else {
    boundaries.push(last + 1);
    let k = last;
    while (k >= first) {
      const p = powerByLevel[line[k]];
      while (k >= first && powerByLevel[line[k]] === p) k--;
      boundaries.push(k + 1);
      power.push(p);
    }
  }
  return { boundaries, power };
}

function toRun(
  encoded: EncodedLine,
  s0: number,
  ds: number,
  cross: number,
  alongRows: boolean,
  signedOverscan: number,
): ToolpathRun {
  const points: number[] = [];
  const power: number[] = [];
  const push = (s: number) => {
    if (alongRows) points.push(s, cross);
    else points.push(cross, s);
  };
  const { boundaries } = encoded;
  const start = s0 + boundaries[0] * ds;
  const end = s0 + boundaries[boundaries.length - 1] * ds;
  if (signedOverscan !== 0) {
    push(start - signedOverscan);
    power.push(0);
  }
  push(start);
  for (let b = 1; b < boundaries.length; b++) {
    push(s0 + boundaries[b] * ds);
    power.push(encoded.power[b - 1]);
  }
  if (signedOverscan !== 0) {
    push(end + signedOverscan);
    power.push(0);
  }
  return { points, power };
}
