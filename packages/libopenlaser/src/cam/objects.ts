/** Which objects take part in a job, and their bed-space bounds. */
import { DEFAULT_TOLERANCE } from '../geometry/bezier';
import { transformRect, unionRect } from '../geometry/mat2d';
import { pathsBounds } from '../geometry/path';
import type { Rect } from '../geometry/types';
import type { Layer, Project, SceneObject } from '../project/types';

/**
 * Objects of a layer that go into the job: matching layerId and `visible`. Layer `visible` is a
 * display toggle only; `output` alone decides whether a layer is part of the job.
 */
export function layerJobObjects(project: Project, layer: Layer): SceneObject[] {
  return project.objects.filter((o) => o.layerId === layer.id && o.visible);
}

export function outputLayers(project: Project): Layer[] {
  return project.layers.filter((l) => l.output);
}

/**
 * Bed-space bounds of an object. Vector bounds follow the flattened outline (accurate to the
 * tolerance), images use their transformed width × height rectangle, text follows its cached outlines.
 */
export function objectBounds(object: SceneObject, tolerance = DEFAULT_TOLERANCE): Rect | null {
  switch (object.kind) {
    case 'vector':
    case 'text':
      return object.paths.length ? pathsBounds(object.paths, object.transform, tolerance) : null;
    case 'image':
      return transformRect(object.transform, { minX: 0, minY: 0, maxX: object.width, maxY: object.height });
  }
}

/** Bounds of every object that would be part of the job (design space, before origin handling). */
export function jobBounds(project: Project, tolerance = DEFAULT_TOLERANCE): Rect | null {
  let bounds: Rect | null = null;
  for (const layer of outputLayers(project)) {
    for (const object of layerJobObjects(project, layer))
      bounds = unionRect(bounds, objectBounds(object, tolerance));
  }
  return bounds;
}
