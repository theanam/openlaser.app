/** Number formatting for G-code words (SPEC §6.5). */

/** mm coordinates: 3 decimals, trailing zeros stripped, `-0` normalised to `0`. */
export function formatCoordinate(value: number, leadingZero = true): string {
  let text = value.toFixed(3);
  if (text.includes('.')) text = text.replace(/0+$/, '').replace(/\.$/, '');
  if (text === '-0') text = '0';
  if (!leadingZero) text = text.replace(/^(-?)0\./, '$1.');
  return text;
}

/** S and F words are whole numbers. */
export function formatInteger(value: number): string {
  const rounded = Math.round(value);
  return rounded === 0 ? '0' : String(rounded);
}

/** Laser power percent to the controller's S range: round(percent / 100 × maxS), clamped to 0–100%. */
export function powerToS(percent: number, maxS: number): number {
  const clamped = Math.min(100, Math.max(0, percent));
  return Math.round((clamped / 100) * maxS);
}

/** User header/footer text to G-code lines: trimmed, blank lines dropped. */
export function userLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
}
