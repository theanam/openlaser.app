/** Builders for CAM tests and golden cases. Shapes are constructed directly as PathData. */
import type {
  ImageObject,
  JobSettings,
  Layer,
  MachineProfile,
  Mat2D,
  PathData,
  Project,
  SceneObject,
  VectorObject,
} from '$lib/project/types';
import type { CompileInput, RasterSource } from '$lib/cam/types';

const IDENTITY: Mat2D = [1, 0, 0, 1, 0, 0];
/** Cubic control distance for a quarter circle. */
const KAPPA = 0.5522847498307936;

/** Counter-clockwise rectangle. */
export function rectPath(x: number, y: number, w: number, h: number): PathData {
  return {
    closed: true,
    start: { x, y },
    segments: [
      { type: 'L', to: { x: x + w, y } },
      { type: 'L', to: { x: x + w, y: y + h } },
      { type: 'L', to: { x, y: y + h } },
      { type: 'L', to: { x, y } },
    ],
  };
}

/** Counter-clockwise circle from four cubic arcs, starting at the rightmost point. */
export function circlePath(cx: number, cy: number, r: number): PathData {
  const k = r * KAPPA;
  return {
    closed: true,
    start: { x: cx + r, y: cy },
    segments: [
      { type: 'C', c1: { x: cx + r, y: cy + k }, c2: { x: cx + k, y: cy + r }, to: { x: cx, y: cy + r } },
      { type: 'C', c1: { x: cx - k, y: cy + r }, c2: { x: cx - r, y: cy + k }, to: { x: cx - r, y: cy } },
      { type: 'C', c1: { x: cx - r, y: cy - k }, c2: { x: cx - k, y: cy - r }, to: { x: cx, y: cy - r } },
      { type: 'C', c1: { x: cx + k, y: cy - r }, c2: { x: cx + r, y: cy - k }, to: { x: cx + r, y: cy } },
    ],
  };
}

export function polyPath(points: [number, number][], closed = true): PathData {
  const [first, ...rest] = points;
  return {
    closed,
    start: { x: first[0], y: first[1] },
    segments: rest.map(([x, y]) => ({ type: 'L' as const, to: { x, y } })),
  };
}

export function vectorObject(
  id: string,
  layerId: string,
  paths: PathData[],
  transform: Mat2D = IDENTITY,
): VectorObject {
  return { id, layerId, name: id, locked: false, visible: true, transform, kind: 'vector', paths };
}

export function imageObject(
  id: string,
  layerId: string,
  assetId: string,
  width: number,
  height: number,
  transform: Mat2D = IDENTITY,
): ImageObject {
  return {
    id,
    layerId,
    name: id,
    locked: false,
    visible: true,
    transform,
    kind: 'image',
    assetId,
    width,
    height,
  };
}

export function layer(partial: Partial<Layer> & { id: string }): Layer {
  return {
    name: partial.id,
    color: '#C0392B',
    visible: true,
    output: true,
    mode: 'line',
    speed: 1000,
    power: 50,
    minPower: 0,
    passes: 1,
    airAssist: false,
    ...partial,
  };
}

export function profile(partial: Partial<MachineProfile> = {}): MachineProfile {
  return {
    id: 'profile',
    name: 'Test laser',
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
    ...partial,
  };
}

export const DEFAULT_JOB_SETTINGS: JobSettings = {
  origin: 'absolute',
  anchor: 'bl',
  userOrigin: null,
  returnToOrigin: false,
  optimizeOrder: true,
};

export function project(
  layers: Layer[],
  objects: SceneObject[],
  jobSettings: Partial<JobSettings> = {},
): Project {
  return {
    version: 1,
    id: 'project',
    name: 'Test',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    machineProfileId: 'profile',
    layers,
    objects,
    assets: {},
    jobSettings: { ...DEFAULT_JOB_SETTINGS, ...jobSettings },
  };
}

export function compileInput(p: Project, partial: Partial<CompileInput> = {}): CompileInput {
  return { project: p, assets: new Map<string, RasterSource>(), profile: profile(), ...partial };
}
