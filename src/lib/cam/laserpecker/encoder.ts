/**
 * Project → LaserPecker job: one file per burn setting (laser, power, depth, passes), burned in turn
 * as one job, plus the framing rectangle and the accessory the job needs.
 */
import { activeAccessory, layerSource, objectDiameter } from '../../project/accessories';
import { depthFromSpeed } from '../../project/depth';
import type { Id, Layer, MachineProfile } from '../../project/types';
import { DEFAULT_FILL_SETTINGS } from '../vector/fill';
import type { JobEncoder } from '../encoders';
import type { CamWarning } from '../types';
import type { RasterFile } from './file';
import { laserPeckerJob } from './job';

export interface LaserPeckerEncodeOptions {
  dpi: number;
  /** The device's step code for the resolution. */
  px: number;
  /** 1-bit packed image, for firmware that takes it. */
  packed: boolean;
}

export interface LaserPeckerFilePart {
  /** Null on one-laser machines. */
  sourceId: Id | null;
  /** The device's laser type (0 blue, 1 infrared). */
  laserType: number;
  /** A file burns at one setting: its layers' power (percent), depth (1–100) and passes. */
  power: number;
  depth: number;
  passes: number;
  file: RasterFile;
}

export interface LaserPeckerPayload {
  parts: LaserPeckerFilePart[];
  /** mm on the work area, top-left origin: around every part. */
  frame: { x: number; y: number; width: number; height: number };
  layers: number;
  accessory: 'rotary' | 'slide' | null;
  /** mm, on a rotary; 0 on the flat bed. */
  objectDiameter: number;
}

type Rect = LaserPeckerPayload['frame'];

function union(a: Rect | null, b: Rect): Rect {
  if (!a) return b;
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return {
    x,
    y,
    width: Math.max(a.x + a.width, b.x + b.width) - x,
    height: Math.max(a.y + a.height, b.y + b.height) - y,
  };
}

/** What one file burns with: the device takes one laser, power, depth and pass count per file. */
function burnKey(profile: MachineProfile, layer: Layer): string {
  const power = Math.max(1, Math.min(100, Math.round(layer.power)));
  return [layerSource(profile, layer)?.id ?? '', power, depthFromSpeed(layer.speed), layer.passes].join('|');
}

/**
 * The device draws one bitmap at its own resolution: fills become solid at that pitch, and scan
 * settings that only steer a moving head (angle, overscan, direction, cross-hatch) do not apply.
 * Passes repeat on the device, not in the bitmap.
 */
function asRaster(layer: Layer, dpi: number): Layer {
  const fill = { ...(layer.fill ?? DEFAULT_FILL_SETTINGS) };
  Object.assign(fill, {
    interval: 25.4 / dpi,
    angle: 0,
    overscan: 0,
    crossHatch: false,
    bidirectional: true,
  });
  return { ...layer, passes: 1, fill, ...(layer.image ? { image: { ...layer.image, overscan: 0 } } : {}) };
}

export const laserPeckerEncoder: JobEncoder<LaserPeckerEncodeOptions, LaserPeckerPayload> = {
  encode(input, options) {
    const { project, profile } = input;
    // In layer order, one file per laser, power, depth and pass count.
    const keys = [...new Set(project.layers.filter((l) => l.output).map((l) => burnKey(profile, l)))];
    const parts: LaserPeckerFilePart[] = [];
    let frame: Rect | null = null;
    let layers = 0;
    const warnings = new Map<string, CamWarning>();
    for (const key of keys) {
      const group = project.layers.filter((l) => l.output && burnKey(profile, l) === key);
      const only = {
        ...project,
        layers: project.layers.map((l) => asRaster({ ...l, output: group.includes(l) }, options.dpi)),
      };
      const job = laserPeckerJob({ ...input, project: only }, options);
      for (const w of job.warnings)
        if (w.code !== 'empty-job' || keys.length === 1) warnings.set(w.message, w);
      if (!job.file || !job.frame) continue;
      const first = group[0]!;
      const source = layerSource(profile, first);
      parts.push({
        sourceId: source?.id ?? null,
        laserType: source?.deviceCode ?? 0,
        power: Math.max(1, Math.min(100, Math.round(first.power))),
        depth: depthFromSpeed(first.speed),
        passes: Math.max(1, Math.round(first.passes)),
        file: job.file,
      });
      frame = union(frame, job.frame);
      layers += job.layers;
    }
    const accessory = activeAccessory(profile, project.jobSettings);
    const payload: LaserPeckerPayload | null = frame
      ? {
          parts,
          frame,
          layers,
          accessory: accessory?.kind ?? null,
          objectDiameter: accessory?.kind === 'rotary' ? objectDiameter(project.jobSettings) : 0,
        }
      : null;
    return { payload, warnings: [...warnings.values()] };
  },
};
