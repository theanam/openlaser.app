export type Vec2 = { x: number; y: number };
export type Vec3 = { x: number; y: number; z: number };

/** Affine 2D transform [a b c d e f]: x' = a·x + c·y + e, y' = b·x + d·y + f. */
export type Mat2D = [number, number, number, number, number, number];

export interface Rect {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export type Segment = { type: 'L'; to: Vec2 } | { type: 'C'; c1: Vec2; c2: Vec2; to: Vec2 };

export interface PathData {
  closed: boolean;
  /** First segment starts at `start`. */
  segments: Segment[];
  start: Vec2;
}

/** A flattened path: x/y pairs in mm. */
export interface Polyline {
  points: Vec2[];
  closed: boolean;
}
