/**
 * Job time estimate (SPEC §6.5): a trapezoid velocity profile per move with a simplified GRBL-style
 * planner — junction-deviation corner speeds, then backward and forward passes so every move can
 * reach its exit speed within its own length. It is an estimate: the real planner has a finite
 * look-ahead buffer and overrides change speeds at run time.
 */
import type { MachineLimits } from '../types';
import type { Move } from './emit';

/**
 * Conservative fallbacks when the controller's $110/$111/$120/$121 are unknown. Low accelerations
 * and a slow rapid rate overestimate rather than underestimate typical hobby diode lasers.
 */
export const DEFAULT_ESTIMATE_LIMITS = {
  /** mm/min, used for G0 when $110/$111 are unknown. Requested G1 feeds are not capped. */
  rapidRate: 3000,
  /** mm/s² */
  accel: 500,
  /** mm, GRBL's default $11. */
  junctionDeviation: 0.01,
} as const;

interface Segment {
  length: number;
  ux: number;
  uy: number;
  /** mm/s */
  cruise: number;
  /** mm/s² */
  accel: number;
}

export function estimateSeconds(moves: readonly Move[], limits: MachineLimits = {}): number {
  const segments: Segment[] = [];
  for (const m of moves) {
    const dx = m.x1 - m.x0;
    const dy = m.y1 - m.y0;
    const length = Math.hypot(dx, dy);
    if (length <= 0) continue;
    const ux = dx / length;
    const uy = dy / length;
    const axisRate = alongAxes(ux, uy, limits.maxRateX, limits.maxRateY);
    const requested = m.rapid
      ? (axisRate ?? DEFAULT_ESTIMATE_LIMITS.rapidRate)
      : Math.min(m.feed, axisRate ?? Infinity);
    const accel = alongAxes(
      ux,
      uy,
      limits.accelX ?? DEFAULT_ESTIMATE_LIMITS.accel,
      limits.accelY ?? DEFAULT_ESTIMATE_LIMITS.accel,
    );
    segments.push({
      length,
      ux,
      uy,
      cruise: Math.max(requested, 1) / 60,
      accel: accel ?? DEFAULT_ESTIMATE_LIMITS.accel,
    });
  }
  if (segments.length === 0) return 0;

  // entry[i] is the speed entering segment i; entry[n] = 0 (the job ends at rest).
  const n = segments.length;
  const entry = new Array<number>(n + 1).fill(0);
  for (let i = 1; i < n; i++) {
    const prev = segments[i - 1];
    const next = segments[i];
    entry[i] = Math.min(prev.cruise, next.cruise, junctionSpeed(prev, next));
  }
  for (let i = n - 1; i >= 0; i--) {
    const s = segments[i];
    entry[i] = Math.min(entry[i], Math.sqrt(entry[i + 1] ** 2 + 2 * s.accel * s.length));
  }
  for (let i = 0; i < n; i++) {
    const s = segments[i];
    entry[i + 1] = Math.min(entry[i + 1], Math.sqrt(entry[i] ** 2 + 2 * s.accel * s.length));
  }

  let seconds = 0;
  for (let i = 0; i < n; i++) seconds += trapezoidTime(segments[i], entry[i], entry[i + 1]);
  return seconds;
}

/** Limit along a direction from per-axis limits: the tighter axis wins. Undefined when both are unknown. */
function alongAxes(
  ux: number,
  uy: number,
  limitX: number | undefined,
  limitY: number | undefined,
): number | undefined {
  let limit = Infinity;
  if (limitX !== undefined && Math.abs(ux) > 1e-9) limit = Math.min(limit, limitX / Math.abs(ux));
  if (limitY !== undefined && Math.abs(uy) > 1e-9) limit = Math.min(limit, limitY / Math.abs(uy));
  return limit === Infinity ? undefined : limit;
}

/** GRBL's junction deviation corner speed, mm/s. */
function junctionSpeed(prev: Segment, next: Segment): number {
  const cosTheta = -(prev.ux * next.ux + prev.uy * next.uy);
  if (cosTheta > 0.999999) return 0;
  if (cosTheta < -0.999999) return Infinity;
  const sinHalf = Math.sqrt(0.5 * (1 - cosTheta));
  const accel = Math.min(prev.accel, next.accel);
  return Math.sqrt((accel * DEFAULT_ESTIMATE_LIMITS.junctionDeviation * sinHalf) / (1 - sinHalf));
}

function trapezoidTime(s: Segment, v0: number, v1: number): number {
  const a = s.accel;
  const accelDistance = Math.max(0, (s.cruise ** 2 - v0 ** 2) / (2 * a));
  const decelDistance = Math.max(0, (s.cruise ** 2 - v1 ** 2) / (2 * a));
  if (accelDistance + decelDistance <= s.length) {
    return (s.cruise - v0) / a + (s.cruise - v1) / a + (s.length - accelDistance - decelDistance) / s.cruise;
  }
  const peak = Math.max(v0, v1, Math.sqrt((2 * a * s.length + v0 ** 2 + v1 ** 2) / 2));
  return (peak - v0) / a + (peak - v1) / a;
}
