import { describe, expect, it } from 'vitest';
import {
  detectBrowser,
  detectOs,
  diagnose,
  flagAddress,
  isAdapterError,
  type BrowserEnv,
} from '$app/connect/browser-check';
import { setupGuide } from '$app/connect/setup-guide';

const UA = {
  linuxChrome:
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36',
  linuxEdge: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/141.0 Safari/537.36 Edg/141.0',
  macChrome: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/141.0 Safari/537.36',
  winOpera:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/141.0 Safari/537.36 OPR/120.0',
  firefox: 'Mozilla/5.0 (X11; Linux x86_64; rv:140.0) Gecko/20100101 Firefox/140.0',
  safari: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/18.0 Safari/605.1.15',
  iosChrome:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 CriOS/141.0 Mobile Safari/604.1',
  android: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/141.0 Mobile Safari/537.36',
};

const env = (userAgent: string, over: Partial<BrowserEnv> = {}): BrowserEnv => ({
  userAgent,
  brands: [],
  brave: false,
  bluetooth: false,
  serial: true,
  ...over,
});

describe('which browser and device this is', () => {
  it('tells Chromium browsers apart', () => {
    expect(detectBrowser(env(UA.linuxChrome, { brands: ['Google Chrome', 'Chromium'] }))).toBe('chrome');
    expect(detectBrowser(env(UA.linuxEdge))).toBe('edge');
    expect(detectBrowser(env(UA.winOpera))).toBe('opera');
    expect(detectBrowser(env(UA.linuxChrome, { brave: true }))).toBe('brave');
    expect(detectBrowser(env(UA.linuxChrome, { brands: ['Chromium'] }))).toBe('chromium');
    expect(detectBrowser(env(UA.firefox))).toBe('firefox');
    expect(detectBrowser(env(UA.safari))).toBe('safari');
    expect(detectBrowser(env(UA.iosChrome))).toBe('chrome');
  });

  it('finds phones', () => {
    expect(detectOs(UA.iosChrome)).toBe('ios');
    expect(detectOs(UA.android)).toBe('android');
    expect(detectOs(UA.linuxChrome)).toBe('linux');
  });
});

describe('why a connection method is unavailable', () => {
  it('needs nothing when the browser has it', () => {
    expect(diagnose('bluetooth', env(UA.macChrome, { bluetooth: true }))).toBeNull();
    expect(diagnose('usb', env(UA.linuxChrome))).toBeNull();
  });

  it('points Chrome and Edge on Linux at the experimental flag, on their own flags page', () => {
    expect(diagnose('bluetooth', env(UA.linuxChrome))).toMatchObject({
      kind: 'flag',
      address: 'chrome://flags/#enable-experimental-web-platform-features',
      flag: 'Experimental Web Platform features',
    });
    expect(diagnose('bluetooth', env(UA.linuxEdge))).toMatchObject({
      address: 'edge://flags/#enable-experimental-web-platform-features',
    });
  });

  it('points Brave at its own Bluetooth flag', () => {
    expect(diagnose('bluetooth', env(UA.macChrome, { brave: true }))).toMatchObject({
      kind: 'flag',
      address: 'brave://flags/#brave-web-bluetooth-api',
    });
    expect(flagAddress('vivaldi', 'x')).toBe('vivaldi://flags/#x');
  });

  it('sends other browsers and devices elsewhere', () => {
    expect(diagnose('bluetooth', env(UA.firefox))).toMatchObject({ kind: 'browser', reason: 'unsupported' });
    expect(diagnose('usb', env(UA.safari, { serial: false }))).toMatchObject({ reason: 'unsupported' });
    expect(diagnose('bluetooth', env(UA.iosChrome))).toMatchObject({ reason: 'device', os: 'ios' });
    expect(diagnose('usb', env(UA.android, { serial: false }))).toMatchObject({ reason: 'device' });
    expect(diagnose('usb', env(UA.linuxChrome, { serial: false }))).toMatchObject({ reason: 'update' });
  });

  it('recognises Bluetooth that is off or not allowed', () => {
    expect(isAdapterError(new DOMException('Bluetooth adapter not available.', 'NotFoundError'))).toBe(true);
    expect(isAdapterError(new Error('Bluetooth permission has been blocked.'))).toBe(true);
    expect(
      isAdapterError(new DOMException('User cancelled the requestDevice() chooser.', 'NotFoundError')),
    ).toBe(false);
  });
});

describe('setup guides', () => {
  it('walks through the flag with the address to copy, then relaunch', () => {
    const guide = setupGuide(diagnose('bluetooth', env(UA.linuxChrome))!);
    expect(guide.title).toBe('Turn on Bluetooth in Chrome');
    expect(guide.steps.map((s) => s.art)).toEqual(['copy', 'paste', 'flag', 'relaunch', 'terminal']);
    expect(guide.steps[0]!.code).toBe('chrome://flags/#enable-experimental-web-platform-features');
    expect(guide.retry).toBe(false);
  });

  it('turns Bluetooth on per computer, with the browser permission on macOS', () => {
    const mac = setupGuide({ kind: 'adapter', browser: 'chrome', os: 'mac' });
    expect(mac.retry).toBe(true);
    expect(mac.steps.some((s) => s.art === 'permission' && s.detail?.includes('Privacy & Security'))).toBe(
      true,
    );
    const win = setupGuide({ kind: 'adapter', browser: 'edge', os: 'windows' });
    expect(win.steps[0]!.links?.[0]!.href).toBe('ms-settings:bluetooth');
    const linux = setupGuide({ kind: 'adapter', browser: 'chrome', os: 'linux' });
    expect(linux.steps.map((s) => s.code)).toContain('sudo systemctl enable --now bluetooth');
  });

  it('offers Chrome and Edge, or a computer', () => {
    const firefox = setupGuide(diagnose('bluetooth', env(UA.firefox))!);
    expect(firefox.title).toBe('Use Chrome or Edge');
    expect(firefox.steps[0]!.links?.map((l) => l.label)).toEqual(['Get Chrome', 'Get Edge']);
    expect(setupGuide(diagnose('bluetooth', env(UA.iosChrome))!).title).toBe('Use a computer');
  });

  it('keeps step titles short and free of "this, not that" phrasing', () => {
    const blockers = [
      diagnose('bluetooth', env(UA.linuxChrome))!,
      diagnose('bluetooth', env(UA.firefox))!,
      diagnose('usb', env(UA.android, { serial: false }))!,
      diagnose('usb', env(UA.linuxChrome, { serial: false }))!,
      ...(['mac', 'windows', 'linux', 'chromeos', 'android'] as const).map((os) => ({
        kind: 'adapter' as const,
        browser: 'chrome' as const,
        os,
      })),
    ];
    for (const b of blockers) {
      const g = setupGuide(b);
      const text = [g.title, g.lead, ...g.steps.flatMap((s) => [s.title, s.detail ?? ''])].join('\n');
      expect(text).not.toMatch(/,\s*not\s+\w+|\binstead of\b|\brather than\b/i);
      for (const s of g.steps) expect(s.title.length).toBeLessThanOrEqual(60);
    }
  });
});
