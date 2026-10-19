import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { LineAccounting } from '$lib/machine/grbl/line-accounting';
import { createSeededRandom } from '$lib/machine/simulator/random';
import { createRig } from './helpers';

/** A line of exactly `length` characters (1–79). Short ones are not valid G-code: errors are fine. */
function lineOfLength(length: number, i: number): string {
  if (length < 4) return 'G90M5'.slice(0, length);
  return `G0${' '.repeat(length - 4)}X${i % 10}`;
}

describe('character-counting buffer accounting (property)', () => {
  it('never lets in-flight bytes exceed rxSize - 1 and settles in FIFO order', () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 1, max: 79 }), { minLength: 1, maxLength: 300 }),
        fc.integer({ min: 1, max: 1000 }),
        (lengths, seed) => {
          const random = createSeededRandom(seed);
          const accounting = new LineAccounting(128);
          const settled: number[] = [];
          let next = 0;
          while (settled.length < lengths.length) {
            const canSend = next < lengths.length && accounting.fits(lengths[next] + 1);
            if (canSend && (random() < 0.6 || accounting.inFlightCount === 0)) {
              const index = next++;
              accounting.push({
                line: String(index),
                byteLength: lengths[index] + 1,
                settle: () => settled.push(index),
                discard: () => undefined,
              });
              expect(accounting.inFlightBytes).toBeLessThanOrEqual(127);
            } else {
              accounting.shift()?.settle({ ok: true });
            }
          }
          expect(settled).toEqual(lengths.map((_, i) => i));
          expect(accounting.inFlightBytes).toBe(0);
        },
      ),
      { numRuns: 300 },
    );
  });

  it('streams random line lengths through the simulator without overflow, each line acked once', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.integer({ min: 1, max: 79 }), { minLength: 1, maxLength: 400 }),
        fc.constantFrom(96, 128, 256),
        fc.integer({ min: 1, max: 12 }),
        fc.integer({ min: 0, max: 3 }),
        fc.integer({ min: 1, max: 2 ** 31 - 1 }),
        async (lengths, rxBufferSize, maxPieceBytes, responseDelayMs, seed) => {
          const rig = await createRig({ sim: { rxBufferSize, random: createSeededRandom(seed) } });
          rig.sim.faults = { splitChunks: { maxPieceBytes }, responseDelayMs };
          const lines = lengths.map(lineOfLength);
          const first = rig.sim.receivedLines.length;
          let acks = 0;
          rig.runner.onEvent((e) => {
            if (e.type === 'progress') acks = e.progress.acked;
          });
          const outcome = await rig.run(rig.runner.run(lines, { errorPolicy: 'continue' }));
          expect(outcome).toBe('completed');
          expect(rig.sim.overflowCount).toBe(0);
          expect(rig.sim.peakRxBytes).toBeLessThanOrEqual(rxBufferSize - 1);
          expect(acks).toBe(lines.length);
          // Every non-empty line reached the controller exactly once, in order.
          expect(rig.sim.receivedLines.slice(first)).toEqual(lines.filter((l) => l.trim() !== ''));
        },
      ),
      { numRuns: 60 },
    );
  });
});
