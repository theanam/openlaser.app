import { DEFAULT_IMAGE_SETTINGS } from '../cam/raster/defaults';
import type { FillSettings, Layer, LayerMode, LineSettings } from '../project/types';

/** Default layer palette from the design system, in order. */
export const LAYER_PALETTE: ReadonlyArray<{ name: string; color: string }> = [
  { name: 'Signal', color: '#C0392B' },
  { name: 'Beam', color: '#4CC9F0' },
  { name: 'Photo', color: '#B794F6' },
  { name: 'Hold', color: '#F2B33D' },
  { name: 'Go', color: '#3DD68C' },
  { name: 'Coral', color: '#F59A95' },
  { name: 'Sky', color: '#7FB2FF' },
  { name: 'Bone', color: '#E7E9EB' },
];

/** Palette color conventionally used for each mode (cut/line, fill, image). */
export const MODE_COLORS: Readonly<Record<LayerMode, string>> = {
  line: '#C0392B',
  fill: '#4CC9F0',
  image: '#B794F6',
};

export const DEFAULT_LINE_SETTINGS: Readonly<LineSettings> = Object.freeze({ kerfOffset: 0 });

export const DEFAULT_FILL_SETTINGS: Readonly<FillSettings> = Object.freeze({
  interval: 0.1,
  angle: 0,
  bidirectional: true,
  overscan: 2.5,
  crossHatch: false,
});

export { DEFAULT_IMAGE_SETTINGS };

const MODE_BASICS: Record<LayerMode, Pick<Layer, 'speed' | 'power' | 'minPower' | 'passes'>> = {
  line: { speed: 1000, power: 100, minPower: 0, passes: 1 },
  fill: { speed: 3000, power: 40, minPower: 0, passes: 1 },
  image: { speed: 2400, power: 55, minPower: 0, passes: 1 },
};

const MODE_NAMES: Record<LayerMode, string> = { line: 'Cut', fill: 'Fill', image: 'Image' };

/**
 * A complete layer with defaults for its mode. `partial.mode` picks the defaults (line when
 * omitted); any other field in `partial` overrides them. Settings objects are fresh copies.
 */
export function defaultLayer(partial: Partial<Layer> & { id: string }): Layer {
  const mode = partial.mode ?? 'line';
  return {
    name: MODE_NAMES[mode],
    color: MODE_COLORS[mode],
    visible: true,
    output: true,
    mode,
    ...MODE_BASICS[mode],
    airAssist: false,
    ...modeSettings(mode),
    ...partial,
  };
}

function modeSettings(mode: LayerMode): Pick<Layer, 'line' | 'fill' | 'image'> {
  if (mode === 'line') return { line: { ...DEFAULT_LINE_SETTINGS } };
  if (mode === 'fill') return { fill: { ...DEFAULT_FILL_SETTINGS } };
  return { image: { ...DEFAULT_IMAGE_SETTINGS } };
}

/** The palette name for a color (case-insensitive), or null when it is not a palette color. */
export function paletteName(color: string): string | null {
  const wanted = color.toLowerCase();
  return LAYER_PALETTE.find((entry) => entry.color.toLowerCase() === wanted)?.name ?? null;
}
