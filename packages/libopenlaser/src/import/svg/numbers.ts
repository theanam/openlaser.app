const NUMBER = /[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/g;

/** All numbers in a list such as `points`, `viewBox` or transform arguments. */
export function parseNumberList(text: string | null): number[] {
  if (!text) return [];
  return Array.from(text.matchAll(NUMBER), (m) => parseFloat(m[0]));
}

/** A plain numeric attribute in user units (unit suffixes other than px are not supported here). */
export function numberAttr(el: Element, name: string, fallback = 0): number {
  const value = parseFloat(el.getAttribute(name) ?? '');
  return Number.isFinite(value) ? value : fallback;
}
