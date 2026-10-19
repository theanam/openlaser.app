/**
 * DXF import: model-space outlines grouped by color, scaled to mm and placed with the drawing's
 * bottom-left corner at (0,0). The result has the SVG importer's shape, so both share the import
 * dialog and the project mapping.
 */
import { pathsBounds } from '../../geometry/path';
import type { PathData, Vec2 } from '../../geometry/types';
import { transformPath } from '../svg/walk';
import type { SvgImportResult } from '../svg/types';
import { collectPaths } from './entities';
import { readDxf } from './reader';

export { DxfError } from './reader';

export type DxfUnit = 'mm' | 'cm' | 'm' | 'in' | 'ft';

export const DXF_UNITS: Record<DxfUnit, number> = { mm: 1, cm: 10, m: 1000, in: 25.4, ft: 304.8 };

/** $INSUNITS codes openlaser understands. */
const INSUNITS: Record<number, DxfUnit> = { 1: 'in', 2: 'ft', 4: 'mm', 5: 'cm', 6: 'm' };

/** A parsed drawing in its own units, ready to scale. */
export interface DxfDrawing {
  /** Units the file declares, or null when it leaves them unset. */
  fileUnits: DxfUnit | null;
  groups: Array<{ color: string; paths: PathData[] }>;
  ignored: Record<string, number>;
}

export function parseDxf(source: string): DxfDrawing {
  const doc = readDxf(source);
  const { byColor, ignored } = collectPaths(doc);
  return {
    fileUnits: INSUNITS[doc.insUnits] ?? null,
    groups: [...byColor].map(([color, paths]) => ({ color, paths: joinPaths(paths) })),
    ignored,
  };
}

export function dxfResult(drawing: DxfDrawing, units: DxfUnit): SvgImportResult {
  const k = DXF_UNITS[units];
  const all = drawing.groups.flatMap((g) => g.paths);
  const box = pathsBounds(all);
  const minX = box?.minX ?? 0;
  const minY = box?.minY ?? 0;
  const place: [number, number, number, number, number, number] = [k, 0, 0, k, -minX * k, -minY * k];
  return {
    width: box ? (box.maxX - box.minX) * k : 0,
    height: box ? (box.maxY - box.minY) * k : 0,
    groups: drawing.groups.map((g) => ({
      color: g.color,
      kind: 'stroke',
      paths: g.paths.map((p) => transformPath(p, place)),
    })),
    images: [],
    ignored: drawing.ignored,
    warnings: [],
  };
}

export function importDxf(source: string, units?: DxfUnit): SvgImportResult {
  const drawing = parseDxf(source);
  return dxfResult(drawing, units ?? drawing.fileUnits ?? 'mm');
}

/** Endpoints closer than this (drawing units) are treated as one point when chaining. */
const JOIN_TOLERANCE = 1e-4;

const end = (p: PathData): Vec2 => p.segments[p.segments.length - 1]?.to ?? p.start;
const key = (v: Vec2) => `${Math.round(v.x / JOIN_TOLERANCE)},${Math.round(v.y / JOIN_TOLERANCE)}`;

function reverse(p: PathData): PathData {
  const points = [p.start, ...p.segments.map((s) => s.to)];
  const segments = p.segments
    .map((s, i) =>
      s.type === 'L'
        ? { type: 'L' as const, to: points[i]! }
        : { type: 'C' as const, c1: s.c2, c2: s.c1, to: points[i]! },
    )
    .reverse();
  return { closed: p.closed, start: end(p), segments };
}

/**
 * CAD outlines are often loose LINE and ARC entities. Chains them end to end into continuous
 * paths, closing a chain when it returns to its start, so fills and kerf offsets see shapes.
 */
export function joinPaths(paths: PathData[]): PathData[] {
  const done: PathData[] = [];
  const open: PathData[] = [];
  for (const p of paths) (p.closed ? done : open).push(p);
  const byEnd = new Map<string, number[]>();
  open.forEach((p, i) => {
    for (const k of new Set([key(p.start), key(end(p))])) byEnd.set(k, [...(byEnd.get(k) ?? []), i]);
  });
  const used = new Set<number>();
  const take = (v: Vec2): PathData | null => {
    const i = byEnd.get(key(v))?.find((j) => !used.has(j));
    if (i === undefined) return null;
    used.add(i);
    return open[i]!;
  };
  open.forEach((first, i) => {
    if (used.has(i)) return;
    used.add(i);
    let chain = first;
    const loops = () => key(chain.start) === key(end(chain));
    for (let o = loops() ? null : take(end(chain)); o; o = loops() ? null : take(end(chain))) {
      const next = key(o.start) === key(end(chain)) ? o : reverse(o);
      chain = { ...chain, segments: [...chain.segments, ...next.segments] };
    }
    for (let o = loops() ? null : take(chain.start); o; o = loops() ? null : take(chain.start)) {
      const prev = key(end(o)) === key(chain.start) ? o : reverse(o);
      chain = { ...prev, segments: [...prev.segments, ...chain.segments] };
    }
    done.push(chain.segments.length > 1 && loops() ? { ...chain, closed: true } : chain);
  });
  return done;
}
