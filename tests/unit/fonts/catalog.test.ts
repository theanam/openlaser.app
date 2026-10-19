// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  BUNDLED_FONTS,
  cssFamilyFor,
  DEFAULT_TEXT_FONT,
  familyToId,
  filterFonts,
  fontsourceTtfUrl,
  mergeCatalog,
  nearestWeight,
  parseCatalog,
  previewCssUrl,
  styleLabel,
} from '$lib/fonts/catalog';
import { CATALOG_ROWS } from './helpers';

const list = mergeCatalog(parseCatalog(CATALOG_ROWS));

describe('catalog parsing', () => {
  it('parses compact rows and drops malformed ones', () => {
    const fonts = parseCatalog([
      ...CATALOG_ROWS,
      ['x'],
      null,
      ['bad', 'Bad', 'sans', [], 0],
      ['odd', 'Odd', 'weird', [700, 400], 1],
    ]);
    expect(fonts).toHaveLength(CATALOG_ROWS.length + 1);
    const odd = fonts.find((f) => f.id === 'odd')!;
    expect(odd).toEqual({ id: 'odd', family: 'Odd', category: 'sans', weights: [400, 700], italic: true });
    expect(parseCatalog('nope')).toEqual([]);
  });

  it('puts bundled faces first without duplicating them', () => {
    expect(list.slice(0, 2).map((f) => f.family)).toEqual(BUNDLED_FONTS.map((f) => f.family));
    expect(list.filter((f) => f.family === 'Geist')).toHaveLength(1);
    expect(list.find((f) => f.family === 'Geist')!.bundled).toEqual([400, 500, 600]);
  });

  it('the committed catalogue is large and well formed', async () => {
    const { readFileSync } = await import('node:fs');
    const { resolve } = await import('node:path');
    const rows = JSON.parse(readFileSync(resolve(process.cwd(), 'public/fonts/google-fonts.json'), 'utf8'));
    const fonts = parseCatalog(rows);
    expect(fonts.length).toBeGreaterThan(1500);
    expect(fonts.length).toBe(rows.length);
    expect(fonts.find((f) => f.id === 'geist')?.family).toBe('Geist');
    expect(new Set(fonts.map((f) => f.category))).toEqual(
      new Set(['sans', 'serif', 'display', 'handwriting', 'mono']),
    );
  });
});

describe('filterFonts', () => {
  it('ranks prefix matches first, then word starts, then substrings', () => {
    const names = filterFonts(list, 'ro').map((f) => f.family);
    expect(names.slice(0, 2)).toEqual(['Roboto', 'Roboto Mono']);
    expect(filterFonts(list, 'mono').map((f) => f.family)).toEqual(['Geist Mono', 'Roboto Mono']);
    expect(filterFonts(list, 'ser').map((f) => f.family)).toEqual(['Noto Serif']);
  });

  it('filters by category and by project fonts', () => {
    expect(filterFonts(list, '', 'serif').map((f) => f.family)).toEqual(['Playfair Display', 'Noto Serif']);
    expect(filterFonts(list, '', 'handwriting').map((f) => f.family)).toEqual(['Caveat']);
    expect(filterFonts(list, '', 'mono').map((f) => f.family)).toEqual(['Geist Mono', 'Roboto Mono']);
    expect(filterFonts(list, '', 'project', ['lobster', 'Inter']).map((f) => f.family)).toEqual([
      'Inter',
      'Lobster',
    ]);
    expect(filterFonts(list, '  ', 'all')).toHaveLength(list.length);
  });
});

describe('bundled faces', () => {
  it('draws bundled Geist weights with the @fontsource family name', () => {
    const geist = list.find((f) => f.id === 'geist')!;
    expect(cssFamilyFor(geist, 500)).toBe('Geist Sans');
    expect(cssFamilyFor(geist, 500, 'italic')).toBe('Geist');
    expect(cssFamilyFor(geist, 800)).toBe('Geist');
    expect(
      cssFamilyFor(
        list.find((f) => f.id === 'geist-mono')!,
        400,
      ),
    ).toBe('Geist Mono');
  });

  it('the default text font is a bundled weight', () => {
    const entry = list.find((f) => f.family === DEFAULT_TEXT_FONT.family)!;
    expect(entry.bundled).toContain(DEFAULT_TEXT_FONT.weight);
  });
});

describe('weights', () => {
  it('nearestWeight snaps and prefers heavier on ties', () => {
    expect(nearestWeight([400], 700)).toBe(400);
    expect(nearestWeight([100, 400, 900], 600)).toBe(400);
    expect(nearestWeight([300, 500], 400)).toBe(500);
    expect(nearestWeight([], 450)).toBe(450);
    expect(nearestWeight(undefined, 300)).toBe(300);
  });

  it('labels weights and italics', () => {
    expect(styleLabel(400)).toBe('Regular');
    expect(styleLabel(400, 'italic')).toBe('Italic');
    expect(styleLabel(700, 'italic')).toBe('Bold Italic');
    expect(styleLabel(100)).toBe('Thin');
    expect(styleLabel(900)).toBe('Black');
    expect(styleLabel(450)).toBe('450');
  });
});

describe('URLs', () => {
  const playfair = list.find((f) => f.id === 'playfair-display')!;

  it('preview URL subsets to the family name', () => {
    expect(previewCssUrl(playfair)).toBe(
      'https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400&text=Playfair%20Display&display=swap',
    );
  });

  it('fontsource TTF URL', () => {
    expect(fontsourceTtfUrl('geist', 400, 'normal')).toBe(
      'https://cdn.jsdelivr.net/fontsource/fonts/geist@latest/latin-400-normal.ttf',
    );
    expect(fontsourceTtfUrl('inter', 700, 'italic')).toBe(
      'https://cdn.jsdelivr.net/fontsource/fonts/inter@latest/latin-700-italic.ttf',
    );
  });

  it('familyToId slugs family names', () => {
    expect(familyToId('Bricolage Grotesque')).toBe('bricolage-grotesque');
    expect(familyToId(' M PLUS 1p ')).toBe('m-plus-1p');
  });
});

describe('loadCatalog', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it('fetches once and merges bundled faces first', async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify(CATALOG_ROWS)));
    vi.stubGlobal('fetch', fetch);
    const { loadCatalog } = await import('$lib/fonts/catalog');
    const [a, b] = await Promise.all([loadCatalog(), loadCatalog()]);
    expect(a).toBe(b);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(String((fetch.mock.calls[0] as unknown[])[0])).toMatch(/fonts\/google-fonts\.json$/);
    expect(a[0].family).toBe('Geist');
    expect(a.some((f) => f.family === 'Caveat')).toBe(true);
  });

  it('falls back to bundled faces offline and retries later', async () => {
    const fetch = vi.fn(async () => {
      throw new TypeError('offline');
    });
    vi.stubGlobal('fetch', fetch);
    const { loadCatalog } = await import('$lib/fonts/catalog');
    expect((await loadCatalog()).map((f) => f.family)).toEqual(BUNDLED_FONTS.map((f) => f.family));
    await loadCatalog();
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});
