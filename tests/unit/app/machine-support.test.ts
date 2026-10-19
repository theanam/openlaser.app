import { describe, expect, it, vi } from 'vitest';
import { appendCapped, ConsoleBatcher } from '$app/state/machine-support';
import type { ConsoleEntry } from '$lib/machine';

const entry = (id: number): ConsoleEntry => ({ id, time: 0, direction: 'received', kind: 'ok', text: 'ok' });

describe('machine support', () => {
  it('caps appended lists', () => {
    expect(appendCapped([1, 2, 3], [4, 5], 4)).toEqual([2, 3, 4, 5]);
  });

  it('batches console entries', () => {
    vi.useFakeTimers();
    const flushed: ConsoleEntry[][] = [];
    const batch = new ConsoleBatcher((more) => flushed.push(more), 100);
    batch.push(entry(1));
    batch.push(entry(2));
    expect(flushed).toEqual([]);
    vi.advanceTimersByTime(100);
    expect(flushed.map((b) => b.map((e) => e.id))).toEqual([[1, 2]]);
    vi.useRealTimers();
  });
});
