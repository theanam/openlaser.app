import { describe, expect, it } from 'vitest';
import { bareSimulator, readySimulator } from './sim-harness';

describe('GrblSimulator basics', () => {
  it('prints the welcome on power on and locks when homing is enabled', () => {
    const h = bareSimulator();
    h.sim.powerOn();
    expect(h.lines()).toEqual(["Grbl 1.1h ['$' for help]", "[MSG:'$H'|'$X' to unlock]"]);
    expect(h.status()).toMatch(/^<Alarm\|/);
    h.send('G0 X1\n');
    expect(h.lines().at(-1)).toBe('error:9');
    h.send('$X\n');
    expect(h.lines().slice(-2)).toEqual(['[MSG:Caution: Unlocked]', 'ok']);
  });

  it('starts idle without homing enabled', () => {
    const h = bareSimulator({ settings: { 22: 0 } });
    h.sim.powerOn();
    expect(h.lines()).toEqual(["Grbl 1.1h ['$' for help]"]);
    expect(h.status()).toMatch(/^<Idle\|MPos:0\.000,0\.000,0\.000\|FS:0,0\|WCO:0\.000,0\.000,0\.000>$/);
  });

  it('answers $I with version and buffer options', () => {
    const h = readySimulator({ rxBufferSize: 256, plannerBlocks: 31 });
    h.send('$I\n');
    expect(h.lines()).toEqual(['[VER:1.1h.20190825:]', '[OPT:V,31,256]', 'ok']);
  });

  it('lists and writes settings', () => {
    const h = readySimulator();
    h.send('$$\n');
    const lines = h.lines();
    expect(lines).toContain('$30=1000');
    expect(lines).toContain('$32=1');
    expect(lines).toContain('$110=6000.000');
    expect(lines).toContain('$130=400.000');
    expect(lines.at(-1)).toBe('ok');
    h.clear();
    h.send('$110=5000\n$999=1\n$110=abc\n');
    expect(h.lines()).toEqual(['ok', 'error:3', 'error:2']);
    expect(h.sim.settings[110]).toBe(5000);
  });

  it('rejects bad G-code with GRBL error codes', () => {
    const h = readySimulator();
    h.send('G1 X10\n'); // no feed rate yet
    h.send('G99\n');
    h.send('Q1\n');
    h.send(`G0 X${'1'.repeat(80)}\n`);
    h.send('$FOO\n');
    h.send('G0 G1 X1\n');
    expect(h.lines()).toEqual(['error:22', 'error:20', 'error:20', 'error:11', 'error:3', 'error:21']);
  });

  it('acknowledges when a move is planned, not when it finishes', async () => {
    const h = readySimulator();
    h.send('G1 X100 F6000\n');
    expect(h.lines()).toEqual(['ok']);
    expect(h.status()).toMatch(/^<Run\|/);
    await h.clock.advance(500);
    expect(h.sim.position.x).toBeCloseTo(50, 5);
    await h.clock.advance(600);
    expect(h.status()).toMatch(/^<Idle\|MPos:100\.000,0\.000,0\.000/);
  });

  it('tracks G90/G91, G20/G21 and G92 offsets', async () => {
    const h = readySimulator();
    h.send('G91 G0 X10 Y5\nG0 X10\nG90 G20 G0 X1\n');
    await h.clock.advance(5000);
    expect(h.sim.position).toEqual({ x: 25.4, y: 5, z: 0 });
    h.send('G21 G92 X0 Y0\n$10=0\n');
    h.clear();
    expect(h.status()).toContain('WPos:0.000,0.000,0.000');
    h.send('G0 X5\n');
    await h.clock.advance(5000);
    expect(h.sim.position.x).toBeCloseTo(30.4);
  });

  it('fills the 15-block planner, then holds lines in the RX buffer and reports Bf', () => {
    const h = readySimulator({ settings: { 10: 3 } });
    let program = 'G1F600\n';
    for (let i = 1; i <= 20; i++) program += `G1X${i}\n`;
    expect(program.length).toBeLessThan(128);
    h.send(program);
    // F600 line + 15 planned moves acknowledged; X16..X20 wait in the RX buffer.
    expect(h.lines().filter((l) => l === 'ok')).toHaveLength(16);
    const bf = /Bf:(\d+),(\d+)/.exec(h.status());
    expect(Number(bf?.[1])).toBe(0);
    expect(Number(bf?.[2])).toBe(128 - 5 * 'G1X16\n'.length);
  });

  it('flags RX overflow and drops the extra bytes like real hardware', () => {
    const h = readySimulator();
    const overflows: number[] = [];
    h.sim.onOverflow((e) => overflows.push(e.total));
    let program = 'G1 F100\n';
    for (let i = 1; i <= 60; i++) program += `G1 X${i}\n`;
    h.send(program);
    expect(h.sim.overflowCount).toBeGreaterThan(0);
    expect(overflows.length).toBe(h.sim.overflowCount);
  });

  it('records every received byte, including realtime bytes', () => {
    const h = readySimulator();
    const before = h.sim.bytesReceived;
    h.send([0x3f, 0x21, 0x7e]);
    h.send('G0 X1\n');
    expect(Array.from(h.sim.receivedBytes().slice(before))).toEqual([
      0x3f,
      0x21,
      0x7e,
      ...Array.from('G0 X1\n', (c) => c.charCodeAt(0)),
    ]);
  });
});

describe('GrblSimulator realtime commands', () => {
  it('feed hold decelerates (Hold:1) to Hold:0 and cycle start resumes', async () => {
    const h = readySimulator();
    h.send('G1 X100 F6000\n');
    await h.clock.advance(200);
    h.send([0x21]);
    expect(h.status()).toMatch(/^<Hold:1\|/);
    await h.clock.advance(250); // 100 mm/s at 500 mm/s² → 200 ms
    expect(h.status()).toMatch(/^<Hold:0\|/);
    const heldAt = h.sim.position.x;
    await h.clock.advance(1000);
    expect(h.sim.position.x).toBe(heldAt);
    h.send([0x7e]);
    expect(h.status()).toMatch(/^<Run\|/);
    await h.clock.advance(1000);
    expect(h.sim.position.x).toBe(100);
  });

  it('ignores cycle start while still decelerating', async () => {
    const h = readySimulator();
    h.send('G1 X100 F6000\n');
    await h.clock.advance(100);
    h.send([0x21, 0x7e]);
    await h.clock.advance(500);
    expect(h.status()).toMatch(/^<Hold:0\|/);
  });

  it('feed hold while idle goes straight to Hold:0', () => {
    const h = readySimulator();
    h.send([0x21]);
    expect(h.status()).toMatch(/^<Hold:0\|/);
  });

  it('jogs and cancels a jog', async () => {
    const h = readySimulator();
    h.send('$J=G91 G21 X300 F3000\n');
    expect(h.lines()).toEqual(['ok']);
    await h.clock.advance(1000);
    expect(h.status()).toMatch(/^<Jog\|/);
    h.send('G0 X0\n');
    expect(h.lines().at(-1)).toBe('error:9');
    h.send([0x85]);
    expect(h.status()).toMatch(/^<Idle\|/);
    expect(h.sim.position.x).toBeCloseTo(50, 3);
    h.clear();
    h.send('$J=G91 X10\n$J=G91 M3 X1 F100\n');
    expect(h.lines()).toEqual(['error:22', 'error:16']);
  });

  it('rejects jogs past the soft limits when enabled and homed', async () => {
    const h = readySimulator({ settings: { 20: 1 }, homingDurationMs: 100 });
    h.send('$H\n');
    await h.clock.advance(200);
    h.clear();
    h.send('$J=G91 X-5 F1000\n$J=G91 X400 F1000\n$J=G91 X10 F1000\n');
    expect(h.lines()).toEqual(['error:15', 'ok', 'error:15']);
  });

  it('homes after a delay and acknowledges when done', async () => {
    const h = readySimulator({ homingDurationMs: 1000 });
    h.send('G0 X50 Y50\n');
    await h.clock.advance(2000);
    h.clear();
    h.send('$H\n');
    expect(h.status()).toMatch(/^<Home\|/);
    expect(h.lines().filter((l) => l === 'ok')).toEqual([]);
    await h.clock.advance(1000);
    expect(h.lines().at(-1)).toBe('ok');
    expect(h.sim.position).toEqual({ x: 0, y: 0, z: 0 });
    expect(h.sim.homed).toBe(true);
    h.sim.settings[22] = 0;
    h.send('$H\n');
    expect(h.lines().at(-1)).toBe('error:5');
  });

  it('applies feed, rapid and spindle overrides', async () => {
    const h = readySimulator();
    h.send([0x91, 0x91, 0x96, 0x9b]);
    let report = '';
    for (let i = 0; i < 10 && !report.includes('Ov:'); i++) report = h.status();
    expect(report).toContain('Ov:120,50,90');
    h.send('G1 X60 F3000\n');
    // 60 mm at 3600 mm/min = 1 s.
    await h.clock.advance(999);
    expect(h.status()).toMatch(/^<Run/);
    await h.clock.advance(2);
    expect(h.status()).toMatch(/^<Idle/);
    h.send([0x90, 0x95, 0x99]);
    for (let i = 0; i < 10 && !report.includes('Ov:100,100,100'); i++) report = h.status();
    expect(report).toContain('Ov:100,100,100');
  });

  it('a reset during motion raises ALARM:3 and prints the welcome', async () => {
    const h = readySimulator();
    h.send('G1 X100 F1000\n');
    await h.clock.advance(100);
    h.clear();
    h.send([0x18]);
    expect(h.lines()).toEqual(['ALARM:3', "Grbl 1.1h ['$' for help]", "[MSG:'$H'|'$X' to unlock]"]);
    expect(h.status()).toMatch(/^<Alarm\|/);
  });

  it('a reset after a completed hold keeps position and raises no alarm', async () => {
    const h = readySimulator();
    h.send('G1 X100 F1000\n');
    await h.clock.advance(1000);
    h.send([0x21]);
    await h.clock.advance(500);
    h.clear();
    h.send([0x18]);
    expect(h.lines()).toEqual(["Grbl 1.1h ['$' for help]"]);
    expect(h.status()).toMatch(/^<Idle\|/);
    expect(h.sim.position.x).toBeGreaterThan(10);
  });

  it('a critical alarm ignores input until reset', () => {
    const h = readySimulator({ faults: { lineAlarm: (line) => (line === 'G0 X5' ? 1 : null) } });
    h.send('G0 X5\nG0 X6\n');
    expect(h.lines()).toEqual(['ALARM:1', '[MSG:Reset to continue]']);
    h.send([0x18]);
    expect(h.lines().slice(-2)).toEqual(["Grbl 1.1h ['$' for help]", "[MSG:'$H'|'$X' to unlock]"]);
    h.clear();
    h.send('$X\nG0 X6\n');
    expect(h.lines()).toEqual(['[MSG:Caution: Unlocked]', 'ok', 'ok']);
  });

  it('check mode parses without moving and resets when left', () => {
    const h = readySimulator();
    h.send('$C\nG0 X50\n');
    expect(h.lines()).toEqual(['[MSG:Enabled]', 'ok', 'ok']);
    expect(h.status()).toMatch(/^<Check\|/);
    h.clear();
    h.send('$C\n');
    expect(h.lines()).toEqual(['[MSG:Disabled]', 'ok', "Grbl 1.1h ['$' for help]"]);
    expect(h.sim.position.x).toBe(0);
  });
});

describe('GrblSimulator burn recording', () => {
  it('records burns for G1 with M3/M4 and never for G0 in laser mode', async () => {
    const h = readySimulator();
    h.send('M4 S500\nG0 X10\nG1 X20 F6000\nM3 S2000\nG1 Y10\nM5\nG1 X0\n');
    await h.clock.advance(5000);
    expect(h.sim.burns).toEqual([
      { from: { x: 10, y: 0 }, to: { x: 20, y: 0 }, power: 500, mode: 'M4', feed: 6000 },
      // S above $30 is clamped to $30.
      { from: { x: 20, y: 0 }, to: { x: 20, y: 10 }, power: 1000, mode: 'M3', feed: 6000 },
    ]);
  });

  it('keeps the laser on during G0 with M3 when laser mode is off', async () => {
    const h = readySimulator({ settings: { 32: 0 } });
    h.send('M3 S300\nG0 X10\n');
    await h.clock.advance(5000);
    expect(h.sim.burns).toHaveLength(1);
    expect(h.sim.burns[0]).toMatchObject({ power: 300, mode: 'M3' });
  });

  it('splits a burn at a feed hold', async () => {
    const h = readySimulator();
    h.send('M4 S100\nG1 X100 F6000\n');
    await h.clock.advance(300);
    h.send([0x21]);
    await h.clock.advance(1000);
    h.send([0x7e]);
    await h.clock.advance(2000);
    expect(h.sim.burns.map((b) => [b.from.x, b.to.x])).toEqual([
      [0, 30],
      [30, 100],
    ]);
  });
});

describe('GrblSimulator fault injection', () => {
  it('answers injected errors for chosen lines', () => {
    const h = readySimulator({ faults: { lineError: (line) => (line === 'G0 X2' ? 33 : null) } });
    h.send('G0 X1\nG0 X2\nG0 X3\n');
    expect(h.lines()).toEqual(['ok', 'error:33', 'ok']);
  });

  it('disconnects after N bytes', () => {
    const h = readySimulator();
    const reasons: string[] = [];
    h.sim.onDisconnect((r) => reasons.push(r));
    h.sim.faults = { disconnectAfterBytes: h.sim.bytesReceived + 5 };
    h.send('G0 X10\n');
    expect(reasons).toEqual(['Device disconnected (simulated)']);
    expect(h.sim.isPowered).toBe(false);
  });

  it('delays responses', async () => {
    const h = readySimulator();
    h.sim.faults = { responseDelayMs: 50 };
    h.send('G0 X1\n');
    expect(h.lines()).toEqual([]);
    await h.clock.advance(50);
    expect(h.lines()).toEqual(['ok']);
  });

  it('splits output into small pieces and injects garbage lines', () => {
    const pieces: number[] = [];
    const h = readySimulator({ faults: { splitChunks: { maxPieceBytes: 3 }, garbageProbability: 1 } });
    h.sim.onOutput((bytes) => pieces.push(bytes.length));
    h.send('G0 X1\n');
    expect(Math.max(...pieces)).toBeLessThanOrEqual(3);
    expect(h.lines().at(-1)).toBe('ok');
    expect(h.lines().length).toBe(2);
  });
});
