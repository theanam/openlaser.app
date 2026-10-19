import { describe, expect, it } from 'vitest';
import { clamp, formatNumber, parseNumberInput, scrubDelta } from '$lib/ui/number';

describe('number helpers', () => {
  it('parses plain and comma decimals', () => {
    expect(parseNumberInput('12.5')).toBe(12.5);
    expect(parseNumberInput('12,5')).toBe(12.5);
    expect(parseNumberInput(' -3 ')).toBe(-3);
  });

  it('evaluates simple arithmetic', () => {
    expect(parseNumberInput('10+2.5')).toBe(12.5);
    expect(parseNumberInput('100/4')).toBe(25);
    expect(parseNumberInput('2*(3+4)')).toBe(14);
  });

  it('rejects junk', () => {
    expect(parseNumberInput('')).toBeNull();
    expect(parseNumberInput('abc')).toBeNull();
    expect(parseNumberInput('1/0')).toBeNull();
    expect(parseNumberInput('(1+2')).toBeNull();
  });

  it('formats and clamps', () => {
    expect(formatNumber(200, 3)).toBe('200.000');
    expect(clamp(120, 0, 100)).toBe(100);
  });

  it('scales scrubbing with modifiers', () => {
    expect(scrubDelta(10, 1)).toBe(5);
    expect(scrubDelta(10, 1, { shift: true })).toBe(50);
    expect(scrubDelta(10, 1, { alt: true })).toBeCloseTo(0.5);
  });
});

describe('stepping', () => {
  it('steps by the field step, with Shift ×10 and Alt ×0.1', async () => {
    const { stepValue } = await import('$lib/ui/number');
    expect(stepValue(1, 0.1, 1, { decimals: 3 })).toBe(1.1);
    expect(stepValue(1, 0.1, -1, { shift: true, decimals: 3 })).toBe(0);
    expect(stepValue(1, 0.1, 1, { alt: true, decimals: 3 })).toBe(1.01);
  });

  it('clamps and rounds away float noise', async () => {
    const { stepValue } = await import('$lib/ui/number');
    expect(stepValue(0.3, 0.1, 1, { decimals: 3 })).toBe(0.4);
    expect(stepValue(0.05, 0.1, -1, { min: 0, decimals: 3 })).toBe(0);
    expect(stepValue(99.95, 0.1, 1, { max: 100, decimals: 2 })).toBe(100);
  });
});
