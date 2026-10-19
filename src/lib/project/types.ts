/**
 * Domain model (SPEC §4). These types are the contract between the project, CAM and UI layers.
 * Change them only deliberately, with a migration and a docs/decisions.md entry.
 */
import type { Mat2D, PathData, Vec2 } from '../geometry/types';

export type { Mat2D, PathData, Segment, Vec2 } from '../geometry/types';

export type Id = string;

export interface Project {
  /** Schema version, starts at 1. */
  version: number;
  id: Id;
  name: string;
  createdAt: string;
  updatedAt: string;
  machineProfileId: Id | null;
  /** Ordered: execution order. */
  layers: Layer[];
  /** z-order = array order. */
  objects: SceneObject[];
  assets: Record<Id, Asset>;
  jobSettings: JobSettings;
}

export type LayerMode = 'line' | 'fill' | 'image';

export interface Layer {
  id: Id;
  name: string;
  color: string;
  visible: boolean;
  output: boolean;
  mode: LayerMode;
  /** mm/min */
  speed: number;
  /** Percent 0–100 (max). */
  power: number;
  /** Percent 0–100, used by image grayscale mode. */
  minPower: number;
  passes: number;
  airAssist: boolean;
  line?: LineSettings;
  fill?: FillSettings;
  image?: ImageSettings;
}

export interface LineSettings {
  /** mm, positive = outward. */
  kerfOffset: number;
}

export interface FillSettings {
  /** mm between scanlines. */
  interval: number;
  /** Degrees. */
  angle: number;
  bidirectional: boolean;
  /** mm, laser-off acceleration distance at each line end. */
  overscan: number;
  /** Second pass at angle + 90°. */
  crossHatch: boolean;
}

export type DitherAlgorithm =
  'threshold' | 'floyd-steinberg' | 'atkinson' | 'jarvis' | 'stucki' | 'ordered' | 'grayscale';

export interface ImageSettings {
  /** Line density; interval = 25.4 / dpi. */
  dpi: number;
  algorithm: DitherAlgorithm;
  /** 0–255, for threshold mode. */
  threshold: number;
  /** -100..100 */
  brightness: number;
  /** -100..100 */
  contrast: number;
  /** 0.1..5 */
  gamma: number;
  invert: boolean;
  bidirectional: boolean;
  /** mm */
  overscan: number;
  scanAngle: 0 | 90;
  /** Treat the image as pre-dithered, no processing. */
  passThrough: boolean;
}

export type SceneObject = VectorObject | ImageObject | TextObject;

export interface BaseObject {
  id: Id;
  layerId: Id;
  name: string;
  locked: boolean;
  visible: boolean;
  /** Object → bed coordinates (mm), Y-up bed space. */
  transform: Mat2D;
}

export interface VectorObject extends BaseObject {
  kind: 'vector';
  /** Absolute subpaths of lines and cubic beziers in object space, mm. */
  paths: PathData[];
  /** Set for objects made with the Shapes tool, so their parameters stay editable. */
  shape?: ShapeSpec;
}

/** A parametric shape from the shape library; `paths` is regenerated from it. */
export interface ShapeSpec {
  /** Shape library kind, e.g. "star", "cog", "heart". */
  kind: string;
  params: Record<string, number | boolean>;
  /** mm, in object space. */
  width: number;
  height: number;
}

export interface ImageObject extends BaseObject {
  kind: 'image';
  assetId: Id;
  /** mm, in object space before transform. */
  width: number;
  height: number;
}

export type TextAlign = 'left' | 'center' | 'right';

/** Text set in a Google Font. CAM burns `paths`, the outlines cached from the font. */
export interface TextObject extends BaseObject {
  kind: 'text';
  /** Lines separated by \n. */
  text: string;
  fontFamily: string;
  /** Em size in mm. */
  fontSize: number;
  /** 100–900 */
  fontWeight: number;
  italic: boolean;
  align: TextAlign;
  /** Baseline-to-baseline distance as a multiple of fontSize. */
  lineHeight: number;
  /** Extra space between letters in 1/1000 em. */
  letterSpacing: number;
  /**
   * Outlines in object space (mm, Y-up): the text block spans (0,0)–(width,height) with the first
   * line at the top. Regenerated when the text or its style changes; empty until the font loads.
   */
  paths: PathData[];
}

export interface Asset {
  id: Id;
  mime: string;
  name: string;
  /** Blob in memory and IndexedDB; a file entry inside .olaser archives. */
  data: Blob;
  widthPx?: number;
  heightPx?: number;
}

export type Anchor = 'tl' | 't' | 'tr' | 'l' | 'c' | 'r' | 'bl' | 'b' | 'br';

export interface JobSettings {
  origin: 'absolute' | 'current-position' | 'user-origin';
  /** For non-absolute origin. */
  anchor: Anchor;
  userOrigin: Vec2 | null;
  returnToOrigin: boolean;
  optimizeOrder: boolean;
}

export interface MachineProfile {
  id: Id;
  name: string;
  /** mm */
  bedWidth: number;
  bedHeight: number;
  /** Where machine 0,0 is, for display mapping. */
  originCorner: 'bl' | 'tl' | 'tr' | 'br';
  baudRate: number;
  /** Read from $30 when connected, editable. */
  maxS: number;
  /** Warn if $32 != 1. */
  laserModeRequired: boolean;
  defaultJogSpeed: number;
  frameSpeed: number;
  /** Default 0 (laser off). Max allowed 5. */
  framePowerPercent: number;
  supportsAirAssist: boolean;
  gcodeHeader: string;
  gcodeFooter: string;
}
