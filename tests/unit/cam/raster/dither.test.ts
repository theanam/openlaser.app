import { describe, expect, it } from 'vitest';
import {
  burnLevels,
  diffusionLevels,
  grayscaleLevels,
  orderedLevels,
  thresholdLevels,
} from '$lib/cam/raster/dither';

const flat = (width: number, height: number, value: number) => new Float32Array(width * height).fill(value);
const burnFraction = (levels: Uint8Array) =>
  levels.reduce((n, v) => n + (v === 255 ? 1 : 0), 0) / levels.length;

describe('thresholdLevels', () => {
  it('burns pixels darker than the threshold', () => {
    const out = thresholdLevels(Float32Array.from([0, 127, 128, 200, 255]), 128);
    expect(Array.from(out)).toEqual([255, 255, 0, 0, 0]);
  });
});

describe('orderedLevels', () => {
  it('reproduces gray levels exactly over an 8×8 tile', () => {
    for (const [tone, expected] of [
      [255, 0],
      [0, 64],
      [128, 32],
      [192, 16],
    ]) {
      const out = orderedLevels(flat(8, 8, tone), 8, 8);
      expect(out.reduce((n, v) => n + (v ? 1 : 0), 0)).toBe(expected);
    }
  });

  it('only outputs 0 or 255', () => {
    const tone = Float32Array.from({ length: 64 }, (_, i) => i * 4);
    for (const v of orderedLevels(tone, 8, 8)) expect([0, 255]).toContain(v);
  });
});

describe('error diffusion', () => {
  for (const algorithm of ['floyd-steinberg', 'atkinson', 'jarvis', 'stucki'] as const) {
    describe(algorithm, () => {
      it('leaves white unburned and burns black fully', () => {
        expect(burnFraction(diffusionLevels(flat(16, 16, 255), 16, 16, algorithm))).toBe(0);
        expect(burnFraction(diffusionLevels(flat(16, 16, 0), 16, 16, algorithm))).toBe(1);
      });

      it('approximates mid and quarter tones', () => {
        // Atkinson drops a quarter of the error, so its density drifts more at mid-tones.
        const tolerance = algorithm === 'atkinson' ? 0.08 : 0.03;
        expect(burnFraction(diffusionLevels(flat(64, 64, 127.5), 64, 64, algorithm))).toBeCloseTo(0.5, 1);
        expect(
          Math.abs(burnFraction(diffusionLevels(flat(64, 64, 191.25), 64, 64, algorithm)) - 0.25),
        ).toBeLessThan(tolerance);
      });

      it('does not modify its input', () => {
        const tone = flat(8, 8, 100);
        diffusionLevels(tone, 8, 8, algorithm);
        expect(tone.every((v) => v === 100)).toBe(true);
      });
    });
  }

  it('scans serpentine: odd rows run right to left', () => {
    // Rows of tones 60, 60, 100. Raster order would give row 1 = [255, 255, 255]; serpentine
    // starts row 1 at the right edge, where the accumulated error leaves x=0 unburned.
    const tone = Float32Array.from([60, 60, 100, 60, 60, 100]);
    const out = diffusionLevels(tone, 3, 2, 'floyd-steinberg');
    expect(Array.from(out)).toEqual([255, 255, 0, 0, 255, 255]);
  });
});

describe('grayscaleLevels', () => {
  it('maps tone linearly to burn intensity', () => {
    expect(Array.from(grayscaleLevels(Float32Array.from([255, 0, 127.5, 254.6])))).toEqual([0, 255, 128, 0]);
  });
});

describe('burnLevels', () => {
  it('dispatches by algorithm', () => {
    const tone = Float32Array.from([10, 250]);
    expect(Array.from(burnLevels(tone, 2, 1, 'threshold', 128))).toEqual([255, 0]);
    expect(Array.from(burnLevels(tone, 2, 1, 'grayscale', 128))).toEqual([245, 5]);
    expect(Array.from(burnLevels(tone, 2, 1, 'floyd-steinberg', 128))).toEqual([255, 0]);
  });
});
