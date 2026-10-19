import { describe, expect, it } from 'vitest';
import { defaultLayer } from '$lib/import/layer-defaults';
import { layerSummary, withMode } from '$app/lib/layers';

describe('layer helpers', () => {
  it('summarizes a layer like the design', () => {
    expect(layerSummary(defaultLayer({ id: 'a', mode: 'fill', speed: 3000, power: 40 }))).toBe(
      'Fill · 3000 · 40% · ×1',
    );
    const photo = defaultLayer({ id: 'b', mode: 'image', speed: 2400, power: 55, minPower: 18 });
    expect(layerSummary({ ...photo, image: { ...photo.image!, algorithm: 'grayscale' } })).toBe(
      'Image · 2400 · 18–55% · ×1',
    );
  });

  it('adds defaults when switching mode', () => {
    const line = defaultLayer({ id: 'a', mode: 'line' });
    const patch = withMode(line, 'fill');
    expect(patch.mode).toBe('fill');
    expect(patch.fill?.interval).toBe(0.1);
    expect(withMode({ ...line, ...patch } as typeof line, 'line')).toEqual({ mode: 'line' });
  });
});
