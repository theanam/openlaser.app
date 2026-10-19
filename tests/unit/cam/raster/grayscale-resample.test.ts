import { describe, expect, it } from 'vitest';
import { toGrayscale } from '$lib/cam/raster/grayscale';
import { resampleGray } from '$lib/cam/raster/resample';
import { graySource, makeSource } from './helpers';

describe('toGrayscale', () => {
  it('uses Rec. 709 luminance weights', () => {
    const img = toGrayscale(
      makeSource(3, 1, (x) => (x === 0 ? [255, 0, 0, 255] : x === 1 ? [0, 255, 0, 255] : [0, 0, 255, 255])),
    );
    expect(img.luma[0]).toBeCloseTo(0.2126 * 255, 3);
    expect(img.luma[1]).toBeCloseTo(0.7152 * 255, 3);
    expect(img.luma[2]).toBeCloseTo(0.0722 * 255, 3);
    expect(img.alpha).toBeNull();
  });

  it('keeps coverage and premultiplies luminance for transparent images', () => {
    const img = toGrayscale(makeSource(2, 1, (x) => (x === 0 ? [200, 200, 200, 0] : [100, 100, 100, 255])));
    expect(img.alpha).not.toBeNull();
    expect(img.alpha?.[0]).toBe(0);
    expect(img.luma[0]).toBe(0);
    expect(img.luma[1]).toBeCloseTo(100, 3);
  });
});

describe('resampleGray', () => {
  it('returns the same image when the size matches', () => {
    const img = toGrayscale(graySource(4, 4, () => 10));
    expect(resampleGray(img, 4, 4)).toBe(img);
  });

  it('area-averages when downsampling', () => {
    const img = toGrayscale(graySource(4, 2, (x) => (x % 2 === 0 ? 0 : 200)));
    const out = resampleGray(img, 2, 1);
    expect(Array.from(out.luma).map((v) => Math.round(v))).toEqual([100, 100]);
  });

  it('averages fractional coverage for non-integer ratios', () => {
    const img = toGrayscale(graySource(3, 1, (x) => [0, 90, 180][x]));
    const out = resampleGray(img, 2, 1);
    // Output pixel 0 covers source 0 fully and half of source 1.
    expect(out.luma[0]).toBeCloseTo((0 + 0.5 * 90) / 1.5, 3);
    expect(out.luma[1]).toBeCloseTo((0.5 * 90 + 180) / 1.5, 3);
  });

  it('interpolates bilinearly when upsampling and preserves flat areas', () => {
    const flat = resampleGray(toGrayscale(graySource(2, 2, () => 77)), 5, 7);
    expect(flat.width).toBe(5);
    expect(flat.height).toBe(7);
    for (const v of flat.luma) expect(v).toBeCloseTo(77, 3);
    const ramp = resampleGray(toGrayscale(graySource(2, 1, (x) => x * 100)), 4, 1);
    expect(Array.from(ramp.luma).map((v) => Math.round(v))).toEqual([0, 25, 75, 100]);
  });

  it('resamples the alpha channel alongside luminance', () => {
    const img = toGrayscale(makeSource(2, 1, (x) => (x === 0 ? [0, 0, 0, 255] : [0, 0, 0, 0])));
    const out = resampleGray(img, 1, 1);
    expect(out.alpha?.[0]).toBeCloseTo(0.5, 5);
  });
});
