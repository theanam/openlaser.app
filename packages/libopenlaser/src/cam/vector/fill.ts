/** Fill mode (SPEC §6.3): union closed shapes, then scan them with parallel lines. */
import { union } from '../../geometry/clipper';
import { flattenPaths } from '../../geometry/path';
import type { Vec2 } from '../../geometry/types';
import type { FillSettings, Id, VectorObject } from '../../project/types';
import { compactPower } from '../toolpath';
import type { ToolpathRun } from '../types';
import { fromScanFrame, scanRegion, type Span, unitVector } from './scanline';

/** Used when a fill layer carries no settings block; matches a new fill layer from the importer. */
export const DEFAULT_FILL_SETTINGS: FillSettings = {
  interval: 0.1,
  angle: 0,
  bidirectional: true,
  overscan: 2.5,
  crossHatch: false,
};

/** Within-line gaps up to this size (or 2× overscan if larger) stay one run with a laser-off G1. */
export const MIN_TRAVEL_GAP = 1;

export interface FillRegion {
  /** Non-overlapping rings of the filled region; holes have opposite orientation. */
  rings: Vec2[][];
  /** Objects that had open paths, which a fill ignores. */
  openPathObjectIds: Id[];
}

/**
 * Builds the filled region of a layer. Each object is resolved with the even-odd rule (compound
 * paths and text-like shapes get their holes), then objects are merged with non-zero so two
 * overlapping objects stay filled where they overlap instead of cancelling out.
 */
export function fillRegion(objects: readonly VectorObject[], tolerance: number): FillRegion {
  const openPathObjectIds: Id[] = [];
  const merged: Vec2[][] = [];
  for (const object of objects) {
    const polylines = flattenPaths(object.paths, object.transform, tolerance);
    if (polylines.some((p) => !p.closed)) openPathObjectIds.push(object.id);
    const rings = polylines.filter((p) => p.closed && p.points.length > 2).map((p) => p.points);
    if (rings.length > 0) merged.push(...union(rings, 'evenodd'));
  }
  return { rings: merged.length > 0 ? union(merged, 'nonzero') : [], openPathObjectIds };
}

/** Scanline runs for a region, including the cross-hatch pass when enabled. */
export function fillRuns(
  rings: readonly (readonly Vec2[])[],
  settings: FillSettings,
  power: number,
): ToolpathRun[] {
  const runs = scanRuns(rings, settings.angle, settings, power);
  if (settings.crossHatch) runs.push(...scanRuns(rings, settings.angle + 90, settings, power));
  return runs;
}

function scanRuns(
  rings: readonly (readonly Vec2[])[],
  angle: number,
  settings: FillSettings,
  power: number,
): ToolpathRun[] {
  const overscan = Math.max(0, settings.overscan);
  const travelGap = Math.max(MIN_TRAVEL_GAP, 2 * overscan);
  const { cos, sin } = unitVector(angle);
  const runs: ToolpathRun[] = [];
  scanRegion(rings, angle, settings.interval).forEach((scanline, lineIndex) => {
    const forward = !settings.bidirectional || lineIndex % 2 === 0;
    const groups = groupSpans(scanline.spans, travelGap);
    if (!forward) groups.reverse();
    for (const group of groups) {
      const run = spanGroupRun(group, forward, overscan, power);
      const points: number[] = [];
      for (const u of run.stations) {
        const p = fromScanFrame(u, scanline.v, cos, sin);
        points.push(p.x, p.y);
      }
      runs.push({ points, power: compactPower(run.power) });
    }
  });
  return runs;
}

/** Splits spans wherever the gap between neighbours is too long to cross with the laser off at feed. */
function groupSpans(spans: readonly Span[], travelGap: number): Span[][] {
  const groups: Span[][] = [];
  let current: Span[] = [];
  for (const span of spans) {
    const last = current[current.length - 1];
    if (last && span.from - last.to > travelGap) {
      groups.push(current);
      current = [];
    }
    current.push(span);
  }
  if (current.length > 0) groups.push(current);
  return groups;
}

/** Positions along the scan direction, in travel order, with the power of each segment between them. */
function spanGroupRun(
  group: readonly Span[],
  forward: boolean,
  overscan: number,
  power: number,
): { stations: number[]; power: number[] } {
  const ordered = forward ? group : [...group].reverse();
  const dir = forward ? 1 : -1;
  const stations: number[] = [];
  const powers: number[] = [];
  const first = forward ? ordered[0].from : ordered[0].to;
  if (overscan > 0) {
    stations.push(first - dir * overscan);
    powers.push(0);
  }
  ordered.forEach((span, i) => {
    const [entry, exit] = forward ? [span.from, span.to] : [span.to, span.from];
    if (i > 0) powers.push(0);
    stations.push(entry, exit);
    powers.push(power);
  });
  if (overscan > 0) {
    stations.push(stations[stations.length - 1] + dir * overscan);
    powers.push(0);
  }
  return { stations, power: powers };
}
