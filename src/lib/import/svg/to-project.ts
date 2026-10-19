import { identity } from '../../geometry/mat2d';
import type {
  Asset,
  Id,
  ImageObject,
  Layer,
  LayerMode,
  SceneObject,
  VectorObject,
} from '../../project/types';
import { defaultLayer, paletteName } from '../layer-defaults';
import type { SvgColorGroup, SvgImportResult } from './types';

export interface SvgToProjectOptions {
  /** Base name for objects and assets, usually the file name without extension. */
  name?: string;
  /**
   * The import dialog's color → layer choice. Return an existing layer id to force a mapping, or
   * undefined to use the default (match by color, else create a layer).
   */
  layerFor?: (group: SvgColorGroup) => Id | undefined;
}

export interface SvgProjectObjects {
  layersToAdd: Layer[];
  objects: SceneObject[];
  /** Embedded images decoded from data: URIs, referenced by the image objects. */
  assets: Asset[];
}

const sameColor = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

/**
 * Maps an SVG import onto project data. Pure apart from `makeId`.
 *
 * - Each color group becomes one VectorObject. Its layer is the user's choice, else the first
 *   existing non-image layer with the same color, else a new layer in that color (line mode for
 *   strokes, fill mode for fills) with default settings.
 * - Paths keep document coordinates and the transform is the identity, so the document's
 *   bottom-left corner lands on bed (0,0).
 * - Embedded images become assets plus ImageObjects on the first image layer (created if needed).
 */
export function buildProjectObjectsFromSvg(
  result: SvgImportResult,
  existingLayers: readonly Layer[],
  makeId: () => Id,
  options: SvgToProjectOptions = {},
): SvgProjectObjects {
  const name = options.name ?? 'SVG';
  const layersToAdd: Layer[] = [];
  const objects: SceneObject[] = [];
  const assets: Asset[] = [];
  const allLayers = () => [...existingLayers, ...layersToAdd];

  const layerForGroup = (group: SvgColorGroup): Id => {
    const chosen = options.layerFor?.(group);
    if (chosen !== undefined) return chosen;
    const match = allLayers().find((l) => l.mode !== 'image' && sameColor(l.color, group.color));
    if (match) return match.id;
    const mode: LayerMode = group.kind === 'stroke' ? 'line' : 'fill';
    const layer = defaultLayer({
      id: makeId(),
      mode,
      color: group.color,
      name: paletteName(group.color) ?? `${mode === 'line' ? 'Cut' : 'Fill'} ${group.color.toUpperCase()}`,
    });
    layersToAdd.push(layer);
    return layer.id;
  };

  for (const group of result.groups) {
    const object: VectorObject = {
      id: makeId(),
      kind: 'vector',
      layerId: layerForGroup(group),
      name: `${name} ${group.color.toUpperCase()}`,
      locked: false,
      visible: true,
      transform: identity(),
      paths: group.paths,
    };
    objects.push(object);
  }

  if (result.images.length > 0) {
    let imageLayer = allLayers().find((l) => l.mode === 'image');
    if (!imageLayer) {
      imageLayer = defaultLayer({ id: makeId(), mode: 'image', name: 'Photo' });
      layersToAdd.push(imageLayer);
    }
    result.images.forEach((image, index) => {
      const decoded = decodeDataUri(image.href);
      if (!decoded) return;
      const assetName = `${name} image ${index + 1}`;
      const asset: Asset = { id: makeId(), mime: decoded.mime, name: assetName, data: decoded.blob };
      assets.push(asset);
      const object: ImageObject = {
        id: makeId(),
        kind: 'image',
        layerId: (imageLayer as Layer).id,
        name: assetName,
        locked: false,
        visible: true,
        transform: image.transform,
        assetId: asset.id,
        width: image.width,
        height: image.height,
      };
      objects.push(object);
    });
  }

  return { layersToAdd, objects, assets };
}

/** Decodes a `data:` URI (base64 or percent-encoded) into a Blob. Null when malformed. */
export function decodeDataUri(uri: string): { mime: string; blob: Blob } | null {
  const match = /^data:([^;,]*)((?:;[^;,]*)*),(.*)$/s.exec(uri);
  if (!match) return null;
  const mime = match[1] || 'text/plain';
  const isBase64 = /;base64$/i.test(match[2]);
  let binary: string;
  try {
    binary = isBase64
      ? atob(match[3].replace(/\s+/g, ''))
      : match[3].replace(/%([0-9a-f]{2})/gi, (_, hex: string) => String.fromCharCode(parseInt(hex, 16)));
  } catch {
    return null;
  }
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return { mime, blob: new Blob([bytes], { type: mime }) };
}
