/* Complex-script shaping with HarfBuzz (harfbuzzjs, MIT): Bangla vowel signs that sit before or
   around their consonant, conjuncts, reph, and the like, which opentype.js cannot place. The
   WASM module loads on first use. Glyph outlines come from HarfBuzz too, as opentype-style
   commands, so outline.ts turns them into paths the same way as Latin glyphs. */
import type { OtCommand } from './outline';

type HarfBuzz = typeof import('harfbuzzjs');

let hbModule: Promise<HarfBuzz> | null = null;

/** Loads HarfBuzz once. Null when the WASM cannot load (offline before it was cached). */
export function loadHarfBuzz(): Promise<HarfBuzz | null> {
  hbModule ??= import('harfbuzzjs');
  return hbModule.catch(() => {
    hbModule = null;
    return null;
  });
}

/** Glyphs of one shaped run, positioned like opentype's getPaths: x from `x`, Y-down, baseline at `y`. */
export interface ShapedRun {
  glyphs: Array<{ commands: OtCommand[] }>;
  /** mm, including letter spacing after each cluster. */
  advance: number;
}

export interface Shaper {
  /** The font has a glyph for this code point. */
  has(cp: number): boolean;
  /**
   * Shapes `text` at `fontSize` mm. `tracking` is letter spacing in 1/1000 em, added after each
   * cluster (a consonant with its vowel signs counts as one), as opentype.js adds it per glyph.
   */
  shape(text: string, x: number, y: number, fontSize: number, tracking: number): ShapedRun;
}

/** A shaper over one face. Null when HarfBuzz or the face cannot load. */
export async function createShaper(bytes: Uint8Array): Promise<Shaper | null> {
  const hb = await loadHarfBuzz();
  if (!hb) return null;
  try {
    const blob = new hb.Blob(bytes.slice().buffer);
    const face = new hb.Face(blob, 0);
    const font = new hb.Font(face);
    const upem = face.upem;
    return {
      has: (cp) => (font.nominalGlyph(cp) ?? 0) > 0,
      shape(text, x, y, fontSize, tracking) {
        const buffer = new hb.Buffer();
        buffer.addText(text);
        buffer.guessSegmentProperties();
        hb.shape(font, buffer);
        const infos = buffer.getGlyphInfos();
        const positions = buffer.getGlyphPositions();
        const scale = fontSize / upem;
        const spacing = (tracking * fontSize) / 1000;
        const glyphs: ShapedRun['glyphs'] = [];
        let pen = x;
        infos.forEach((info, i) => {
          const p = positions[i];
          const ox = pen + p.xOffset * scale;
          const oy = y - p.yOffset * scale;
          glyphs.push({ commands: toCommands(font.glyphToJson(info.codepoint), ox, oy, scale) });
          pen += p.xAdvance * scale;
          // Spacing goes between clusters, never between a consonant and its own marks.
          if (infos[i + 1]?.cluster !== info.cluster) pen += spacing;
        });
        return { glyphs, advance: pen - x };
      },
    };
  } catch {
    return null;
  }
}

/** HarfBuzz path commands (font units, Y-up) to opentype commands in mm, Y-down, at (ox, oy). */
function toCommands(
  path: Array<{ type: string; values: number[] }>,
  ox: number,
  oy: number,
  scale: number,
): OtCommand[] {
  const X = (v: number) => ox + v * scale;
  const Y = (v: number) => oy - v * scale;
  const out: OtCommand[] = [];
  for (const { type, values: v } of path) {
    if (type === 'M' || type === 'L') out.push({ type, x: X(v[0]), y: Y(v[1]) });
    else if (type === 'Q') out.push({ type, x1: X(v[0]), y1: Y(v[1]), x: X(v[2]), y: Y(v[3]) });
    else if (type === 'C')
      out.push({ type, x1: X(v[0]), y1: Y(v[1]), x2: X(v[2]), y2: Y(v[3]), x: X(v[4]), y: Y(v[5]) });
    else if (type === 'Z') out.push({ type: 'Z' });
  }
  return out;
}
