import type { ErrorPolicy } from '../machine/types';

export type ThemePreference = 'system' | 'dark' | 'light';

export interface Preferences {
  theme: ThemePreference;
  /** Status poll interval while idle, ms. */
  statusPollMs: number;
  errorPolicy: ErrorPolicy;
  /** Hide `?` status traffic and `ok` lines in the console. */
  quietConsole: boolean;
  /** Keep the console scrolled to the newest line. */
  consoleAutoScroll: boolean;
  debug: {
    gcodeComments: boolean;
    disableOptimizer: boolean;
    leadingZero: boolean;
  };
}

export function defaultPreferences(): Preferences {
  return {
    theme: 'system',
    statusPollMs: 200,
    errorPolicy: 'stop',
    quietConsole: true,
    consoleAutoScroll: true,
    debug: { gcodeComments: false, disableOptimizer: false, leadingZero: true },
  };
}

/** Merges stored values over defaults so new preference fields get sane values. */
export function normalizePreferences(stored: unknown): Preferences {
  const defaults = defaultPreferences();
  if (!stored || typeof stored !== 'object') return defaults;
  const s = stored as Partial<Preferences>;
  return {
    ...defaults,
    ...s,
    statusPollMs: Math.min(1000, Math.max(50, Number(s.statusPollMs) || defaults.statusPollMs)),
    debug: { ...defaults.debug, ...(s.debug ?? {}) },
  };
}
