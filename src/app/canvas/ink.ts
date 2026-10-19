/**
 * Layer colors are the user's (or the imported file's), and some vanish on the bed: black lines
 * on the dark theme, white or pale yellow on the light one. Strokes are drawn with an ink nudged
 * toward the bed's opposite until it reads, leaving the layer's own color untouched.
 */
type Rgb = [number, number, number];

/** WCAG AA contrast: thin 1–2 px lines need more than the 3:1 non-text minimum to read clearly. */
export const MIN_CONTRAST = 4.5;

function parseHex(color: string): Rgb | null {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(color.trim());
  if (!m) return null;
  const hex = m[1]!.length === 3 ? [...m[1]!].map((c) => c + c).join('') : m[1]!;
  const n = parseInt(hex, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function luminance([r, g, b]: Rgb): number {
  const ch = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(b);
}

export function contrast(a: Rgb, b: Rgb): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

const toHex = (c: Rgb) => `#${c.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`;
const cache = new Map<string, string>();

/** `color` when it reads on `bed`, else the nearest mix toward white (dark bed) or black (light bed) that does. */
export function inkOn(color: string, bed: string): string {
  const key = `${color}|${bed}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const c = parseHex(color);
  const b = parseHex(bed);
  let ink = color;
  if (c && b && contrast(c, b) < MIN_CONTRAST) {
    const target = luminance(b) < 0.5 ? 255 : 0;
    for (let t = 0.1; t <= 1.0001; t += 0.1) {
      const mixed = c.map((v) => v + (target - v) * t) as Rgb;
      ink = toHex(mixed);
      if (contrast(mixed, b) >= MIN_CONTRAST) break;
    }
  }
  if (cache.size > 512) cache.clear();
  cache.set(key, ink);
  return ink;
}
