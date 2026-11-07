import { GRBL_SETTINGS } from '../grbl/settings-info';

/** A plausible 400×400 mm diode laser with homing switches and laser mode on. */
export const DEFAULT_SIMULATOR_SETTINGS: Readonly<Record<number, number>> = {
  0: 10,
  1: 255,
  2: 0,
  3: 0,
  4: 0,
  5: 0,
  6: 0,
  10: 1,
  11: 0.01,
  12: 0.002,
  13: 0,
  20: 0,
  21: 0,
  22: 1,
  23: 3,
  24: 100,
  25: 2000,
  26: 250,
  27: 2,
  30: 1000,
  31: 0,
  32: 1,
  100: 80,
  101: 80,
  102: 250,
  110: 6000,
  111: 6000,
  112: 500,
  120: 500,
  121: 500,
  122: 50,
  130: 400,
  131: 400,
  132: 50,
};

/** GRBL prints integer settings without decimals and the rest with three. */
export function formatSettingValue(n: number, value: number): string {
  return GRBL_SETTINGS.get(n)?.integer === false ? value.toFixed(3) : String(Math.trunc(value));
}
