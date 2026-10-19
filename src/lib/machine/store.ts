import type { Readable, Unsubscribe } from './types';

export interface Writable<T> extends Readable<T> {
  set(value: T): void;
  update(fn: (value: T) => T): void;
}

/**
 * Minimal Svelte-store compatible writable. Subscribers are called immediately with the current
 * value and then on every `set`, which lets Svelte components use `$store` syntax directly.
 */
export function writable<T>(initial: T): Writable<T> {
  let value = initial;
  const subscribers = new Set<(value: T) => void>();

  return {
    get: () => value,
    set(next: T) {
      value = next;
      for (const run of [...subscribers]) run(value);
    },
    update(fn: (value: T) => T) {
      this.set(fn(value));
    },
    subscribe(run: (value: T) => void): Unsubscribe {
      subscribers.add(run);
      run(value);
      return () => {
        subscribers.delete(run);
      };
    },
  };
}

/** Typed listener set used for events throughout the machine layer. */
export class Listeners<T> {
  private readonly callbacks = new Set<(value: T) => void>();

  add(cb: (value: T) => void): Unsubscribe {
    this.callbacks.add(cb);
    return () => {
      this.callbacks.delete(cb);
    };
  }

  emit(value: T): void {
    for (const cb of [...this.callbacks]) cb(value);
  }

  clear(): void {
    this.callbacks.clear();
  }

  get size(): number {
    return this.callbacks.size;
  }
}
