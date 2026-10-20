/** Keyboard shortcut parsing and matching. `Mod` is ⌘ on Apple platforms and Ctrl elsewhere. */

export interface KeyCombo {
  key: string;
  mod: boolean;
  shift: boolean;
  alt: boolean;
}

export function isApple(platform = typeof navigator === 'undefined' ? '' : navigator.platform): boolean {
  return /Mac|iPhone|iPad|iPod/i.test(platform);
}

export function parseCombo(spec: string): KeyCombo {
  const parts = spec.split('+');
  const key = parts.pop()!;
  return {
    key: key.length === 1 ? key.toLowerCase() : key,
    mod: parts.includes('Mod'),
    shift: parts.includes('Shift'),
    alt: parts.includes('Alt'),
  };
}

export interface KeyLike {
  key: string;
  /** Physical key, e.g. "Digit2". Used for digits, whose `key` changes with Shift. */
  code?: string;
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
}

export function matches(event: KeyLike, spec: string, apple = isApple()): boolean {
  const combo = parseCombo(spec);
  const mod = apple ? event.metaKey : event.ctrlKey;
  const otherMod = apple ? event.ctrlKey : event.metaKey;
  if (mod !== combo.mod || otherMod) return false;
  if (event.altKey !== combo.alt) return false;
  if (/^\d$/.test(combo.key) && event.code) {
    return event.shiftKey === combo.shift && event.code === `Digit${combo.key}`;
  }
  const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
  // Shift changes printable keys ("?" is Shift+/), so only enforce it for letters and named keys.
  const shiftMatters = combo.key.length > 1 || /[a-z]/.test(combo.key);
  if (shiftMatters && event.shiftKey !== combo.shift) return false;
  return key === combo.key;
}

/** Human label: ⌘⇧S on Apple platforms, Ctrl+Shift+S elsewhere. */
export function formatCombo(spec: string, apple = isApple()): string {
  const combo = parseCombo(spec);
  const names: Record<string, string> = {
    ArrowUp: '↑',
    ArrowDown: '↓',
    ArrowLeft: '←',
    ArrowRight: '→',
    Escape: 'Esc',
    Delete: 'Del',
    Backspace: '⌫',
    Enter: '↵',
  };
  const key = names[combo.key] ?? combo.key.toUpperCase();
  if (apple) return `${combo.mod ? '⌘' : ''}${combo.alt ? '⌥' : ''}${combo.shift ? '⇧' : ''}${key}`;
  return [combo.mod && 'Ctrl', combo.alt && 'Alt', combo.shift && 'Shift', key].filter(Boolean).join('+');
}

/** True when the event comes from a text field, where shortcuts must stay out of the way. */
/** Widgets that use arrow keys themselves (radio grids, menus, lists, tabs). */
const ARROW_WIDGETS = '[role="radiogroup"], [role="menu"], [role="listbox"], [role="tablist"]';

export function ownsArrowKeys(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest(ARROW_WIDGETS) !== null;
}

export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  if (target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) return true;
  if (target instanceof HTMLInputElement) {
    return !['checkbox', 'radio', 'range', 'button', 'submit', 'color', 'file'].includes(target.type);
  }
  return false;
}
