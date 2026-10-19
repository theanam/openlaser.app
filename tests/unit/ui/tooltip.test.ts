// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { placeTooltip, tooltipTarget, tooltipText } from '$lib/ui/tooltip';

describe('tooltips', () => {
  it('uses aria-label for icon buttons', () => {
    document.body.innerHTML = '<button class="icon-btn" aria-label="Undo"><svg><path/></svg></button>';
    const target = tooltipTarget(document.querySelector('path'));
    expect(target?.tagName).toBe('BUTTON');
    expect(tooltipText(target!)).toBe('Undo');
  });

  it('takes over native titles so the browser tooltip never shows', () => {
    document.body.innerHTML = '<button class="btn" title="Import art (⌘I)">Import</button>';
    const button = document.querySelector('button')!;
    expect(tooltipText(button)).toBe('Import art (⌘I)');
    expect(button.hasAttribute('title')).toBe(false);
    expect(tooltipText(button)).toBe('Import art (⌘I)');
  });

  it('ignores plain text buttons without a hint', () => {
    document.body.innerHTML = '<button class="btn">Frame</button>';
    expect(tooltipTarget(document.querySelector('button'))).toBeNull();
  });

  it('places below, flips above near the bottom, and stays on screen', () => {
    const viewport = { width: 1000, height: 800 };
    expect(
      placeTooltip({ left: 100, top: 100, width: 36, height: 36 }, { width: 60, height: 24 }, viewport),
    ).toMatchObject({ side: 'bottom', y: 144 });
    expect(
      placeTooltip({ left: 100, top: 770, width: 36, height: 30 }, { width: 60, height: 24 }, viewport).side,
    ).toBe('top');
    expect(
      placeTooltip({ left: 990, top: 100, width: 10, height: 10 }, { width: 100, height: 24 }, viewport).x,
    ).toBe(892);
  });
});
