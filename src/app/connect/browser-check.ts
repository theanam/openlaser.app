/**
 * Why a connection method is unavailable, and what the user can do about it: a browser flag to
 * switch on, Bluetooth to turn on, or another browser or device. Pure, so every case is testable.
 */
import { detectPlatform, type DesktopPlatform } from '../lib/platform';

export type ConnectMedium = 'usb' | 'bluetooth';

export type BrowserId =
  'chrome' | 'edge' | 'opera' | 'brave' | 'vivaldi' | 'chromium' | 'firefox' | 'safari' | 'other';

export type DeviceOs = DesktopPlatform | 'android' | 'ios';

export interface BrowserEnv {
  userAgent: string;
  /** `navigator.userAgentData.brands`, where the browser has it. */
  brands: string[];
  /** Brave exposes `navigator.brave`. */
  brave: boolean;
  bluetooth: boolean;
  serial: boolean;
}

export type Blocker =
  /** The browser can do it once a flag is on. */
  | { kind: 'flag'; method: ConnectMedium; browser: BrowserId; os: DeviceOs; address: string; flag: string }
  /** Bluetooth is off, or the browser may not use it. */
  | { kind: 'adapter'; browser: BrowserId; os: DeviceOs }
  /** This browser or device cannot do it: switch browser, update, or use a computer. */
  | {
      kind: 'browser';
      method: ConnectMedium;
      browser: BrowserId;
      os: DeviceOs;
      reason: 'unsupported' | 'update' | 'device';
    };

export const BROWSER_NAMES: Record<BrowserId, string> = {
  chrome: 'Chrome',
  edge: 'Edge',
  opera: 'Opera',
  brave: 'Brave',
  vivaldi: 'Vivaldi',
  chromium: 'your browser',
  firefox: 'Firefox',
  safari: 'Safari',
  other: 'your browser',
};

const CHROMIUM: BrowserId[] = ['chrome', 'edge', 'opera', 'brave', 'vivaldi', 'chromium'];
const SCHEMES: Partial<Record<BrowserId, string>> = {
  edge: 'edge',
  opera: 'opera',
  brave: 'brave',
  vivaldi: 'vivaldi',
};

export const EXPERIMENTAL_FLAG = 'enable-experimental-web-platform-features';
export const BRAVE_BLUETOOTH_FLAG = 'brave-web-bluetooth-api';

export function currentEnv(): BrowserEnv {
  if (typeof navigator === 'undefined')
    return { userAgent: '', brands: [], brave: false, bluetooth: false, serial: false };
  const nav = navigator as Navigator & {
    userAgentData?: { brands: Array<{ brand: string }> };
    brave?: unknown;
  };
  return {
    userAgent: nav.userAgent,
    brands: nav.userAgentData?.brands.map((b) => b.brand) ?? [],
    brave: nav.brave !== undefined,
    bluetooth: 'bluetooth' in nav,
    serial: 'serial' in nav,
  };
}

export function detectBrowser(env: Pick<BrowserEnv, 'userAgent' | 'brands' | 'brave'>): BrowserId {
  const ua = env.userAgent;
  if (env.brave) return 'brave';
  if (/Edg(A|iOS)?\//.test(ua)) return 'edge';
  if (/OPR\/|Opera/.test(ua)) return 'opera';
  if (/Vivaldi/.test(ua)) return 'vivaldi';
  if (/Firefox\/|FxiOS/.test(ua)) return 'firefox';
  if (/CriOS/.test(ua)) return 'chrome';
  if (env.brands.includes('Google Chrome')) return 'chrome';
  if (/Chrome\//.test(ua)) return env.brands.includes('Chromium') ? 'chromium' : 'chrome';
  if (/Safari\//.test(ua)) return 'safari';
  return 'other';
}

export function detectOs(userAgent: string): DeviceOs {
  if (/iPhone|iPad|iPod/.test(userAgent)) return 'ios';
  if (/Android/.test(userAgent)) return 'android';
  return detectPlatform(userAgent);
}

/** The flags page address for this browser, opened at `flag`. */
export function flagAddress(browser: BrowserId, flag: string): string {
  return `${SCHEMES[browser] ?? 'chrome'}://flags/#${flag}`;
}

/** What stands between this browser and `method`, or null when nothing does. */
export function diagnose(method: ConnectMedium, env: BrowserEnv): Blocker | null {
  if (method === 'bluetooth' ? env.bluetooth : env.serial) return null;
  const browser = detectBrowser(env);
  const os = detectOs(env.userAgent);
  // Every browser on iPhone and iPad is Safari underneath, without Bluetooth or USB access.
  if (os === 'ios') return { kind: 'browser', method, browser, os, reason: 'device' };
  if (!CHROMIUM.includes(browser)) return { kind: 'browser', method, browser, os, reason: 'unsupported' };
  if (method === 'usb') {
    return { kind: 'browser', method, browser, os, reason: os === 'android' ? 'device' : 'update' };
  }
  if (browser === 'brave') {
    return {
      kind: 'flag',
      method,
      browser,
      os,
      address: flagAddress(browser, BRAVE_BLUETOOTH_FLAG),
      flag: 'Web Bluetooth API',
    };
  }
  // Chromium ships Web Bluetooth behind the experimental flag on Linux.
  return {
    kind: 'flag',
    method,
    browser,
    os,
    address: flagAddress(browser, EXPERIMENTAL_FLAG),
    flag: 'Experimental Web Platform features',
  };
}

/** Bluetooth exists but is off or blocked. */
export function adapterBlocker(env: BrowserEnv): Blocker {
  return { kind: 'adapter', browser: detectBrowser(env), os: detectOs(env.userAgent) };
}

/** Errors that mean the computer's Bluetooth is off, missing or not allowed. */
export function isAdapterError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /adapter|bluetooth is (off|disabled|unavailable)|bluetooth permission|globally disabled/i.test(
    message,
  );
}
