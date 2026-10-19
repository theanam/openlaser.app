import { describe, expect, it } from 'vitest';
import { flattenPaths, pathsBounds } from '$lib/geometry/path';
import type { PathData } from '$lib/geometry/types';
import { DxfError, importDxf, joinPaths, parseDxf } from '$lib/import/dxf';
import { aciColor } from '$lib/import/dxf/reader';
import { dxf, line } from './build';

const all = (r: ReturnType<typeof importDxf>) => r.groups.flatMap((g) => g.paths);
const box = (paths: PathData[]) => pathsBounds(paths, undefined, 0.001)!;

describe('importDxf', () => {
  it('reads lines in mm and places the drawing at the origin', () => {
    const r = importDxf(dxf({ units: 4, entities: [line(10, 20, 60, 20), line(60, 20, 60, 50)] }));
    expect(r.width).toBeCloseTo(50);
    expect(r.height).toBeCloseTo(30);
    expect(box(all(r))).toMatchObject({ minX: 0, minY: 0 });
    expect(r.groups[0]).toMatchObject({ kind: 'stroke', color: '#000000' });
  });

  it('scales by the declared units, and the caller can override them', () => {
    const source = dxf({ units: 1, entities: [line(0, 0, 2, 0)] });
    expect(parseDxf(source).fileUnits).toBe('in');
    expect(importDxf(source).width).toBeCloseTo(50.8);
    expect(importDxf(source, 'mm').width).toBeCloseTo(2);
    expect(parseDxf(dxf({ entities: [line(0, 0, 1, 0)] })).fileUnits).toBeNull();
  });

  it('chains loose lines into one closed outline', () => {
    const r = importDxf(
      dxf({ entities: [line(0, 0, 10, 0), line(10, 10, 10, 0), line(10, 10, 0, 10), line(0, 0, 0, 10)] }),
    );
    expect(all(r)).toHaveLength(1);
    expect(all(r)[0]!.closed).toBe(true);
    expect(all(r)[0]!.segments).toHaveLength(4);
  });

  it('turns circles, arcs and ellipses into true curves', () => {
    const circle = importDxf(
      dxf({
        entities: [
          [
            [0, 'CIRCLE'],
            [10, 5],
            [20, 5],
            [40, 5],
          ],
        ],
      }),
    );
    const c = all(circle)[0]!;
    expect(c.closed).toBe(true);
    expect(c.segments.every((s) => s.type === 'C')).toBe(true);
    for (const p of flattenPaths([c], undefined, 0.001)[0]!.points) {
      expect(Math.hypot(p.x - 5, p.y - 5)).toBeCloseTo(5, 2);
    }
    // Quarter arc from 0° to 90°, radius 10.
    const arc = importDxf(
      dxf({
        entities: [
          [
            [0, 'ARC'],
            [10, 0],
            [20, 0],
            [40, 10],
            [50, 0],
            [51, 90],
          ],
        ],
      }),
    );
    expect(arc.width).toBeCloseTo(10);
    expect(arc.height).toBeCloseTo(10);
    const ellipse = importDxf(
      dxf({
        entities: [
          [
            [0, 'ELLIPSE'],
            [10, 0],
            [20, 0],
            [11, 20],
            [21, 0],
            [40, 0.5],
          ],
        ],
      }),
    );
    expect(ellipse.width).toBeCloseTo(40, 2);
    expect(ellipse.height).toBeCloseTo(20, 2);
  });

  it('follows polyline bulges', () => {
    // A 10 mm slot: two straight sides joined by half circles (bulge 1).
    const slot: [number, string | number][] = [
      [0, 'LWPOLYLINE'],
      [90, 4],
      [70, 1],
      [10, 0],
      [20, 0],
      [42, 0],
      [10, 20],
      [20, 0],
      [42, 1],
      [10, 20],
      [20, 10],
      [42, 0],
      [10, 0],
      [20, 10],
      [42, 1],
    ];
    const r = importDxf(dxf({ entities: [slot] }));
    expect(r.width).toBeCloseTo(30, 2);
    expect(r.height).toBeCloseTo(10, 2);
    expect(all(r)[0]!.closed).toBe(true);
  });

  it('reads old-style POLYLINE with VERTEX records', () => {
    const r = importDxf(
      dxf({
        entities: [
          [
            [0, 'POLYLINE'],
            [66, 1],
            [70, 1],
          ],
          [
            [0, 'VERTEX'],
            [10, 0],
            [20, 0],
          ],
          [
            [0, 'VERTEX'],
            [10, 8],
            [20, 0],
          ],
          [
            [0, 'VERTEX'],
            [10, 8],
            [20, 4],
          ],
          [[0, 'SEQEND']],
        ],
      }),
    );
    expect(all(r)[0]).toMatchObject({ closed: true });
    expect(r.width).toBeCloseTo(8);
    expect(r.height).toBeCloseTo(4);
  });

  it('samples splines through their control points', () => {
    const r = importDxf(
      dxf({
        entities: [
          [
            [0, 'SPLINE'],
            [70, 8],
            [71, 3],
            [72, 8],
            [73, 4],
            [40, 0],
            [40, 0],
            [40, 0],
            [40, 0],
            [40, 1],
            [40, 1],
            [40, 1],
            [40, 1],
            [10, 0],
            [20, 0],
            [10, 10],
            [20, 20],
            [10, 20],
            [20, 20],
            [10, 30],
            [20, 0],
          ],
        ],
      }),
    );
    const p = all(r)[0]!;
    expect(p.start).toEqual({ x: 0, y: 0 });
    expect(p.segments[p.segments.length - 1]!.to.x).toBeCloseTo(30);
    expect(r.height).toBeCloseTo(15, 1); // a clamped cubic peaks at 3/4 of its control height
  });

  it('expands blocks with position, rotation, scale and arrays', () => {
    const r = importDxf(
      dxf({
        blocks: [{ name: 'TAB', base: [5, 5], entities: [line(5, 5, 15, 5)] }],
        entities: [
          [
            [0, 'INSERT'],
            [2, 'TAB'],
            [10, 100],
            [20, 0],
            [50, 90],
            [41, 2],
            [42, 2],
          ],
          [
            [0, 'INSERT'],
            [2, 'TAB'],
            [10, 0],
            [20, 0],
            [70, 3],
            [44, 30],
          ],
        ],
      }),
    );
    const paths = all(r);
    expect(paths).toHaveLength(4);
    // Rotated insert: a 20 mm vertical line at x = 100.
    expect(r.width).toBeCloseTo(100);
    expect(r.height).toBeCloseTo(20);
  });

  it('mirrors planar entities drawn with a flipped extrusion', () => {
    const r = parseDxf(
      dxf({
        entities: [
          [
            [0, 'CIRCLE'],
            [10, 10],
            [20, 0],
            [40, 1],
            [230, -1],
          ],
        ],
      }),
    );
    const b = pathsBounds(r.groups[0]!.paths, undefined, 0.001)!;
    expect(b.minX).toBeCloseTo(-11);
    expect(b.maxX).toBeCloseTo(-9);
  });

  it('groups by color: entity color, then layer color, then block color', () => {
    const r = importDxf(
      dxf({
        layers: [
          { name: 'CUT', color: 1 },
          { name: 'SCORE', color: 5 },
        ],
        blocks: [{ name: 'B', entities: [line(0, 0, 1, 0, [[62, 0]])] }],
        entities: [
          line(0, 0, 1, 0, [[8, 'CUT']]),
          line(0, 5, 1, 5, [[8, 'SCORE']]),
          line(0, 9, 1, 9, [
            [8, 'CUT'],
            [62, 3],
          ]),
          line(0, 12, 1, 12, [[420, 0x123456]]),
          [
            [0, 'INSERT'],
            [8, 'CUT'],
            [2, 'B'],
            [62, 6],
            [10, 0],
            [20, 20],
          ],
        ],
      }),
    );
    expect(r.groups.map((g) => g.color)).toEqual(['#ff0000', '#0000ff', '#00ff00', '#123456', '#ff00ff']);
  });

  it('skips hidden layers, paper space and annotation, and reports them', () => {
    const r = importDxf(
      dxf({
        layers: [
          { name: 'OFF', color: -1 },
          { name: 'FROZEN', color: 2, flags: 1 },
        ],
        entities: [
          line(0, 0, 10, 0),
          line(0, 0, 10, 0, [[8, 'OFF']]),
          line(0, 0, 10, 0, [[8, 'FROZEN']]),
          line(0, 0, 99, 0, [[67, 1]]),
          [
            [0, 'TEXT'],
            [10, 0],
            [20, 0],
            [1, 'Hello'],
          ],
          [
            [0, 'MTEXT'],
            [10, 0],
            [20, 0],
            [1, 'Hi'],
          ],
          [
            [0, 'HATCH'],
            [10, 0],
            [20, 0],
          ],
          [
            [0, 'DIMENSION'],
            [10, 0],
            [20, 0],
          ],
        ],
      }),
    );
    expect(all(r)).toHaveLength(1);
    expect(r.width).toBeCloseTo(10);
    expect(r.ignored).toEqual({ hidden: 2, text: 2, hatch: 1, dimension: 1 });
  });

  it('accepts CRLF line endings and indented group codes', () => {
    const source = dxf({ entities: [line(0, 0, 3, 4)] })
      .split('\n')
      .map((l, i) => (i % 2 === 0 ? `  ${l}` : l))
      .join('\r\n');
    expect(importDxf(source).width).toBeCloseTo(3);
  });

  it('explains binary and malformed files', () => {
    expect(() => importDxf('AutoCAD Binary DXF\r\n\x1a\0')).toThrow(DxfError);
    expect(() => importDxf('<svg></svg>')).toThrow(/unreadable/);
  });
});

describe('joinPaths', () => {
  it('reverses pieces as needed and leaves separate shapes apart', () => {
    const seg = (ax: number, ay: number, bx: number, by: number): PathData => ({
      closed: false,
      start: { x: ax, y: ay },
      segments: [{ type: 'L', to: { x: bx, y: by } }],
    });
    const joined = joinPaths([seg(0, 0, 1, 0), seg(2, 0, 1, 0), seg(5, 5, 6, 6)]);
    expect(joined).toHaveLength(2);
    expect(joined[0]!.segments.map((s) => s.to)).toEqual([
      { x: 1, y: 0 },
      { x: 2, y: 0 },
    ]);
    expect(joined.every((p) => !p.closed)).toBe(true);
  });
});

describe('aciColor', () => {
  it('maps the index palette', () => {
    expect(aciColor(1)).toBe('#ff0000');
    expect(aciColor(7)).toBe('#000000');
    expect(aciColor(10)).toBe('#ff0000');
    expect(aciColor(11)).toBe('#ff8080');
    expect(aciColor(250)).toBe('#333333');
    expect(aciColor(0)).toBeNull();
    expect(aciColor(256)).toBeNull();
  });
});
