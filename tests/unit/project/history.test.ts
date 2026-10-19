import { describe, expect, it } from 'vitest';
import { History } from '$lib/project/history';

describe('History', () => {
  it('undoes and redoes', () => {
    const h = new History<number>();
    h.record(1);
    h.record(2);
    expect(h.undo(3)).toBe(2);
    expect(h.undo(2)).toBe(1);
    expect(h.undo(1)).toBeNull();
    expect(h.redo(1)).toBe(2);
    expect(h.redo(2)).toBe(3);
    expect(h.canRedo).toBe(false);
  });

  it('clears redo on a new commit', () => {
    const h = new History<number>();
    h.record(1);
    h.undo(2);
    h.record(1);
    expect(h.canRedo).toBe(false);
  });

  it('coalesces commits that share a key', () => {
    const h = new History<number>();
    h.record(1, 'drag');
    h.record(2, 'drag');
    h.record(3, 'drag');
    expect(h.size).toBe(1);
    expect(h.undo(4)).toBe(1);
  });

  it('starts a new step after seal', () => {
    const h = new History<number>();
    h.record(1, 'drag');
    h.seal();
    h.record(2, 'drag');
    expect(h.size).toBe(2);
  });

  it('caps history at the limit', () => {
    const h = new History<number>(200);
    for (let i = 0; i < 250; i++) h.record(i);
    expect(h.size).toBe(200);
    let last: number | null = null;
    for (let s = 250; ; s--) {
      const v = h.undo(s);
      if (v === null) break;
      last = v;
    }
    expect(last).toBe(50);
  });
});
