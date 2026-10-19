import { describe, expect, it } from 'vitest';
import { ConsoleLog, formatConsoleReport, formatConsoleText } from '$lib/machine/console-log';

describe('ConsoleLog', () => {
  it('keeps the newest entries once capacity is reached', () => {
    const log = new ConsoleLog(() => 0, 3);
    for (let i = 1; i <= 5; i++) log.add('sent', 'command', `G0 X${i}`);
    expect(log.size).toBe(3);
    expect(log.entries().map((e) => e.text)).toEqual(['G0 X3', 'G0 X4', 'G0 X5']);
    expect(log.entries().map((e) => e.id)).toEqual([3, 4, 5]);
  });

  it('holds 10,000 entries by default and notifies subscribers', () => {
    const log = new ConsoleLog(() => 0);
    const seen: string[] = [];
    const unsubscribe = log.onEntry((e) => seen.push(e.text));
    for (let i = 0; i < 10_050; i++) log.add('received', 'ok', 'ok');
    unsubscribe();
    log.add('info', 'info', 'after');
    expect(log.size).toBe(10_000);
    expect(seen).toHaveLength(10_050);
  });

  it('formats copy text and a downloadable report with environment details', () => {
    const log = new ConsoleLog(() => Date.UTC(2026, 0, 2, 3, 4, 5));
    log.add('sent', 'command', '$I');
    log.add('received', 'ok', 'ok');
    expect(formatConsoleText(log.entries())).toBe(
      '2026-01-02T03:04:05.000Z >> $I\n2026-01-02T03:04:05.000Z << ok',
    );
    const report = formatConsoleReport(log.entries(), {
      appName: 'openlaser',
      appVersion: '0.1.0',
      userAgent: 'TestAgent/1.0',
      firmware: { name: 'grbl', version: '1.1h.20190825' },
      settings: { 32: '1', 10: '1', 130: '400.000' },
      generatedAt: Date.UTC(2026, 0, 2),
    });
    expect(report).toContain('openlaser 0.1.0 console log');
    expect(report).toContain('User agent: TestAgent/1.0');
    expect(report).toContain('Firmware: grbl 1.1h.20190825');
    expect(report).toContain('$10=1\n$32=1\n$130=400.000');
    expect(report).toContain('Log (2 entries):');
  });
});
