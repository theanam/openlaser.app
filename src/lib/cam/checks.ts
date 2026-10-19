/** Job-level CAM warnings: bed bounds and machine speed limits (SPEC §6.5). */
import type { Layer, MachineProfile } from '../project/types';
import type { Move } from './gcode/emit';
import type { CamWarning, MachineLimits } from './types';

/** Rounding slack so a move on the bed edge is never flagged. */
const BOUNDS_EPSILON = 1e-6;

/** One blocking warning when any move leaves 0..bedWidth × 0..bedHeight. */
export function boundsWarning(moves: readonly Move[], profile: MachineProfile): CamWarning | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const m of moves) {
    minX = Math.min(minX, m.x1);
    maxX = Math.max(maxX, m.x1);
    minY = Math.min(minY, m.y1);
    maxY = Math.max(maxY, m.y1);
  }
  if (minX === Infinity) return null;
  const outside =
    minX < -BOUNDS_EPSILON ||
    minY < -BOUNDS_EPSILON ||
    maxX > profile.bedWidth + BOUNDS_EPSILON ||
    maxY > profile.bedHeight + BOUNDS_EPSILON;
  if (!outside) return null;
  const extent = `X ${round(minX)}..${round(maxX)}, Y ${round(minY)}..${round(maxY)} mm`;
  return {
    code: 'out-of-bounds',
    message: `The job moves outside the ${profile.bedWidth} × ${profile.bedHeight} mm bed (${extent}).`,
    blocking: true,
  };
}

/**
 * Non-blocking warning when a layer's speed exceeds the machine's max rate. The slower of the known
 * axes is used, since fills and cuts move along both.
 */
export function speedWarning(layer: Layer, limits: MachineLimits | undefined): CamWarning | null {
  const known = [limits?.maxRateX, limits?.maxRateY].filter((v): v is number => v !== undefined && v > 0);
  if (known.length === 0) return null;
  const maxRate = Math.min(...known);
  if (layer.speed <= maxRate) return null;
  return {
    code: 'speed-exceeds-max',
    message: `Layer "${layer.name}" speed ${layer.speed} mm/min is above the machine max rate of ${maxRate} mm/min ($110/$111). The machine will run slower than set.`,
    blocking: false,
    layerId: layer.id,
  };
}

function round(v: number): number {
  return Math.round(v * 100) / 100;
}
