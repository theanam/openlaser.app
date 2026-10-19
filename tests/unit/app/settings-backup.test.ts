import { describe, expect, it } from 'vitest';
import { parseSettingsBackup, settingsBackup } from '$app/lib/settings-backup';

describe('settings backup', () => {
  it('round-trips', () => {
    const settings = { 30: '1000', 32: '1', 110: '6000.000' };
    expect(parseSettingsBackup(settingsBackup(settings, { name: 'grbl', version: '1.1h' }))).toEqual(
      settings,
    );
  });

  it('reads GRBL $$ output', () => {
    expect(parseSettingsBackup('$30=1000\n$32=1\nok\n')).toEqual({ 30: '1000', 32: '1' });
  });

  it('rejects unrelated files', () => {
    expect(() => parseSettingsBackup('{"format":"other"}')).toThrow();
    expect(() => parseSettingsBackup('hello')).toThrow();
  });
});
