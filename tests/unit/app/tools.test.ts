import { describe, expect, it } from 'vitest';
import { cursorFor, shapeObject } from '$app/canvas/tools';

describe('canvas tools', () => {
  it('builds shapes at the drag rectangle and ignores tiny clicks', () => {
    const rect = shapeObject('rect', { minX: 10, minY: 20, maxX: 40, maxY: 30 }, 'l', 'o')!;
    expect(rect.transform).toEqual([1, 0, 0, 1, 10, 20]);
    expect(rect.name).toBe('Rectangle');
    expect(shapeObject('ellipse', { minX: 0, minY: 0, maxX: 0.2, maxY: 5 }, 'l', 'o')).toBeNull();
  });

  it('picks cursors', () => {
    expect(cursorFor({ drag: 'pan', panning: true, tool: 'select', handle: null })).toBe('grabbing');
    expect(cursorFor({ drag: null, panning: false, tool: 'rect', handle: null })).toBe('crosshair');
    expect(cursorFor({ drag: null, panning: false, tool: 'select', handle: 'ne' })).toBe('nesw-resize');
    expect(cursorFor({ drag: 'move', panning: false, tool: 'select', handle: null })).toBe('move');
  });
});
