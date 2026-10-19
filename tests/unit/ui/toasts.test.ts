import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_DURATION, ERROR_DURATION, toast, toasts } from '$lib/ui/toasts.svelte';

describe('toasts', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    toasts.items = [];
  });
  afterEach(() => vi.useRealTimers());

  it('keeps errors for a minute', () => {
    toast.error('Port lost');
    expect(toasts.items[0]!.duration).toBe(ERROR_DURATION);
    expect(ERROR_DURATION).toBe(60_000);
    vi.advanceTimersByTime(59_000);
    expect(toasts.items).toHaveLength(1);
    vi.advanceTimersByTime(1_000);
    expect(toasts.items).toHaveLength(0);
  });

  it('clears other tones quickly and keeps untimed toasts', () => {
    toast.info('Saved');
    toast.warning('Stays', { duration: 0 });
    vi.advanceTimersByTime(DEFAULT_DURATION);
    expect(toasts.items.map((t) => t.message)).toEqual(['Stays']);
  });
});
