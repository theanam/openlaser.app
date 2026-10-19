/**
 * Starting profiles for GRBL laser engravers on the market. Sizes are the working (travel) area
 * from manufacturer or retailer spec pages, collected 2026-10, which can differ from the frame or
 * honeycomb size. Users confirm them against their own machine; the handshake also offers to adopt
 * the size the controller reports in $130/$131. Air assist is set only where the maker documents
 * M8 control. Machines with non-GRBL stock firmware (xTool, Jinsoku app firmware, Snapmaker,
 * LaserPecker) are left out.
 */
import type { MachineProfile } from './types';

export interface MachinePreset {
  brand: string;
  model: string;
  /** mm */
  bedWidth: number;
  bedHeight: number;
  originCorner?: MachineProfile['originCorner'];
  supportsAirAssist?: boolean;
}

export const GENERIC_BRAND = 'Generic';

export const MACHINE_PRESETS: readonly MachinePreset[] = [
  { brand: GENERIC_BRAND, model: 'GRBL laser 400 × 400', bedWidth: 400, bedHeight: 400 },
  { brand: GENERIC_BRAND, model: 'GRBL laser 300 × 300', bedWidth: 300, bedHeight: 300 },
  { brand: GENERIC_BRAND, model: 'GRBL laser 200 × 200', bedWidth: 200, bedHeight: 200 },
  { brand: 'Two Trees', model: 'TS3', bedWidth: 300, bedHeight: 200 },
  { brand: 'Two Trees', model: 'TS2 10W / 20W', bedWidth: 450, bedHeight: 410 },
  { brand: 'Two Trees', model: 'TS2 Max (450 × 900)', bedWidth: 450, bedHeight: 900 },
  { brand: 'Two Trees', model: 'TTS-20 Pro', bedWidth: 418, bedHeight: 418 },
  { brand: 'Two Trees', model: 'TTS-20 Max', bedWidth: 450, bedHeight: 450 },
  { brand: 'Two Trees', model: 'TTS-55 Pro', bedWidth: 300, bedHeight: 300 },
  { brand: 'Two Trees', model: 'TTS-10 Pro', bedWidth: 300, bedHeight: 300 },
  { brand: 'Two Trees', model: 'TT-5.5S', bedWidth: 300, bedHeight: 300 },
  { brand: 'Two Trees', model: 'Totem S', bedWidth: 300, bedHeight: 300 },
  { brand: 'Ortur', model: 'Laser Master 3 (10W)', bedWidth: 400, bedHeight: 400 },
  { brand: 'Ortur', model: 'Laser Master 3 (20W / 40W)', bedWidth: 400, bedHeight: 380 },
  { brand: 'Ortur', model: 'Laser Master 3 LE', bedWidth: 400, bedHeight: 400 },
  { brand: 'Ortur', model: 'Laser Master 2 Pro S2', bedWidth: 400, bedHeight: 400 },
  { brand: 'Ortur', model: 'Laser Master 2', bedWidth: 400, bedHeight: 430 },
  { brand: 'Ortur', model: 'Aufero Laser 1', bedWidth: 180, bedHeight: 180 },
  { brand: 'Ortur', model: 'Aufero Laser 2', bedWidth: 390, bedHeight: 390 },
  { brand: 'Sculpfun', model: 'S9', bedWidth: 410, bedHeight: 415 },
  { brand: 'Sculpfun', model: 'S10', bedWidth: 390, bedHeight: 400 },
  { brand: 'Sculpfun', model: 'S30 (5W)', bedWidth: 380, bedHeight: 385, supportsAirAssist: true },
  { brand: 'Sculpfun', model: 'S30 Pro (10W)', bedWidth: 380, bedHeight: 385, supportsAirAssist: true },
  { brand: 'Sculpfun', model: 'S30 Pro Max (20W)', bedWidth: 370, bedHeight: 360, supportsAirAssist: true },
  { brand: 'Sculpfun', model: 'S30 Ultra 11W', bedWidth: 600, bedHeight: 620 },
  { brand: 'Sculpfun', model: 'S30 Ultra 22W / 33W', bedWidth: 590, bedHeight: 595 },
  { brand: 'Sculpfun', model: 'SF-A9 40W', bedWidth: 400, bedHeight: 400 },
  { brand: 'Sculpfun', model: 'S40 Max', bedWidth: 830, bedHeight: 800 },
  { brand: 'Sculpfun', model: 'iCube Pro Max 10W', bedWidth: 120, bedHeight: 120 },
  { brand: 'Atomstack', model: 'A5 Pro', bedWidth: 410, bedHeight: 400 },
  { brand: 'Atomstack', model: 'A5 M50 Pro', bedWidth: 410, bedHeight: 400 },
  { brand: 'Atomstack', model: 'A10 Pro V2', bedWidth: 410, bedHeight: 380 },
  { brand: 'Atomstack', model: 'A20 Pro V2', bedWidth: 400, bedHeight: 365 },
  { brand: 'Atomstack', model: 'A40 Pro V2', bedWidth: 385, bedHeight: 400 },
  { brand: 'Atomstack', model: 'A40 / X40 / S40 Pro', bedWidth: 400, bedHeight: 400 },
  { brand: 'Atomstack', model: 'X20 Pro', bedWidth: 400, bedHeight: 400 },
  { brand: 'Atomstack', model: 'X30 Pro', bedWidth: 410, bedHeight: 400 },
  { brand: 'Atomstack', model: 'A24 Pro', bedWidth: 360, bedHeight: 280 },
  { brand: 'Atomstack', model: 'A70 Max', bedWidth: 850, bedHeight: 800 },
  { brand: 'Creality', model: 'Falcon 5W / 10W', bedWidth: 400, bedHeight: 415 },
  { brand: 'Creality', model: 'Falcon2 12W / 22W / 40W', bedWidth: 400, bedHeight: 415 },
  { brand: 'Creality', model: 'Falcon2 Pro 22W / 40W', bedWidth: 400, bedHeight: 415 },
  { brand: 'Longer', model: 'Ray5 5W / 10W', bedWidth: 400, bedHeight: 400 },
  { brand: 'Longer', model: 'Ray5 20W', bedWidth: 400, bedHeight: 365 },
  { brand: 'Longer', model: 'B1 20W / 30W', bedWidth: 450, bedHeight: 440 },
  { brand: 'Comgrow', model: 'Z1', bedWidth: 400, bedHeight: 400 },
  { brand: 'ACMER', model: 'P1 20W', bedWidth: 400, bedHeight: 385 },
  { brand: 'ACMER', model: 'P2', bedWidth: 420, bedHeight: 400 },
  { brand: 'AlgoLaser', model: 'Alpha 22W', bedWidth: 400, bedHeight: 400 },
  { brand: 'AlgoLaser', model: 'Delta 22W', bedWidth: 440, bedHeight: 415 },
  { brand: 'AlgoLaser', model: 'Delta 40W', bedWidth: 425, bedHeight: 415 },
  { brand: 'Genmitsu', model: 'L8 20W', bedWidth: 400, bedHeight: 400 },
  { brand: 'Genmitsu', model: 'L8 40W', bedWidth: 390, bedHeight: 390 },
  { brand: 'Wainlux', model: 'JL7', bedWidth: 400, bedHeight: 400 },
  { brand: 'NEJE', model: 'Master 2S Max', bedWidth: 810, bedHeight: 460 },
  { brand: 'NEJE', model: 'Master 3 Max', bedWidth: 810, bedHeight: 460 },
  { brand: 'NEJE', model: 'MAX 4', bedWidth: 750, bedHeight: 460 },
  { brand: 'Mr Carve', model: 'M3', bedWidth: 400, bedHeight: 400 },
];

export function presetName(preset: Pick<MachinePreset, 'brand' | 'model'>): string {
  return preset.brand === GENERIC_BRAND ? `Generic ${preset.model}` : `${preset.brand} ${preset.model}`;
}

/** Profile fields a preset sets. */
export function presetProfileFields(preset: MachinePreset): Partial<MachineProfile> {
  return {
    name: presetName(preset),
    bedWidth: preset.bedWidth,
    bedHeight: preset.bedHeight,
    originCorner: preset.originCorner ?? 'bl',
    supportsAirAssist: preset.supportsAirAssist ?? false,
  };
}

/** Case-insensitive match on brand and model; every word must appear. */
export function searchPresets(
  query: string,
  presets: readonly MachinePreset[] = MACHINE_PRESETS,
): MachinePreset[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [...presets];
  return presets.filter((p) => {
    const hay = `${p.brand} ${p.model} ${p.bedWidth}x${p.bedHeight}`.toLowerCase().replace(/-/g, ' ');
    return words.every((w) => hay.includes(w.replace(/-/g, ' ')));
  });
}

/** Groups by brand, Generic first, then brands alphabetically, models in list order. */
export function groupByBrand(
  presets: readonly MachinePreset[],
): Array<{ brand: string; presets: MachinePreset[] }> {
  const groups = new Map<string, MachinePreset[]>();
  for (const p of presets) groups.set(p.brand, [...(groups.get(p.brand) ?? []), p]);
  return [...groups.entries()]
    .sort(([a], [b]) => (a === GENERIC_BRAND ? -1 : b === GENERIC_BRAND ? 1 : a.localeCompare(b)))
    .map(([brand, list]) => ({ brand, presets: list }));
}
