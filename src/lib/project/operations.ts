/**
 * Pure project mutations. Each returns a new Project and leaves the input untouched, which is what
 * makes undo snapshots safe to share.
 */
import { multiply, translation } from '../geometry/mat2d';
import type { MakeId } from './ids';
import type {
  Asset,
  Id,
  ImageObject,
  Layer,
  Mat2D,
  Project,
  SceneObject,
  TextObject,
  VectorObject,
} from './types';

export function renameProject(project: Project, name: string): Project {
  return { ...project, name };
}

export function addLayer(project: Project, layer: Layer, index = project.layers.length): Project {
  const layers = [...project.layers];
  layers.splice(index, 0, layer);
  return { ...project, layers };
}

export function updateLayer(project: Project, id: Id, patch: Partial<Omit<Layer, 'id'>>): Project {
  return { ...project, layers: project.layers.map((l) => (l.id === id ? { ...l, ...patch } : l)) };
}

/** Removes a layer and every object on it. */
export function removeLayer(project: Project, id: Id): Project {
  return removeUnusedAssets({
    ...project,
    layers: project.layers.filter((l) => l.id !== id),
    objects: project.objects.filter((o) => o.layerId !== id),
  });
}

export function moveLayer(project: Project, from: number, to: number): Project {
  if (from === to || from < 0 || from >= project.layers.length) return project;
  const layers = [...project.layers];
  const [layer] = layers.splice(from, 1);
  layers.splice(Math.max(0, Math.min(to, layers.length)), 0, layer);
  return { ...project, layers };
}

export function addObjects(project: Project, objects: SceneObject[], assets: Asset[] = []): Project {
  const nextAssets = { ...project.assets };
  for (const asset of assets) nextAssets[asset.id] = asset;
  return { ...project, objects: [...project.objects, ...objects], assets: nextAssets };
}

export function removeObjects(project: Project, ids: ReadonlySet<Id>): Project {
  return removeUnusedAssets({ ...project, objects: project.objects.filter((o) => !ids.has(o.id)) });
}

/** Fields any object kind may carry; callers pass the ones that fit the object they update. */
export type ObjectPatch =
  | Partial<Omit<VectorObject, 'id' | 'kind'>>
  | Partial<Omit<TextObject, 'id' | 'kind'>>
  | Partial<Omit<ImageObject, 'id' | 'kind'>>;

export function updateObject(project: Project, id: Id, patch: ObjectPatch): Project {
  return {
    ...project,
    objects: project.objects.map((o) => (o.id === id ? ({ ...o, ...patch } as SceneObject) : o)),
  };
}

/** Pre-multiplies `matrix` onto each object's transform: the change happens in bed space. */
export function transformObjects(project: Project, ids: ReadonlySet<Id>, matrix: Mat2D): Project {
  return {
    ...project,
    objects: project.objects.map((o) =>
      ids.has(o.id) && !o.locked ? { ...o, transform: multiply(matrix, o.transform) } : o,
    ),
  };
}

export function setObjectTransforms(project: Project, transforms: ReadonlyMap<Id, Mat2D>): Project {
  return {
    ...project,
    objects: project.objects.map((o) => {
      const t = transforms.get(o.id);
      return t ? { ...o, transform: t } : o;
    }),
  };
}

export function setObjectsLayer(project: Project, ids: ReadonlySet<Id>, layerId: Id): Project {
  return { ...project, objects: project.objects.map((o) => (ids.has(o.id) ? { ...o, layerId } : o)) };
}

export function duplicateObjects(
  project: Project,
  ids: ReadonlySet<Id>,
  makeId: MakeId,
  offset = { x: 5, y: -5 },
): { project: Project; ids: Id[] } {
  const copies = project.objects
    .filter((o) => ids.has(o.id))
    .map((o) => ({
      ...o,
      id: makeId(),
      name: `${o.name} copy`,
      transform: multiply(translation(offset.x, offset.y), o.transform),
    }));
  return { project: { ...project, objects: [...project.objects, ...copies] }, ids: copies.map((c) => c.id) };
}

/** Moves objects to the end (front) or start (back) of the z-order. */
export function reorderObjects(project: Project, ids: ReadonlySet<Id>, where: 'front' | 'back'): Project {
  const picked = project.objects.filter((o) => ids.has(o.id));
  const rest = project.objects.filter((o) => !ids.has(o.id));
  return { ...project, objects: where === 'front' ? [...rest, ...picked] : [...picked, ...rest] };
}

export function removeUnusedAssets(project: Project): Project {
  const used = new Set(project.objects.flatMap((o) => (o.kind === 'image' ? [o.assetId] : [])));
  const ids = Object.keys(project.assets);
  if (ids.every((id) => used.has(id))) return project;
  const assets: Record<Id, Asset> = {};
  for (const id of ids) if (used.has(id)) assets[id] = project.assets[id];
  return { ...project, assets };
}

export function setJobSettings(project: Project, patch: Partial<Project['jobSettings']>): Project {
  return { ...project, jobSettings: { ...project.jobSettings, ...patch } };
}

/** Layers exist only while they hold objects; this drops the rest. */
export function dropEmptyLayers(project: Project): Project {
  const used = new Set(project.objects.map((o) => o.layerId));
  if (project.layers.every((l) => used.has(l.id))) return project;
  return { ...project, layers: project.layers.filter((l) => used.has(l.id)) };
}

/** Creates `layer` and moves the given objects onto it, in one step. */
export function moveObjectsToNewLayer(project: Project, ids: ReadonlySet<Id>, layer: Layer): Project {
  return setObjectsLayer(addLayer(project, layer), ids, layer.id);
}
