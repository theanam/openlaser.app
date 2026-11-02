/**
 * Material presets for the active machine. LaserPecker models have their own published tables;
 * other machines get the presets published for their kind of laser at the nearest optical power
 * at or below theirs (a weaker class only errs on the gentle side).
 */
import type { Layer, MachineProfile } from '../types';
import type { MaterialOperation, MaterialPreset } from './types';
import { CO2_PRESETS } from './co2/index';
import { DIODE_PRESETS } from './diode/index';
import { LASERPECKER_PRESETS } from './laserpecker/index';

export type { MaterialOperation, MaterialPreset, PresetMachine } from './types';

export const MATERIAL_PRESETS: readonly MaterialPreset[] = [
  ...LASERPECKER_PRESETS,
  ...DIODE_PRESETS,
  ...CO2_PRESETS,
];

/** What the presets were matched on, for the picker to say. */
export type PresetBasis =
  | { kind: 'model'; model: string }
  | { kind: 'class'; laser: 'diode' | 'co2'; watts: number }
  | { kind: 'none'; laser: 'diode' | 'co2' };

export function presetBasis(
  profile: Pick<MachineProfile, 'name' | 'laserType' | 'laserWatts'>,
  all: readonly MaterialPreset[] = MATERIAL_PRESETS,
): PresetBasis {
  const model = all.find((p) => p.machine.kind === 'model' && profile.name.includes(p.machine.model));
  if (model && model.machine.kind === 'model') return { kind: 'model', model: model.machine.model };
  const laser = profile.laserType;
  const watts = profile.laserWatts;
  if (!watts) return { kind: 'none', laser };
  const classes = [
    ...new Set(
      all.flatMap((p) => (p.machine.kind === 'class' && p.machine.laser === laser ? [p.machine.watts] : [])),
    ),
  ];
  const fit = classes.filter((w) => w <= watts).sort((a, b) => b - a)[0] ?? Math.min(...classes);
  return Number.isFinite(fit) ? { kind: 'class', laser, watts: fit } : { kind: 'none', laser };
}

/** Wattage classes there are presets for, per laser type. */
export function wattClasses(
  laser: 'diode' | 'co2',
  all: readonly MaterialPreset[] = MATERIAL_PRESETS,
): number[] {
  return [
    ...new Set(
      all.flatMap((p) => (p.machine.kind === 'class' && p.machine.laser === laser ? [p.machine.watts] : [])),
    ),
  ].sort((a, b) => a - b);
}

export function presetsFor(
  basis: PresetBasis,
  operation: MaterialOperation,
  all: readonly MaterialPreset[] = MATERIAL_PRESETS,
): MaterialPreset[] {
  if (basis.kind === 'none') return [];
  return all
    .filter((p) => p.operation === operation)
    .filter((p) =>
      basis.kind === 'model'
        ? p.machine.kind === 'model' && p.machine.model === basis.model
        : p.machine.kind === 'class' && p.machine.laser === basis.laser && p.machine.watts === basis.watts,
    )
    .sort((a, b) => a.material.localeCompare(b.material) || (a.thicknessMm ?? 0) - (b.thicknessMm ?? 0));
}

export const presetById = (id: string | undefined) => MATERIAL_PRESETS.find((p) => p.id === id);

/** "Basswood plywood · 3 mm" */
export function presetName(p: Pick<MaterialPreset, 'material' | 'thicknessMm'>): string {
  return p.thicknessMm ? `${p.material} · ${p.thicknessMm} mm` : p.material;
}

/**
 * The layer settings a preset sets. Images keep their mode (only engraving applies to them);
 * vector layers take the preset's mode, so a cut preset turns a fill into a line layer.
 */
export function presetLayerPatch(layer: Layer, preset: MaterialPreset): Partial<Layer> {
  const patch: Partial<Layer> = {
    power: preset.power,
    speed: preset.speed,
    passes: preset.passes,
    materialId: preset.id,
  };
  if (preset.airAssist !== undefined) patch.airAssist = preset.airAssist;
  if (layer.mode !== 'image' && preset.mode !== 'image') patch.mode = preset.mode;
  return patch;
}
