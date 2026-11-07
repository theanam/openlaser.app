/** Path builders for the shape tools. Shapes are built in object space with the origin at the bottom-left. */
import type { PathData, Vec2 } from './types';

/** Cubic bezier circle constant: control distance for a quarter arc. */
const KAPPA = 0.5522847498307936;

export function rectanglePath(width: number, height: number, radius = 0): PathData {
  const r = Math.max(0, Math.min(radius, width / 2, height / 2));
  if (r === 0) {
    return {
      closed: true,
      start: { x: 0, y: 0 },
      segments: [
        { type: 'L', to: { x: width, y: 0 } },
        { type: 'L', to: { x: width, y: height } },
        { type: 'L', to: { x: 0, y: height } },
        { type: 'L', to: { x: 0, y: 0 } },
      ],
    };
  }
  const k = r * (1 - KAPPA);
  const corner = (c1: Vec2, c2: Vec2, to: Vec2) => ({ type: 'C' as const, c1, c2, to });
  return {
    closed: true,
    start: { x: r, y: 0 },
    segments: [
      { type: 'L', to: { x: width - r, y: 0 } },
      corner({ x: width - k, y: 0 }, { x: width, y: k }, { x: width, y: r }),
      { type: 'L', to: { x: width, y: height - r } },
      corner({ x: width, y: height - k }, { x: width - k, y: height }, { x: width - r, y: height }),
      { type: 'L', to: { x: r, y: height } },
      corner({ x: k, y: height }, { x: 0, y: height - k }, { x: 0, y: height - r }),
      { type: 'L', to: { x: 0, y: r } },
      corner({ x: 0, y: k }, { x: k, y: 0 }, { x: r, y: 0 }),
    ],
  };
}

export function ellipsePath(width: number, height: number): PathData {
  const rx = width / 2;
  const ry = height / 2;
  const kx = rx * KAPPA;
  const ky = ry * KAPPA;
  return {
    closed: true,
    start: { x: width, y: ry },
    segments: [
      { type: 'C', c1: { x: width, y: ry + ky }, c2: { x: rx + kx, y: height }, to: { x: rx, y: height } },
      { type: 'C', c1: { x: rx - kx, y: height }, c2: { x: 0, y: ry + ky }, to: { x: 0, y: ry } },
      { type: 'C', c1: { x: 0, y: ry - ky }, c2: { x: rx - kx, y: 0 }, to: { x: rx, y: 0 } },
      { type: 'C', c1: { x: rx + kx, y: 0 }, c2: { x: width, y: ry - ky }, to: { x: width, y: ry } },
    ],
  };
}
