/** Pure helpers behind NumberField, kept separate for tests. */

export function clamp(value: number, min = -Infinity, max = Infinity): number {
  return Math.min(max, Math.max(min, value));
}

export function roundTo(value: number, decimals: number): number {
  const f = 10 ** decimals;
  return Math.round(value * f) / f;
}

export function formatNumber(value: number, decimals: number): string {
  if (!Number.isFinite(value)) return '';
  return roundTo(value, decimals).toFixed(decimals);
}

/** Parses user input. Accepts a comma decimal separator and simple arithmetic (`10+2.5`, `100/3`). */
export function parseNumberInput(text: string): number | null {
  const cleaned = text.trim().replace(/,/g, '.');
  if (cleaned === '') return null;
  if (!/^[-+*/().\d\s]+$/.test(cleaned)) return null;
  const tokens = cleaned.match(/\d*\.?\d+|[-+*/()]/g);
  if (!tokens) return null;
  let pos = 0;
  const peek = () => tokens[pos];
  const take = () => tokens[pos++];
  function expr(): number {
    let v = term();
    while (peek() === '+' || peek() === '-') v = take() === '+' ? v + term() : v - term();
    return v;
  }
  function term(): number {
    let v = factor();
    while (peek() === '*' || peek() === '/') v = take() === '*' ? v * factor() : v / factor();
    return v;
  }
  function factor(): number {
    const t = take();
    if (t === '-') return -factor();
    if (t === '+') return factor();
    if (t === '(') {
      const v = expr();
      if (take() !== ')') return NaN;
      return v;
    }
    return t === undefined ? NaN : Number(t);
  }
  const value = expr();
  return pos === tokens.length && Number.isFinite(value) ? value : null;
}

/** Value change for a label scrub of `dx` pixels. Shift = ×10, Alt = ×0.1. */
export function scrubDelta(
  dx: number,
  step: number,
  modifiers: { shift?: boolean; alt?: boolean } = {},
): number {
  const factor = modifiers.shift ? 10 : modifiers.alt ? 0.1 : 1;
  return Math.round(dx / 2) * step * factor;
}

/** One stepper or arrow-key step: Shift = ×10, Alt = ×0.1, clamped and rounded to the field's precision. */
export function stepValue(
  value: number,
  step: number,
  direction: 1 | -1,
  options: { shift?: boolean; alt?: boolean; min?: number; max?: number; decimals?: number } = {},
): number {
  const factor = options.shift ? 10 : options.alt ? 0.1 : 1;
  const next = clamp(value + direction * step * factor, options.min, options.max);
  return roundTo(next, options.decimals ?? 0);
}
