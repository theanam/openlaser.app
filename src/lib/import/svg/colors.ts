import { NAMED_COLORS } from './named-colors';

const hex2 = (n: number): string =>
  Math.round(Math.min(255, Math.max(0, n)))
    .toString(16)
    .padStart(2, '0');

const toHex = (r: number, g: number, b: number): string => `#${hex2(r)}${hex2(g)}${hex2(b)}`;

/** Parses a channel value: a number 0..255 or a percentage. */
function channel(token: string): number {
  return token.endsWith('%') ? (parseFloat(token) * 255) / 100 : parseFloat(token);
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const hue = (((h % 360) + 360) % 360) / 360;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + hue * 12) % 12;
    return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
  };
  return [f(0) * 255, f(8) * 255, f(4) * 255];
}

/**
 * Normalizes a CSS color to lowercase `#rrggbb`, ignoring alpha (layers are keyed by hue only).
 * Supports hex (3, 4, 6, 8 digits), rgb()/rgba(), hsl()/hsla() and named colors.
 * Returns null for anything else (including `none`, `currentColor`, `url(...)`).
 */
export function parseColor(value: string): string | null {
  const v = value.trim().toLowerCase();
  if (v.startsWith('#')) {
    const digits = v.slice(1);
    if (!/^[0-9a-f]+$/.test(digits)) return null;
    if (digits.length === 3 || digits.length === 4) {
      return `#${digits[0]}${digits[0]}${digits[1]}${digits[1]}${digits[2]}${digits[2]}`;
    }
    if (digits.length === 6 || digits.length === 8) return `#${digits.slice(0, 6)}`;
    return null;
  }
  const fn = /^(rgba?|hsla?)\(([^)]*)\)$/.exec(v);
  if (fn) {
    const parts = fn[2].split(/[\s,/]+/).filter(Boolean);
    if (parts.length < 3 || parts.slice(0, 3).some((p) => Number.isNaN(parseFloat(p)))) return null;
    if (fn[1].startsWith('rgb')) return toHex(channel(parts[0]), channel(parts[1]), channel(parts[2]));
    const [r, g, b] = hslToRgb(parseFloat(parts[0]), parseFloat(parts[1]) / 100, parseFloat(parts[2]) / 100);
    return toHex(r, g, b);
  }
  return NAMED_COLORS.get(v) ?? null;
}
