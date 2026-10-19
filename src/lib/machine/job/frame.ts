import type { Rect } from '../../geometry/types';
import type { MachineProfile } from '../../project/types';
import { formatNumber } from '../grbl/gcode-format';

/** Framing never fires above this, whatever the profile says (SPEC §7.4, §11.1). */
export const MAX_FRAME_POWER_PERCENT = 5;

/**
 * G-code that traces the job's bounding rectangle at the profile frame speed (SPEC §7.4).
 * Default is laser off: `G1 … S0` with M5, so the speed is honoured while nothing fires. With
 * framePowerPercent > 0 (clamped to 5%), M3 constant power at that level and M5 right after.
 */
export function buildFrameGcode(bounds: Rect, profile: MachineProfile): string[] {
  const x0 = formatNumber(bounds.minX);
  const y0 = formatNumber(bounds.minY);
  const x1 = formatNumber(bounds.maxX);
  const y1 = formatNumber(bounds.maxY);
  const percent = Math.min(MAX_FRAME_POWER_PERCENT, Math.max(0, profile.framePowerPercent));
  const power = Math.round((percent / 100) * profile.maxS);
  const feed = formatNumber(Math.max(1, profile.frameSpeed), 0);

  const lines = ['G90', 'G21', 'M5 S0', `G0 X${x0} Y${y0}`];
  if (power > 0) lines.push(`M3 S${power}`);
  const s = power > 0 ? '' : ' S0';
  lines.push(
    `G1 X${x1} Y${y0} F${feed}${s}`,
    `G1 X${x1} Y${y1}`,
    `G1 X${x0} Y${y1}`,
    `G1 X${x0} Y${y0}`,
    'M5 S0',
  );
  return lines;
}
