import type { Vec3 } from '../types';

/** Fixed precision with trailing zeros stripped: 12.5 → "12.5", 3 → "3", -0.0001 → "0". */
export function formatNumber(value: number, decimals = 3): string {
  const fixed = value.toFixed(decimals);
  const trimmed = fixed.includes('.') ? fixed.replace(/0+$/, '').replace(/\.$/, '') : fixed;
  return trimmed === '-0' ? '0' : trimmed;
}

/** `$J=G91 G21 X.. Y.. F..` for an incremental jog; axes that are absent or zero are omitted. */
export function buildJogCommand(delta: Partial<Vec3>, feed: number): string {
  const words: string[] = [];
  for (const axis of ['x', 'y', 'z'] as const) {
    const value = delta[axis];
    if (value !== undefined && value !== 0) words.push(`${axis.toUpperCase()}${formatNumber(value)}`);
  }
  if (words.length === 0) throw new RangeError('Jog needs at least one non-zero axis');
  if (!(feed > 0)) throw new RangeError('Jog feed must be positive');
  return `$J=G91 G21 ${words.join(' ')} F${formatNumber(feed, 0)}`;
}

/** Uppercased, comments and whitespace removed: the form GRBL actually parses. */
export function normalizeGcodeLine(line: string): string {
  return line
    .replace(/\([^)]*\)/g, '')
    .replace(/;.*$/, '')
    .replace(/\s+/g, '')
    .toUpperCase();
}
