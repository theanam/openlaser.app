import type { JobSettings, MachineProfile, Project } from './types';
import { makeId, type MakeId } from './ids';

export const PROJECT_SCHEMA_VERSION = 1;

export function defaultJobSettings(): JobSettings {
  return {
    origin: 'absolute',
    anchor: 'bl',
    userOrigin: null,
    returnToOrigin: false,
    optimizeOrder: true,
  };
}

export function createProject(
  options: { name?: string; machineProfileId?: string | null; now?: string; id?: MakeId } = {},
): Project {
  const now = options.now ?? new Date().toISOString();
  return {
    version: PROJECT_SCHEMA_VERSION,
    id: (options.id ?? makeId)(),
    name: options.name ?? 'Untitled',
    createdAt: now,
    updatedAt: now,
    machineProfileId: options.machineProfileId ?? null,
    layers: [],
    objects: [],
    assets: {},
    jobSettings: defaultJobSettings(),
  };
}

/** Frame power is capped by the safety rules (SPEC §11). */
export const MAX_FRAME_POWER_PERCENT = 5;

export function defaultMachineProfile(overrides: Partial<MachineProfile> = {}): MachineProfile {
  return {
    id: makeId(),
    name: 'Generic GRBL laser',
    bedWidth: 400,
    bedHeight: 400,
    originCorner: 'bl',
    baudRate: 115200,
    maxS: 1000,
    laserModeRequired: true,
    defaultJogSpeed: 3000,
    frameSpeed: 3000,
    framePowerPercent: 0,
    supportsAirAssist: false,
    gcodeHeader: '',
    gcodeFooter: '',
    ...overrides,
  };
}

export { MACHINE_PRESETS } from './machine-presets';
