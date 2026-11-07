import { describe, expect, it } from 'vitest';
import { encodeFrame } from 'libopenlaser/machine/laserpecker/frame';
import { DUPLICATE_WINDOW_MS, LaserPeckerLink } from 'libopenlaser/machine/laserpecker/link';
import { Listeners } from 'libopenlaser/machine/store';
import type { Transport } from 'libopenlaser/machine/types';
import { VirtualScheduler } from 'libopenlaser/machine/virtual-scheduler';

/** A transport the test feeds bytes into by hand. */
function wire() {
  const data = new Listeners<Uint8Array>();
  const transport: Transport = {
    kind: 'simulator',
    connected: true,
    open: async () => undefined,
    close: async () => undefined,
    write: async () => undefined,
    onData: (cb) => data.add(cb),
    onDisconnect: () => () => undefined,
  };
  return { transport, feed: (bytes: Uint8Array) => data.emit(bytes) };
}

describe('LaserPeckerLink', () => {
  it('drops a reply repeated right after itself, so it cannot answer the next request', async () => {
    const clock = new VirtualScheduler();
    const { transport, feed } = wire();
    const link = new LaserPeckerLink(transport, clock);
    const status = encodeFrame(0x00, new Array(21).fill(6));
    const first = link.request(encodeFrame(0x00, [0]), (f) => f.func === 0, 1000);
    await Promise.resolve();
    feed(status);
    await first;
    // The next query's waiter must not get the repeat.
    const next = link.request(encodeFrame(0x00, [2]), (f) => f.func === 0, 1000);
    await Promise.resolve();
    feed(status);
    const settings = encodeFrame(0x00, new Array(19).fill(1));
    feed(settings);
    expect(Array.from((await next).bytes)).toEqual(Array.from(settings));
  });

  it('takes the same frame again once the window has passed', async () => {
    const clock = new VirtualScheduler();
    const { transport, feed } = wire();
    const link = new LaserPeckerLink(transport, clock);
    const status = encodeFrame(0x00, new Array(21).fill(6));
    const a = link.request(encodeFrame(0x00, [0]), (f) => f.func === 0, 5000);
    await Promise.resolve();
    feed(status);
    await a;
    await clock.advance(DUPLICATE_WINDOW_MS + 1);
    const b = link.request(encodeFrame(0x00, [0]), (f) => f.func === 0, 5000);
    await Promise.resolve();
    feed(status);
    expect(Array.from((await b).bytes)).toEqual(Array.from(status));
  });
});
