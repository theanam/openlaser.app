/* Curvesmith's node-based path representation, kept private to the shapes module so the generators port
   unchanged. Coordinates here are Y-down inside the box (0,0)–(w,h); convert.ts maps them to PathData. */

export type Vec = [number, number];

/** An anchor with optional absolute bezier handles on either side. */
export type PathNode = { x: number; y: number; in: Vec | null; out: Vec | null };

export type Subpath = { closed: boolean; nodes: PathNode[] };

/** Parameter values: percents as fractions (50% → 0.5), counts and angles as-is. */
export type ShapeParams = Record<string, number | boolean>;
