import { beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
// @ts-expect-error opentype.js ships no type declarations; narrowed to OtFont below.
import * as opentype from 'opentype.js';
import { textToPaths, type OtFont } from '$lib/fonts/outline';

const bytes = readFileSync(resolve(process.cwd(), 'tests/fixtures/fonts/geist-latin-400-normal.ttf'));
let font: OtFont;

beforeAll(() => {
  const ns = opentype as unknown as { parse?: unknown; default?: unknown };
  const ot = (ns.parse ? ns : ns.default) as { parse(b: ArrayBuffer): OtFont };
  font = ot.parse(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer);
});

const spec = (text: string) => ({
  text,
  fontSize: 10,
  align: 'left' as const,
  lineHeight: 1.2,
  letterSpacing: 0,
});

describe('letters a font does not have', () => {
  it('reports none for text the font covers', () => {
    expect(textToPaths(spec('Text 42'), font).missing).toBeUndefined();
  });

  it('lists each missing letter once and keeps the block height', () => {
    const outline = textToPaths(spec('আমার আম'), font);
    expect(outline.missing).toEqual(['আ', 'ম', 'া', 'র']);
    expect(outline.height).toBeGreaterThan(0);
  });

  it('lists only the missing ones in mixed text', () => {
    expect(textToPaths(spec('Hi বাংলা'), font).missing).toEqual(['ব', 'া', 'ং', 'ল']);
  });
});
