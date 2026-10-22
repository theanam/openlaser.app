export type ToastTone = 'info' | 'success' | 'warning' | 'error';

export interface ToastAction {
  label: string;
  run: () => void;
}

export interface Toast {
  id: number;
  message: string;
  tone: ToastTone;
  action?: ToastAction;
  /** ms; 0 keeps the toast until dismissed. */
  duration: number;
  /** Wall-clock time the toast goes away, null for one kept until dismissed. */
  expiresAt: number | null;
  /** How many times the same message arrived while it was showing. */
  count: number;
}

/** Errors stay long enough to read and act on; the rest clear quickly. */
export const ERROR_DURATION = 60_000;
export const DEFAULT_DURATION = 4000;

/**
 * Expiry is kept as a wall-clock time and checked by one timer plus a sweep whenever the tab comes
 * back: browsers slow timers right down in hidden tabs, so a toast raised while you watched the
 * laser would otherwise hang around long after its ring had drained.
 */
class Toasts {
  items = $state<Toast[]>([]);
  private nextId = 1;
  private timer: ReturnType<typeof setTimeout> | null = null;

  show(message: string, options: { tone?: ToastTone; action?: ToastAction; duration?: number } = {}): number {
    const tone = options.tone ?? 'info';
    const duration = options.duration ?? (tone === 'error' ? ERROR_DURATION : DEFAULT_DURATION);
    const expiresAt = duration > 0 ? Date.now() + duration : null;
    // The same message again folds into the toast already up and restarts its time.
    const same = this.items.find(
      (t) => t.message === message && t.tone === tone && !t.action && !options.action,
    );
    if (same) {
      this.items = this.items.map((t) =>
        t === same ? { ...t, duration, expiresAt, count: t.count + 1 } : t,
      );
      this.schedule();
      return same.id;
    }
    const id = this.nextId++;
    this.items = [
      ...this.items,
      { id, message, tone, action: options.action, duration, expiresAt, count: 1 },
    ];
    this.schedule();
    return id;
  }

  dismiss(id: number): void {
    this.items = this.items.filter((t) => t.id !== id);
    this.schedule();
  }

  /** Drops every toast whose time is up. */
  sweep(now = Date.now()): void {
    if (this.items.some((t) => t.expiresAt !== null && t.expiresAt <= now)) {
      this.items = this.items.filter((t) => t.expiresAt === null || t.expiresAt > now);
    }
    this.schedule();
  }

  /** One timer for the next expiry; a sweep reschedules it, so a late timer never strands a toast. */
  private schedule(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    const next = this.items.reduce<number | null>(
      (soonest, t) =>
        t.expiresAt !== null && (soonest === null || t.expiresAt < soonest) ? t.expiresAt : soonest,
      null,
    );
    if (next === null) return;
    this.timer = setTimeout(() => this.sweep(), Math.max(0, next - Date.now()));
  }
}

export const toasts = new Toasts();

export const toast = {
  info: (message: string, options?: { action?: ToastAction; duration?: number }) =>
    toasts.show(message, { ...options, tone: 'info' }),
  success: (message: string, options?: { action?: ToastAction; duration?: number }) =>
    toasts.show(message, { ...options, tone: 'success' }),
  warning: (message: string, options?: { action?: ToastAction; duration?: number }) =>
    toasts.show(message, { ...options, tone: 'warning' }),
  error: (message: string, options?: { action?: ToastAction; duration?: number }) =>
    toasts.show(message, { ...options, tone: 'error' }),
};
