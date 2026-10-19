/** Geometry of the current selection, in bed space. */
import { objectBounds } from '$lib/cam';
import { textPlaceholderSize } from '$lib/project/outline';
import {
  decompose,
  multiply,
  rotationAbout,
  scalingAbout,
  transformRect,
  translation,
  unionRect,
} from '$lib/geometry/mat2d';
import type { Mat2D, Rect, Vec2 } from '$lib/geometry/types';
import type { Anchor, Id, Project, SceneObject } from '$lib/project/types';

export function selectedObjects(project: Project, ids: ReadonlySet<Id>): SceneObject[] {
  return project.objects.filter((o) => ids.has(o.id));
}

export function boundsOf(objects: SceneObject[]): Rect | null {
  let bounds: Rect | null = null;
  for (const object of objects) {
    // Text still waiting for its font has no outlines; use its estimated block meanwhile.
    const b =
      object.kind === 'text' && object.paths.length === 0
        ? transformRect(object.transform, {
            minX: 0,
            minY: 0,
            maxX: textPlaceholderSize(object).width,
            maxY: textPlaceholderSize(object).height,
          })
        : objectBounds(object);
    bounds = unionRect(bounds, b);
  }
  return bounds;
}

/** Anchor point of a rect in bed space (Y up: 'b' is minY). */
export function anchorOf(r: Rect, anchor: Anchor): Vec2 {
  const x = anchor.endsWith('l') ? r.minX : anchor.endsWith('r') ? r.maxX : (r.minX + r.maxX) / 2;
  const y = anchor.startsWith('t') ? r.maxY : anchor.startsWith('b') ? r.minY : (r.minY + r.maxY) / 2;
  return { x, y };
}

/** Moves the selection so its anchor lands on `to`. */
export function moveAnchorTo(r: Rect, anchor: Anchor, to: Partial<Vec2>): Mat2D {
  const p = anchorOf(r, anchor);
  return translation((to.x ?? p.x) - p.x, (to.y ?? p.y) - p.y);
}

/** Scales the selection about its anchor to the requested size. */
export function resizeAbout(
  r: Rect,
  anchor: Anchor,
  size: { width?: number; height?: number },
  keepAspect: boolean,
): Mat2D {
  const w = r.maxX - r.minX;
  const h = r.maxY - r.minY;
  let sx = size.width !== undefined && w > 0 ? size.width / w : 1;
  let sy = size.height !== undefined && h > 0 ? size.height / h : 1;
  if (keepAspect) {
    if (size.width !== undefined) sy = sx;
    else sx = sy;
  }
  const p = anchorOf(r, anchor);
  return scalingAbout(sx, sy, p.x, p.y);
}

export function rotateAbout(r: Rect, anchor: Anchor, degrees: number): Mat2D {
  const p = anchorOf(r, anchor);
  return rotationAbout(degrees, p.x, p.y);
}

/** Rotation shown in the selection bar: the object's own rotation for a single object. */
export function displayRotation(objects: SceneObject[]): number {
  if (objects.length !== 1) return 0;
  const r = decompose(objects[0].transform).rotation;
  const normalized = ((r % 360) + 360) % 360;
  return Math.round(normalized * 1000) / 1000;
}

export { multiply };
