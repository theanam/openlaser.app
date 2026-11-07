/**
 * Export a project as a Ruida `.rd` file, for CO₂ lasers that run jobs from their own panel.
 * Copy the file to a USB stick, then load, frame and start it on the laser.
 */
import { encodeJob } from 'libopenlaser/cam';
import { defaultMachineProfile, laserTypeDefaults, type Project } from 'libopenlaser/project';

export function exportRuida(project: Project): Uint8Array {
  const profile = defaultMachineProfile({
    ...laserTypeDefaults('co2'),
    controller: 'ruida',
    bedWidth: 600,
    bedHeight: 400,
    originCorner: 'tr',
  });
  const { payload, warnings } = encodeJob('ruida', { project, profile, assets: new Map() }, undefined);
  const blocking = warnings.find((w) => w.blocking);
  if (blocking) throw new Error(blocking.message);
  if (!payload) throw new Error('Nothing to export');
  return payload; // In a browser: new Blob([payload]) and download it as job.rd
}
