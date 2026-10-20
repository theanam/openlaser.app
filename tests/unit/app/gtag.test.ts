import { describe, expect, it } from 'vitest';
import { gtag, gtagTags } from '../../../scripts/gtag';

describe('gtag build plugin', () => {
  it('injects the loader and config for a valid ID', () => {
    const [loader, config] = gtagTags('G-PX75J5ZJBS');
    expect(loader!.attrs).toEqual({
      async: true,
      src: 'https://www.googletagmanager.com/gtag/js?id=G-PX75J5ZJBS',
    });
    expect(config!.children).toContain("gtag('config', 'G-PX75J5ZJBS');");
  });

  it('rejects anything else, so nothing odd reaches the page', () => {
    expect(() => gtagTags("G-X');alert(1);//")).toThrow();
  });

  it('adds nothing without an ID, and only runs for builds', () => {
    const plugin = gtag(undefined);
    expect(plugin.apply).toBe('build');
    expect((plugin.transformIndexHtml as () => unknown)()).toEqual([]);
  });
});
