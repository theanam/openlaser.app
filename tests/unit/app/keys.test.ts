import { describe, expect, it } from 'vitest';
import { formatCombo, matches, parseCombo } from '$app/lib/keys';

const ev = (
  key: string,
  mods: Partial<{ meta: boolean; ctrl: boolean; shift: boolean; alt: boolean }> = {},
) => ({
  key,
  metaKey: !!mods.meta,
  ctrlKey: !!mods.ctrl,
  shiftKey: !!mods.shift,
  altKey: !!mods.alt,
});

describe('keyboard shortcuts', () => {
  it('parses combos', () => {
    expect(parseCombo('Mod+Shift+S')).toEqual({ key: 's', mod: true, shift: true, alt: false });
  });

  it('maps Mod to Cmd on Apple and Ctrl elsewhere', () => {
    expect(matches(ev('s', { meta: true }), 'Mod+S', true)).toBe(true);
    expect(matches(ev('s', { ctrl: true }), 'Mod+S', true)).toBe(false);
    expect(matches(ev('s', { ctrl: true }), 'Mod+S', false)).toBe(true);
  });

  it('keeps Shift variants apart', () => {
    expect(matches(ev('S', { meta: true, shift: true }), 'Mod+S', true)).toBe(false);
    expect(matches(ev('S', { meta: true, shift: true }), 'Mod+Shift+S', true)).toBe(true);
    expect(matches(ev('z', { meta: true, shift: true }), 'Mod+Shift+Z', true)).toBe(true);
  });

  it('ignores Shift for printable symbols', () => {
    expect(matches(ev('?', { shift: true }), '?', true)).toBe(true);
  });

  it('matches named keys', () => {
    expect(matches(ev('ArrowLeft', { shift: true }), 'Shift+ArrowLeft', false)).toBe(true);
    expect(matches(ev('Escape'), 'Escape', false)).toBe(true);
  });

  it('formats labels per platform', () => {
    expect(formatCombo('Mod+Shift+S', true)).toBe('⌘⇧S');
    expect(formatCombo('Mod+Shift+S', false)).toBe('Ctrl+Shift+S');
    expect(formatCombo('Escape', true)).toBe('Esc');
  });
});

describe('digit shortcuts', () => {
  it('match by physical key so Shift+2 works on any layout', () => {
    expect(matches({ ...ev('@', { shift: true }), code: 'Digit2' }, 'Shift+2', true)).toBe(true);
    expect(matches({ ...ev('2'), code: 'Digit2' }, 'Shift+2', true)).toBe(false);
    expect(matches({ ...ev('0', { meta: true }), code: 'Digit0' }, 'Mod+0', true)).toBe(true);
  });
});
