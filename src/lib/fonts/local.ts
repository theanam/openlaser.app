/* Fonts from the user's machine: files they upload (kept in IndexedDB) and installed system fonts
   (Local Font Access API, Chromium). Both appear in the font picker beside Google Fonts, and the
   loader asks here first, so a local family wins over a catalogue family of the same name. */
import type { CatalogFont, FontStyle } from './catalog';
import { nearestWeight } from './catalog';
import { loadOpentype, type OtFontInfo } from './opentype';
import { collectionSize, extractFromCollection, fontFormat, parseStyleName } from './sfnt';

export type LocalSource = 'uploaded' | 'system';

/** What a system font entry from `queryLocalFonts()` offers. */
interface SystemFontData {
  family: string;
  fullName: string;
  postscriptName: string;
  style: string;
  blob(): Promise<Pick<Blob, 'arrayBuffer'>>;
}

interface LocalFace {
  family: string;
  weight: number;
  style: FontStyle;
  source: LocalSource;
  /** Uploaded faces keep their bytes; system faces read them on demand. */
  bytes?: Uint8Array;
  system?: SystemFontData;
}

export class FontFileError extends Error {}

const faces = new Map<string, LocalFace[]>();
const familyKey = (family: string) => family.trim().toLowerCase();
const faceKey = (f: Pick<LocalFace, 'family' | 'weight' | 'style'>) =>
  `${familyKey(f.family)}|${f.weight}|${f.style}`;

function add(face: LocalFace): void {
  const list = (faces.get(familyKey(face.family)) ?? []).filter((f) => faceKey(f) !== faceKey(face));
  faces.set(
    familyKey(face.family),
    [...list, face].sort((a, b) => a.weight - b.weight),
  );
}

/** Local families as picker entries: uploaded first, then system, each alphabetical. */
export function localFamilies(): CatalogFont[] {
  const out: CatalogFont[] = [];
  for (const list of faces.values()) {
    const first = list[0]!;
    // A family is "uploaded" when any of its faces is, so a re-uploaded system font shows as yours.
    const source: LocalSource = list.some((f) => f.source === 'uploaded') ? 'uploaded' : 'system';
    out.push({
      id: `local-${familyKey(first.family).replace(/[^a-z0-9]+/g, '-')}`,
      family: first.family,
      category: 'sans',
      weights: [...new Set(list.filter((f) => f.style === 'normal').map((f) => f.weight))],
      italic: list.some((f) => f.style === 'italic'),
      source,
    });
  }
  const rank = (f: CatalogFont) => (f.source === 'uploaded' ? 0 : 1);
  return out.sort((a, b) => rank(a) - rank(b) || a.family.localeCompare(b.family));
}

export const hasLocalFamily = (family: string) => faces.has(familyKey(family));

/** Bytes of the nearest local face, or null when the family is not local or cannot be read. */
export async function localFontBytes(font: { family: string; weight: number; style: FontStyle }) {
  const list = faces.get(familyKey(font.family));
  if (!list?.length) return null;
  const sameStyle = list.filter((f) => f.style === font.style);
  const pool = sameStyle.length ? sameStyle : list;
  const weight = nearestWeight(
    pool.map((f) => f.weight),
    font.weight,
  );
  const face = pool.find((f) => f.weight === weight)!;
  if (face.bytes) return face.bytes;
  try {
    return await systemFaceBytes(face.system!);
  } catch {
    return null;
  }
}

/* ---------- reading font files ---------- */

interface FaceInfo {
  family: string;
  weight: number;
  style: FontStyle;
  postscriptName: string;
}

function describe(font: OtFontInfo): FaceInfo {
  const family = font.getEnglishName('typographicFamily') ?? font.getEnglishName('fontFamily') ?? '';
  const weight = font.tables.os2?.usWeightClass ?? 400;
  const italic =
    ((font.tables.os2?.fsSelection ?? 0) & 1) === 1 || ((font.tables.head?.macStyle ?? 0) & 2) === 2;
  return {
    family: family.trim(),
    weight: Math.min(900, Math.max(100, Math.round(weight / 100) * 100)),
    style: italic ? 'italic' : 'normal',
    postscriptName: font.getEnglishName('postScriptName') ?? '',
  };
}

/** Parse a font file into a single standalone face (TTC: the one matching `postscriptName`, else the first). */
export async function readFontFile(
  bytes: Uint8Array,
  postscriptName?: string,
): Promise<{ bytes: Uint8Array; info: FaceInfo }> {
  const format = fontFormat(bytes);
  if (format === 'woff2') throw new FontFileError('WOFF2 is unsupported. Use the TTF, OTF or WOFF version.');
  if (format === 'unknown') throw new FontFileError('The file is unreadable as a font.');
  const ot = await loadOpentype();
  const candidates =
    format === 'ttc'
      ? Array.from({ length: collectionSize(bytes) }, (_, i) => extractFromCollection(bytes, i))
      : [bytes];
  let first: { bytes: Uint8Array; info: FaceInfo } | null = null;
  for (const candidate of candidates) {
    let info: FaceInfo;
    try {
      info = describe(ot.parse(candidate.slice().buffer));
    } catch {
      continue;
    }
    if (!info.family) continue;
    const entry = { bytes: candidate, info };
    if (!postscriptName || info.postscriptName === postscriptName) return entry;
    first ??= entry;
  }
  if (first) return first;
  throw new FontFileError('The file is unreadable as a font.');
}

/* ---------- uploaded fonts ---------- */

const DB_NAME = 'openlaser-user-fonts';
const STORE = 'faces';

interface StoredFace {
  family: string;
  weight: number;
  style: FontStyle;
  bytes: ArrayBuffer;
}

function openDb(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    try {
      if (typeof indexedDB === 'undefined') return resolve(null);
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function withStore<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T | null> {
  const db = await openDb();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const req = run(db.transaction(STORE, mode).objectStore(STORE));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  }).finally(() => db.close()) as Promise<T | null>;
}

/** Registers a face with the page so previews and the font picker can draw it. */
async function registerFace(face: LocalFace): Promise<void> {
  if (!face.bytes || typeof FontFace === 'undefined' || typeof document === 'undefined') return;
  try {
    const ff = new FontFace(face.family, face.bytes.slice().buffer, {
      weight: String(face.weight),
      style: face.style,
    });
    await ff.load();
    document.fonts.add(ff);
  } catch {
    /* outlines still work; only the preview falls back */
  }
}

/** Adds an uploaded font file and keeps it for later visits. Returns its family. */
export async function uploadFont(file: Pick<Blob, 'arrayBuffer'>): Promise<string> {
  const { bytes, info } = await readFontFile(new Uint8Array(await file.arrayBuffer()));
  const face: LocalFace = {
    family: info.family,
    weight: info.weight,
    style: info.style,
    source: 'uploaded',
    bytes,
  };
  add(face);
  await registerFace(face);
  const stored: StoredFace = {
    family: face.family,
    weight: face.weight,
    style: face.style,
    bytes: bytes.slice().buffer,
  };
  await withStore('readwrite', (s) => s.put(stored, faceKey(face)));
  return face.family;
}

/** Loads uploaded fonts saved on earlier visits. */
export async function restoreUploadedFonts(): Promise<void> {
  const rows = (await withStore('readonly', (s) => s.getAll() as IDBRequest<StoredFace[]>)) ?? [];
  for (const row of rows) {
    const face: LocalFace = { ...row, source: 'uploaded', bytes: new Uint8Array(row.bytes) };
    add(face);
    void registerFace(face);
  }
}

/** Forgets an uploaded family on this device. */
export async function removeUploadedFont(family: string): Promise<void> {
  const list = faces.get(familyKey(family)) ?? [];
  for (const face of list.filter((f) => f.source === 'uploaded')) {
    await withStore('readwrite', (s) => s.delete(faceKey(face)));
  }
  const rest = list.filter((f) => f.source !== 'uploaded');
  if (rest.length) faces.set(familyKey(family), rest);
  else faces.delete(familyKey(family));
}

/* ---------- system fonts ---------- */

type QueryLocalFonts = (options?: { postscriptNames?: string[] }) => Promise<SystemFontData[]>;
const queryLocalFonts = (): QueryLocalFonts | null =>
  typeof window !== 'undefined' && 'queryLocalFonts' in window
    ? (window as unknown as { queryLocalFonts: QueryLocalFonts }).queryLocalFonts.bind(window)
    : null;

export const systemFontsSupported = () => queryLocalFonts() !== null;

/** Whether the browser already granted font access, so system fonts can load without asking. */
export async function systemFontsGranted(): Promise<boolean> {
  if (!systemFontsSupported() || !navigator.permissions) return false;
  try {
    const status = await navigator.permissions.query({ name: 'local-fonts' as PermissionName });
    return status.state === 'granted';
  } catch {
    return false;
  }
}

/** Lists installed fonts (asks permission the first time). Returns the number of families. */
export async function loadSystemFonts(): Promise<number> {
  const query = queryLocalFonts();
  if (!query) return 0;
  const list = await query();
  const families = new Set<string>();
  for (const font of list) {
    const { weight, italic } = parseStyleName(font.style);
    families.add(familyKey(font.family));
    const existing = faces
      .get(familyKey(font.family))
      ?.find((f) => f.weight === weight && f.style === (italic ? 'italic' : 'normal'));
    if (existing?.source === 'uploaded') continue;
    add({ family: font.family, weight, style: italic ? 'italic' : 'normal', source: 'system', system: font });
  }
  return families.size;
}

const systemBytes = new Map<string, Promise<Uint8Array>>();

function systemFaceBytes(font: SystemFontData): Promise<Uint8Array> {
  let p = systemBytes.get(font.postscriptName);
  if (!p) {
    p = font
      .blob()
      .then(
        async (blob) =>
          (await readFontFile(new Uint8Array(await blob.arrayBuffer()), font.postscriptName)).bytes,
      );
    systemBytes.set(font.postscriptName, p);
    p.catch(() => systemBytes.delete(font.postscriptName));
  }
  return p;
}

/** Test hook: forget every local face. */
export function resetLocalFonts(): void {
  faces.clear();
  systemBytes.clear();
}
