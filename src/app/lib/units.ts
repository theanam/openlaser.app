/** Speed units for display. Projects always store mm/min; CO₂ users think in mm/s. */
import type { SpeedUnit } from '$lib/project/types';

export function speedToUnit(mmPerMin: number, unit: SpeedUnit): number {
  return unit === 'mm/s' ? mmPerMin / 60 : mmPerMin;
}

export function speedFromUnit(value: number, unit: SpeedUnit): number {
  return unit === 'mm/s' ? value * 60 : value;
}

/** "3000" in mm/min, "50" in mm/s: rounded for a compact summary. */
export function speedLabel(mmPerMin: number, unit: SpeedUnit): string {
  const v = speedToUnit(mmPerMin, unit);
  // Slow mm/s speeds keep a decimal (2.5 mm/s); everything else rounds to whole numbers.
  return String(v < 10 && unit === 'mm/s' ? Math.round(v * 10) / 10 : Math.round(v));
}

/** CO₂ tubes need roughly this much power before they fire reliably. */
export const CO2_MIN_FIRING_PERCENT = 10;
