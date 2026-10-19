import { describe, it } from 'vitest';
import { DEFAULT_IMAGE_SETTINGS, imageObjectToolpath } from '$lib/cam/raster';
import type { RasterSource, ToolpathRun } from '$lib/cam/types';
import type { ImageObject, ImageSettings, Layer } from '$lib/project/types';
import { expectGolden, readFixture } from './helpers';

/**
 * Raster golden cases (SPEC §12). The input image is generated in code: a 24×16 px gradient
 * (dark left → light right) with a soft vertical modulation and a transparent corner, so every
 * algorithm, trimming, gaps and transparency show up. settings.json holds the case's layer and
 * object placement. expected.gcode is a textual serialization of the runs (one segment per line,
 * `x0 y0 x1 y1 power`), independent of the G-code emitter.
 */
const CASES = [
  'raster-threshold',
  'raster-floyd-steinberg',
  'raster-atkinson',
  'raster-jarvis',
  'raster-stucki',
  'raster-ordered',
  'raster-grayscale',
  'raster-bidirectional-overscan',
];

interface CaseSettings {
  layer: { power: number; minPower: number; image: Partial<ImageSettings> };
  object: { width: number; height: number; transform: ImageObject['transform'] };
}

function gradientImage(): RasterSource {
  const width = 24;
  const height = 16;
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const gray = Math.round((x / (width - 1)) * 230 + 12 * Math.sin((y / (height - 1)) * Math.PI));
      const transparent = x >= 20 && y < 4;
      data.set([gray, gray, gray, transparent ? 0 : 255], (y * width + x) * 4);
    }
  }
  return { width, height, data };
}

const fmt = (v: number) => (Object.is(v, -0) ? 0 : v).toFixed(3);

function serializeRuns(runs: ToolpathRun[]): string[] {
  const lines: string[] = [];
  runs.forEach((run, index) => {
    lines.push(`run ${index}`);
    for (let s = 0; s + 3 < run.points.length; s += 2) {
      const power = Array.isArray(run.power) ? run.power[s / 2] : run.power;
      lines.push(
        `${fmt(run.points[s])} ${fmt(run.points[s + 1])} ${fmt(run.points[s + 2])} ${fmt(run.points[s + 3])} ${fmt(power)}`,
      );
    }
  });
  return lines;
}

describe('raster golden files', () => {
  for (const name of CASES) {
    it(name, () => {
      const settings = JSON.parse(readFixture(name, 'settings.json')) as CaseSettings;
      const layer: Layer = {
        id: 'layer-image',
        name: 'Photo',
        color: '#B794F6',
        visible: true,
        output: true,
        mode: 'image',
        speed: 2400,
        power: settings.layer.power,
        minPower: settings.layer.minPower,
        passes: 1,
        airAssist: false,
        image: { ...DEFAULT_IMAGE_SETTINGS, ...settings.layer.image },
      };
      const object: ImageObject = {
        id: 'image-1',
        kind: 'image',
        layerId: layer.id,
        name: 'gradient',
        locked: false,
        visible: true,
        assetId: 'asset-1',
        ...settings.object,
      };
      const { runs, warnings } = imageObjectToolpath(object, layer, gradientImage());
      if (warnings.length > 0) throw new Error(`unexpected warnings: ${JSON.stringify(warnings)}`);
      expectGolden(name, serializeRuns(runs));
    });
  }
});
