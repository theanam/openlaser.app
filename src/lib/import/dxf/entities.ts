/** DXF entities → colored paths in drawing units, with blocks expanded and OCS mirroring applied. */
import { multiply, rotation, scaling, translation } from '../../geometry/mat2d';
import type { Mat2D, PathData, Segment, Vec2 } from '../../geometry/types';
import { transformPath } from '../svg/walk';
import { bulgeSegments, ellipseArc, splineSegments } from './curves';
import { aciColor, hexOf, num, nums, text, type DxfDocument, type DxfRecord } from './reader';

export interface DxfPaths {
  /** Color → paths, in order of first appearance. */
  byColor: Map<string, PathData[]>;
  /** Skipped entity kinds, keyed for IGNORED_HINTS. */
  ignored: Record<string, number>;
}

interface Context {
  matrix: Mat2D;
  /** Layer and color an INSERT passes to entities on layer 0 and BYBLOCK. */
  layer: string;
  color: string | null;
  depth: number;
}

const MAX_DEPTH = 16;
const BLACK = '#000000';
/** Entities that carry no cuttable outline, grouped as the import dialog reports them. */
const IGNORED_KIND: Record<string, string> = {
  TEXT: 'text',
  MTEXT: 'text',
  ATTRIB: 'text',
  ATTDEF: 'text',
  DIMENSION: 'dimension',
  LEADER: 'dimension',
  MLEADER: 'dimension',
  HATCH: 'hatch',
  SOLID: 'solid',
  '3DFACE': 'solid',
  '3DSOLID': 'solid',
  REGION: 'solid',
  BODY: 'solid',
  MESH: 'solid',
  IMAGE: 'image',
};
/** Entities whose coordinates are in object space; LINE, ELLIPSE and SPLINE use world space. */
const OCS_TYPES = new Set(['CIRCLE', 'ARC', 'LWPOLYLINE', 'POLYLINE']);
const SILENT = new Set(['POINT', 'VIEWPORT', 'XLINE', 'RAY', 'SEQEND', 'WIPEOUT']);

const pt = (rec: DxfRecord, x: number, y: number): Vec2 => ({ x: num(rec, x), y: num(rec, y) });
const MIRROR_X: Mat2D = [-1, 0, 0, 1, 0, 0];
/** Planar entities drawn with extrusion (0,0,-1) live in a mirrored object coordinate system. */
const flipped = (rec: DxfRecord) => num(rec, 230, 1) < 0;

export function collectPaths(doc: DxfDocument): DxfPaths {
  const out: DxfPaths = { byColor: new Map(), ignored: {} };
  const skip = (kind: string) => (out.ignored[kind] = (out.ignored[kind] ?? 0) + 1);

  const colorOf = (rec: DxfRecord, ctx: Context, layer: string): string => {
    const trueColor = text(rec, 420);
    if (trueColor) return hexOf(Number(trueColor));
    const aci = num(rec, 62, 256);
    if (aci === 0) return ctx.color ?? BLACK;
    if (aci > 0 && aci < 256) return aciColor(aci) ?? BLACK;
    return doc.layers.get(layer)?.color ?? BLACK;
  };

  const emit = (color: string, paths: PathData[], matrix: Mat2D) => {
    if (paths.length === 0) return;
    const list = out.byColor.get(color) ?? [];
    for (const p of paths) list.push(transformPath(p, matrix));
    out.byColor.set(color, list);
  };

  const walk = (entities: DxfRecord[], ctx: Context) => {
    for (const rec of entities) {
      if (num(rec, 67) === 1) continue; // paper space
      const own = text(rec, 8) ?? '0';
      const layer = own === '0' && ctx.depth > 0 ? ctx.layer : own;
      if (doc.layers.get(layer)?.hidden) {
        skip('hidden');
        continue;
      }
      const color = colorOf(rec, ctx, layer);
      if (rec.type === 'INSERT') {
        insert(rec, { ...ctx, layer, color });
        continue;
      }
      const ocs = flipped(rec) && OCS_TYPES.has(rec.type) ? multiply(ctx.matrix, MIRROR_X) : ctx.matrix;
      const paths = shape(rec);
      if (paths) emit(color, paths, ocs);
      else if (IGNORED_KIND[rec.type]) skip(IGNORED_KIND[rec.type]!);
      else if (!SILENT.has(rec.type)) skip('other');
    }
  };

  const insert = (rec: DxfRecord, ctx: Context) => {
    const block = doc.blocks.get(text(rec, 2) ?? '');
    if (!block || ctx.depth >= MAX_DEPTH) {
      skip('other');
      return;
    }
    const at = pt(rec, 10, 20);
    const cols = Math.max(1, num(rec, 70, 1));
    const rows = Math.max(1, num(rec, 71, 1));
    const place = multiply(translation(at.x, at.y), rotation(num(rec, 50)));
    const fit = multiply(
      scaling(num(rec, 41, 1), num(rec, 42, 1)),
      translation(-block.base.x, -block.base.y),
    );
    const base = flipped(rec) ? multiply(ctx.matrix, MIRROR_X) : ctx.matrix;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const cell = translation(c * num(rec, 44), r * num(rec, 45));
        const matrix = multiply(base, multiply(place, multiply(cell, fit)));
        walk(block.entities, { matrix, layer: ctx.layer, color: ctx.color, depth: ctx.depth + 1 });
      }
    }
  };

  walk(doc.entities, { matrix: [1, 0, 0, 1, 0, 0], layer: '0', color: null, depth: 0 });
  return out;
}

/** The entity's outline in its own coordinates, or null when it has none. */
function shape(rec: DxfRecord): PathData[] | null {
  switch (rec.type) {
    case 'LINE': {
      const a = pt(rec, 10, 20);
      const b = pt(rec, 11, 21);
      return a.x === b.x && a.y === b.y
        ? []
        : [{ closed: false, start: a, segments: [{ type: 'L', to: b }] }];
    }
    case 'CIRCLE': {
      const r = num(rec, 40);
      if (r <= 0) return [];
      const arc = ellipseArc(pt(rec, 10, 20), { x: r, y: 0 }, 1, 0, Math.PI * 2);
      return [{ closed: true, ...arc }];
    }
    case 'ARC': {
      const r = num(rec, 40);
      if (r <= 0) return [];
      const a0 = num(rec, 50);
      let a1 = num(rec, 51, 360);
      while (a1 <= a0) a1 += 360;
      const arc = ellipseArc(pt(rec, 10, 20), { x: r, y: 0 }, 1, rad(a0), rad(a1));
      return [{ closed: false, ...arc }];
    }
    case 'ELLIPSE': {
      const t0 = num(rec, 41, 0);
      let t1 = num(rec, 42, Math.PI * 2);
      while (t1 <= t0) t1 += Math.PI * 2;
      const full = Math.abs(t1 - t0 - Math.PI * 2) < 1e-6;
      const ratio = num(rec, 40, 1) * (flipped(rec) ? -1 : 1);
      const arc = ellipseArc(pt(rec, 10, 20), pt(rec, 11, 21), ratio, t0, full ? t0 + Math.PI * 2 : t1);
      return [{ closed: full, ...arc }];
    }
    case 'LWPOLYLINE':
      return polyline(lwVertices(rec), (num(rec, 70) & 1) === 1);
    case 'POLYLINE': {
      const flags = num(rec, 70);
      if (flags & (16 | 64)) return null; // polygon and polyface meshes
      const vertices = (rec.children ?? [])
        .filter((v) => v.type === 'VERTEX' && (num(v, 70) & (16 | 128)) === 0)
        .map((v) => ({ ...pt(v, 10, 20), bulge: num(v, 42) }));
      return polyline(vertices, (flags & 1) === 1);
    }
    case 'SPLINE': {
      const xs = nums(rec, 10);
      const ys = nums(rec, 20);
      const fx = nums(rec, 11);
      const fy = nums(rec, 21);
      const curve = splineSegments({
        degree: num(rec, 71, 3),
        knots: nums(rec, 40),
        weights: nums(rec, 41),
        control: xs.map((x, i) => ({ x, y: ys[i] ?? 0 })),
        fit: fx.map((x, i) => ({ x, y: fy[i] ?? 0 })),
        closed: (num(rec, 70) & 1) === 1,
      });
      if (!curve) return [];
      const end = curve.segments[curve.segments.length - 1]!.to;
      const closed = Math.hypot(end.x - curve.start.x, end.y - curve.start.y) < 1e-6;
      return [{ closed, ...curve }];
    }
    default:
      return null;
  }
}

const rad = (deg: number) => (deg * Math.PI) / 180;

function lwVertices(rec: DxfRecord): Array<Vec2 & { bulge: number }> {
  const out: Array<Vec2 & { bulge: number }> = [];
  for (const [code, value] of rec.codes) {
    if (code === 10) out.push({ x: Number(value), y: 0, bulge: 0 });
    else if (code === 20 && out.length) out[out.length - 1]!.y = Number(value);
    else if (code === 42 && out.length) out[out.length - 1]!.bulge = Number(value);
  }
  return out;
}

function polyline(vertices: Array<Vec2 & { bulge: number }>, closed: boolean): PathData[] {
  if (vertices.length < 2) return [];
  const segments: Segment[] = [];
  const count = closed ? vertices.length : vertices.length - 1;
  for (let i = 0; i < count; i++) {
    const a = vertices[i]!;
    const b = vertices[(i + 1) % vertices.length]!;
    segments.push(...bulgeSegments(a, b, a.bulge));
  }
  return [{ closed, start: { x: vertices[0]!.x, y: vertices[0]!.y }, segments }];
}
