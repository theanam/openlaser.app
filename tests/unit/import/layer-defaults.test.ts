import { describe, expect, it } from 'vitest';
import { defaultLayer, LAYER_PALETTE, paletteName } from '$lib/import/layer-defaults';

describe('defaultLayer', () => {
  it('builds a line layer by default', () => {
    expect(defaultLayer({ id: 'a' })).toEqual({
      id: 'a',
      name: 'Cut',
      color: '#C0392B',
      visible: true,
      output: true,
      mode: 'line',
      speed: 1000,
      power: 100,
      minPower: 0,
      passes: 1,
      airAssist: false,
      line: { kerfOffset: 0 },
    });
  });

  it('uses fill defaults', () => {
    const layer = defaultLayer({ id: 'b', mode: 'fill' });
    expect(layer).toMatchObject({ speed: 3000, power: 40, color: '#4CC9F0' });
    expect(layer.fill).toEqual({
      interval: 0.1,
      angle: 0,
      bidirectional: true,
      overscan: 2.5,
      crossHatch: false,
    });
    expect(layer.line).toBeUndefined();
  });

  it('uses image defaults', () => {
    const layer = defaultLayer({ id: 'c', mode: 'image', power: 70 });
    expect(layer).toMatchObject({ speed: 2400, power: 70, minPower: 0, color: '#B794F6' });
    expect(layer.image).toEqual({
      dpi: 254,
      algorithm: 'floyd-steinberg',
      threshold: 128,
      brightness: 0,
      contrast: 0,
      gamma: 1,
      invert: false,
      bidirectional: true,
      overscan: 2.5,
      scanAngle: 0,
      passThrough: false,
    });
  });

  it('returns fresh settings objects', () => {
    const a = defaultLayer({ id: 'a', mode: 'fill' });
    const b = defaultLayer({ id: 'b', mode: 'fill' });
    expect(a.fill).not.toBe(b.fill);
  });
});

describe('palette', () => {
  it('follows the design order', () => {
    expect(LAYER_PALETTE.map((p) => p.color)).toEqual([
      '#C0392B',
      '#4CC9F0',
      '#B794F6',
      '#F2B33D',
      '#3DD68C',
      '#F59A95',
      '#7FB2FF',
      '#E7E9EB',
    ]);
    expect(paletteName('#c0392b')).toBe('Signal');
    expect(paletteName('#123456')).toBeNull();
  });
});
