import { describe, expect, it } from 'vitest';
import { coord, count, distance, duration, relativeTime } from '$app/lib/format';

describe('format', () => {
  it('formats coordinates and counts', () => {
    expect(coord(200)).toBe('200.000');
    expect(count(42615)).toBe('42,615');
  });

  it('formats durations', () => {
    expect(duration(45)).toBe('45 s');
    expect(duration(700)).toBe('11 min 40 s');
    expect(duration(7500)).toBe('2 h 05 min');
  });

  it('formats distances', () => {
    expect(distance(6200)).toBe('6.2 m');
    expect(distance(84.4)).toBe('84 mm');
  });

  it('formats relative times', () => {
    const now = Date.parse('2026-10-20T12:00:00Z');
    expect(relativeTime('2026-10-20T11:59:50Z', now)).toBe('just now');
    expect(relativeTime('2026-10-20T10:00:00Z', now)).toBe('2 h ago');
    expect(relativeTime('2026-10-19T10:00:00Z', now)).toBe('yesterday');
  });
});
