/** The desktop OS the browser runs on, to open driver instructions on the right tab. */
export type DesktopPlatform = 'windows' | 'mac' | 'linux' | 'chromeos';

export function detectPlatform(
  userAgent = typeof navigator === 'undefined' ? '' : navigator.userAgent,
): DesktopPlatform {
  if (/CrOS/i.test(userAgent)) return 'chromeos';
  if (/Windows/i.test(userAgent)) return 'windows';
  if (/Mac OS X|Macintosh/i.test(userAgent)) return 'mac';
  return 'linux';
}
