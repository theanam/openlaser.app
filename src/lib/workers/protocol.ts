/** Messages between the UI and the CAM worker. */
import type { CamWarning, GcodeOptions, JobStats, MachineLimits, MoveList, Rect } from '../cam/types';
import type { ImageSettings, Layer, MachineProfile, Project } from '../project/types';
import type { Vec2 } from '../geometry/types';

export interface CompileRequest {
  type: 'compile';
  id: number;
  project: Project;
  profile: MachineProfile;
  machinePosition?: Vec2;
  limits?: MachineLimits;
  gcode?: Partial<GcodeOptions>;
}

export interface CompileResult {
  gcode: string[];
  bounds: Rect | null;
  stats: JobStats;
  warnings: CamWarning[];
  moves: MoveList;
}

export interface ParseGcodeRequest {
  type: 'parse-gcode';
  id: number;
  text: string;
  maxS: number;
}

export interface ParseGcodeResult {
  lines: string[];
  moves: MoveList;
  /** Lines too long for GRBL (≥ 80 characters). */
  longLines: number[];
}

export interface DitherRequest {
  type: 'dither';
  id: number;
  assetId: string;
  blob: Blob;
  settings: ImageSettings;
  layer: Pick<Layer, 'power' | 'minPower'>;
  widthMm: number;
  heightMm: number;
}

export interface DitherResult {
  width: number;
  height: number;
  burn: Uint8ClampedArray;
}

export type WorkerRequest = CompileRequest | ParseGcodeRequest | DitherRequest;

export type WorkerResponse =
  | { id: number; ok: true; result: CompileResult | ParseGcodeResult | DitherResult }
  | { id: number; ok: false; error: string };
