/**
 * Toolpath preview (SPEC §9.2): burns shaded by power, travel dashed. Moves are batched into
 * bed-space Path2D chunks once per MoveList, so a million-segment job redraws with a few dozen
 * native stroke calls. The scrubber position draws whole chunks plus a short tail.
 */
import type { MoveList } from '$lib/cam/types';
import { bedToScreenMatrix, type BedFrame, type View } from './viewport';

/** Power shades from soft to full Signal. */
export const POWER_BUCKETS = 6;
const CHUNK_MOVES = 16_384;

interface Chunk {
  /** Exclusive end index into the move list. */
  end: number;
  burns: Path2D[];
  travel: Path2D;
}

export interface PreviewGeometry {
  moves: MoveList;
  chunks: Chunk[];
}

const cache = new WeakMap<MoveList, PreviewGeometry>();

export function bucketOf(power: number): number {
  return Math.min(POWER_BUCKETS - 1, Math.max(0, Math.ceil(power * POWER_BUCKETS) - 1));
}

export function previewGeometry(moves: MoveList): PreviewGeometry {
  let geometry = cache.get(moves);
  if (geometry) return geometry;
  const chunks: Chunk[] = [];
  const { coords, power, rapid, count } = moves;
  for (let start = 0; start < count; start += CHUNK_MOVES) {
    const end = Math.min(count, start + CHUNK_MOVES);
    const burns = Array.from({ length: POWER_BUCKETS }, () => new Path2D());
    const travel = new Path2D();
    for (let i = start; i < end; i++) {
      const o = i * 4;
      const target = rapid[i] || power[i] <= 0 ? travel : burns[bucketOf(power[i])];
      target.moveTo(coords[o], coords[o + 1]);
      target.lineTo(coords[o + 2], coords[o + 3]);
    }
    chunks.push({ end, burns, travel });
  }
  geometry = { moves, chunks };
  cache.set(moves, geometry);
  return geometry;
}

/** Index of the first move produced by G-code line `line` or later. */
export function moveIndexForLine(moves: MoveList, line: number): number {
  let lo = 0;
  let hi = moves.count;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (moves.line[mid] < line) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

export interface PreviewColors {
  burnLow: string;
  burnHigh: string;
  travel: string;
}

/** Mixes two #rrggbb colors. */
export function mix(a: string, b: string, t: number): string {
  const pa = parseHex(a);
  const pb = parseHex(b);
  if (!pa || !pb) return t < 0.5 ? a : b;
  const c = pa.map((v, i) => Math.round(v + (pb[i] - v) * t));
  return `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
}

function parseHex(hex: string): number[] | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Draws moves [0, upTo) of the job. */
export function drawPreview(
  ctx: CanvasRenderingContext2D,
  geometry: PreviewGeometry,
  upTo: number,
  view: View,
  bed: BedFrame,
  colors: PreviewColors,
): void {
  const m = bedToScreenMatrix(view, bed);
  const base = ctx.getTransform();
  ctx.save();
  ctx.setTransform(base.multiply(new DOMMatrix(m)));
  // Line widths are in bed units under this transform.
  const px = 1 / view.zoom;
  const shades = Array.from({ length: POWER_BUCKETS }, (_, i) =>
    mix(colors.burnLow, colors.burnHigh, i / (POWER_BUCKETS - 1)),
  );

  let start = 0;
  for (const chunk of geometry.chunks) {
    if (chunk.end <= upTo) {
      ctx.globalAlpha = 0.55;
      ctx.setLineDash([3 * px, 3 * px]);
      ctx.strokeStyle = colors.travel;
      ctx.lineWidth = px;
      ctx.stroke(chunk.travel);
      ctx.globalAlpha = 1;
      ctx.setLineDash([]);
      ctx.lineWidth = 1.4 * px;
      chunk.burns.forEach((path, i) => {
        ctx.strokeStyle = shades[i];
        ctx.stroke(path);
      });
    } else {
      drawTail(ctx, geometry.moves, start, upTo, shades, colors.travel, px);
      break;
    }
    start = chunk.end;
  }
  ctx.restore();
}

function drawTail(
  ctx: CanvasRenderingContext2D,
  moves: MoveList,
  from: number,
  to: number,
  shades: string[],
  travel: string,
  px: number,
): void {
  if (to <= from) return;
  const burns = shades.map(() => new Path2D());
  const travelPath = new Path2D();
  for (let i = from; i < to; i++) {
    const o = i * 4;
    const target = moves.rapid[i] || moves.power[i] <= 0 ? travelPath : burns[bucketOf(moves.power[i])];
    target.moveTo(moves.coords[o], moves.coords[o + 1]);
    target.lineTo(moves.coords[o + 2], moves.coords[o + 3]);
  }
  ctx.globalAlpha = 0.55;
  ctx.setLineDash([3 * px, 3 * px]);
  ctx.strokeStyle = travel;
  ctx.lineWidth = px;
  ctx.stroke(travelPath);
  ctx.globalAlpha = 1;
  ctx.setLineDash([]);
  ctx.lineWidth = 1.4 * px;
  burns.forEach((path, i) => {
    ctx.strokeStyle = shades[i];
    ctx.stroke(path);
  });
}

/** End point of move `index - 1`: where the head is after `index` moves. */
export function headAt(moves: MoveList, index: number): { x: number; y: number } | null {
  if (index <= 0 || moves.count === 0) return null;
  const o = (Math.min(index, moves.count) - 1) * 4;
  return { x: moves.coords[o + 2], y: moves.coords[o + 3] };
}
