/**
 * Which elements get a tooltip and what it says. Every icon button gets one: from `data-tip`, a
 * native `title` (taken over so the browser's slow unstyled tooltip never shows), or `aria-label`.
 */
export const TOOLTIP_SELECTOR =
  '[data-tip], [title], .icon-btn, [role="radio"][aria-label], [role="tab"][aria-label]';

export function tooltipTarget(start: Element | null): HTMLElement | null {
  const el = start?.closest(TOOLTIP_SELECTOR) ?? null;
  // SVG <title> children and SVG elements are not interactive controls.
  return el instanceof HTMLElement ? el : null;
}

/** Moves `title` to `data-tip` and returns the tooltip text, or null for none. */
export function tooltipText(el: HTMLElement): string | null {
  const title = el.getAttribute('title');
  if (title) {
    el.dataset.tip = title;
    el.removeAttribute('title');
  }
  const text =
    el.dataset.tip ??
    (el.matches('.icon-btn, [role="radio"], [role="tab"]') ? el.getAttribute('aria-label') : null);
  return text?.trim() ? text.trim() : null;
}

export interface Placement {
  x: number;
  y: number;
  side: 'top' | 'bottom';
}

/** Below the target, or above when there is no room; kept inside the viewport horizontally. */
export function placeTooltip(
  target: { left: number; top: number; width: number; height: number },
  tip: { width: number; height: number },
  viewport: { width: number; height: number },
  gap = 8,
  margin = 8,
): Placement {
  const below = target.top + target.height + gap;
  const side = below + tip.height + margin > viewport.height ? 'top' : 'bottom';
  const y = side === 'bottom' ? below : target.top - gap - tip.height;
  const centered = target.left + target.width / 2 - tip.width / 2;
  const x = Math.max(margin, Math.min(centered, viewport.width - tip.width - margin));
  return { x, y, side };
}
