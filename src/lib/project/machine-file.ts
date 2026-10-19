/** Machine profiles saved as .json files, for sharing and backup. */
import { defaultMachineProfile, MAX_FRAME_POWER_PERCENT } from './factory';
import type { MachineProfile } from './types';

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

/** Parses and validates a machine file. Missing optional fields fall back to defaults. */
export function parseMachineProfile(text: string): MachineProfile {
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
  profile.framePowerPercent = Math.min(Math.max(profile.framePowerPercent, 0), MAX_FRAME_POWER_PERCENT);
  return profile;
}
