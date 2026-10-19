<script lang="ts">
  import type { RasterSource } from '$lib/cam/types';
  import type { PathData } from '$lib/geometry/types';
  import { traceLayersToPaths } from '$lib/trace/to-paths';
  import type { TraceResult } from '$lib/trace/types';

  interface Props {
    pixels: RasterSource | null;
    result: TraceResult | null;
    view: 'result' | 'outline' | 'original';
  }

  let { pixels, result, view }: Props = $props();
  let host = $state<HTMLDivElement | null>(null);
  let canvas = $state<HTMLCanvasElement | null>(null);
  let size = $state({ w: 0, h: 0 });

  /** Paths come back Y-up; flip them into the image's own Y-down pixel space for drawing. */
  function toPath2D(paths: PathData[], height: number): Path2D {
    const p = new Path2D();
    for (const sub of paths) {
      p.moveTo(sub.start.x, height - sub.start.y);
      for (const s of sub.segments) {
        if (s.type === 'L') p.lineTo(s.to.x, height - s.to.y);
        else p.bezierCurveTo(s.c1.x, height - s.c1.y, s.c2.x, height - s.c2.y, s.to.x, height - s.to.y);
      }
      if (sub.closed) p.closePath();
    }
    return p;
  }

  const shapes = $derived(
    result
      ? traceLayersToPaths(result, result.width, result.height).map((l) => ({
          color: l.color,
          path: toPath2D(l.paths, result.height),
        }))
      : [],
  );

  const bitmap = $derived.by(() => {
    if (!pixels) return null;
    const c = new OffscreenCanvas(pixels.width, pixels.height);
    c.getContext('2d')!.putImageData(
      new ImageData(new Uint8ClampedArray(pixels.data), pixels.width, pixels.height),
      0,
      0,
    );
    return c;
  });

  $effect(() => {
    if (!host) return;
    const el = host;
    const ro = new ResizeObserver(() => (size = { w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  });

  $effect(() => {
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx || !size.w) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = size.w * dpr;
    canvas.height = size.h * dpr;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const w = result?.width ?? pixels?.width;
    const h = result?.height ?? pixels?.height;
    if (!w || !h) return;
    const pad = 16;
    const s = Math.min((size.w - pad * 2) / w, (size.h - pad * 2) / h);
    const ox = (size.w - w * s) / 2;
    const oy = (size.h - h * s) / 2;
    ctx.setTransform(s * dpr, 0, 0, s * dpr, ox * dpr, oy * dpr);
    // Paper-white backing so dark traces read the way they will on the material.
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, w, h);
    if (view !== 'result' || !result) {
      if (bitmap) {
        ctx.globalAlpha = view === 'outline' && result ? 0.35 : 1;
        ctx.drawImage(bitmap, 0, 0, w, h);
        ctx.globalAlpha = 1;
      }
      if (view === 'outline' && result) {
        ctx.strokeStyle = getComputedStyle(canvas).getPropertyValue('--ol-beam').trim();
        ctx.lineWidth = 1.2 / s;
        for (const p of shapes) ctx.stroke(p.path);
      }
      return;
    }
    for (const p of shapes) {
      ctx.fillStyle = p.color;
      ctx.fill(p.path, 'evenodd');
    }
  });
</script>

<div class="preview" bind:this={host}>
  <canvas
    bind:this={canvas}
    style="width: {size.w}px; height: {size.h}px"
    aria-label="Trace preview"
    data-testid="trace-preview"
  ></canvas>
</div>

<style>
  .preview {
    flex: 1;
    min-height: 0;
    border-radius: var(--ol-radius-md);
    border: 1px solid var(--ol-border);
    background: var(--ol-bed);
    overflow: hidden;
  }

  canvas {
    display: block;
  }
</style>
