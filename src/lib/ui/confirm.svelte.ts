/** Promise-based confirmation, rendered by <ConfirmHost>. Replaces window.confirm. */

export interface ConfirmRequest {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** 'danger' paints the confirm button Signal red. */
  tone?: 'default' | 'danger';
}

interface PendingConfirm extends ConfirmRequest {
  resolve: (value: boolean) => void;
}

class ConfirmQueue {
  current = $state<PendingConfirm | null>(null);
  private queue: PendingConfirm[] = [];

  ask(request: ConfirmRequest): Promise<boolean> {
    return new Promise((resolve) => {
      this.queue.push({ ...request, resolve });
      if (!this.current) this.next();
    });
  }

  answer(value: boolean): void {
    const pending = this.current;
    this.current = null;
    pending?.resolve(value);
    this.next();
  }

  private next(): void {
    this.current = this.queue.shift() ?? null;
  }
}

export const confirms = new ConfirmQueue();

export function confirm(request: ConfirmRequest): Promise<boolean> {
  return confirms.ask(request);
}
