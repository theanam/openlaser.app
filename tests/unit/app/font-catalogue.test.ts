import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseCatalog } from 'libopenlaser/fonts';

describe('the font catalogue the app serves', () => {
  it('is large and well formed', () => {
    const rows = JSON.parse(
      readFileSync(resolve(import.meta.dirname, '../../../public/fonts/google-fonts.json'), 'utf8'),
    );
    const fonts = parseCatalog(rows);
    expect(fonts.length).toBeGreaterThan(1500);
    expect(fonts.length).toBe(rows.length);
    expect(fonts.find((f) => f.id === 'geist')?.family).toBe('Geist');
    expect(new Set(fonts.map((f) => f.category))).toEqual(
      new Set(['sans', 'serif', 'display', 'handwriting', 'mono']),
    );
  });
});
