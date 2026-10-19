/** Pure pieces of the canvas tools, kept out of the component so they can be tested. */
import { translation } from '$lib/geometry/mat2d';
import type { Rect } from '$lib/geometry/types';
import { ellipsePath, rectanglePath } from '$lib/project/shapes';
import { defaultParams, isShapeKind, shapeDef, shapePaths } from '$lib/shapes';
import type { Id, Project, VectorObject } from '$lib/project/types';
import type { Tool } from '../state/editor.svelte';
import { boundsOf } from '../lib/selection';
import { rectsIntersect, type HandleId } from './handles';
import { bedRectToScreen, type BedFrame, type View } from './viewport';

/** Shapes smaller than this (mm) are treated as accidental clicks. */
export const MIN_SHAPE_MM = 0.5;

/** What a drag with a drawing tool makes: a rectangle, an ellipse, or a shape from the library. */
export type DrawnShape = 'rect' | 'ellipse' | { library: string };

export function shapeObject(shape: DrawnShape, r: Rect, layerId: Id, id: Id): VectorObject | null {
  const w = r.maxX - r.minX;
  const h = r.maxY - r.minY;
  if (w < MIN_SHAPE_MM || h < MIN_SHAPE_MM) return null;
  const base = {
    id,
    kind: 'vector' as const,
    layerId,
    locked: false,
    visible: true,
    transform: translation(r.minX, r.minY),
  };
  if (shape === 'rect') return { ...base, name: 'Rectangle', paths: [rectanglePath(w, h)] };
  if (shape === 'ellipse') return { ...base, name: 'Ellipse', paths: [ellipsePath(w, h)] };
  if (!isShapeKind(shape.library)) return null;
  const params = defaultParams(shape.library);
  return {
    ...base,
    name: shapeDef(shape.library).label,
    paths: shapePaths(shape.library, w, h, params),
    shape: { kind: shape.library, params, width: w, height: h },
  };
}

/** Objects whose bounds touch a screen-space marquee. */
export function marqueeHits(project: Project, view: View, bed: BedFrame, box: Rect): Id[] {
  return project.objects
    .filter((o) => o.visible && !o.locked)
    .filter((o) => {
      const b = boundsOf([o]);
      return b ? rectsIntersect(bedRectToScreen(view, bed, b), box) : false;
    })
    .map((o) => o.id);
}

const HANDLE_CURSORS: Record<HandleId, string> = {
  rotate: 'alias',
  n: 'ns-resize',
  s: 'ns-resize',
  e: 'ew-resize',
  w: 'ew-resize',
  nw: 'nwse-resize',
  se: 'nwse-resize',
  ne: 'nesw-resize',
  sw: 'nesw-resize',
};

export function cursorFor(state: {
  drag: string | null;
  panning: boolean;
  tool: Tool;
  handle: HandleId | null;
}): string {
  if (state.drag === 'pan') return 'grabbing';
  if (state.panning) return 'grab';
  if (state.tool === 'text') return 'text';
  if (state.tool === 'rect' || state.tool === 'ellipse' || state.tool === 'shape' || state.tool === 'measure')
    return 'crosshair';
  if (state.handle) return HANDLE_CURSORS[state.handle];
  return state.drag === 'move' ? 'move' : 'default';
}
