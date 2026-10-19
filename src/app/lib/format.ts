/** Display formatting. Coordinates use 3 decimals, speeds and powers whole numbers (DESIGN §3). */

export function coord(value: number): string {
  return value.toFixed(3);
}

export function whole(value: number): string {
  return Math.round(value).toString();
}

export function count(value: number): string {
  return Math.round(value).toLocaleString('en-US');
}

/** "11 min 40 s", "45 s", "2 h 05 min". */
export function duration(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  if (s < 60) return `${s} s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min ${String(s % 60).padStart(2, '0')} s`;
  return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')} min`;
}

/** mm → "6.2 m", "84 mm". */
export function distance(mm: number): string {
  if (mm >= 1000) return `${(mm / 1000).toFixed(1)} m`;
  return `${Math.round(mm)} mm`;
}

export function relativeTime(iso: string, now = Date.now()): string {
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return 'some time ago';
  const minutes = Math.round((now - then) / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days} days ago`;
  return new Date(then).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
