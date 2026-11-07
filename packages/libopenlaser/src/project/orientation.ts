/**
 * The design keeps reading the right way up when the machine's home corner changes. Coordinates
 * are machine coordinates and the screen mirrors them for machines homed at the top or right, so
 * switching from a bottom-left GRBL laser to a top-left LaserPecker would otherwise show the art
 * upside down. The project remembers the corner it was laid out for; on a change, the whole design
 * is mirrored about its own centre. It stays at the same machine position (art by the home corner
 * stays by the home corner), keeps its layout as seen on screen, and switching back restores it
 * exactly, whatever the bed sizes.
 */
import { multiply, transformRect, unionRect } from '../geometry/mat2d';
import { pathsBounds } from '../geometry/path';
import type { Mat2D, Rect } from '../geometry/types';
import { textPlaceholderSize } from './outline';
import type { MachineProfile, Project, SceneObject } from './types';

type Corner = MachineProfile['originCorner'];

/** Machine-space box of an object: its outlines, its image, or text's size estimate while loading. */
export function objectBox(o: SceneObject): Rect | null {
  if (o.kind === 'image')
    return transformRect(o.transform, { minX: 0, minY: 0, maxX: o.width, maxY: o.height });
  if (o.paths.length) return pathsBounds(o.paths, o.transform, 0.05);
  if (o.kind !== 'text') return null;
  const { width, height } = textPlaceholderSize(o);
  return transformRect(o.transform, { minX: 0, minY: 0, maxX: width, maxY: height });
}

const right = (c: Corner) => c === 'tr' || c === 'br';
const top = (c: Corner) => c === 'tl' || c === 'tr';

/** Re-lays the project out for `to` from the corner it was laid out for (`from`, else its own). */
export function reorient(
  project: Project,
  to: Corner,
  from: Corner | undefined = project.designCorner,
): Project {
  if (!from || from === to) return project.designCorner === to ? project : { ...project, designCorner: to };
  const fx = right(from) !== right(to);
  const fy = top(from) !== top(to);
  let bounds: Rect | null = null;
  for (const o of project.objects) bounds = unionRect(bounds, objectBox(o));
  if (!bounds) return { ...project, designCorner: to };
  const cx = (bounds.minX + bounds.maxX) / 2;
  const cy = (bounds.minY + bounds.maxY) / 2;
  const m: Mat2D = [fx ? -1 : 1, 0, 0, fy ? -1 : 1, fx ? 2 * cx : 0, fy ? 2 * cy : 0];
  return {
    ...project,
    designCorner: to,
    // `+ 0` turns −0 into 0, so a round trip gives back the exact transforms.
    objects: project.objects.map((o) => ({
      ...o,
      transform: multiply(m, o.transform).map((v) => v + 0) as Mat2D,
    })),
  };
}
