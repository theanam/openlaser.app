/** Finds the topmost object under a screen point. Strokes win over fills so outlines stay clickable inside larger shapes. */
import { apply, invert } from '$lib/geometry/mat2d';
import type { Vec2 } from '$lib/geometry/types';
import type { Project, SceneObject } from '$lib/project/types';
import { screenPath } from './scene-render';
import { textPlaceholderSize } from '$lib/project/outline';
import { boundsOfPoints } from '$lib/geometry/mat2d';
import type { PathData, Rect } from '$lib/geometry/types';

/** Control-point bounds of paths in object space (beziers stay inside them). */
function pathsBox(paths: PathData[]): Rect {
  const points = paths.flatMap((p) => [
    p.start,
    ...p.segments.flatMap((s) => (s.type === 'C' ? [s.c1, s.c2, s.to] : [s.to])),
  ]);
  return boundsOfPoints(points) ?? { minX: 0, minY: 0, maxX: 0, maxY: 0 };
}
import { screenToBed, type BedFrame, type View } from './viewport';

/** Pick tolerance around strokes, px. */
const STROKE_TOLERANCE = 10;

export function hitObject(
  ctx: CanvasRenderingContext2D,
  project: Project,
  view: View,
  bed: BedFrame,
  screen: Vec2,
): SceneObject | null {
  const layers = new Map(project.layers.map((l) => [l.id, l]));
  const dpr = window.devicePixelRatio || 1;
  const candidates = project.objects
    .filter((o) => o.visible && !o.locked && layers.get(o.layerId)?.visible)
    .reverse();
  ctx.save();
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.lineWidth = STROKE_TOLERANCE;
  try {
    for (const pass of ['stroke', 'fill'] as const) {
      for (const object of candidates) {
        if (object.kind === 'text' && pass === 'fill') {
          // Text is picked by its block so the gaps between letters still select it.
          const box = object.paths.length
            ? pathsBox(object.paths)
            : {
                minX: 0,
                minY: 0,
                maxX: textPlaceholderSize(object).width,
                maxY: textPlaceholderSize(object).height,
              };
          const inv = invert(object.transform);
          const p = inv && apply(inv, screenToBed(view, bed, screen));
          if (p && p.x >= box.minX && p.y >= box.minY && p.x <= box.maxX && p.y <= box.maxY) return object;
        } else if (object.kind === 'vector' || (object.kind === 'text' && object.paths.length)) {
          const path = screenPath(object, view, bed);
          const hit =
            pass === 'stroke'
              ? ctx.isPointInStroke(path, screen.x * dpr, screen.y * dpr)
              : ctx.isPointInPath(path, screen.x * dpr, screen.y * dpr, 'evenodd');
          if (hit) return object;
        } else if (object.kind === 'image' && pass === 'fill') {
          const inv = invert(object.transform);
          const p = inv && apply(inv, screenToBed(view, bed, screen));
          if (p && p.x >= 0 && p.y >= 0 && p.x <= object.width && p.y <= object.height) return object;
        }
      }
    }
  } finally {
    ctx.restore();
  }
  return null;
}
