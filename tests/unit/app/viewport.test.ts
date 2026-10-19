import { describe, expect, it } from 'vitest';
import { bedToScreen, fitBed, niceStep, screenToBed, zoomAt, type BedFrame } from '$app/canvas/viewport';

const bed = (originCorner: BedFrame['originCorner']): BedFrame => ({ width: 400, height: 300, originCorner });
const view = { zoom: 2, offsetX: 10, offsetY: 20 };

describe('viewport', () => {
  it('maps a bottom-left origin with Y up', () => {
    expect(bedToScreen(view, bed('bl'), { x: 0, y: 0 })).toEqual({ x: 10, y: 620 });
    expect(bedToScreen(view, bed('bl'), { x: 400, y: 300 })).toEqual({ x: 810, y: 20 });
  });

  it('maps a top-left origin with Y down', () => {
    expect(bedToScreen(view, bed('tl'), { x: 0, y: 0 })).toEqual({ x: 10, y: 20 });
  });

  it('maps right-hand origins mirrored in X', () => {
    expect(bedToScreen(view, bed('br'), { x: 0, y: 0 })).toEqual({ x: 810, y: 620 });
    expect(bedToScreen(view, bed('tr'), { x: 0, y: 0 })).toEqual({ x: 810, y: 20 });
  });

  it('round-trips screen and bed coordinates', () => {
    for (const corner of ['bl', 'tl', 'tr', 'br'] as const) {
      const p = screenToBed(view, bed(corner), bedToScreen(view, bed(corner), { x: 123.4, y: 56.7 }));
      expect(p.x).toBeCloseTo(123.4);
      expect(p.y).toBeCloseTo(56.7);
    }
  });

  it('fits the bed centered in the viewport', () => {
    const v = fitBed({ width: 1000, height: 800 }, bed('bl'), 50);
    const center = bedToScreen(v, bed('bl'), { x: 200, y: 150 });
    expect(center.x).toBeCloseTo(500);
    expect(center.y).toBeCloseTo(400);
    expect(v.zoom).toBeCloseTo(Math.min(900 / 400, 700 / 300));
  });

  it('zooms around an anchor', () => {
    const anchor = { x: 300, y: 200 };
    const before = screenToBed(view, bed('bl'), anchor);
    const after = screenToBed(zoomAt(view, 1.5, anchor), bed('bl'), anchor);
    expect(after.x).toBeCloseTo(before.x);
    expect(after.y).toBeCloseTo(before.y);
  });

  it('picks readable ruler steps', () => {
    expect(niceStep(1)).toBe(100);
    expect(niceStep(10)).toBe(10);
  });
});
