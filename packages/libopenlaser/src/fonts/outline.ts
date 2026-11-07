/* Text to outlines: the paths CAM burns for a TextObject.
   textToPaths is pure (font in, PathData out); outlineText fetches and parses the face. */
import { union } from '../geometry';
import { flattenPath } from '../geometry';
import { signedArea } from '../geometry';
import type { PathData, Segment, Vec2 } from '../geometry';
import type { TextObject } from '../project';
import { findFont, loadCatalog } from './catalog';
import { getFontBytes } from './loader';
import { hasLocalFamily } from './local';
import { codePointsIn, FALLBACK_FAMILIES, subsetsFor } from './scripts';
import { createShaper, type Shaper } from './shaping';
import { loadOpentype } from './opentype';
import { missingChars, splitRuns, type Run } from './runs';

/** The slice of opentype.js's Font this module uses (opentype.js ships no type declarations). */
export type OtCommand =
  | { type: 'M' | 'L'; x: number; y: number }
  | { type: 'C'; x1: number; y1: number; x2: number; y2: number; x: number; y: number }
  | { type: 'Q'; x1: number; y1: number; x: number; y: number }
  | { type: 'Z' };
export type OtRenderOptions = { kerning?: boolean; tracking?: number };
export type OtFont = {
  unitsPerEm: number;
  /** hhea ascender, font units (positive). */
  ascender: number;
  /** hhea descender, font units (negative). */
  descender: number;
  getPath(
    text: string,
    x: number,
    y: number,
    fontSize: number,
    options?: OtRenderOptions,
  ): { commands: OtCommand[] };
  getAdvanceWidth(text: string, fontSize: number, options?: OtRenderOptions): number;
  /** Glyph index of a character; 0 when the font has no glyph for it. */
  charToGlyphIndex?(char: string): number;
  /** One path per glyph, laid out as getPath would. */
  getPaths(
    text: string,
    x: number,
    y: number,
    fontSize: number,
    options?: OtRenderOptions,
  ): Array<{ commands: OtCommand[] }>;
};

export type TextLayoutSpec = Pick<TextObject, 'text' | 'fontSize' | 'align' | 'lineHeight' | 'letterSpacing'>;
export type TextOutline = {
  paths: PathData[];
  width: number;
  height: number;
  /** Characters the font has no glyph for, once each; set only when there are some. */
  missing?: string[];
};
export type OutlineTextInput = Pick<
  TextObject,
  'text' | 'fontFamily' | 'fontSize' | 'fontWeight' | 'italic' | 'align' | 'lineHeight' | 'letterSpacing'
>;

const same = (a: Vec2, b: Vec2) => Math.abs(a.x - b.x) < 1e-9 && Math.abs(a.y - b.y) < 1e-9;

/**
 * opentype commands (Y-down) to closed PathData, mapping each point through `map`. Quadratics
 * become exact cubics (controls 2/3 of the way to the quad control). Glyph contours are always
 * closed, but TrueType glyphs may omit the final Z or the closing point, so every contour is
 * closed explicitly with a segment back to its start.
 */
function commandsToPaths(commands: readonly OtCommand[], map: (x: number, y: number) => Vec2): PathData[] {
  const out: PathData[] = [];
  let start: Vec2 | null = null;
  let cur: Vec2 = { x: 0, y: 0 };
  let segs: Segment[] = [];
  const finish = () => {
    if (start && segs.length) {
      if (!same(cur, start)) segs.push({ type: 'L', to: start });
      out.push({ closed: true, start, segments: segs });
    }
    start = null;
    segs = [];
  };
  for (const c of commands) {
    if (c.type === 'Z') {
      finish();
      continue;
    }
    if (c.type === 'M') {
      finish();
      start = cur = map(c.x, c.y);
      continue;
    }
    if (!start) start = cur;
    const to = map(c.x, c.y);
    if (c.type === 'L') {
      if (!same(cur, to)) segs.push({ type: 'L', to });
    } else if (c.type === 'C') {
      segs.push({ type: 'C', c1: map(c.x1, c.y1), c2: map(c.x2, c.y2), to });
    } else if (c.type === 'Q') {
      const q = map(c.x1, c.y1);
      segs.push({
        type: 'C',
        c1: { x: cur.x + (2 / 3) * (q.x - cur.x), y: cur.y + (2 / 3) * (q.y - cur.y) },
        c2: { x: to.x + (2 / 3) * (q.x - to.x), y: to.y + (2 / 3) * (q.y - to.y) },
        to,
      });
    }
    cur = to;
  }
  finish();
  return out;
}

/**
 * Bumped when outlines change shape for the same text and font, so saved text is re-outlined
 * once on open. 2: overlapping glyph contours merged. 3: other scripts shaped with HarfBuzz. 4: overlaps between glyphs merged.
 */
export const TEXT_OUTLINE_VERSION = 4;

/** Flattening tolerance for merged glyphs, mm: far below a laser spot. */
const GLYPH_TOLERANCE = 0.005;

/**
 * Fonts fill glyphs by the non-zero rule, so contours may overlap: the bar of a "t" crosses its
 * stem. Burned even-odd, an overlap would be a hole, and cut as lines it would add strokes inside
 * the letter. Glyphs with overlaps are merged into clean outlines; the rest keep their curves.
 */
function solidGlyph(paths: PathData[]): PathData[] {
  if (paths.length < 2) return paths;
  const rings = paths.map((p) => flattenPath(p, undefined, GLYPH_TOLERANCE).points);
  const merged = union(rings, 'nonzero');
  const areas = (list: Vec2[][]) => list.map((r) => Math.abs(signedArea(r))).sort((a, b) => a - b);
  const before = areas(rings);
  const after = areas(merged);
  const unchanged =
    before.length === after.length &&
    before.every((a, i) => Math.abs(a - after[i]!) <= Math.max(1e-6, a * 1e-3));
  if (unchanged) return paths;
  return merged
    .filter((r) => r.length >= 3)
    .map((ring) => ({
      closed: true,
      start: ring[0]!,
      segments: ring.slice(1).map((to) => ({ type: 'L' as const, to })),
    }));
}

function pathBox(paths: PathData[]): { x0: number; y0: number; x1: number; y1: number } | null {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const p of paths) {
    for (const s of [{ type: 'L' as const, to: p.start }, ...p.segments]) {
      for (const pt of s.type === 'C' ? [s.c1, s.c2, s.to] : [s.to]) {
        x0 = Math.min(x0, pt.x);
        y0 = Math.min(y0, pt.y);
        x1 = Math.max(x1, pt.x);
        y1 = Math.max(y1, pt.y);
      }
    }
  }
  return x0 === Infinity ? null : { x0, y0, x1, y1 };
}

/**
 * Glyphs overlap each other too: Bangla vowel signs reach into their consonant, letters join on
 * the headline, cursive Latin letters run into the next. Glyphs whose boxes touch are grouped and
 * merged like the contours of one glyph; a group without a real overlap keeps its curves, so
 * ordinary text comes out exactly as before.
 */
function mergeTouching(glyphs: PathData[][]): PathData[] {
  const boxes = glyphs.map(pathBox);
  const group = glyphs.map((_, i) => i);
  const root = (i: number): number => (group[i] === i ? i : (group[i] = root(group[i]!)));
  const EPS = 1e-6;
  for (let i = 0; i < glyphs.length; i++) {
    const a = boxes[i];
    if (!a) continue;
    for (let j = i + 1; j < glyphs.length; j++) {
      const b = boxes[j];
      if (b && a.x0 <= b.x1 + EPS && b.x0 <= a.x1 + EPS && a.y0 <= b.y1 + EPS && b.y0 <= a.y1 + EPS)
        group[root(j)] = root(i);
    }
  }
  const groups = new Map<number, PathData[][]>();
  glyphs.forEach((g, i) => groups.set(root(i), [...(groups.get(root(i)) ?? []), g]));
  const merged = new Map<number, PathData[]>();
  for (const [r, members] of groups) {
    if (members.length < 2) continue;
    const flat = members.flat();
    const solid = solidGlyph(flat);
    if (solid !== flat) merged.set(r, solid);
  }
  // Glyph order as laid out; a merged group goes where its first glyph was.
  const out: PathData[] = [];
  glyphs.forEach((g, i) => {
    const m = merged.get(root(i));
    if (!m) out.push(...g);
    else if (groups.get(root(i))![0] === g) out.push(...m);
  });
  return out;
}

/**
 * Lay out and outline a text block in object space (mm, Y-up). The block spans
 * (0,0)–(width,height): width is the widest line's advance, height is one line box
 * (ascender − descender) plus (lines − 1) line pitches, and the first line sits at the top.
 * Empty lines still advance; whitespace-only lines produce no glyphs and no width.
 */
export function textToPaths(
  spec: TextLayoutSpec,
  font: OtFont,
  shapers: readonly Shaper[] = [],
): TextOutline {
  const size = spec.fontSize;
  const scale = size / font.unitsPerEm;
  const pitch = spec.lineHeight * size;
  const tracking = spec.letterSpacing || 0;
  const opts: OtRenderOptions = { kerning: true, tracking };
  const lines = spec.text.split('\n');
  // Without a glyph lookup (test fakes), the face is taken to have everything.
  const has = (cp: number) => !font.charToGlyphIndex || font.charToGlyphIndex(String.fromCodePoint(cp)) !== 0;
  const runs = lines.map((l) => splitRuns(l, shapers, has));
  // opentype adds tracking after the last glyph too; the visible block ends at the last glyph's advance.
  const trailing = (tracking * size) / 1000;
  const advance = (run: Run) =>
    run.shaper
      ? run.shaper.shape(run.text, 0, 0, size, tracking).advance
      : font.getAdvanceWidth(run.text, size, opts);
  const widths = lines.map((l, i) => (l.trim() ? runs[i].reduce((w, r) => w + advance(r), 0) - trailing : 0));
  const width = Math.max(0, ...widths);
  const ascent = font.ascender * scale;
  const height = (font.ascender - font.descender) * scale + (lines.length - 1) * pitch;
  // Y-down layout frame flipped so the block's top edge lands at y = height.
  const flip = (x: number, y: number): Vec2 => ({ x, y: height - y });

  const paths: PathData[] = [];
  lines.forEach((line, i) => {
    if (!line.trim()) return;
    const slack = width - widths[i];
    let x = spec.align === 'center' ? slack / 2 : spec.align === 'right' ? slack : 0;
    const baseline = ascent + i * pitch;
    const linePaths: PathData[][] = [];
    for (const run of runs[i]) {
      const glyphs = run.shaper
        ? run.shaper.shape(run.text, x, baseline, size, tracking).glyphs
        : font.getPaths(run.text, x, baseline, size, opts);
      for (const glyph of glyphs) linePaths.push(solidGlyph(commandsToPaths(glyph.commands, flip)));
      x += advance(run);
    }
    paths.push(...mergeTouching(linePaths));
  });
  const missing = missingChars(spec.text, shapers, has);
  return missing.length ? { paths, width, height, missing } : { paths, width, height };
}

const parsed = new Map<string, Promise<OtFont | null>>();
const shapers = new Map<string, Promise<Shaper | null>>();

/** Drops parsed faces of a family, so the next outline reads its current source (an upload, say). */
export function forgetParsedFamily(family: string): void {
  for (const cache of [parsed, shapers] as Map<string, unknown>[])
    for (const key of cache.keys())
      if (key.split('|')[0]!.toLowerCase() === family.toLowerCase()) cache.delete(key);
}

function parsedFont(family: string, weight: number, italic: boolean): Promise<OtFont | null> {
  const key = `${family}|${weight}|${italic}`;
  let p = parsed.get(key);
  if (!p) {
    p = (async () => {
      // The loader snaps the weight and drops italic for families without italics.
      const bytes = await getFontBytes({ family, weight, style: italic ? 'italic' : 'normal' });
      if (!bytes) return null;
      try {
        const ot = await loadOpentype();
        return ot.parse(bytes.slice().buffer);
      } catch {
        return null;
      }
    })();
    parsed.set(key, p);
    // Forget misses so a later call can succeed once the face is reachable.
    void p.then((f) => {
      if (!f) parsed.delete(key);
    });
  }
  return p;
}

/** A HarfBuzz shaper over one subset of a face (all of it for uploaded and system fonts). */
function subsetShaper(
  family: string,
  weight: number,
  italic: boolean,
  subset: string,
): Promise<Shaper | null> {
  const key = `${family}|${weight}|${italic}|${subset}`;
  let p = shapers.get(key);
  if (!p) {
    p = (async () => {
      const bytes = await getFontBytes({ family, weight, style: italic ? 'italic' : 'normal', subset });
      return bytes ? createShaper(bytes) : null;
    })();
    shapers.set(key, p);
    void p.then((s) => {
      if (!s) shapers.delete(key);
    });
  }
  return p;
}

/**
 * Shapers for the scripts in `text`: the chosen font's own subset files (or the whole file for
 * uploaded and system fonts), then, for letters the chosen font cannot draw, the script's Noto
 * fallback at the nearest weight, as other apps fall back.
 */
async function shapersFor(obj: OutlineTextInput): Promise<Shaper[]> {
  const local = hasLocalFamily(obj.fontFamily);
  const entry = local ? undefined : findFont(await loadCatalog(), obj.fontFamily);
  const available = local ? undefined : (entry?.subsets ?? []);
  const needed = subsetsFor(obj.text, available);
  if (!needed.length) return [];
  const load = (family: string, subset: string) => subsetShaper(family, obj.fontWeight, obj.italic, subset);
  const own = local ? ['all'] : needed.filter((s) => available?.includes(s));
  const chosen = (await Promise.all(own.map((s) => load(obj.fontFamily, s)))).filter((s): s is Shaper => !!s);
  const lacking = needed.filter((subset) => {
    const family = FALLBACK_FAMILIES[subset];
    if (!family || family.toLowerCase() === obj.fontFamily.toLowerCase()) return false;
    return codePointsIn(obj.text, subset, available).some((cp) => !chosen.some((s) => s.has(cp)));
  });
  const fallbacks = await Promise.all(lacking.map((s) => load(FALLBACK_FAMILIES[s]!, s)));
  return [...chosen, ...fallbacks.filter((s): s is Shaper => !!s)];
}

/** Outline a text object with its face. Null when the face cannot be loaded (offline, unknown family). */
export async function outlineText(obj: OutlineTextInput): Promise<TextOutline | null> {
  const [font, extra] = await Promise.all([
    parsedFont(obj.fontFamily, obj.fontWeight, obj.italic),
    shapersFor(obj),
  ]);
  return font ? textToPaths(obj, font, extra) : null;
}
