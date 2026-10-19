/** Compound selector: optional tag, optional id, any number of classes (e.g. `path.cls-1`). */
interface Selector {
  tag: string | null;
  id: string | null;
  classes: string[];
}

export interface CssRule {
  selector: Selector;
  specificity: number;
  /** Source order, for ties in specificity. */
  order: number;
  declarations: Map<string, string>;
}

const COMPOUND = /^(\*|[a-zA-Z][\w-]*)?((?:[#.][\w-]+)*)$/;

/**
 * Parses `property: value; …` (as in a `style` attribute). Property names are lowercased;
 * `!important` is dropped (it only matters inside the cascade, which we flatten).
 */
export function parseDeclarations(text: string | null): Map<string, string> {
  const out = new Map<string, string>();
  if (!text) return out;
  for (const part of text.split(';')) {
    const colon = part.indexOf(':');
    if (colon < 0) continue;
    const name = part.slice(0, colon).trim().toLowerCase();
    const value = part
      .slice(colon + 1)
      .replace(/!important/i, '')
      .trim();
    if (name && value) out.set(name, value);
  }
  return out;
}

/**
 * A deliberately small CSS parser for `<style>` elements as exported by Illustrator, Inkscape and
 * Figma: rule sets with selector lists of compound selectors (`.cls-1`, `#id`, `path.a.b`).
 * Combinators, pseudo-classes and at-rules are skipped.
 */
export function parseStylesheet(text: string, firstOrder = 0): CssRule[] {
  const css = text.replace(/\/\*[\s\S]*?\*\//g, '');
  const rules: CssRule[] = [];
  let order = firstOrder;
  let pos = 0;
  while (pos < css.length) {
    const open = css.indexOf('{', pos);
    if (open < 0) break;
    const prelude = css.slice(pos, open).trim();
    if (prelude.startsWith('@')) {
      pos = skipBlock(css, open);
      continue;
    }
    const close = css.indexOf('}', open);
    if (close < 0) break;
    const declarations = parseDeclarations(css.slice(open + 1, close));
    for (const text of prelude.split(',')) {
      const selector = parseSelector(text.trim());
      if (!selector) continue;
      const specificity = (selector.id ? 100 : 0) + selector.classes.length * 10 + (selector.tag ? 1 : 0);
      rules.push({ selector, specificity, order: order++, declarations });
    }
    pos = close + 1;
  }
  return rules;
}

function skipBlock(css: string, open: number): number {
  let depth = 0;
  for (let i = open; i < css.length; i++) {
    if (css[i] === '{') depth++;
    else if (css[i] === '}' && --depth === 0) return i + 1;
  }
  return css.length;
}

function parseSelector(text: string): Selector | null {
  const match = COMPOUND.exec(text);
  if (!match || text === '') return null;
  const selector: Selector = { tag: match[1] && match[1] !== '*' ? match[1] : null, id: null, classes: [] };
  for (const part of match[2].match(/[#.][\w-]+/g) ?? []) {
    if (part[0] === '#') selector.id = part.slice(1);
    else selector.classes.push(part.slice(1));
  }
  return selector;
}

export function selectorMatches(selector: Selector, el: Element): boolean {
  if (selector.tag && selector.tag !== el.localName) return false;
  if (selector.id && selector.id !== el.getAttribute('id')) return false;
  if (selector.classes.length === 0) return true;
  const classes = (el.getAttribute('class') ?? '').split(/\s+/);
  return selector.classes.every((c) => classes.includes(c));
}
