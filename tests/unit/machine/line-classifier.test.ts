import { describe, expect, it } from 'vitest';
import { classifyLine, parseOptionsFeedback, parseVersionFeedback } from '$lib/machine/grbl/line-classifier';
import { LineSplitter } from '$lib/machine/grbl/line-splitter';

describe('classifyLine', () => {
  it.each([
    ['ok', { type: 'ok' }],
    ['error:22', { type: 'error', code: 22, text: 'error:22' }],
    ['ALARM:1', { type: 'alarm', code: 1, text: 'ALARM:1' }],
    ['<Idle|MPos:0.000,0.000,0.000|FS:0,0>', { type: 'status', body: 'Idle|MPos:0.000,0.000,0.000|FS:0,0' }],
    ['[MSG:Caution: Unlocked]', { type: 'feedback', tag: 'MSG', content: 'Caution: Unlocked' }],
    [
      '[GC:G0 G54 G17 G21 G90 G94 M5 M9 T0 F0 S0]',
      { type: 'feedback', tag: 'GC', content: 'G0 G54 G17 G21 G90 G94 M5 M9 T0 F0 S0' },
    ],
    ['[VER:1.1h.20190825:]', { type: 'feedback', tag: 'VER', content: '1.1h.20190825:' }],
    ['[OPT:V,15,128]', { type: 'feedback', tag: 'OPT', content: 'V,15,128' }],
    ['[echo:G1X1]', { type: 'feedback', tag: 'echo', content: 'G1X1' }],
    ['[G54:0.000,0.000,0.000]', { type: 'feedback', tag: 'G54', content: '0.000,0.000,0.000' }],
    ['$110=6000.000', { type: 'setting', n: 110, value: '6000.000' }],
    ['', { type: 'empty' }],
  ])('classifies %j', (line, expected) => {
    expect(classifyLine(line)).toEqual(expected);
  });

  it('recognises welcome messages from GRBL variants', () => {
    expect(classifyLine("Grbl 1.1h ['$' for help]")).toMatchObject({
      type: 'welcome',
      firmware: 'grbl',
      version: '1.1h',
    });
    expect(classifyLine("GrblHAL 1.1f ['$' or '$HELP' for help]")).toMatchObject({
      type: 'welcome',
      firmware: 'grblHAL',
      version: '1.1f',
    });
    expect(classifyLine("Grbl 3.7 [FluidNC v3.7.8 (wifi) '$' for help]")).toMatchObject({
      type: 'welcome',
      firmware: 'fluidnc',
      version: '3.7.8',
    });
  });

  it('never throws and logs anything else as unknown', () => {
    for (const junk of [
      '\u0000ÿ#%',
      'hello world',
      '<unterminated',
      '[broken',
      'error:',
      'ALARM:Hard limit',
      '$x=y',
    ]) {
      expect(() => classifyLine(junk)).not.toThrow();
    }
    expect(classifyLine('hello world')).toEqual({ type: 'unknown', text: 'hello world' });
    expect(classifyLine('error: Bad number format')).toMatchObject({ type: 'error', code: 0 });
    expect(classifyLine('ALARM:Hard limit')).toMatchObject({ type: 'alarm', code: 0 });
  });

  it('strips line noise at the edges', () => {
    expect(classifyLine('\u0000þok\r')).toEqual({ type: 'ok' });
  });
});

describe('feedback parsing', () => {
  it('parses $I version and options', () => {
    expect(parseVersionFeedback('1.1h.20190825:')).toBe('1.1h.20190825');
    expect(parseOptionsFeedback('V,15,128')).toEqual({ flags: 'V', plannerBlocks: 15, rxSize: 128 });
    expect(parseOptionsFeedback('VNMZL,35,1024')).toMatchObject({ rxSize: 1024, plannerBlocks: 35 });
    expect(parseOptionsFeedback('V')).toEqual({ flags: 'V', plannerBlocks: null, rxSize: null });
  });
});

describe('LineSplitter', () => {
  it('reassembles lines split across chunks and trims CR', () => {
    const splitter = new LineSplitter();
    const enc = (s: string) => Uint8Array.from(s, (c) => c.charCodeAt(0));
    expect(splitter.push(enc('o'))).toEqual([]);
    expect(splitter.push(enc('k\r\nerr'))).toEqual(['ok']);
    expect(splitter.push(enc('or:20\r\n<Idle>\r\n'))).toEqual(['error:20', '<Idle>']);
  });
});

describe('interpretFeedback', () => {
  it('derives firmware, buffer size and reset requirement', async () => {
    const { interpretFeedback } = await import('$lib/machine/grbl/feedback');
    const grbl = { name: 'grbl' as const, version: '1.1h' };
    expect(interpretFeedback('VER', '1.1h.20190825:', grbl)).toEqual({
      firmware: { name: 'grbl', version: '1.1h.20190825' },
    });
    expect(interpretFeedback('VER', '3.7 FluidNC v3.7.8:', grbl).firmware?.name).toBe('fluidnc');
    expect(interpretFeedback('FIRMWARE', 'grblHAL', grbl)).toEqual({
      firmware: { name: 'grblHAL', version: '1.1h' },
    });
    expect(interpretFeedback('OPT', 'VL,35,1024', grbl)).toEqual({ rxSize: 1024 });
    expect(interpretFeedback('MSG', 'Reset to continue', grbl)).toEqual({ needsResetToUnlock: true });
    expect(interpretFeedback('GC', 'G0 G54', grbl)).toEqual({});
  });
});
