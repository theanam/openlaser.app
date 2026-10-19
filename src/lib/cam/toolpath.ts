/** Small helpers shared by the CAM stages for working with ToolpathRun data. */
import type { Polyline, Rect, Vec2 } from '../geometry/types';
import type { Toolpath, ToolpathRun } from './types';

/** Power of segment `index` (between point index and index + 1), percent. */
export function segmentPower(run: ToolpathRun, index: number): number {
  return typeof run.power === 'number' ? run.power : (run.power[index] ?? 0);
}

export function runPointCount(run: ToolpathRun): number {
  return run.points.length >> 1;
}

export function runStart(run: ToolpathRun): Vec2 {
  return { x: run.points[0], y: run.points[1] };
}

export function runEnd(run: ToolpathRun): Vec2 {
  const n = run.points.length;
  return { x: run.points[n - 2], y: run.points[n - 1] };
}

/** One run per polyline; closed polylines return to their first point. */
export function polylineToRun(polyline: Polyline, power: number): ToolpathRun {
  const points: number[] = [];
  for (const p of polyline.points) points.push(p.x, p.y);
  if (polyline.closed && polyline.points.length > 2) points.push(polyline.points[0].x, polyline.points[0].y);
  return { points, power };
}

/** Collapses a per-segment power array to a single value when every segment shares it. */
export function compactPower(power: number[]): number | number[] {
  return power.length > 0 && power.every((p) => p === power[0]) ? power[0] : power;
}

/** Bounds of segments with power > 0. Null when nothing burns. */
export function burnBounds(toolpaths: readonly Toolpath[]): Rect | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const tp of toolpaths) {
    for (const run of tp.runs) {
      const pts = run.points;
      for (let i = 0; i + 3 < pts.length; i += 2) {
        if (segmentPower(run, i >> 1) <= 0) continue;
        minX = Math.min(minX, pts[i], pts[i + 2]);
        maxX = Math.max(maxX, pts[i], pts[i + 2]);
        minY = Math.min(minY, pts[i + 1], pts[i + 3]);
        maxY = Math.max(maxY, pts[i + 1], pts[i + 3]);
      }
    }
  }
  return minX === Infinity ? null : { minX, minY, maxX, maxY };
}

export function translateToolpaths(toolpaths: readonly Toolpath[], dx: number, dy: number): Toolpath[] {
  if (dx === 0 && dy === 0) return [...toolpaths];
  return toolpaths.map((tp) => ({
    ...tp,
    runs: tp.runs.map((run) => ({
      power: run.power,
      points: run.points.map((v, i) => (i % 2 === 0 ? v + dx : v + dy)),
    })),
  }));
}

/** Repeats runs for `passes` (each pass is the full run list again). */
export function repeatPasses(runs: ToolpathRun[], passes: number): ToolpathRun[] {
  const count = Math.max(1, Math.floor(passes));
  const out: ToolpathRun[] = [];
  for (let i = 0; i < count; i++) out.push(...runs);
  return out;
}
