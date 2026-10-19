/** Backup files for GRBL `$$` settings. */

export const SETTINGS_BACKUP_FORMAT = 'openlaser-grbl-settings';

export function settingsBackup(
  settings: Record<number, string>,
  firmware: { name: string; version: string } | null,
): string {
  return JSON.stringify({ format: SETTINGS_BACKUP_FORMAT, version: 1, firmware, settings }, null, 2) + '\n';
}

/** Accepts our backup format or plain `$N=value` lines (as GRBL prints them). */
export function parseSettingsBackup(text: string): Record<number, string> {
  const trimmed = text.trim();
  if (trimmed.startsWith('{')) {
    const parsed = JSON.parse(trimmed) as { format?: string; settings?: Record<string, unknown> };
    if (parsed.format !== SETTINGS_BACKUP_FORMAT || !parsed.settings)
      throw new Error('This file is not a settings backup.');
    const out: Record<number, string> = {};
    for (const [k, v] of Object.entries(parsed.settings)) {
      if (/^\d+$/.test(k) && /^-?[\d.]+$/.test(String(v))) out[Number(k)] = String(v);
    }
    return out;
  }
  const out: Record<number, string> = {};
  for (const line of trimmed.split(/\r?\n/)) {
    const m = /^\$(\d+)=(-?[\d.]+)/.exec(line.trim());
    if (m) out[Number(m[1])] = m[2];
  }
  if (Object.keys(out).length === 0) throw new Error('No settings found in this file.');
  return out;
}
