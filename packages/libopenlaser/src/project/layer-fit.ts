/**
 * Which objects a layer can burn: images need an image layer, vectors and text a line or fill
 * layer. Used to pick where a deleted layer's objects go and to flag mismatches in the UI.
 */
import type { Id, Layer, LayerMode, Project, SceneObject } from './types';

export function layerAccepts(mode: LayerMode, kind: SceneObject['kind']): boolean {
  return mode === 'image' ? kind === 'image' : kind !== 'image';
}

/**
 * Layers that can take every object now on `layerId`, best first: same mode before a different
 * one, then the nearest in run order. Empty when nothing fits (or the layer has nothing to move).
 */
export function deleteDestinations(project: Project, layerId: Id): Layer[] {
  const index = project.layers.findIndex((l) => l.id === layerId);
  const source = project.layers[index];
  if (!source) return [];
  const kinds = new Set(project.objects.filter((o) => o.layerId === layerId).map((o) => o.kind));
  if (kinds.size === 0) return [];
  return project.layers
    .map((layer, i) => ({ layer, i }))
    .filter(({ layer }) => layer.id !== layerId && [...kinds].every((k) => layerAccepts(layer.mode, k)))
    .sort((a, b) => {
      const sameA = a.layer.mode === source.mode ? 0 : 1;
      const sameB = b.layer.mode === source.mode ? 0 : 1;
      return sameA - sameB || Math.abs(a.i - index) - Math.abs(b.i - index);
    })
    .map(({ layer }) => layer);
}
