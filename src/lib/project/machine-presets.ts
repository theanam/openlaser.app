/**
 * Starting profiles for GRBL laser engravers on the market. Sizes are the working (travel) area
 * from manufacturer or retailer spec pages, collected 2026-10, which can differ from the frame or
 * honeycomb size. Users confirm them against their own machine; the handshake also offers to adopt
 * the size the controller reports in $130/$131. Air assist is set only where the maker documents
 * M8 control. Machines with non-GRBL stock firmware (xTool, Jinsoku app firmware, Snapmaker) are
 * left out.
 *
 * CO₂ machines on Ruida controllers (home at the top right) run exported .rd files; sizes from the
 * makers' spec pages (Thunder Laser, Aeon, OMTech), checked 2026-10. A K40 with a GRBL board
 * connects like any GRBL laser.
 *
 * LaserPecker LP2 and LP3 speak their own protocol over Bluetooth or USB (460800 baud) and work from
 * the top-left corner. LP2: 100 × 100 mm, slide 100 × 300, rotary up to 628 mm around. LP3:
 * 115 × 80 mm (an oval area), electric roller 65 × 65. LP4 and LP5 take G-code over USB with
 * LaserPecker's M-codes (M3010/M3011 pick the laser, M3030/M3031/M3032 the mode). From LaserPecker's
 * LightBurn device files (2026-11): 460800 baud, S 255, origin top left; LP4 160 × 120 mm, slide
 * 160 × 300, rotary a chuck on Y at 256 mm per turn, up to 628 mm around (the Electric Roller
 * fits the LP4 too; it is left out until it can be tried); LP5 120 × 160 mm, slide
 * 300 × 160. The LP2 and LP3 accessory sizes still need confirming on devices.
 */
import { laserTypeDefaults } from './factory';
import type { LaserSource, MachineAccessory, MachineProfile, RotarySetup } from './types';

export interface MachinePreset {
  brand: string;
  model: string;
  /** mm */
  bedWidth: number;
  bedHeight: number;
  originCorner?: MachineProfile['originCorner'];
  supportsAirAssist?: boolean;
  /** Diode unless set. */
  laserType?: MachineProfile['laserType'];
  /** GRBL unless set. */
  controller?: MachineProfile['controller'];
  /** The profile default unless set. */
  baudRate?: number;
  speedUnit?: MachineProfile['speedUnit'];
  maxS?: number;
  laserSources?: LaserSource[];
  accessories?: MachineAccessory[];
  flatModeGcode?: string;
}

export const GENERIC_BRAND = 'Generic';

/** LaserPecker's own protocol (LP2, LP3): its rotary turns surface mm into rotation itself. */
function laserPecker(
  model: string,
  bedWidth: number,
  bedHeight: number,
  accessories: MachineAccessory[],
  laserSources?: LaserSource[],
): MachinePreset {
  const brand = 'LaserPecker';
  const base = { brand, model, bedWidth, bedHeight, originCorner: 'tl' as const };
  return {
    ...base,
    controller: 'laserpecker',
    baudRate: 460800,
    speedUnit: 'depth',
    accessories,
    ...(laserSources ? { laserSources } : {}),
  };
}

/** The LP3's one laser is a 1064 nm fiber: its print start says so (laser type 1). */
const LP3_LASER: LaserSource[] = [
  { id: 'ir', label: '1064 nm infrared', wavelength: 1064, selectGcode: '', deviceCode: 1 },
];

const DUAL_LASER: LaserSource[] = [
  { id: 'blue', label: '450 nm diode', wavelength: 450, selectGcode: 'M3010', deviceCode: 0 },
  { id: 'ir', label: '1064 nm infrared', wavelength: 1064, selectGcode: 'M3011', deviceCode: 1 },
];

function slide(bedWidth: number, bedHeight: number, startGcode = ''): MachineAccessory {
  return { id: 'slide', kind: 'slide', label: 'Slide Extension', bedWidth, bedHeight, startGcode };
}

function rotary(
  bedWidth: number,
  bedHeight: number,
  options: { id?: string; label?: string; startGcode?: string; setup?: Partial<RotarySetup> } = {},
): MachineAccessory {
  const setup: RotarySetup = {
    type: 'roller',
    axis: 'y',
    unitsPerRotation: 0,
    rollerDiameter: 0,
    deviceScales: true,
    ...options.setup,
  };
  return {
    id: options.id ?? 'rotary',
    kind: 'rotary',
    label: options.label ?? 'Rotary Extension',
    bedWidth,
    bedHeight,
    startGcode: options.startGcode ?? '',
    rotary: setup,
  };
}

/** LaserPecker models on G-code over USB, with two lasers and mode M-codes. */
function laserPeckerGcode(
  model: string,
  bedWidth: number,
  bedHeight: number,
  accessories: MachineAccessory[],
): MachinePreset {
  const base = { brand: 'LaserPecker', model, bedWidth, bedHeight, originCorner: 'tl' as const };
  return {
    ...base,
    baudRate: 460800,
    maxS: 255,
    speedUnit: 'depth',
    laserSources: DUAL_LASER,
    flatModeGcode: 'M3030',
    accessories,
  };
}

/** A CO₂ machine on a Ruida controller: home top right, air assist on board. */
function ruida(brand: string, model: string, bedWidth: number, bedHeight: number): MachinePreset {
  return { brand, model, bedWidth, bedHeight, originCorner: 'tr', laserType: 'co2', controller: 'ruida' };
}

export const MACHINE_PRESETS: readonly MachinePreset[] = [
  { brand: GENERIC_BRAND, model: 'GRBL laser 400 × 400', bedWidth: 400, bedHeight: 400 },
  { brand: GENERIC_BRAND, model: 'GRBL laser 300 × 300', bedWidth: 300, bedHeight: 300 },
  { brand: GENERIC_BRAND, model: 'GRBL laser 200 × 200', bedWidth: 200, bedHeight: 200 },
  ruida(GENERIC_BRAND, 'CO₂ Ruida 600 × 400', 600, 400),
  ruida(GENERIC_BRAND, 'CO₂ Ruida 900 × 600', 900, 600),
  ruida(GENERIC_BRAND, 'CO₂ Ruida 1300 × 900', 1300, 900),
  { brand: GENERIC_BRAND, model: 'CO₂ GRBL 600 × 400', bedWidth: 600, bedHeight: 400, laserType: 'co2' },
  {
    brand: 'K40',
    model: 'CO₂ with GRBL board',
    bedWidth: 300,
    bedHeight: 200,
    originCorner: 'tl',
    laserType: 'co2',
  },
  ruida('Thunder Laser', 'Nova 24', 600, 400),
  ruida('Thunder Laser', 'Nova 35', 900, 600),
  ruida('Thunder Laser', 'Nova 51', 1300, 900),
  ruida('Thunder Laser', 'Nova 63', 1600, 1000),
  laserPecker('LP2', 100, 100, [slide(100, 300), rotary(100, 628)]),
  laserPecker('LP3', 115, 80, [rotary(65, 65, { label: 'Electric Roller' })], LP3_LASER),
  laserPeckerGcode('LP4', 160, 120, [
    slide(160, 300, 'M3031'),
    rotary(160, 628, {
      startGcode: 'M3032',
      setup: { type: 'chuck', unitsPerRotation: 256, deviceScales: false },
    }),
  ]),
  laserPeckerGcode('LP5', 120, 160, [slide(300, 160, 'M3031')]),
  ruida('Aeon', 'Mira 5', 500, 300),
  ruida('Aeon', 'Mira 7', 700, 500),
  ruida('Aeon', 'Mira 9', 900, 600),
  ruida('OMTech', '60W 16 × 24', 600, 400),
  ruida('OMTech', '20 × 28', 700, 500),
  ruida('OMTech', '100W 24 × 40', 1000, 600),
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

/** Optical watts from a model name with one rating ("S30 Pro (10W)"); none for "10W / 20W". */
export function wattsFromModel(model: string): number | undefined {
  if (model.includes('/')) return undefined;
  const m = /(\d+(?:\.\d+)?)\s*W\b/i.exec(model);
  return m ? Number(m[1]) : undefined;
}

/** Profile fields a preset sets. */
export function presetProfileFields(preset: MachinePreset): Partial<MachineProfile> {
  const watts = wattsFromModel(preset.model);
  return {
    name: presetName(preset),
    bedWidth: preset.bedWidth,
    bedHeight: preset.bedHeight,
    ...laserTypeDefaults(preset.laserType ?? 'diode'),
    originCorner: preset.originCorner ?? 'bl',
    supportsAirAssist: preset.supportsAirAssist ?? preset.laserType === 'co2',
    controller: preset.controller ?? 'grbl',
    ...(preset.baudRate ? { baudRate: preset.baudRate } : {}),
    ...(preset.maxS ? { maxS: preset.maxS } : {}),
    ...(preset.speedUnit ? { speedUnit: preset.speedUnit } : {}),
    ...(watts ? { laserWatts: watts } : {}),
    ...(preset.laserSources ? { laserSources: preset.laserSources } : {}),
    ...(preset.accessories ? { accessories: preset.accessories } : {}),
    ...(preset.flatModeGcode ? { flatModeGcode: preset.flatModeGcode } : {}),
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
