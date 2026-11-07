/** Job origin handling (SPEC §6.6). */
import type { Rect, Vec2 } from '../geometry/types';
import type { Anchor, JobSettings, MachineProfile } from '../project/types';

/**
 * The bed-space point of `bounds` named by `anchor`, as the user sees it on screen. The canvas
 * puts the machine origin in `originCorner`, so for a top-left origin the screen top is bed minY,
 * and for a right-hand origin the screen left is bed maxX.
 */
export function anchorPoint(
  bounds: Rect,
  anchor: Anchor,
  originCorner: MachineProfile['originCorner'] = 'bl',
): Vec2 {
  const yUpOnScreen = originCorner === 'bl' || originCorner === 'br';
  const xRightOnScreen = originCorner === 'bl' || originCorner === 'tl';
  const top = yUpOnScreen ? bounds.maxY : bounds.minY;
  const bottom = yUpOnScreen ? bounds.minY : bounds.maxY;
  const left = xRightOnScreen ? bounds.minX : bounds.maxX;
  const right = xRightOnScreen ? bounds.maxX : bounds.minX;
  const midX = (bounds.minX + bounds.maxX) / 2;
  const midY = (bounds.minY + bounds.maxY) / 2;
  const x = anchor.endsWith('l') ? left : anchor.endsWith('r') ? right : midX;
  const y = anchor.startsWith('t') ? top : anchor.startsWith('b') ? bottom : midY;
  return { x, y };
}

/**
 * Where the job's anchor goes. `absolute` keeps bed coordinates; the other modes need a position.
 * A missing machine position or user origin falls back to 0,0 so a G-code export still works; the
 * UI only allows starting such a job when the position is known.
 */
export function originTarget(settings: JobSettings, machinePosition: Vec2 | undefined): Vec2 | null {
  if (settings.origin === 'absolute') return null;
  const target = settings.origin === 'current-position' ? machinePosition : settings.userOrigin;
  return target ?? { x: 0, y: 0 };
}

/** Translation that moves the anchor of `bounds` onto the origin target. Zero for absolute jobs. */
export function originOffset(
  bounds: Rect | null,
  settings: JobSettings,
  profile: MachineProfile,
  machinePosition: Vec2 | undefined,
): Vec2 {
  const target = originTarget(settings, machinePosition);
  if (!target || !bounds) return { x: 0, y: 0 };
  const anchor = anchorPoint(bounds, settings.anchor, profile.originCorner);
  return { x: target.x - anchor.x, y: target.y - anchor.y };
}

/** The point a `returnToOrigin` job travels back to: the origin target, or machine 0,0 for absolute jobs. */
export function jobOrigin(settings: JobSettings, machinePosition: Vec2 | undefined): Vec2 {
  return originTarget(settings, machinePosition) ?? { x: 0, y: 0 };
}
