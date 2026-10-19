import { describe, expect, it } from 'vitest';
import { defaultLayer } from '$lib/import/layer-defaults';
import { createProject } from '$lib/project/factory';
import { rectanglePath } from '$lib/project/shapes';
import { designPrintSvg } from '$app/lib/print-svg';

const profile = { bedWidth: 400, bedHeight: 400, originCorner: 'bl' as const };

describe('print template SVG', () => {
  it('returns null for an empty design', () => {
    expect(designPrintSvg(createProject(), profile, () => '')).toBeNull();
  });

  it('draws true vector paths in millimetres at 1:1', () => {
    const project = createProject({ name: 'Coaster' });
    project.layers.push(defaultLayer({ id: 'l', mode: 'line' }));
    project.objects.push({
      id: 'o',
      kind: 'vector',
      layerId: 'l',
      name: 'r',
      locked: false,
      visible: true,
      transform: [1, 0, 0, 1, 100, 100],
      paths: [rectanglePath(30, 20, 3)],
    });
    const out = designPrintSvg(project, profile, () => '')!;
    expect(out.width).toBeCloseTo(30 + 16);
    expect(out.svg).toContain('width="46mm"');
    // Rounded corners stay as cubic curves for the printer.
    expect(out.svg).toMatch(/<path d="M[^"]*C/);
    expect(out.svg).toContain('Coaster · 30.0 × 20.0 mm · 1:1');
  });

  it('skips hidden layers', () => {
    const project = createProject();
    project.layers.push({ ...defaultLayer({ id: 'l', mode: 'line' }), visible: false });
    project.objects.push({
      id: 'o',
      kind: 'vector',
      layerId: 'l',
      name: 'r',
      locked: false,
      visible: true,
      transform: [1, 0, 0, 1, 0, 0],
      paths: [rectanglePath(10, 10)],
    });
    expect(designPrintSvg(project, profile, () => '')).toBeNull();
  });
});
