/**
 * Keeping the design on the bed. Switching to a machine with a smaller work area scales down and
 * moves what fitted on the old one so it fits the new one, as one group, keeping its layout.
 * Anything already off the old bed is left where it is; `outsideBed` finds it for a warning.
 */
import { multiply, unionRect } from '../geometry/mat2d';
import type { Mat2D, Rect } from '../geometry/types';
import { objectBox } from './orientation';
import type { Project, SceneObject } from './types';

export interface Area {
  /** mm */
  width: number;
  height: number;
}

/** Slack for rounding: art drawn up to the bed's edge counts as on it. */
const EDGE_MM = 0.05;

const within = (box: Rect, area: Area, slack = EDGE_MM) =>
  box.minX >= -slack &&
  box.minY >= -slack &&
  box.maxX <= area.width + slack &&
  box.maxY <= area.height + slack;

/** Objects reaching past the bed's edges. */
export function outsideBed(objects: readonly SceneObject[], area: Area): SceneObject[] {
  return objects.filter((o) => {
    const box = objectBox(o);
    return box !== null && !within(box, area);
  });
}

/** The project with what fitted on `from` fitted on `to`, or null when nothing has to change. */
export function fitToBed(project: Project, from: Area, to: Area): Project | null {
  return fitGroup(project, (box) => within(box, from), to);
}

/** Scales down and moves the given objects, as one group, onto the bed. */
export function bringOnBed(project: Project, ids: ReadonlySet<string>, to: Area): Project | null {
  return fitGroup(project, (_box, o) => ids.has(o.id), to);
}

function fitGroup(project: Project, pick: (box: Rect, o: SceneObject) => boolean, to: Area): Project | null {
  const inside = new Set<string>();
  let group: Rect | null = null;
  for (const o of project.objects) {
    const box = objectBox(o);
    if (!box || !pick(box, o)) continue;
    inside.add(o.id);
    group = unionRect(group, box);
  }
  if (!group || within(group, to)) return null;
  const w = group.maxX - group.minX;
  const h = group.maxY - group.minY;
  const s = Math.min(1, to.width / w, to.height / h);
  // Moves as little as it can: clamped into the bed after scaling about the group's corner.
  const x = Math.min(Math.max(group.minX, 0), to.width - w * s);
  const y = Math.min(Math.max(group.minY, 0), to.height - h * s);
  const m: Mat2D = [s, 0, 0, s, x - s * group.minX, y - s * group.minY];
  return {
    ...project,
    objects: project.objects.map((o) =>
      inside.has(o.id) ? { ...o, transform: multiply(m, o.transform) } : o,
    ),
  };
}
