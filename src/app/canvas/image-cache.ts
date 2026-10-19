/**
 * Canvas looks for image objects: the dithered preview tinted in the layer color (DESIGN §5),
 * computed in the worker and cached. While a preview computes, the raw image shows faintly.
 */
import { DEFAULT_IMAGE_SETTINGS } from '$lib/cam/raster/defaults';
import type { Asset, ImageObject, Layer } from '$lib/project/types';
import { reportError } from '$lib/ui/errors';
import { ditherInWorker } from '../lib/cam-client';
import type { ImageLook } from './scene-render';

const ALGORITHM_NAMES: Record<string, string> = {
  threshold: 'Threshold',
  'floyd-steinberg': 'Floyd–Steinberg',
  atkinson: 'Atkinson',
  jarvis: 'Jarvis',
  stucki: 'Stucki',
  ordered: 'Bayer',
  grayscale: 'Grayscale',
};

interface Entry {
  key: string;
  bitmap: CanvasImageSource | null;
  pending: boolean;
}

export class ImageLooks {
  private previews = new Map<string, Entry>();
  private raw = new Map<string, ImageBitmap | 'loading' | 'failed'>();

  constructor(private readonly invalidate: () => void) {}

  look(object: ImageObject, layer: Layer, asset: Asset | undefined): ImageLook {
    const settings = layer.image ?? DEFAULT_IMAGE_SETTINGS;
    const caption =
      layer.mode === 'image'
        ? `${object.name} · ${ALGORITHM_NAMES[settings.algorithm] ?? settings.algorithm} · ${settings.dpi} dpi`
        : `${object.name} · move to an image layer`;
    if (!asset) return { bitmap: null, caption: `${object.name} · missing image` };
    if (layer.mode !== 'image') return { bitmap: this.rawBitmap(asset), caption };

    // Rounded size keeps tiny drag jitters from recomputing the preview.
    const w = Math.abs(object.width * Math.hypot(object.transform[0], object.transform[1]));
    const h = Math.abs(object.height * Math.hypot(object.transform[2], object.transform[3]));
    const key = JSON.stringify([
      asset.id,
      settings,
      layer.power,
      layer.minPower,
      layer.color,
      w.toFixed(1),
      h.toFixed(1),
    ]);
    const entry = this.previews.get(object.id);
    if (entry?.key === key) return { bitmap: entry.bitmap ?? this.rawBitmap(asset), caption };
    this.schedule(object.id, key, asset, layer, w, h, entry?.bitmap ?? null);
    return { bitmap: entry?.bitmap ?? this.rawBitmap(asset), caption };
  }

  private timers = new Map<string, ReturnType<typeof setTimeout>>();

  /** Debounced so a drag or a scrubbed setting computes once it settles. */
  private schedule(
    objectId: string,
    key: string,
    asset: Asset,
    layer: Layer,
    w: number,
    h: number,
    previous: CanvasImageSource | null,
  ): void {
    this.previews.set(objectId, { key, bitmap: previous, pending: true });
    clearTimeout(this.timers.get(objectId));
    this.timers.set(
      objectId,
      setTimeout(() => this.request(objectId, key, asset, layer, w, h, previous), 150),
    );
  }

  private request(
    objectId: string,
    key: string,
    asset: Asset,
    layer: Layer,
    w: number,
    h: number,
    previous: CanvasImageSource | null,
  ): void {
    this.previews.set(objectId, { key, bitmap: previous, pending: true });
    ditherInWorker({
      assetId: asset.id,
      blob: asset.data,
      settings: { ...(layer.image ?? DEFAULT_IMAGE_SETTINGS) },
      layer: { power: layer.power, minPower: layer.minPower },
      widthMm: w,
      heightMm: h,
    })
      .then((result) => {
        const current = this.previews.get(objectId);
        if (current?.key !== key) return;
        this.previews.set(objectId, { key, bitmap: tint(result, layer.color), pending: false });
        this.invalidate();
      })
      .catch((error: unknown) => {
        reportError(error, 'Image preview');
        const current = this.previews.get(objectId);
        if (current?.key === key) this.previews.set(objectId, { ...current, pending: false });
      });
  }

  private rawBitmap(asset: Asset): ImageBitmap | null {
    const cached = this.raw.get(asset.id);
    if (cached instanceof ImageBitmap) return cached;
    if (!cached) {
      this.raw.set(asset.id, 'loading');
      createImageBitmap(asset.data)
        .then((bitmap) => {
          this.raw.set(asset.id, bitmap);
          this.invalidate();
        })
        .catch(() => this.raw.set(asset.id, 'failed'));
    }
    return null;
  }

  /** Drops previews for objects that no longer exist. */
  prune(objectIds: Set<string>): void {
    for (const id of this.previews.keys()) if (!objectIds.has(id)) this.previews.delete(id);
  }
}

/** Burn intensity → layer-colored pixels with alpha, on a canvas the scene can draw. */
function tint(
  preview: { width: number; height: number; burn: Uint8ClampedArray },
  color: string,
): OffscreenCanvas | HTMLCanvasElement {
  const m = /^#?([0-9a-f]{6})$/i.exec(color.trim());
  const n = m ? parseInt(m[1], 16) : 0xb794f6;
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  const pixels = new Uint8ClampedArray(preview.width * preview.height * 4);
  for (let i = 0, o = 0; i < preview.burn.length; i++, o += 4) {
    pixels[o] = r;
    pixels[o + 1] = g;
    pixels[o + 2] = b;
    pixels[o + 3] = preview.burn[i];
  }
  const canvas =
    typeof OffscreenCanvas !== 'undefined'
      ? new OffscreenCanvas(preview.width, preview.height)
      : Object.assign(document.createElement('canvas'), { width: preview.width, height: preview.height });
  const ctx = canvas.getContext('2d') as OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D;
  ctx.putImageData(new ImageData(pixels, preview.width, preview.height), 0, 0);
  return canvas;
}
