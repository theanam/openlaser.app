import type { Subpath } from './geom';

/** Pixels in RGBA order, like ImageData (which satisfies this type). */
export type Pixels = { width: number; height: number; data: Uint8ClampedArray };

export type TraceMode = 'color' | 'gray' | 'bw';

export type TraceOptions = {
  mode: TraceMode;
  /** Palette size for color and gray modes (2–64). */
  colors: number;
  /** Black-and-white cutoff, 0–255. Negative picks one automatically (Otsu). */
  threshold: number;
  /** Regions smaller than this many pixels merge into their neighbors. */
  speckle: number;
  /** 0–100: how loosely curves follow the pixels. */
  smoothness: number;
  /** 0–100: how readily bends become corners. */
  corners: number;
  /** Layers overlap (no hairline gaps) when true; regions sit side by side when false. */
  stacked: boolean;
  /** Leave out the color that fills the image border. */
  ignoreBackground: boolean;
  /** Blur radius in pixels before reading colors (0–3), for noisy photos. */
  denoise: number;
};

export type TraceLayer = {
  /** sRGB 0–1. */
  color: { r: number; g: number; b: number };
  subpaths: Subpath[];
  /** Pixels covered by this color's own region. */
  area: number;
};

/** Paths in the coordinates of the traced pixels (1 unit = 1 pixel), bottom layer first. */
export type TraceResult = {
  width: number;
  height: number;
  layers: TraceLayer[];
  nodes: number;
};
