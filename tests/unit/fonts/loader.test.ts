// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FontRef } from '$lib/fonts/loader';
import { CATALOG_ROWS } from './helpers';

type Loader = typeof import('$lib/fonts/loader');

const TTF = new Uint8Array([0, 1, 0, 0, 9, 9, 9, 9]);
const faces: { family: string; weight?: string; style?: string }[] = [];
const added: unknown[] = [];
let ttfRequests: string[] = [];
let online = true;

class FakeFontFace {
  family: string;
  weight?: string;
  style?: string;
  constructor(family: string, _src: ArrayBuffer, desc: { weight?: string; style?: string } = {}) {
    this.family = family;
    this.weight = desc.weight;
    this.style = desc.style;
    faces.push({ family, weight: desc.weight, style: desc.style });
  }
  load() {
    return Promise.resolve(this);
  }
}

const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
  const url = String(input);
  if (url.endsWith('fonts/google-fonts.json')) {
    if (!online) throw new TypeError('offline');
    return new Response(JSON.stringify(CATALOG_ROWS));
  }
  ttfRequests.push(url);
  if (!online) throw new TypeError('Failed to fetch');
  if (url.includes('/nope@')) return new Response('missing', { status: 404 });
  await new Promise((r) => setTimeout(r, 5));
  return new Response(TTF.slice());
});

async function freshLoader(): Promise<Loader> {
  vi.resetModules();
  return import('$lib/fonts/loader');
}

function deleteDb() {
  return new Promise<void>((resolve) => {
    const req = indexedDB.deleteDatabase('openlaser-fonts');
    req.onsuccess = req.onerror = req.onblocked = () => resolve();
  });
}

beforeEach(async () => {
  faces.length = 0;
  added.length = 0;
  ttfRequests = [];
  online = true;
  fetchMock.mockClear();
  vi.stubGlobal('fetch', fetchMock);
  vi.stubGlobal('FontFace', FakeFontFace);
  Object.defineProperty(document, 'fonts', {
    configurable: true,
    value: { add: (f: unknown) => added.push(f), check: () => true, load: async () => [] },
  });
  await deleteDb();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const inter: FontRef = { family: 'Inter', weight: 700, style: 'normal' };

describe('ensureFont', () => {
  it('dedupes concurrent loads, registers the face and notifies once', async () => {
    const L = await freshLoader();
    const seen = vi.fn();
    const off = L.onFontLoaded(seen);
    await Promise.all([L.ensureFont(inter), L.ensureFont(inter), L.ensureFont({ ...inter })]);
    expect(ttfRequests).toEqual([
      'https://cdn.jsdelivr.net/fontsource/fonts/inter@latest/latin-700-normal.ttf',
    ]);
    expect(faces).toEqual([{ family: 'Inter', weight: '700', style: 'normal' }]);
    expect(added).toHaveLength(1);
    expect(seen).toHaveBeenCalledTimes(1);
    off();
    await L.ensureFont({ ...inter, weight: 650 }); // snaps to 700: same face, no new fetch
    expect(ttfRequests).toHaveLength(1);
    expect(seen).toHaveBeenCalledTimes(1);
  });

  it('snaps to the nearest weight and drops italic where the family has none', async () => {
    const L = await freshLoader();
    await L.ensureFont({ family: 'Lobster', weight: 700, style: 'italic' });
    expect(ttfRequests).toEqual([
      'https://cdn.jsdelivr.net/fontsource/fonts/lobster@latest/latin-400-normal.ttf',
    ]);
  });

  it('bundled faces resolve without a download, but bytes still come from fontsource', async () => {
    const L = await freshLoader();
    await L.ensureFont({ family: 'Geist', weight: 500, style: 'normal' });
    expect(ttfRequests).toEqual([]);
    const bytes = await L.getFontBytes({ family: 'Geist', weight: 500, style: 'normal' });
    expect(bytes).toEqual(TTF);
    expect(ttfRequests).toEqual([
      'https://cdn.jsdelivr.net/fontsource/fonts/geist@latest/latin-500-normal.ttf',
    ]);
    // A weight the app does not bundle loads like any other face.
    await L.ensureFont({ family: 'Geist', weight: 800, style: 'normal' });
    expect(faces).toEqual([{ family: 'Geist', weight: '800', style: 'normal' }]);
  });
});

describe('getFontBytes', () => {
  it('caches bytes in IndexedDB across sessions', async () => {
    let L = await freshLoader();
    expect(await L.getFontBytes(inter)).toEqual(TTF);
    expect(ttfRequests).toHaveLength(1);
    // Let the IndexedDB write settle, then start a new "session" while offline.
    await new Promise((r) => setTimeout(r, 20));
    L = await freshLoader();
    online = false;
    expect(await L.getFontBytes(inter)).toEqual(TTF);
    expect(ttfRequests).toHaveLength(1);
  });

  it('offline failures resolve to null, never throw, and are remembered', async () => {
    online = false;
    const L = await freshLoader();
    const seen = vi.fn();
    L.onFontLoaded(seen);
    await expect(L.ensureFont(inter)).resolves.toBeUndefined();
    expect(await L.getFontBytes(inter)).toBeNull();
    online = true;
    expect(await L.getFontBytes(inter)).toBeNull();
    expect(ttfRequests).toHaveLength(1);
    expect(seen).not.toHaveBeenCalled();
    expect(faces).toHaveLength(0);
  });

  it('unknown families fail quietly', async () => {
    const L = await freshLoader();
    expect(await L.getFontBytes({ family: 'Nope', weight: 400, style: 'normal' })).toBeNull();
    expect(ttfRequests[0]).toContain('/nope@latest/latin-400-normal.ttf');
  });

  it('works without IndexedDB', async () => {
    const idb = globalThis.indexedDB;
    vi.stubGlobal('indexedDB', undefined);
    try {
      const L = await freshLoader();
      expect(await L.getFontBytes(inter)).toEqual(TTF);
    } finally {
      vi.stubGlobal('indexedDB', idb);
    }
  });
});

describe('loadPreviewCss', () => {
  it('injects one css2 &text= stylesheet per family and skips bundled families', async () => {
    const L = await freshLoader();
    const { BUNDLED_FONTS, parseCatalog } = await import('$lib/fonts/catalog');
    const [lobster] = parseCatalog([CATALOG_ROWS[3]]);
    const before = document.head.querySelectorAll('link').length;
    L.loadPreviewCss(lobster);
    L.loadPreviewCss({ ...lobster });
    L.loadPreviewCss(BUNDLED_FONTS[0]);
    const links = [...document.head.querySelectorAll('link')].slice(before);
    expect(links.map((l) => l.href)).toEqual([
      'https://fonts.googleapis.com/css2?family=Lobster:wght@400&text=Lobster&display=swap',
    ]);
    expect(links[0].rel).toBe('stylesheet');
  });
});
