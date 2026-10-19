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
}

/** Errors stay long enough to read and act on; the rest clear quickly. */
export const ERROR_DURATION = 60_000;
export const DEFAULT_DURATION = 4000;

class Toasts {
  items = $state<Toast[]>([]);
  private nextId = 1;

  show(message: string, options: { tone?: ToastTone; action?: ToastAction; duration?: number } = {}): number {
    const id = this.nextId++;
    const tone = options.tone ?? 'info';
    const duration = options.duration ?? (tone === 'error' ? ERROR_DURATION : DEFAULT_DURATION);
    this.items = [...this.items, { id, message, tone, action: options.action, duration }];
    if (duration > 0) setTimeout(() => this.dismiss(id), duration);
    return id;
  }

  dismiss(id: number): void {
    this.items = this.items.filter((t) => t.id !== id);
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
