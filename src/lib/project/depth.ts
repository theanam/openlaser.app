/**
 * LaserPecker "depth": how long each dot burns, 1–100, the way LaserPecker's own app sets it.
 * LaserPecker's LightBurn guide gives the scale: depth 1 to 100 is 24000 to 240 mm/min (deeper is
 * slower), so a layer still stores mm/min and depth is a way of showing it.
 */
export const DEPTH_SPEED_FACTOR = 24000;

export function depthFromSpeed(mmPerMin: number): number {
  return Math.max(1, Math.min(100, Math.round(DEPTH_SPEED_FACTOR / Math.max(1, mmPerMin))));
}

export function speedFromDepth(depth: number): number {
  return DEPTH_SPEED_FACTOR / Math.max(1, Math.min(100, depth));
}
