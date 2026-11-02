import { describe, expect, it } from 'vitest';
import { laserPeckerEncoder } from '$lib/cam/laserpecker';
import { depthFromSpeed, speedFromDepth } from '$lib/project/depth';
import { speedFromUnit, speedLabel, speedToUnit } from '$app/lib/units';
import { compileInput, layer, profile, project, rectPath, vectorObject } from '../fixtures';

const lp = profile({
  controller: 'laserpecker',
  originCorner: 'tl',
  bedWidth: 100,
  bedHeight: 100,
  speedUnit: 'depth',
});
const fill = (id: string, over = {}) =>
  layer({
    id,
    mode: 'fill',
    fill: { interval: 0.5, angle: 30, bidirectional: false, overscan: 3, crossHatch: true },
    ...over,
  });
const encode = (
  layers: ReturnType<typeof fill>[],
  objects = layers.map((l, i) => vectorObject(`o${i}`, l.id, [rectPath(10 + i * 20, 10, 10, 5)])),
) =>
  laserPeckerEncoder.encode(compileInput(project(layers, objects), { profile: lp }), {
    dpi: 254,
    px: 4,
    packed: false,
  }).payload!;

describe('LaserPecker depth', () => {
  it('maps depth 1–100 onto 24000–240 mm/min, deeper slower', () => {
    expect(speedFromDepth(1)).toBe(24000);
    expect(speedFromDepth(100)).toBe(240);
    expect(depthFromSpeed(2400)).toBe(10);
    expect(depthFromSpeed(100_000)).toBe(1);
    expect(depthFromSpeed(1)).toBe(100);
    expect(speedToUnit(2400, 'depth')).toBe(10);
    expect(speedFromUnit(10, 'depth')).toBe(2400);
    expect(speedLabel(2400, 'depth')).toBe('depth 10');
  });
});

describe('LaserPecker jobs with several burn settings', () => {
  it('burns layers that share a setting as one file', () => {
    const p = encode([
      fill('a', { power: 60, speed: 2400, passes: 2 }),
      fill('b', { power: 60, speed: 2400, passes: 2 }),
    ]);
    expect(p.parts.map(({ power, depth, passes }) => ({ power, depth, passes }))).toEqual([
      { power: 60, depth: 10, passes: 2 },
    ]);
  });

  it('splits layers with different power, depth or passes into files, in layer order', () => {
    const p = encode([
      fill('a', { power: 60, speed: 2400 }),
      fill('b', { power: 30, speed: 2400 }),
      fill('c', { power: 60, speed: 1200 }),
      fill('d', { power: 60, speed: 2400, passes: 3 }),
    ]);
    expect(p.parts.map(({ power, depth, passes }) => [power, depth, passes])).toEqual([
      [60, 10, 1],
      [30, 10, 1],
      [60, 20, 1],
      [60, 10, 3],
    ]);
    expect(new Set(p.parts.map((part) => part.file.id)).size).toBe(4);
    expect(p.layers).toBe(4);
  });

  it('fills solid at the device resolution, whatever the layer’s scan settings', () => {
    const p = encode([fill('a')]);
    const { data } = p.parts[0].file;
    const width = new DataView(data.buffer, data.byteOffset).getUint16(1);
    // 10 × 5 mm at 254 dpi: every pixel burns (0x00), with no stripes from the 0.5 mm interval.
    expect(width).toBe(100);
    expect(data.subarray(64).every((b) => b === 0x00)).toBe(true);
  });
});
