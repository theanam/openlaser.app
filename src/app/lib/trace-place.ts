/** Turns a finished trace into project layers and vector objects placed exactly over the image. */
import { defaultLayer } from '$lib/import/layer-defaults';
import type { MakeId } from '$lib/project/ids';
import { addLayer, addObjects, removeLayer, removeObjects, updateObject } from '$lib/project/operations';
import type { Id, ImageObject, Layer, LayerMode, PathData, Project, VectorObject } from '$lib/project/types';

export interface TracedLayer {
  color: string;
  rgb: { r: number; g: number; b: number };
  area: number;
  paths: PathData[];
}

export interface PlaceOptions {
  /** Fill engraves the traced areas; line cuts or scores their outlines. */
  mode: Extract<LayerMode, 'fill' | 'line'>;
  /** Darker colors burn harder: power scales with how dark each traced color is. */
  powerByShade: boolean;
  /** Keep the photo hidden under the trace; otherwise it is removed. */
  keepImage: boolean;
}

const luminance = (c: { r: number; g: number; b: number }) => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;

/** Paper-white regions are where the laser stays off, so they never become burn layers. */
export const WHITE_LUMINANCE = 0.92;

export function burnableLayers(traced: TracedLayer[]): TracedLayer[] {
  return traced.filter((t) => t.paths.length > 0 && luminance(t.rgb) < WHITE_LUMINANCE);
}

/** Layer colors are display-only; near-black traces would vanish on the graphite bed, so lift them. */
export function displayColor(rgb: { r: number; g: number; b: number }): string {
  const lift = luminance(rgb) < 0.3 ? 0.45 : 0;
  const ch = (v: number) =>
    Math.round((v + (1 - v) * lift) * 255)
      .toString(16)
      .padStart(2, '0');
  return `#${ch(rgb.r)}${ch(rgb.g)}${ch(rgb.b)}`.toUpperCase();
}

/** Power for a traced color: full layer power for black, nothing for white. */
export function shadePower(rgb: { r: number; g: number; b: number }, maxPower: number): number {
  return Math.round(Math.max(1, maxPower * (1 - luminance(rgb))));
}

/** Power steps traces are grouped into: colors within 5% of each other burn identically. */
export const POWER_STEP = 5;

/**
 * Groups traced colors by the power they burn at. A layer holds settings, so colors that burn the
 * same share one layer (a 24-color photo lands on a handful of layers, not 24).
 */
export function groupByPower(
  burnable: TracedLayer[],
  basePower: number,
  byShade: boolean,
): Array<{ power: number; members: TracedLayer[] }> {
  const groups = new Map<number, TracedLayer[]>();
  for (const t of burnable) {
    const power = byShade
      ? Math.max(1, Math.round(shadePower(t.rgb, basePower) / POWER_STEP) * POWER_STEP)
      : basePower;
    groups.set(power, [...(groups.get(power) ?? []), t]);
  }
  // Darkest (highest power) first: deep areas burn before light ones.
  return [...groups.entries()].sort((a, b) => b[0] - a[0]).map(([power, members]) => ({ power, members }));
}

/** Area-weighted color of a group, for its layer swatch. */
function groupColor(members: TracedLayer[]): { r: number; g: number; b: number } {
  const total = members.reduce((n, m) => n + m.area, 0) || 1;
  const mix = (k: 'r' | 'g' | 'b') => members.reduce((n, m) => n + m.rgb[k] * m.area, 0) / total;
  return { r: mix('r'), g: mix('g'), b: mix('b') };
}

export function placeTrace(
  project: Project,
  image: ImageObject,
  traced: TracedLayer[],
  options: PlaceOptions,
  makeId: MakeId,
): { project: Project; objectIds: Id[] } {
  let next = project;
  const objects: VectorObject[] = [];
  const base = defaultLayer({ id: 'template', mode: options.mode });
  const burnable = burnableLayers(traced);
  const byShade = options.powerByShade && burnable.length > 1;
  const groups = groupByPower(burnable, base.power, byShade);
  const multi = groups.length > 1;
  for (const group of groups) {
    const layer: Layer = {
      ...defaultLayer({ id: makeId(), mode: options.mode }),
      name: multi ? `Trace ${group.power}%` : 'Trace',
      color: multi ? displayColor(groupColor(group.members)) : base.color,
      power: group.power,
    };
    next = addLayer(next, layer);
    objects.push({
      id: makeId(),
      kind: 'vector',
      layerId: layer.id,
      name: multi ? `${image.name} trace ${group.power}%` : `${image.name} trace`,
      locked: false,
      visible: true,
      // The trace covers the image's own box, so it inherits the image's placement.
      transform: image.transform,
      paths: group.members.flatMap((m) => m.paths),
    });
  }
  next = addObjects(next, objects);
  if (options.keepImage) next = updateObject(next, image.id, { visible: false });
  else {
    next = removeObjects(next, new Set([image.id]));
    // The photo's layer has nothing left to burn once its only image is replaced.
    if (!next.objects.some((o) => o.layerId === image.layerId)) next = removeLayer(next, image.layerId);
  }
  return { project: next, objectIds: objects.map((o) => o.id) };
}
