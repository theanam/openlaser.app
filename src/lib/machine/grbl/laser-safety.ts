import { normalizeGcodeLine } from './gcode-format';

export type SpindleCommand = 'M3' | 'M4' | 'M5';

/** Last spindle command (M3/M4/M5) in a line, if any. `M30` and similar are not spindle commands. */
export function spindleCommandIn(line: string): SpindleCommand | null {
  const normalized = normalizeGcodeLine(line);
  if (normalized.startsWith('$')) return null;
  let found: SpindleCommand | null = null;
  for (const match of normalized.matchAll(/M0*([345])(?![\d.])/g)) {
    found = `M${match[1]}` as SpindleCommand;
  }
  return found;
}

/** S word value in a line, or null when the line has no S word. */
export function spindleSpeedIn(line: string): number | null {
  const normalized = normalizeGcodeLine(line);
  if (normalized.startsWith('$')) return null;
  const match = /S(-?\d*\.?\d+)/.exec(normalized);
  return match ? Number.parseFloat(match[1]) : null;
}

/**
 * True when a manually typed line turns the laser on (M3/M4 with a non-zero S, either in the line
 * or already modal). The UI shows a one-time warning for these (SPEC §11.4).
 */
export function isManualLaserOnCommand(line: string, modalSpindleSpeed = 0): boolean {
  const command = spindleCommandIn(line);
  if (command !== 'M3' && command !== 'M4') return false;
  const speed = spindleSpeedIn(line) ?? modalSpindleSpeed;
  return speed > 0;
}
