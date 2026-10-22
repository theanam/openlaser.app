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

  it('folds a repeated message into one toast and restarts its time', () => {
    toast.success('Job complete');
    vi.advanceTimersByTime(3000);
    toast.success('Job complete');
    expect(toasts.items).toHaveLength(1);
    expect(toasts.items[0]!.count).toBe(2);
    vi.advanceTimersByTime(3000);
    expect(toasts.items).toHaveLength(1);
    vi.advanceTimersByTime(1000);
    expect(toasts.items).toHaveLength(0);
    // Different tones, and toasts with actions, stay separate.
    toast.info('Hello');
    toast.warning('Hello');
    toast.info('Hello', { action: { label: 'Undo', run: () => undefined } });
    expect(toasts.items).toHaveLength(3);
  });

  it('clears expired toasts on a sweep when timers ran late', () => {
    toast.info('Stale');
    // Timers can stall in a hidden tab; the sweep on return goes by the clock.
    toasts.items = toasts.items.map((t) => ({ ...t, expiresAt: Date.now() - 1 }));
    toasts.sweep();
    expect(toasts.items).toHaveLength(0);
  });

  it('keeps a dismissed toast gone when its timer fires later', () => {
    const id = toast.info('Bye');
    toast.info('Stay', { duration: 10_000 });
    toasts.dismiss(id);
    vi.advanceTimersByTime(DEFAULT_DURATION);
    expect(toasts.items.map((t) => t.message)).toEqual(['Stay']);
  });
});
