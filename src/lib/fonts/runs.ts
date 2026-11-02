/* Splitting a line of text into runs: latin for the primary face (opentype.js, as before), other
   scripts for a HarfBuzz shaper whose face has them. Spaces and joiners stay with their run. */
import { isNeutral, subsetFor } from './scripts';
import type { Shaper } from './shaping';

/** `shaper` null: the primary face draws the run. */
export type Run = { text: string; shaper: Shaper | null };

export function splitRuns(
  line: string,
  shapers: readonly Shaper[],
  primaryHas: (cp: number) => boolean,
): Run[] {
  const runs: Run[] = [];
  for (const char of line) {
    const cp = char.codePointAt(0)!;
    const last = runs.at(-1);
    if (isNeutral(cp) && last) {
      last.text += char;
      continue;
    }
    let target: Shaper | null = null;
    // Latin goes to the primary face; any other script is shaped, falling back to an unshaped
    // primary glyph only when no shaper has it.
    if (subsetFor(cp) !== null && !isNeutral(cp)) {
      target = shapers.find((s) => s.has(cp)) ?? null;
      if (!target && !primaryHas(cp)) target = shapers[0] ?? null;
    }
    if (last && last.shaper === target) last.text += char;
    else runs.push({ text: char, shaper: target });
  }
  return runs;
}

/** Visible characters neither the primary face nor any shaper can draw, once each. */
export function missingChars(
  text: string,
  shapers: readonly Shaper[],
  primaryHas: (cp: number) => boolean,
): string[] {
  const out = new Set<string>();
  for (const char of text) {
    const cp = char.codePointAt(0)!;
    if (/\s/.test(char) || isNeutral(cp)) continue;
    if (!primaryHas(cp) && !shapers.some((s) => s.has(cp))) out.add(char);
  }
  return [...out];
}
