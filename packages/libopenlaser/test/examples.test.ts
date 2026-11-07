// @vitest-environment jsdom
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { svgToGcode } from '../examples/svg-to-gcode';
import { runOnVirtualLaser } from '../examples/virtual-machine';
import { cutLayer, star, traceBitmap } from '../examples/design-tools';
import { engraveOnLaserPecker } from '../examples/laserpecker';
import { exportRuida } from '../examples/ruida-export';
import { cutBirchPlywood, orturProfile, roundTrip } from '../examples/projects-and-presets';
import { VirtualLaserPecker, VirtualScheduler } from 'libopenlaser/machine';
import { addLayer, addObjects, createProject, defaultLayer, makeId } from 'libopenlaser/project';
import { shapePaths } from 'libopenlaser/shapes';

const SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="40mm" height="20mm" viewBox="0 0 40 20">
  <rect x="2" y="2" width="36" height="16" fill="none" stroke="#ff0000"/>
</svg>`;

describe('README examples', () => {
  it('turns an SVG into G-code', () => {
    expect(svgToGcode(SVG)).toEqual([
      'G90',
      'G21',
      'M4 S0',
      'G0 X2 Y2',
      'G1 Y18 F1200 S600',
      'X38',
      'Y2',
      'X2',
      'M5 S0',
    ]);
  });

  it('runs G-code on the virtual laser', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const square = ['G90', 'G21', 'M4 S0', 'G0 X1 Y1', 'G1 X3 F3000 S500', 'Y3', 'X1', 'Y1', 'M5 S0'];
    expect(await runOnVirtualLaser(square)).toEqual({ outcome: 'completed' });
  });

  it('builds a star on a cut layer', () => {
    const object = star();
    expect(object.layerId).toBe(cutLayer.id);
    expect(object.paths).toEqual(shapePaths('star', 50, 50));
    expect(object.transform).toEqual([1, 0, 0, 1, 20, 20]);
  });

  it('traces a bitmap into vector objects', async () => {
    // A black 8 × 8 square on white, 16 × 16 pixels.
    const width = 16;
    const data = new Uint8ClampedArray(width * width * 4).fill(255);
    for (let y = 4; y < 12; y++)
      for (let x = 4; x < 12; x++) data.fill(0, (y * width + x) * 4, (y * width + x) * 4 + 3);
    const objects = await traceBitmap({ width, height: width, data }, 32);
    expect(objects.length).toBeGreaterThan(0);
    expect(objects.some((o) => o.name === '#000000')).toBe(true);
  });

  it('exports a Ruida job', () => {
    const rd = exportRuida(starProject(0.5));
    expect(rd).toBeInstanceOf(Uint8Array);
    expect(rd.length).toBeGreaterThan(100);
  });

  it('engraves on a LaserPecker', async () => {
    const lp2 = {
      ...starProject(0.1),
      layers: [defaultLayer({ id: cutLayer.id, mode: 'fill', power: 30, speed: 2400 })],
    };
    // A virtual clock runs the device's real timing (uploads, settling, polling) instantly.
    const clock = new VirtualScheduler();
    const device = new VirtualLaserPecker({ scheduler: clock });
    const outcome = await clock.runUntil(engraveOnLaserPecker(lp2, device, { scheduler: clock }), 120_000);
    expect(outcome).toEqual({ outcome: 'completed' });
    expect(device.power).toBe(30);
  });

  it('saves, reopens and applies presets', async () => {
    const project = starProject(0.5);
    expect(await roundTrip(project)).toEqual(project);
    expect(orturProfile()).toMatchObject({
      name: 'Ortur Laser Master 3 (10W)',
      bedWidth: 400,
      bedHeight: 400,
    });
    const tuned = cutBirchPlywood(project).layers[0];
    expect(tuned.materialId).toBeDefined();
    expect(tuned.power).not.toBe(cutLayer.power);
  });
});

/** The example star, scaled, near the bed's corner. */
function starProject(scale: number) {
  let project = createProject({ id: makeId });
  project = addLayer(project, cutLayer);
  return addObjects(project, [{ ...star(), transform: [scale, 0, 0, scale, 10, 10] }]);
}

describe('README', () => {
  const readme = readFileSync(resolve(import.meta.dirname, '../README.md'), 'utf8');
  const examples = resolve(import.meta.dirname, '../examples');

  it.each(readdirSync(examples))('shows examples/%s exactly as tested', (file) => {
    expect(readme).toContain('```ts\n' + readFileSync(resolve(examples, file), 'utf8'));
  });
});
