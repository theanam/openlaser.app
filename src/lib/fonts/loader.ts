/* Font loading for text outlines and on-screen previews.
   Faces come from the Fontsource CDN as single latin TTFs (opentype.js needs TTF, not woff2),
   are cached in IndexedDB so text can be re-outlined offline, and are registered with
   document.fonts so the canvas and the picker can draw them. Every failure (offline, unknown
   family, blocked storage) resolves quietly to null and is remembered for the session. */
import {
  cssFamilyFor,
  familyToId,
  findFont,
  fontsourceTtfUrl,
  loadCatalog,
  nearestWeight,
  previewCssUrl,
  type CatalogFont,
  type FontStyle,
} from './catalog';
import { hasLocalFamily, localFontBytes } from './local';

export type FontRef = { family: string; weight: number; style: FontStyle };

const DB_NAME = 'openlaser-fonts';
const STORE = 'ttf';

type Face = {
  id: string;
  family: string;
  weight: number;
  style: FontStyle;
  entry?: CatalogFont;
  key: string;
};

const listeners = new Set<() => void>();
/** Resolved face key → bytes (or null when the face could not be fetched). */
const bytesCache = new Map<string, Promise<Uint8Array | null>>();
/** Resolved face key → registration with document.fonts. */
const registered = new Map<string, Promise<boolean>>();
/** Requested font key → ensureFont in flight or done. */
const ensured = new Map<string, Promise<void>>();
const failed = new Set<string>();
const previewLinks = new Set<string>();

const refKey = (f: FontRef) => `${f.family}|${f.weight}|${f.style}`;

function notify() {
  for (const fn of [...listeners]) {
    try {
      fn();
    } catch (e) {
      console.error(e);
    }
  }
}

/** Snap a FontRef to a face the catalogue has (nearest weight; italic only where it exists). */
async function resolveFace(font: FontRef): Promise<Face> {
  const entry = findFont(await loadCatalog(), font.family);
  const id = entry?.id ?? familyToId(font.family);
  const weight = entry ? nearestWeight(entry.weights, font.weight) : font.weight;
  const style = font.style === 'italic' && (!entry || entry.italic) ? 'italic' : 'normal';
  return { id, family: entry?.family ?? font.family, weight, style, entry, key: `${id}-${weight}-${style}` };
}

/* ---------- IndexedDB cache (optional: private windows and blocked storage get none) ---------- */

let dbPromise: Promise<IDBDatabase | null> | null = null;
function openDb(): Promise<IDBDatabase | null> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    try {
      if (typeof indexedDB === 'undefined') return resolve(null);
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
      };
      req.onsuccess = () => {
        const db = req.result;
        // Let another tab (or a test) delete or upgrade the database instead of blocking it.
        db.onversionchange = () => {
          db.close();
          dbPromise = null;
        };
        resolve(db);
      };
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return dbPromise;
}

async function readCached(key: string): Promise<Uint8Array | null> {
  const db = await openDb();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const req = db.transaction(STORE, 'readonly').objectStore(STORE).get(key);
      req.onsuccess = () => {
        const v = req.result as ArrayBuffer | Uint8Array | undefined;
        resolve(v ? (v instanceof Uint8Array ? v : new Uint8Array(v)) : null);
      };
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function writeCached(key: string, bytes: Uint8Array): Promise<void> {
  const db = await openDb();
  if (!db) return;
  await new Promise<void>((resolve) => {
    try {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(bytes.slice().buffer, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
      tx.onabort = () => resolve();
    } catch {
      resolve();
    }
  });
}

/* ---------- fetching ---------- */

function faceBytes(face: Face): Promise<Uint8Array | null> {
  const hit = bytesCache.get(face.key);
  if (hit) return hit;
  const p = (async () => {
    if (failed.has(face.key)) return null;
    const cached = await readCached(face.key);
    if (cached) return cached;
    try {
      const res = await fetch(fontsourceTtfUrl(face.id, face.weight, face.style));
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const bytes = new Uint8Array(await res.arrayBuffer());
      if (!bytes.length) throw new Error('empty font');
      await writeCached(face.key, bytes);
      return bytes;
    } catch {
      failed.add(face.key);
      return null;
    }
  })();
  bytesCache.set(face.key, p);
  return p;
}

/** TrueType bytes for a font, for outlining. Null when unavailable (offline and not cached). */
export async function getFontBytes(font: FontRef): Promise<Uint8Array | null> {
  try {
    // Uploaded and system fonts first: a local family wins over a catalogue family of the same name.
    if (hasLocalFamily(font.family)) return await localFontBytes(font);
    return await faceBytes(await resolveFace(font));
  } catch {
    return null;
  }
}

const isBundled = (face: Face) => face.style === 'normal' && !!face.entry?.bundled?.includes(face.weight);

function register(face: Face): Promise<boolean> {
  const hit = registered.get(face.key);
  if (hit) return hit;
  const p = (async () => {
    const bytes = await faceBytes(face);
    if (!bytes || typeof FontFace === 'undefined' || typeof document === 'undefined' || !document.fonts)
      return false;
    try {
      const ff = new FontFace(face.family, bytes.slice().buffer, {
        weight: String(face.weight),
        style: face.style,
      });
      await ff.load();
      document.fonts.add(ff);
      return true;
    } catch {
      failed.add(face.key);
      return false;
    }
  })();
  registered.set(face.key, p);
  return p;
}

/** Make a font drawable by the canvas. Resolves when the face is registered (or failed); never rejects. */
export function ensureFont(font: FontRef): Promise<void> {
  const k = refKey(font);
  const hit = ensured.get(k);
  if (hit) return hit;
  const p = (async () => {
    try {
      const face = await resolveFace(font);
      if (face.entry && isBundled(face)) {
        // Declared by the @fontsource CSS; nudge the browser to fetch the woff2 and redraw once it has.
        const spec = `${face.weight} 16px "${cssFamilyFor(face.entry, face.weight)}"`;
        const set = typeof document !== 'undefined' ? document.fonts : undefined;
        if (set && !set.check(spec)) void set.load(spec).then(notify, () => undefined);
        return;
      }
      if (await register(face)) notify();
    } catch {
      /* never throws */
    }
  })();
  ensured.set(k, p);
  return p;
}

/** Subscribe to font-loaded events (canvas and picker re-render). Returns the unsubscribe. */
export function onFontLoaded(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/**
 * Inject the Google css2 `&text=` stylesheet for a picker row, once per family: it carries only
 * the glyphs of the family's name, so scrolling a list of 1,800 fonts costs a few KB each.
 * Bundled families are already available and are skipped.
 */
export function loadPreviewCss(entry: CatalogFont): void {
  if (entry.bundled?.length || previewLinks.has(entry.family) || typeof document === 'undefined') return;
  previewLinks.add(entry.family);
  try {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = previewCssUrl(entry);
    link.addEventListener('load', notify, { once: true });
    document.head.appendChild(link);
  } catch {
    /* no DOM: previews fall back to the UI font */
  }
}
