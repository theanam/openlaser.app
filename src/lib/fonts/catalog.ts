/* The font catalogue: every Google Font (public/fonts/google-fonts.json, built by
   scripts/update-google-fonts.mjs from Fontsource) plus the faces the app bundles.
   Everything here is pure except loadCatalog(), which fetches the JSON once. */

export type FontCategory = 'sans' | 'serif' | 'display' | 'handwriting' | 'mono';
/** Category filter ids: the five font categories plus the virtual "all" and "project" lists. */
export type FontCategoryId = 'all' | 'project' | 'uploaded' | 'system' | FontCategory;
export type FontStyle = 'normal' | 'italic';

export type CatalogFont = {
  /** Fontsource id, e.g. "bricolage-grotesque". */
  id: string;
  family: string;
  category: FontCategory;
  /** Available weights, ascending. */
  weights: number[];
  italic: boolean;
  /** Upright weights the app ships (via @fontsource), so the UI renders them without a download. */
  bundled?: number[];
  /**
   * CSS family name the bundled weights are registered under, when it differs from `family`
   * (@fontsource/geist-sans registers "Geist Sans", while Google Fonts calls the family "Geist").
   */
  cssFamily?: string;
  /** Fonts from the user's machine: uploaded files or installed system fonts. */
  source?: 'uploaded' | 'system';
};

export const FONT_CATEGORIES: { id: FontCategoryId; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'project', label: 'In this project' },
  { id: 'uploaded', label: 'Uploaded' },
  { id: 'system', label: 'System' },
  { id: 'sans', label: 'Sans' },
  { id: 'serif', label: 'Serif' },
  { id: 'display', label: 'Display' },
  { id: 'handwriting', label: 'Handwriting' },
  { id: 'mono', label: 'Mono' },
];

const ALL_WEIGHTS = [100, 200, 300, 400, 500, 600, 700, 800, 900];

/** Faces whose woff2 ships with the app (imported in src/main.ts). Outlines still come from the CDN as TTF. */
export const BUNDLED_FONTS: CatalogFont[] = [
  {
    id: 'geist',
    family: 'Geist',
    category: 'sans',
    weights: ALL_WEIGHTS,
    italic: true,
    bundled: [400, 500, 600],
    cssFamily: 'Geist Sans',
  },
  {
    id: 'geist-mono',
    family: 'Geist Mono',
    category: 'mono',
    weights: ALL_WEIGHTS,
    italic: true,
    bundled: [400, 500],
  },
];

/**
 * Font for new text objects. Geist is bundled, so the editor shows it instantly and offline, and
 * it is a monolinear sans: no hairline strokes that char away or drop out of a fill at small sizes,
 * and open counters that survive kerf. Medium (500) keeps stems sturdy enough for cutting stencils
 * and engraving at a few mm without the closed-up counters of bold.
 */
export const DEFAULT_TEXT_FONT = { family: 'Geist', weight: 500 } as const;

const KNOWN = new Set<string>(['sans', 'serif', 'display', 'handwriting', 'mono']);

/** Compact rows [id, family, category, weights, hasItalic] to entries. Malformed rows are dropped; unknown categories become sans. */
export function parseCatalog(rows: unknown): CatalogFont[] {
  if (!Array.isArray(rows)) return [];
  const out: CatalogFont[] = [];
  for (const r of rows) {
    if (!Array.isArray(r) || typeof r[0] !== 'string' || typeof r[1] !== 'string' || !Array.isArray(r[3]))
      continue;
    const weights = (r[3] as unknown[])
      .filter((w): w is number => typeof w === 'number' && Number.isFinite(w))
      .sort((a, b) => a - b);
    if (!weights.length) continue;
    const cat = String(r[2]);
    out.push({
      id: r[0],
      family: r[1],
      category: (KNOWN.has(cat) ? cat : 'sans') as FontCategory,
      weights,
      italic: !!r[4],
    });
  }
  return out;
}

/** Bundled faces first, then the catalogue (minus the bundled families) in its own order. */
export function mergeCatalog(fonts: CatalogFont[]): CatalogFont[] {
  const have = new Set(BUNDLED_FONTS.map((f) => f.family));
  return [...BUNDLED_FONTS, ...fonts.filter((f) => !have.has(f.family))];
}

export const findFont = (list: readonly CatalogFont[], family: string): CatalogFont | undefined => {
  const f = family.toLowerCase();
  return list.find((e) => e.family.toLowerCase() === f);
};

/** Fontsource id for a family that is not in the catalogue (best guess). */
export const familyToId = (family: string) =>
  family
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

/**
 * Case-insensitive search within a category; families that start with the query rank first,
 * then families with a word starting with it, then any other match.
 */
export function filterFonts(
  list: readonly CatalogFont[],
  query: string,
  cat: FontCategoryId = 'all',
  projectFonts?: Iterable<string>,
): CatalogFont[] {
  const q = String(query || '')
    .trim()
    .toLowerCase();
  let inCat: readonly CatalogFont[] = list;
  if (cat === 'project') {
    const used = new Set([...(projectFonts ?? [])].map((f) => f.toLowerCase()));
    inCat = list.filter((f) => used.has(f.family.toLowerCase()));
  } else if (cat === 'uploaded' || cat === 'system') inCat = list.filter((f) => f.source === cat);
  else if (cat !== 'all') inCat = list.filter((f) => f.category === cat && !f.source);
  if (!q) return [...inCat];
  const starts: CatalogFont[] = [];
  const word: CatalogFont[] = [];
  const contains: CatalogFont[] = [];
  for (const f of inCat) {
    const n = f.family.toLowerCase();
    if (n.startsWith(q)) starts.push(f);
    else if (n.includes(' ' + q)) word.push(f);
    else if (n.includes(q) || f.id.includes(q)) contains.push(f);
  }
  return [...starts, ...word, ...contains];
}

/** The available weight closest to `want`, preferring the heavier one on a tie. */
export function nearestWeight(weights: readonly number[] | undefined, want: number): number {
  if (!weights || !weights.length) return want;
  let best = weights[0];
  for (const w of weights) {
    const d = Math.abs(w - want);
    const bd = Math.abs(best - want);
    if (d < bd || (d === bd && w > best)) best = w;
  }
  return best;
}

export const WEIGHT_NAMES: Record<number, string> = {
  100: 'Thin',
  200: 'Extra Light',
  300: 'Light',
  400: 'Regular',
  500: 'Medium',
  600: 'Semibold',
  700: 'Bold',
  800: 'Extra Bold',
  900: 'Black',
};

/** "Bold", "Bold Italic", "Italic" (for 400 italic), or the number for odd weights. */
export function styleLabel(weight: number, style: FontStyle = 'normal'): string {
  const name = WEIGHT_NAMES[weight] ?? String(weight);
  if (style !== 'italic') return name;
  return weight === 400 ? 'Italic' : `${name} Italic`;
}

/**
 * The CSS family to draw a face with: bundled weights use the name @fontsource registered,
 * everything else the family name the loader registers its FontFace under.
 */
export function cssFamilyFor(entry: CatalogFont, weight: number, style: FontStyle = 'normal'): string {
  return entry.cssFamily && style === 'normal' && entry.bundled?.includes(weight)
    ? entry.cssFamily
    : entry.family;
}

const fam = (name: string) => encodeURIComponent(name).replace(/%20/g, '+');

/** css2 URL with only the glyphs of the family's own name (the `&text=` subset), for a picker row. */
export function previewCssUrl(entry: CatalogFont): string {
  return `https://fonts.googleapis.com/css2?family=${fam(entry.family)}:wght@${nearestWeight(entry.weights, 400)}&text=${encodeURIComponent(entry.family)}&display=swap`;
}

/** A single latin TrueType face from the Fontsource CDN (served as font/ttf with CORS). */
export function fontsourceTtfUrl(id: string, weight: number, style: FontStyle): string {
  return `https://cdn.jsdelivr.net/fontsource/fonts/${id}@latest/latin-${weight}-${style}.ttf`;
}

let catalogPromise: Promise<CatalogFont[]> | null = null;
let catalogLoaded: CatalogFont[] | null = null;

/**
 * The full list (bundled first). Fetched once, relative to the document base because the app is
 * served from a relative base (GitHub Pages project path). Offline it falls back to the bundled
 * faces and retries on the next call.
 */
export function loadCatalog(): Promise<CatalogFont[]> {
  if (catalogPromise) return catalogPromise;
  const p = (async () => {
    // Let concurrent callers share this promise before the fetch can fail synchronously.
    await Promise.resolve();
    try {
      const base = typeof document !== 'undefined' ? document.baseURI : globalThis.location?.href;
      const res = await fetch(new URL('fonts/google-fonts.json', base));
      if (!res.ok) throw new Error(`catalogue ${res.status}`);
      const list = mergeCatalog(parseCatalog(await res.json()));
      catalogLoaded = list;
      return list;
    } catch {
      catalogPromise = null;
      return [...BUNDLED_FONTS];
    }
  })();
  catalogPromise = p;
  return p;
}

/** The catalogue if it has already loaded, else null (for synchronous UI reads). */
export const loadedCatalog = (): CatalogFont[] | null => catalogLoaded;
