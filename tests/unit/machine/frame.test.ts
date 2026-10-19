import { describe, expect, it } from 'vitest';
import { buildFrameGcode } from '$lib/machine/job/frame';
import { createRig, testProfile } from './helpers';

const bounds = { minX: 20, minY: 30, maxX: 120, maxY: 80 };

describe('framing through the JobRunner', () => {
  it('traces the bounds with the laser off by default', async () => {
    const rig = await createRig();
    const events: string[] = [];
    rig.runner.onEvent((e) => e.type === 'started' && events.push(e.kind));
    const outcome = await rig.run(rig.runner.run(buildFrameGcode(bounds, testProfile()), { kind: 'frame' }));
    expect(outcome).toBe('completed');
    expect(events).toEqual(['frame']);
    expect(rig.runner.progress.get().kind).toBe('frame');
    expect(rig.sim.burns).toEqual([]);
    expect(rig.sim.position).toEqual({ x: 20, y: 30, z: 0 });
  });

  it('fires at most 5 % with M3 when frame power is enabled', async () => {
    const rig = await createRig();
    const lines = buildFrameGcode(bounds, testProfile({ framePowerPercent: 50, maxS: 1000 }));
    await rig.run(rig.runner.run(lines, { kind: 'frame' }));
    expect(rig.sim.burns).toHaveLength(4);
    for (const burn of rig.sim.burns) expect(burn).toMatchObject({ power: 50, mode: 'M3', feed: 3000 });
    expect(rig.sim.modal.spindle).toBe('M5');
  });

  it('can be stopped like any job', async () => {
    const rig = await createRig();
    const frame = rig.runner.run(buildFrameGcode(bounds, testProfile({ frameSpeed: 600 })), {
      kind: 'frame',
    });
    await rig.clock.advance(3000);
    await rig.run(rig.runner.stop());
    expect(await frame).toBe('aborted');
  });
});
