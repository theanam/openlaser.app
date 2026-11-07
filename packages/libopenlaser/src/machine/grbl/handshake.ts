import type { MachineProfile } from '../../project/types';
import type { HandshakeResult } from '../types';
import { numericSetting } from './settings-info';

export const DEFAULT_RX_SIZE = 128;

/**
 * Bed size mismatch rule: an axis counts as different when $130/$131 and the profile differ by
 * more than this many millimetres. Small differences are normal (users round bed sizes).
 */
export const BED_SIZE_TOLERANCE_MM = 5;

export function deriveLaserModeOff(settings: Record<number, string>): boolean {
  return numericSetting(settings, 32) !== 1;
}

export function deriveBedSizeMismatch(
  settings: Record<number, string>,
  profile: MachineProfile,
): HandshakeResult['bedSizeMismatch'] {
  const width = numericSetting(settings, 130);
  const height = numericSetting(settings, 131);
  if (width === null || height === null || width <= 0 || height <= 0) return null;
  const differs =
    Math.abs(width - profile.bedWidth) > BED_SIZE_TOLERANCE_MM ||
    Math.abs(height - profile.bedHeight) > BED_SIZE_TOLERANCE_MM;
  return differs ? { width, height } : null;
}
