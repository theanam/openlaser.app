// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { ownsArrowKeys } from '$app/lib/keys';

describe('ownsArrowKeys', () => {
  it('is true inside radio grids, menus, lists and tabs', () => {
    document.body.innerHTML = `
      <div role="radiogroup"><button id="cell"></button></div>
      <div role="menu"><div id="item"></div></div>
      <button id="plain"></button>`;
    expect(ownsArrowKeys(document.getElementById('cell'))).toBe(true);
    expect(ownsArrowKeys(document.getElementById('item'))).toBe(true);
    expect(ownsArrowKeys(document.getElementById('plain'))).toBe(false);
    expect(ownsArrowKeys(null)).toBe(false);
  });
});
