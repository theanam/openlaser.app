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
  /**
   * The home corner the objects were laid out for. When the machine's differs, the design is
   * mirrored to match, so it reads the same on screen (see `project/orientation.ts`). Missing on
   * projects saved before it was recorded.
   */
  designCorner?: MachineProfile['originCorner'];
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
  /** Which of the machine's laser sources burns this layer; the first one when unset. */
  laserSourceId?: Id;
  /** The material preset the settings came from (see `project/materials`), until they are edited. */
  materialId?: string;
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
  /** Drawn on the bed with the rectangle or ellipse tool: free to stretch, unlike imported art. */
  drawn?: boolean;
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
  /**
   * Height of the laid-out block (line boxes, not glyph extents) that `paths` were made for, so a
   * re-outline keeps the block's top edge in place. Missing on text saved before it was recorded.
   */
  blockHeight?: number;
  /** TEXT_OUTLINE_VERSION the paths were made with; older text is re-outlined on open. */
  outlineVersion?: number;
  /**
   * Characters no available face could draw when the paths were made (the font and its script's
   * fallback were both out of reach, offline say). They are absent from the burn.
   */
  missingGlyphs?: string[];
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
  /** The machine accessory fitted for this job (a rotary, a slide), or null for the flat bed. */
  accessoryId?: Id | null;
  /** mm, of the round object on a rotary. */
  objectDiameter?: number;
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
  /** Source type: CO₂ tubes need constant power and show speeds in mm/s by default. */
  laserType: LaserType;
  /** Optical output power in watts, for material presets. Unknown when unset. */
  laserWatts?: number;
  /** The machine adapter that drives this machine: `grbl`, `ruida`, … (see src/app/machines/registry.ts). */
  controller: LaserController;
  /** Burn with M3 (constant power) instead of M4 (power follows speed). On for CO₂ tubes. */
  constantPower: boolean;
  /** How speeds are shown and typed. Stored values stay mm/min. */
  speedUnit: SpeedUnit;
  /** Machines with more than one laser (450 nm diode and 1064 nm IR); layers pick one. Empty: one laser. */
  laserSources?: LaserSource[];
  /** Rotaries, slides and other attachments that change how and where the machine works. */
  accessories?: MachineAccessory[];
  /** G-code at the start of every job on the flat bed, e.g. a normal-mode switch (M3030). */
  flatModeGcode?: string;
}

export interface LaserSource {
  id: Id;
  label: string;
  /** nm */
  wavelength: number;
  /** G-code that switches to this laser before its layers burn, e.g. M3011. */
  selectGcode: string;
  /** The machine's own number for this laser, for protocols that take one (LaserPecker: 0 blue, 1 IR). */
  deviceCode: number;
}

export type AccessoryKind = 'rotary' | 'slide';

export interface RotarySetup {
  /** Roller: the object rests on rollers. Chuck: the object is held at its ends and turns with the axis. */
  type: 'roller' | 'chuck';
  /** The controller axis that turns the object. */
  axis: 'y' | 'a';
  /** Controller units for one full turn of the roller or chuck: mm on Y, degrees on A. */
  unitsPerRotation: number;
  /** mm, roller rotaries only. */
  rollerDiameter: number;
  /** The machine turns surface mm into rotation itself (LaserPecker): positions go out unscaled. */
  deviceScales: boolean;
}

export interface MachineAccessory {
  id: Id;
  kind: AccessoryKind;
  label: string;
  /** Work area while fitted, mm. A rotary's height is the most surface it turns through. */
  bedWidth: number;
  bedHeight: number;
  /** G-code at the start of every job with this accessory, e.g. a mode switch (M3032). */
  startGcode: string;
  /** Set for rotaries. */
  rotary?: RotarySetup;
}

export type LaserType = 'diode' | 'co2';
/** A registered machine adapter id. Unknown ids fall back to `grbl`. */
export type LaserController = string;
/** `depth`: LaserPecker's 1–100 burn depth (see `project/depth.ts`). */
export type SpeedUnit = 'mm/min' | 'mm/s' | 'depth';
