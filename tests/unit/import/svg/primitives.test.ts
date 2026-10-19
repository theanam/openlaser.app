import { describe, expect, it } from 'vitest';
import { apply } from '$lib/geometry/mat2d';
import { parseColor } from '$lib/import/svg/colors';
import { parseDeclarations, parseStylesheet } from '$lib/import/svg/css';
import { parseTransform } from '$lib/import/svg/transform';
import { parseLengthMm, parseViewBox, viewBoxTransform } from '$lib/import/svg/units';

describe('parseLengthMm', () => {
  it('converts physical units', () => {
    expect(parseLengthMm('10mm', 96)).toBe(10);
    expect(parseLengthMm('2cm', 96)).toBe(20);
    expect(parseLengthMm('1in', 96)).toBe(25.4);
    expect(parseLengthMm('72pt', 96)).toBeCloseTo(25.4, 9);
  });

  it('uses the DPI for unitless and px values', () => {
    expect(parseLengthMm('96', 96)).toBeCloseTo(25.4, 9);
    expect(parseLengthMm('96px', 96)).toBeCloseTo(25.4, 9);
    expect(parseLengthMm('72', 72)).toBeCloseTo(25.4, 9);
  });

  it('rejects percentages, font units and junk', () => {
    expect(parseLengthMm('100%', 96)).toBeNull();
    expect(parseLengthMm('2em', 96)).toBeNull();
    expect(parseLengthMm('abc', 96)).toBeNull();
    expect(parseLengthMm(null, 96)).toBeNull();
  });
});

describe('viewBoxTransform', () => {
  const box = parseViewBox('10 20 100 50');

  it('parses viewBox', () => {
    expect(box).toEqual({ x: 10, y: 20, width: 100, height: 50 });
    expect(parseViewBox('0 0 0 10')).toBeNull();
  });

  it('stretches with none', () => {
    const m = viewBoxTransform(box!, 200, 200, 'none');
    expect(apply(m, { x: 10, y: 20 })).toEqual({ x: 0, y: 0 });
    expect(apply(m, { x: 110, y: 70 })).toEqual({ x: 200, y: 200 });
  });

  it('fits and centers with the default xMidYMid meet', () => {
    const m = viewBoxTransform(box!, 200, 200, null);
    expect(apply(m, { x: 10, y: 20 })).toEqual({ x: 0, y: 50 });
    expect(apply(m, { x: 110, y: 70 })).toEqual({ x: 200, y: 150 });
  });

  it('aligns and covers with xMaxYMin slice', () => {
    const m = viewBoxTransform(box!, 200, 200, 'xMaxYMin slice');
    expect(m[0]).toBe(4);
    expect(apply(m, { x: 110, y: 20 })).toEqual({ x: 200, y: 0 });
  });
});

describe('parseTransform', () => {
  const at = (t: string, x: number, y: number) => {
    const p = apply(parseTransform(t), { x, y });
    return [Math.round(p.x * 1e9) / 1e9, Math.round(p.y * 1e9) / 1e9];
  };

  it('parses each function', () => {
    expect(at('translate(5)', 1, 1)).toEqual([6, 1]);
    expect(at('translate(5, 6)', 1, 1)).toEqual([6, 7]);
    expect(at('scale(2)', 1, 3)).toEqual([2, 6]);
    expect(at('scale(2 -1)', 1, 3)).toEqual([2, -3]);
    expect(at('rotate(90)', 1, 0)).toEqual([0, 1]);
    expect(at('rotate(90 10 10)', 11, 10)).toEqual([10, 11]);
    expect(at('skewX(45)', 0, 1)).toEqual([1, 1]);
    expect(at('skewY(45)', 1, 0)).toEqual([1, 1]);
    expect(at('matrix(1 0 0 1 3 4)', 0, 0)).toEqual([3, 4]);
  });

  it('composes left to right (rightmost applies first)', () => {
    expect(at('translate(10,0) scale(2)', 1, 1)).toEqual([12, 2]);
    expect(at('scale(2) translate(10,0)', 1, 1)).toEqual([22, 2]);
  });

  it('returns identity for missing or invalid input', () => {
    expect(parseTransform(null)).toEqual([1, 0, 0, 1, 0, 0]);
    expect(parseTransform('wobble(3)')).toEqual([1, 0, 0, 1, 0, 0]);
  });
});

describe('parseColor', () => {
  it('normalizes hex, rgb, hsl and names', () => {
    expect(parseColor('#ABC')).toBe('#aabbcc');
    expect(parseColor('#aabbccdd')).toBe('#aabbcc');
    expect(parseColor('#FF0000')).toBe('#ff0000');
    expect(parseColor('rgb(255, 0, 128)')).toBe('#ff0080');
    expect(parseColor('rgba(100%, 0%, 0%, 0.5)')).toBe('#ff0000');
    expect(parseColor('rgb(0 255 0 / 50%)')).toBe('#00ff00');
    expect(parseColor('hsl(240, 100%, 50%)')).toBe('#0000ff');
    expect(parseColor('RebeccaPurple')).toBe('#663399');
    expect(parseColor('black')).toBe('#000000');
  });

  it('returns null for non-colors', () => {
    for (const v of ['none', 'currentColor', 'url(#g)', '#12', 'notacolor', 'rgb(a,b,c)'])
      expect(parseColor(v)).toBeNull();
  });
});

describe('css', () => {
  it('parses declarations', () => {
    expect(parseDeclarations('fill: red ; stroke:#000 !important;;bad')).toEqual(
      new Map([
        ['fill', 'red'],
        ['stroke', '#000'],
      ]),
    );
  });

  it('parses rules with selector lists and skips at-rules and complex selectors', () => {
    const rules = parseStylesheet(`
      /* comment */
      .a, path.b { fill: red }
      @media print { .a { fill: blue } }
      g > .c { fill: green }
      #id { stroke: blue }
    `);
    expect(
      rules.map((r) => [r.specificity, r.declarations.get('fill') ?? r.declarations.get('stroke')]),
    ).toEqual([
      [10, 'red'],
      [11, 'red'],
      [100, 'blue'],
    ]);
  });
});
