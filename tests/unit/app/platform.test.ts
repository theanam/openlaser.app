import { describe, expect, it } from 'vitest';
import { detectPlatform } from '$app/lib/platform';
import { DRIVERS, PLATFORM_LABELS } from '$app/connect/connect-help';

describe('detectPlatform', () => {
  it('reads the OS from the user agent', () => {
    expect(detectPlatform('Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130')).toBe('windows');
    expect(detectPlatform('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/130')).toBe('mac');
    expect(detectPlatform('Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) Chrome/130')).toBe('chromeos');
    expect(detectPlatform('Mozilla/5.0 (X11; Linux x86_64) Chrome/130')).toBe('linux');
  });
});

describe('connection help', () => {
  it('has driver steps for every platform, with commands where a terminal helps', () => {
    for (const p of Object.keys(PLATFORM_LABELS) as Array<keyof typeof DRIVERS>) {
      expect(DRIVERS[p].length).toBeGreaterThan(0);
    }
    expect(DRIVERS.linux.some((l) => l.code?.includes('dialout'))).toBe(true);
    expect(DRIVERS.linux.some((l) => l.code?.includes('brltty'))).toBe(true);
    expect(DRIVERS.windows.flatMap((l) => l.links ?? []).map((l) => l.href)).toEqual(
      expect.arrayContaining([expect.stringContaining('wch-ic.com'), expect.stringContaining('silabs.com')]),
    );
  });
});
