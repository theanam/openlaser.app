/* Text to outlines: the paths CAM burns for a TextObject.
   textToPaths is pure (font in, PathData out); outlineText fetches and parses the face. */
import type { PathData, Segment, Vec2 } from '../geometry/types';
import type { TextObject } from '../project/types';
import { getFontBytes } from './loader';
import { loadOpentype } from './opentype';

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
};

export type TextLayoutSpec = Pick<TextObject, 'text' | 'fontSize' | 'align' | 'lineHeight' | 'letterSpacing'>;
export type TextOutline = { paths: PathData[]; width: number; height: number };
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
 * Lay out and outline a text block in object space (mm, Y-up). The block spans
 * (0,0)–(width,height): width is the widest line's advance, height is one line box
 * (ascender − descender) plus (lines − 1) line pitches, and the first line sits at the top.
 * Empty lines still advance; whitespace-only lines produce no glyphs and no width.
 */
export function textToPaths(spec: TextLayoutSpec, font: OtFont): TextOutline {
  const size = spec.fontSize;
  const scale = size / font.unitsPerEm;
  const pitch = spec.lineHeight * size;
  const opts: OtRenderOptions = { kerning: true, tracking: spec.letterSpacing || 0 };
  const lines = spec.text.split('\n');
  // opentype adds tracking after the last glyph too; the visible block ends at the last glyph's advance.
  const trailing = (opts.tracking! * size) / 1000;
  const widths = lines.map((l) => (l.trim() ? font.getAdvanceWidth(l, size, opts) - trailing : 0));
  const width = Math.max(0, ...widths);
  const ascent = font.ascender * scale;
  const height = (font.ascender - font.descender) * scale + (lines.length - 1) * pitch;
  // Y-down layout frame flipped so the block's top edge lands at y = height.
  const flip = (x: number, y: number): Vec2 => ({ x, y: height - y });

  const paths: PathData[] = [];
  lines.forEach((line, i) => {
    if (!line.trim()) return;
    const slack = width - widths[i];
    const x = spec.align === 'center' ? slack / 2 : spec.align === 'right' ? slack : 0;
    const baseline = ascent + i * pitch;
    paths.push(...commandsToPaths(font.getPath(line, x, baseline, size, opts).commands, flip));
  });
  return { paths, width, height };
}

const parsed = new Map<string, Promise<OtFont | null>>();

/** Drops parsed faces of a family, so the next outline reads its current source (an upload, say). */
export function forgetParsedFamily(family: string): void {
  for (const key of parsed.keys())
    if (key.split('|')[0]!.toLowerCase() === family.toLowerCase()) parsed.delete(key);
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

/** Outline a text object with its face. Null when the face cannot be loaded (offline, unknown family). */
export async function outlineText(obj: OutlineTextInput): Promise<TextOutline | null> {
  const font = await parsedFont(obj.fontFamily, obj.fontWeight, obj.italic);
  return font ? textToPaths(obj, font) : null;
}
