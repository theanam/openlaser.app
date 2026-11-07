/**
 * Save and open `.olaser` files, set up a machine from a preset, and give a layer a material's
 * starting settings.
 */
import {
  defaultMachineProfile,
  deserializeProject,
  MACHINE_PRESETS,
  machinePresetName,
  presetBasis,
  presetLayerPatch,
  presetProfileFields,
  presetsFor,
  serializeProject,
  updateLayer,
  type Project,
} from 'libopenlaser/project';

export async function roundTrip(project: Project): Promise<Project> {
  // A zip with project.json and the image assets.
  const bytes: Uint8Array = await serializeProject(project);
  return deserializeProject(bytes);
}

export function orturProfile() {
  const preset = MACHINE_PRESETS.find((p) => machinePresetName(p) === 'Ortur Laser Master 3 (10W)')!;
  return defaultMachineProfile(presetProfileFields(preset));
}

/** Cutting settings for birch plywood, matched to the laser's kind and power. */
export function cutBirchPlywood(project: Project): Project {
  const profile = orturProfile();
  const preset = presetsFor(presetBasis(profile), 'cut').find((p) => p.material === 'Birch plywood');
  const layer = project.layers[0];
  return preset ? updateLayer(project, layer.id, presetLayerPatch(layer, preset)) : project;
}
