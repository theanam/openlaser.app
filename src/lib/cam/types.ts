/**
 * CAM contracts (SPEC §6). CAM is pure: data in, data out. No DOM, no I/O, no clocks, no randomness.
 */
import type { Rect, Vec2 } from '../geometry/types';
import type { Id, MachineProfile, Project } from '../project/types';

export type { Rect } from '../geometry/types';

/** ImageData-compatible RGBA buffer. Works in workers and in Node tests. */
export interface RasterSource {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

/** Firmware limits used by the time estimate. Missing values use conservative defaults. */
export interface MachineLimits {
  /** $110 / $111, mm/min */
  maxRateX?: number;
  maxRateY?: number;
  /** $120 / $121, mm/s² */
  accelX?: number;
  accelY?: number;
}

export interface GcodeOptions {
  /** Run the modal/coordinate optimizer. Always on; the toggle is a debug aid. */
  optimize: boolean;
  /** Keep `0.5` instead of `.5`. */
  leadingZero: boolean;
  /** Add `; layer` comments at layer boundaries (debug only). */
  comments: boolean;
}

export interface CompileInput {
  project: Project;
  assets: Map<Id, RasterSource>;
  profile: MachineProfile;
  /** Needed for the 'current-position' origin. */
  machinePosition?: Vec2;
  limits?: MachineLimits;
  gcode?: Partial<GcodeOptions>;
  /** Bezier flattening chord tolerance in mm. Default 0.01. */
  tolerance?: number;
}

/**
 * One continuous burn run. The emitter travels (G0) to the first point, then burns each segment.
 * `power` is a percent (0–100) per segment, or one value for the whole run. A segment with power 0
 * is a laser-off G1 move (overscan, short gaps).
 */
export interface ToolpathRun {
  /** Interleaved x,y in bed mm: x0,y0,x1,y1,… */
  points: number[];
  power: number | number[];
}

export interface Toolpath {
  layerId: Id;
  /** mm/min */
  feed: number;
  runs: ToolpathRun[];
  airAssist: boolean;
  /** 'dynamic' = M4 (default). 'constant' = M3: framing with power, and profiles set to constant power (CO₂). */
  laserMode?: 'dynamic' | 'constant';
}

export type CamWarningCode =
  | 'out-of-bounds'
  | 'speed-exceeds-max'
  | 'rotated-image'
  | 'empty-job'
  | 'missing-asset'
  | 'open-path-fill'
  | 'text-not-ready';

export interface CamWarning {
  code: CamWarningCode;
  message: string;
  /** Blocking warnings must be confirmed by the user before a job starts. */
  blocking: boolean;
  layerId?: Id;
  objectId?: Id;
}

export interface JobStats {
  lineCount: number;
  byteCount: number;
  /** mm */
  burnDistance: number;
  travelDistance: number;
  /** An estimate, label it as such in the UI. */
  estimatedSeconds: number;
}

export interface JobPlan {
  toolpaths: Toolpath[];
  /** Final lines without trailing newlines. */
  gcode: string[];
  /** Of laser-on moves, for framing. Null when nothing burns. */
  bounds: Rect | null;
  stats: JobStats;
  warnings: CamWarning[];
}

/**
 * Moves parsed from G-code for preview and framing (SPEC §5.3). Compact typed arrays so a
 * million-segment job stays cheap to hold and draw.
 */
export interface MoveList {
  count: number;
  /** x0,y0,x1,y1 per move, bed mm. */
  coords: Float32Array;
  /** Laser power per move, 0–1 of maxS. 0 for travel or laser off. */
  power: Float32Array;
  /** 1 for G0 (rapid) moves. */
  rapid: Uint8Array;
  /** 0-based index of the source G-code line that produced the move. */
  line: Uint32Array;
  /** Total G-code line count. */
  lineCount: number;
  /** Of all moves. Null when there are none. */
  bounds: Rect | null;
  /** Of laser-on moves only. Null when nothing burns. */
  burnBounds: Rect | null;
}
