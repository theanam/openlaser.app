import { describe, expect, it } from 'vitest';
import { toGrayscale } from '$lib/cam/raster/grayscale';
import { toneMap } from '$lib/cam/raster/tone';
import { graySource, makeSource } from './helpers';

const NEUTRAL = { brightness: 0, contrast: 0, gamma: 1, invert: false };
const tone = (gray: number, settings = NEUTRAL) =>
  toneMap(toGrayscale(graySource(1, 1, () => gray)), settings)[0];

describe('toneMap', () => {
  it('passes values through with neutral settings', () => {
    expect(tone(100)).toBeCloseTo(100, 3);
  });

  it('brightness shifts and clamps', () => {
    expect(tone(100, { ...NEUTRAL, brightness: 10 })).toBeCloseTo(125.5, 3);
    expect(tone(250, { ...NEUTRAL, brightness: 100 })).toBe(255);
    expect(tone(10, { ...NEUTRAL, brightness: -100 })).toBe(0);
  });

  it('contrast stretches around mid-gray', () => {
    expect(tone(128, { ...NEUTRAL, contrast: 50 })).toBeCloseTo(128, 3);
    expect(tone(160, { ...NEUTRAL, contrast: 50 })).toBeGreaterThan(160);
    expect(tone(100, { ...NEUTRAL, contrast: 50 })).toBeLessThan(100);
    expect(tone(160, { ...NEUTRAL, contrast: -50 })).toBeLessThan(160);
  });

  it('gamma > 1 lightens midtones and keeps the end points', () => {
    expect(tone(128, { ...NEUTRAL, gamma: 2 })).toBeCloseTo(255 * Math.sqrt(128 / 255), 3);
    expect(tone(0, { ...NEUTRAL, gamma: 2 })).toBe(0);
    expect(tone(255, { ...NEUTRAL, gamma: 2 })).toBe(255);
  });

  it('inverts', () => {
    expect(tone(40, { ...NEUTRAL, invert: true })).toBeCloseTo(215, 3);
  });

  it('composites transparent pixels over white, even when inverted', () => {
    const src = makeSource(2, 1, (x) => (x === 0 ? [0, 0, 0, 0] : [0, 0, 0, 128]));
    const plain = toneMap(toGrayscale(src), NEUTRAL);
    expect(plain[0]).toBe(255);
    expect(plain[1]).toBeCloseTo(255 * (1 - 128 / 255), 2);
    const inverted = toneMap(toGrayscale(src), { ...NEUTRAL, invert: true });
    expect(inverted[0]).toBe(255);
    expect(inverted[1]).toBe(255);
  });
});
