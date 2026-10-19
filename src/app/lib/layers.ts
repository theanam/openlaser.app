/** Layer helpers for the UI. */
import { DEFAULT_IMAGE_SETTINGS } from '$lib/cam/raster/defaults';
import { DEFAULT_FILL_SETTINGS, DEFAULT_LINE_SETTINGS } from '$lib/import/layer-defaults';
import type { Layer, LayerMode } from '$lib/project/types';

const MODE_LABEL: Record<LayerMode, string> = { line: 'Line', fill: 'Fill', image: 'Image' };

/** "Fill · 3000 · 40% · ×1", "Image · 2400 · 18–55% · ×1" (DESIGN §5). */
export function layerSummary(layer: Layer): string {
  const power =
    layer.mode === 'image' && layer.image?.algorithm === 'grayscale'
      ? `${Math.round(layer.minPower)}–${Math.round(layer.power)}%`
      : `${Math.round(layer.power)}%`;
  return `${MODE_LABEL[layer.mode]} · ${Math.round(layer.speed)} · ${power} · ×${layer.passes}`;
}

/** Switching mode keeps the other settings and fills in defaults for the new mode. */
export function withMode(layer: Layer, mode: LayerMode): Partial<Layer> {
  const patch: Partial<Layer> = { mode };
  if (mode === 'line' && !layer.line) patch.line = { ...DEFAULT_LINE_SETTINGS };
  if (mode === 'fill' && !layer.fill) patch.fill = { ...DEFAULT_FILL_SETTINGS };
  if (mode === 'image' && !layer.image) patch.image = { ...DEFAULT_IMAGE_SETTINGS };
  return patch;
}
