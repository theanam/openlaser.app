/** Machine profiles saved as .json files, for sharing and backup. */
import { defaultMachineProfile, MAX_FRAME_POWER_PERCENT } from './factory';
import type { LaserSource, MachineAccessory, MachineProfile, RotarySetup } from './types';

export const MACHINE_FORMAT = 'openlaser-machine';

export class MachineFileError extends Error {
  override name = 'MachineFileError';
}

export function serializeMachineProfile(profile: MachineProfile): string {
  return JSON.stringify({ format: MACHINE_FORMAT, version: 1, profile }, null, 2) + '\n';
}

const NUMBER_FIELDS = [
  'bedWidth',
  'bedHeight',
  'baudRate',
  'maxS',
  'defaultJogSpeed',
  'frameSpeed',
  'framePowerPercent',
] as const satisfies ReadonlyArray<keyof MachineProfile>;

/**
 * Parses and validates a machine file. Missing optional fields fall back to defaults; a controller
 * outside `controllers` (the registered adapters) falls back to the first one.
 */
export function parseMachineProfile(text: string, controllers: readonly string[] = ['grbl']): MachineProfile {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new MachineFileError('This file is not valid JSON.');
  }
  const file = parsed as { format?: unknown; profile?: unknown };
  const raw = (file?.format === MACHINE_FORMAT ? file.profile : parsed) as Partial<MachineProfile> | null;
  if (!raw || typeof raw !== 'object' || typeof raw.name !== 'string') {
    throw new MachineFileError('This file is not an openlaser machine profile.');
  }
  const profile = defaultMachineProfile({ ...raw });
  for (const field of NUMBER_FIELDS) {
    if (typeof profile[field] !== 'number' || !Number.isFinite(profile[field])) {
      throw new MachineFileError(`The machine profile has an invalid ${field}.`);
    }
  }
  if (profile.bedWidth <= 0 || profile.bedHeight <= 0)
    throw new MachineFileError('The bed size must be positive.');
  if (!['bl', 'tl', 'tr', 'br'].includes(profile.originCorner)) {
    throw new MachineFileError('The origin corner must be bl, tl, tr or br.');
  }
  const pick = <T extends string>(value: unknown, allowed: readonly T[], fallback: T): T =>
    allowed.includes(value as T) ? (value as T) : fallback;
  profile.laserType = pick(profile.laserType, ['diode', 'co2'], 'diode');
  profile.controller = pick(profile.controller, controllers, controllers[0] ?? 'grbl');
  profile.speedUnit = pick(profile.speedUnit, ['mm/min', 'mm/s', 'depth'], 'mm/min');
  profile.constantPower = profile.constantPower === true;
  if (typeof profile.laserWatts !== 'number' || !(profile.laserWatts > 0)) delete profile.laserWatts;
  profile.laserSources = cleanList(profile.laserSources, cleanSource);
  profile.accessories = cleanList(profile.accessories, cleanAccessory);
  profile.flatModeGcode = typeof profile.flatModeGcode === 'string' ? profile.flatModeGcode : '';
  profile.framePowerPercent = Math.min(Math.max(profile.framePowerPercent, 0), MAX_FRAME_POWER_PERCENT);
  return profile;
}

const num = (v: unknown, fallback: number) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);
const str = (v: unknown, fallback = '') => (typeof v === 'string' ? v : fallback);

/** Keeps the well-formed entries of a list from a file; anything else is dropped. */
function cleanList<T>(value: unknown, clean: (raw: Record<string, unknown>) => T | null): T[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((raw) => {
    const item = raw && typeof raw === 'object' ? clean(raw as Record<string, unknown>) : null;
    return item ? [item] : [];
  });
}

function cleanSource(raw: Record<string, unknown>): LaserSource | null {
  if (typeof raw.id !== 'string' || !raw.id) return null;
  return {
    id: raw.id,
    label: str(raw.label, raw.id),
    wavelength: num(raw.wavelength, 450),
    selectGcode: str(raw.selectGcode),
    deviceCode: num(raw.deviceCode, 0),
  };
}

function cleanRotary(raw: unknown): RotarySetup | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const r = raw as Record<string, unknown>;
  return {
    type: r.type === 'chuck' ? 'chuck' : 'roller',
    axis: r.axis === 'a' ? 'a' : 'y',
    unitsPerRotation: Math.max(0, num(r.unitsPerRotation, 0)),
    rollerDiameter: Math.max(0, num(r.rollerDiameter, 0)),
    deviceScales: r.deviceScales === true,
  };
}

function cleanAccessory(raw: Record<string, unknown>): MachineAccessory | null {
  if (typeof raw.id !== 'string' || !raw.id) return null;
  if (raw.kind !== 'rotary' && raw.kind !== 'slide') return null;
  const width = num(raw.bedWidth, 0);
  const height = num(raw.bedHeight, 0);
  if (width <= 0 || height <= 0) return null;
  const rotary = raw.kind === 'rotary' ? cleanRotary(raw.rotary) : undefined;
  if (raw.kind === 'rotary' && !rotary) return null;
  return {
    id: raw.id,
    kind: raw.kind,
    label: str(raw.label, raw.kind === 'rotary' ? 'Rotary' : 'Slide'),
    bedWidth: width,
    bedHeight: height,
    startGcode: str(raw.startGcode),
    ...(rotary ? { rotary } : {}),
  };
}
