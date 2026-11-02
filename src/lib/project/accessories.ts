/**
 * Machine accessories and laser sources: which ones a job uses and what follows from that. The
 * work area, the mode G-code and the rotary's axis scaling all come from here, so switching the
 * rotary on in the Machine panel is the only step a user takes.
 */
import type {
  Id,
  JobSettings,
  Layer,
  LaserSource,
  MachineAccessory,
  MachineProfile,
  RotarySetup,
} from './types';

/** A typical tumbler, used until the object is measured. */
export const DEFAULT_OBJECT_DIAMETER = 60;

export function accessories(profile: MachineProfile): MachineAccessory[] {
  return profile.accessories ?? [];
}

export function laserSources(profile: MachineProfile): LaserSource[] {
  return profile.laserSources ?? [];
}

/** The accessory the job uses, if the profile still has it. */
export function activeAccessory(
  profile: MachineProfile,
  settings: Pick<JobSettings, 'accessoryId'> | undefined,
): MachineAccessory | null {
  const id = settings?.accessoryId;
  return id ? (accessories(profile).find((a) => a.id === id) ?? null) : null;
}

export function objectDiameter(settings: Pick<JobSettings, 'objectDiameter'> | undefined): number {
  const d = settings?.objectDiameter;
  return d && d > 0 ? d : DEFAULT_OBJECT_DIAMETER;
}

/**
 * The area a job can use. A rotary unrolls the object: its surface is one circumference tall
 * (never more than the rotary takes), as wide as the rotary allows.
 */
export function workArea(
  profile: MachineProfile,
  settings: Pick<JobSettings, 'accessoryId' | 'objectDiameter'> | undefined,
): { width: number; height: number } {
  const accessory = activeAccessory(profile, settings);
  if (!accessory) return { width: profile.bedWidth, height: profile.bedHeight };
  if (accessory.kind !== 'rotary') return { width: accessory.bedWidth, height: accessory.bedHeight };
  const around = Math.PI * objectDiameter(settings);
  return { width: accessory.bedWidth, height: Math.min(accessory.bedHeight, around) };
}

/** The profile as the job sees it: the accessory's work area in place of the bed. */
export function workProfile(
  profile: MachineProfile,
  settings: Pick<JobSettings, 'accessoryId' | 'objectDiameter'> | undefined,
): MachineProfile {
  const area = workArea(profile, settings);
  if (area.width === profile.bedWidth && area.height === profile.bedHeight) return profile;
  return { ...profile, bedWidth: area.width, bedHeight: area.height };
}

/** G-code that puts the machine in the job's mode, sent at the start of every job. */
export function modeGcode(
  profile: MachineProfile,
  settings: Pick<JobSettings, 'accessoryId'> | undefined,
): string {
  return activeAccessory(profile, settings)?.startGcode ?? profile.flatModeGcode ?? '';
}

/**
 * Controller units per mm of object surface. A roller turns the object by its own circumference;
 * a chuck turns it once per rotation. Machines that scale on their own take surface mm (1).
 */
export function rotaryScale(rotary: RotarySetup, diameter: number): number {
  if (rotary.deviceScales) return 1;
  const turned = rotary.type === 'roller' ? rotary.rollerDiameter : diameter;
  return turned > 0 && rotary.unitsPerRotation > 0 ? rotary.unitsPerRotation / (Math.PI * turned) : 1;
}

/** How Y positions go out on a rotary job: the axis letter and the scale; null on the flat bed. */
export interface YAxisMapping {
  letter: 'Y' | 'A';
  scale: number;
}

export function yAxisMapping(
  profile: MachineProfile,
  settings: Pick<JobSettings, 'accessoryId' | 'objectDiameter'> | undefined,
): YAxisMapping | null {
  const rotary = activeAccessory(profile, settings)?.rotary;
  if (!rotary) return null;
  const mapping: YAxisMapping = {
    letter: rotary.axis === 'a' ? 'A' : 'Y',
    scale: rotaryScale(rotary, objectDiameter(settings)),
  };
  return mapping.letter === 'Y' && mapping.scale === 1 ? null : mapping;
}

/** The laser a layer burns with: its own choice, else the machine's first. Null on one-laser machines. */
export function layerSource(
  profile: MachineProfile,
  layer: Pick<Layer, 'laserSourceId'>,
): LaserSource | null {
  const sources = laserSources(profile);
  return sources.find((s) => s.id === layer.laserSourceId) ?? sources[0] ?? null;
}

export function sourceById(profile: MachineProfile, id: Id | undefined): LaserSource | null {
  return laserSources(profile).find((s) => s.id === id) ?? null;
}
