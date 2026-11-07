/** GRBL 1.1 `$` settings with names and units, for the device settings viewer (SPEC §9.5). */
export interface GrblSettingInfo {
  n: number;
  name: string;
  unit: string;
  /** Integer settings print without decimals; the rest print with three. */
  integer: boolean;
}

const SETTINGS: GrblSettingInfo[] = [
  { n: 0, name: 'Step pulse time', unit: 'µs', integer: true },
  { n: 1, name: 'Step idle delay', unit: 'ms', integer: true },
  { n: 2, name: 'Step pulse invert', unit: 'mask', integer: true },
  { n: 3, name: 'Step direction invert', unit: 'mask', integer: true },
  { n: 4, name: 'Invert step enable pin', unit: 'boolean', integer: true },
  { n: 5, name: 'Invert limit pins', unit: 'boolean', integer: true },
  { n: 6, name: 'Invert probe pin', unit: 'boolean', integer: true },
  { n: 10, name: 'Status report options', unit: 'mask', integer: true },
  { n: 11, name: 'Junction deviation', unit: 'mm', integer: false },
  { n: 12, name: 'Arc tolerance', unit: 'mm', integer: false },
  { n: 13, name: 'Report in inches', unit: 'boolean', integer: true },
  { n: 20, name: 'Soft limits enable', unit: 'boolean', integer: true },
  { n: 21, name: 'Hard limits enable', unit: 'boolean', integer: true },
  { n: 22, name: 'Homing cycle enable', unit: 'boolean', integer: true },
  { n: 23, name: 'Homing direction invert', unit: 'mask', integer: true },
  { n: 24, name: 'Homing locate feed rate', unit: 'mm/min', integer: false },
  { n: 25, name: 'Homing search seek rate', unit: 'mm/min', integer: false },
  { n: 26, name: 'Homing switch debounce delay', unit: 'ms', integer: true },
  { n: 27, name: 'Homing switch pull-off distance', unit: 'mm', integer: false },
  { n: 30, name: 'Maximum spindle speed (laser S max)', unit: 'S', integer: true },
  { n: 31, name: 'Minimum spindle speed (laser S min)', unit: 'S', integer: true },
  { n: 32, name: 'Laser-mode enable', unit: 'boolean', integer: true },
  { n: 100, name: 'X-axis travel resolution', unit: 'step/mm', integer: false },
  { n: 101, name: 'Y-axis travel resolution', unit: 'step/mm', integer: false },
  { n: 102, name: 'Z-axis travel resolution', unit: 'step/mm', integer: false },
  { n: 110, name: 'X-axis maximum rate', unit: 'mm/min', integer: false },
  { n: 111, name: 'Y-axis maximum rate', unit: 'mm/min', integer: false },
  { n: 112, name: 'Z-axis maximum rate', unit: 'mm/min', integer: false },
  { n: 120, name: 'X-axis acceleration', unit: 'mm/s²', integer: false },
  { n: 121, name: 'Y-axis acceleration', unit: 'mm/s²', integer: false },
  { n: 122, name: 'Z-axis acceleration', unit: 'mm/s²', integer: false },
  { n: 130, name: 'X-axis maximum travel', unit: 'mm', integer: false },
  { n: 131, name: 'Y-axis maximum travel', unit: 'mm', integer: false },
  { n: 132, name: 'Z-axis maximum travel', unit: 'mm', integer: false },
];

export const GRBL_SETTINGS: ReadonlyMap<number, GrblSettingInfo> = new Map(SETTINGS.map((s) => [s.n, s]));

/** Parses a numeric setting value; `null` if absent or not a number. */
export function numericSetting(settings: Record<number, string>, n: number): number | null {
  const raw = settings[n];
  if (raw === undefined) return null;
  const value = Number.parseFloat(raw);
  return Number.isFinite(value) ? value : null;
}
