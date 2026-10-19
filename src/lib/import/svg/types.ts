import type { Mat2D, PathData } from '../../geometry/types';

export interface SvgImportOptions {
  /** Pixels per inch for unitless and px sizes. Default 96; some tools export at 72. */
  dpi?: number;
}

export type SvgPaintKind = 'stroke' | 'fill';

/** All geometry painted with one color in one way: becomes one layer and one vector object. */
export interface SvgColorGroup {
  /** Lowercase `#rrggbb`. */
  color: string;
  kind: SvgPaintKind;
  /** Document space: mm, Y-up, document bottom-left at (0,0). */
  paths: PathData[];
}

/** An embedded `<image>` with a data: URI, to become an ImageObject. */
export interface SvgImage {
  href: string;
  /** Bottom-left corner in document mm (Y-up), for axis-aligned images. */
  x: number;
  y: number;
  /** Object-space size in mm, as ImageObject.width/height. */
  width: number;
  height: number;
  /** Image object space (0..width, 0..height, Y-up) → document mm. Identity scale. */
  transform: Mat2D;
}

export interface SvgImportResult {
  /** Document size in mm. */
  width: number;
  height: number;
  /** One per distinct color + kind, in order of first appearance. */
  groups: SvgColorGroup[];
  images: SvgImage[];
  /** Count of skipped or simplified features by kind (keys of IGNORED_HINTS). */
  ignored: Record<string, number>;
  /** Human-readable summary lines for the import dialog. */
  warnings: string[];
}

/** What happened to each ignored feature, and what the user can do about it. */
export const IGNORED_HINTS: Readonly<Record<string, string>> = {
  text: 'Text was skipped: convert text to paths in your editor.',
  use: 'Clones and symbols (<use>) were skipped: unlink or expand them in your editor.',
  clipPath: 'Clipping was not applied: the full shapes were imported.',
  mask: 'Masks were not applied: the full shapes were imported.',
  filter: 'Filter effects were ignored.',
  gradient: 'Gradients were imported as solid colors (the first stop).',
  pattern: 'Pattern fills were imported as solid colors.',
  foreignObject: 'Embedded HTML (<foreignObject>) was skipped.',
  image:
    'Linked or unsupported images were skipped: embed PNG/JPEG images or import the image file directly.',
  hatch: 'Hatch fills were skipped. Boundaries drawn as separate lines still import.',
  dimension: 'Dimensions and leaders were skipped.',
  solid: 'Solids, meshes and 3D faces were skipped.',
  hidden: 'Shapes on layers that are off or frozen were skipped.',
  other: 'Unsupported entities were skipped: explode them in your CAD tool.',
};
