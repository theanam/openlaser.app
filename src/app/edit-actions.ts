/** Clipboard and selection edits: copy, cut, paste, duplicate, delete, nudge. */
import { multiply, translation } from '$lib/geometry/mat2d';
import { makeId } from '$lib/project/ids';
import {
  addLayer,
  addObjects,
  duplicateObjects,
  removeObjects,
  transformObjects,
} from '$lib/project/operations';
import { contourPaths, type ContourOptions } from '$lib/project/contour';
import type { Asset, Id, Layer, SceneObject, VectorObject } from '$lib/project/types';
import { toast } from '$lib/ui/toasts.svelte';
import { editor } from './state/editor.svelte';

/** Copied objects with their assets and layers, so a cut layer comes back with its settings. */
let clipboard: { objects: SceneObject[]; assets: Asset[]; layers: Layer[] } | null = null;

export function copySelection(): void {
  const project = editor.project;
  if (!project || editor.selection.size === 0) return;
  const objects = project.objects.filter((o) => editor.selection.has(o.id));
  const assets = objects.flatMap((o) =>
    o.kind === 'image' && project.assets[o.assetId] ? [project.assets[o.assetId]] : [],
  );
  const layerIds = new Set(objects.map((o) => o.layerId));
  clipboard = { objects, assets, layers: project.layers.filter((l) => layerIds.has(l.id)) };
}

export function cutSelection(): void {
  copySelection();
  deleteSelection();
}

export function paste(): void {
  const project = editor.project;
  if (!project || !clipboard) return;
  const existing = new Set(project.layers.map((l) => l.id));
  const restore = clipboard.layers.filter((l) => !existing.has(l.id));
  const copies = clipboard.objects.map((o) => ({
    ...o,
    id: makeId(),
    transform: multiply(translation(5, -5), o.transform),
  })) as SceneObject[];
  const { assets, layers } = clipboard;
  editor.commit((p) =>
    addObjects(
      restore.reduce((acc, l) => addLayer(acc, l), p),
      copies,
      assets,
    ),
  );
  editor.select(copies.map((c) => c.id));
  clipboard = { objects: copies, assets, layers };
}

export function duplicateSelection(): void {
  if (!editor.project || editor.selection.size === 0) return;
  let ids: Id[] = [];
  const selection = editor.selection;
  editor.commit((p) => {
    const result = duplicateObjects(p, selection, makeId);
    ids = result.ids;
    return result.project;
  });
  editor.select(ids);
}

export function deleteSelection(): void {
  if (!editor.project || editor.selection.size === 0) return;
  const ids = editor.selection;
  editor.commit((p) => removeObjects(p, ids));
  editor.clearSelection();
}

export function nudge(dx: number, dy: number): void {
  if (!editor.project || editor.selection.size === 0) return;
  const ids = editor.selection;
  editor.commit((p) => transformObjects(p, ids, translation(dx, dy)), { coalesce: 'nudge' });
}

const OUTLINE_LAYER = 'Outline';

/**
 * Outline tool: one closed line around the selection on the "Outline" cut layer (made when
 * missing), selected afterwards so it can be moved or deleted straight away.
 */
export function addOutline(options: ContourOptions): boolean {
  const project = editor.project;
  if (!project || editor.selection.size === 0) return false;
  const paths = contourPaths(
    project.objects.filter((o) => editor.selection.has(o.id)),
    options,
  );
  if (paths.length === 0) {
    toast.warning('The offset leaves nothing to outline.');
    return false;
  }
  const existing = project.layers.find((l) => l.mode === 'line' && l.name === OUTLINE_LAYER);
  const layer: Layer | null = existing ? null : { ...editor.makeLayer('line'), name: OUTLINE_LAYER };
  const outline: VectorObject = {
    id: makeId(),
    kind: 'vector',
    layerId: existing?.id ?? layer!.id,
    name: OUTLINE_LAYER,
    locked: false,
    visible: true,
    transform: [1, 0, 0, 1, 0, 0],
    paths,
  };
  editor.commit((p) => addObjects(layer ? addLayer(p, layer) : p, [outline]));
  editor.select([outline.id]);
  return true;
}
