import { describe, expect, it } from 'vitest';
import { pathToD, previewSvg } from '$app/lib/vector-preview';

describe('vector preview', () => {
  it('writes path data and flips Y into SVG space', () => {
    const d = pathToD({
      closed: true,
      start: { x: 0, y: 0 },
      segments: [
        { type: 'L', to: { x: 10, y: 0 } },
        { type: 'C', c1: { x: 10, y: 5 }, c2: { x: 5, y: 10 }, to: { x: 0, y: 10 } },
      ],
    });
    expect(d).toBe('M0 0L10 0C10 5 5 10 0 10Z');
    const svg = previewSvg({
      width: 10,
      height: 10,
      groups: [{ color: '#ff0000', kind: 'stroke', paths: [] }],
      images: [],
      ignored: {},
      warnings: [],
    });
    expect(svg).toContain('matrix(1 0 0 -1 0 10)');
    expect(svg).toContain('stroke="#ff0000"');
  });
});
