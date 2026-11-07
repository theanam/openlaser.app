import { parseColor } from './colors';
import { type CssRule, parseDeclarations, selectorMatches } from './css';

/** A resolved paint. `source` records where a solid color came from, for the import summary. */
export type Paint =
  { kind: 'none' } | { kind: 'color'; color: string; source: 'solid' | 'gradient' | 'pattern' };

/** Inherited style state passed down the tree. */
export interface InheritedStyle {
  fill: Paint;
  stroke: Paint;
  /** For `currentColor`. */
  color: string;
  fillOpacity: number;
  strokeOpacity: number;
  hidden: boolean;
}

/** Style of one element: the inherited state plus non-inherited properties that affect import. */
export interface ElementStyle extends InheritedStyle {
  /** `display: none` or `opacity: 0`: the element and its subtree are not rendered. */
  notRendered: boolean;
  clipPath: boolean;
  mask: boolean;
  filter: boolean;
}

export interface StyleContext {
  rules: CssRule[];
  ids: Map<string, Element>;
}

/** SVG initial values: black fill, no stroke. */
export const ROOT_STYLE: InheritedStyle = {
  fill: { kind: 'color', color: '#000000', source: 'solid' },
  stroke: { kind: 'none' },
  color: '#000000',
  fillOpacity: 1,
  strokeOpacity: 1,
  hidden: false,
};

const PRESENTATION_PROPERTIES = [
  'fill',
  'stroke',
  'color',
  'fill-opacity',
  'stroke-opacity',
  'opacity',
  'display',
  'visibility',
  'clip-path',
  'mask',
  'filter',
  'stop-color',
];

const NONE: Paint = { kind: 'none' };
const BLACK = '#000000';

/**
 * The cascade, flattened: presentation attributes, then stylesheet rules by specificity and
 * source order, then the `style` attribute.
 */
export function declaredProperties(el: Element, context: StyleContext): Map<string, string> {
  const declared = new Map<string, string>();
  for (const name of PRESENTATION_PROPERTIES) {
    const value = el.getAttribute(name);
    if (value !== null && value.trim() !== '') declared.set(name, value.trim());
  }
  const matching = context.rules
    .filter((rule) => selectorMatches(rule.selector, el))
    .sort((a, b) => a.specificity - b.specificity || a.order - b.order);
  for (const rule of matching) for (const [k, v] of rule.declarations) declared.set(k, v);
  for (const [k, v] of parseDeclarations(el.getAttribute('style'))) declared.set(k, v);
  return declared;
}

export function resolveStyle(el: Element, parent: InheritedStyle, context: StyleContext): ElementStyle {
  const declared = declaredProperties(el, context);
  const colorValue = declared.get('color');
  const color = (colorValue && parseColor(colorValue)) || parent.color;
  const fillOpacity = opacityValue(declared.get('fill-opacity'), parent.fillOpacity);
  const strokeOpacity = opacityValue(declared.get('stroke-opacity'), parent.strokeOpacity);
  const visibility = declared.get('visibility');
  const hidden =
    visibility === undefined || visibility === 'inherit' ? parent.hidden : visibility !== 'visible';
  const fill = resolvePaint(declared.get('fill'), color, parent.fill, context);
  const stroke = resolvePaint(declared.get('stroke'), color, parent.stroke, context);
  const isSet = (name: string) => {
    const value = declared.get(name);
    return value !== undefined && value !== 'none';
  };
  return {
    fill,
    stroke,
    color,
    fillOpacity,
    strokeOpacity,
    hidden,
    notRendered: declared.get('display') === 'none' || opacityValue(declared.get('opacity'), 1) <= 0,
    clipPath: isSet('clip-path'),
    mask: isSet('mask'),
    filter: isSet('filter'),
  };
}

/** Paints that actually show. Fully transparent paint burns nothing, so it counts as `none`. */
export function visiblePaints(style: InheritedStyle): { fill: Paint; stroke: Paint } {
  return {
    fill: style.fillOpacity <= 0 ? NONE : style.fill,
    stroke: style.strokeOpacity <= 0 ? NONE : style.stroke,
  };
}

function opacityValue(value: string | undefined, inherited: number): number {
  if (value === undefined || value === 'inherit') return inherited;
  const n = value.endsWith('%') ? parseFloat(value) / 100 : parseFloat(value);
  return Number.isFinite(n) ? n : inherited;
}

/**
 * Paint values: `none`, `transparent`, `inherit`, `currentColor`, a color, or `url(#id) [fallback]`.
 * Gradients become their first stop's color; patterns use the fallback color or black. Invalid
 * values are ignored like any invalid CSS declaration (the inherited paint stays).
 */
function resolvePaint(
  value: string | undefined,
  currentColor: string,
  inherited: Paint,
  context: StyleContext,
): Paint {
  if (value === undefined) return inherited;
  const v = value.trim();
  const lower = v.toLowerCase();
  if (lower === 'none' || lower === 'transparent') return NONE;
  if (lower === 'inherit') return inherited;
  if (lower === 'currentcolor') return { kind: 'color', color: currentColor, source: 'solid' };
  const reference = /^url\(\s*['"]?#([^'")]+)['"]?\s*\)\s*(.*)$/i.exec(v);
  if (reference) {
    const fallback = reference[2] ? resolvePaint(reference[2], currentColor, NONE, context) : null;
    const target = context.ids.get(reference[1]);
    if (target && /^(linear|radial)Gradient$/.test(target.localName)) {
      const stop = firstStopColor(target, context, currentColor, 0);
      return stop ? { kind: 'color', color: stop, source: 'gradient' } : NONE;
    }
    if (target && target.localName === 'pattern') {
      const color = fallback && fallback.kind === 'color' ? fallback.color : BLACK;
      return { kind: 'color', color, source: 'pattern' };
    }
    return fallback ?? NONE;
  }
  const color = parseColor(v);
  return color ? { kind: 'color', color, source: 'solid' } : inherited;
}

/** First `<stop>` color, following `href` to a template gradient when this one has no stops. */
function firstStopColor(
  gradient: Element,
  context: StyleContext,
  currentColor: string,
  depth: number,
): string | null {
  const stop = Array.from(gradient.children).find((child) => child.localName === 'stop');
  if (stop) {
    const value = declaredProperties(stop, context).get('stop-color');
    if (!value) return BLACK;
    if (value.toLowerCase() === 'currentcolor') return currentColor;
    return parseColor(value) ?? BLACK;
  }
  const href =
    gradient.getAttribute('href') ?? gradient.getAttributeNS('http://www.w3.org/1999/xlink', 'href');
  const template = href?.startsWith('#') ? context.ids.get(href.slice(1)) : undefined;
  return template && depth < 8 ? firstStopColor(template, context, currentColor, depth + 1) : null;
}
