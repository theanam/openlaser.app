<script lang="ts">
  import Wand from '@lucide/svelte/icons/wand-sparkles';
  import Shapes from '@lucide/svelte/icons/shapes';
  import Spline from '@lucide/svelte/icons/spline';
  import ImageIcon from '@lucide/svelte/icons/image';
  import LoaderCircle from '@lucide/svelte/icons/loader-circle';
  import Dialog from '$lib/ui/Dialog.svelte';
  import NumberField from '$lib/ui/NumberField.svelte';
  import Toggle from '$lib/ui/Toggle.svelte';
  import { toast } from '$lib/ui/toasts.svelte';
  import { errorMessage, reportError } from '$lib/ui/errors';
  import type { RasterSource } from '$lib/cam/types';
  import { decodeImage } from '$lib/import/image';
  import { makeId } from '$lib/project/ids';
  import type { ImageObject } from '$lib/project/types';
  import { stopTrace, trace } from '$lib/trace/client';
  import { TRACE_PRESETS, tracePreset, type TracePresetId } from '$lib/trace/presets';
  import { traceLayersToPaths } from '$lib/trace/to-paths';
  import type { TraceOptions, TraceResult } from '$lib/trace/types';
  import { editor } from '../state/editor.svelte';
  import { ui } from '../state/ui.svelte';
  import { burnableLayers, placeTrace } from '../lib/trace-place';
  import TracePreview from './TracePreview.svelte';

  /** Longest side traced, in pixels: plenty for laser detail and keeps the live preview quick. */
  const MAX_TRACE_PX = 1600;

  const image = $derived(
    ui.traceImageId
      ? (editor.project?.objects.find(
          (o): o is ImageObject => o.id === ui.traceImageId && o.kind === 'image',
        ) ?? null)
      : null,
  );

  let open = $derived(image !== null);
  let pixels = $state.raw<RasterSource | null>(null);
  let result = $state.raw<TraceResult | null>(null);
  let preset = $state<TracePresetId | null>('lineart');
  let options = $state<TraceOptions>({ ...tracePreset('lineart').options });
  let autoThreshold = $state(true);
  let view = $state<'result' | 'outline' | 'original'>('result');
  let progress = $state<number | null>(null);
  let layerMode = $state<'fill' | 'line'>('fill');
  let powerByShade = $state(true);
  let keepImage = $state(false);
  let timer: ReturnType<typeof setTimeout> | null = null;

  // Load the image once per dialog opening.
  $effect(() => {
    const target = image;
    pixels = null;
    result = null;
    if (!target) return;
    const asset = editor.project?.assets[target.assetId];
    if (!asset) return;
    void decodeImage(asset.data)
      .then((source) => (pixels = downscale(source, MAX_TRACE_PX)))
      .catch((error: unknown) => toast.error(`Could not read the image: ${errorMessage(error)}`));
  });

  // Re-trace whenever the settings change, a moment after the last change.
  $effect(() => {
    const px = pixels;
    const opts: TraceOptions = {
      ...$state.snapshot(options),
      threshold: autoThreshold ? -1 : options.threshold,
    };
    if (!px) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => void run(px, opts), 180);
  });

  async function run(px: RasterSource, opts: TraceOptions) {
    progress = 0;
    try {
      result = await trace(px, opts, { onProgress: (p) => (progress = p) });
      progress = null;
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      progress = null;
      reportError(error, 'Trace');
      toast.error(`Trace failed: ${errorMessage(error)}`);
    }
  }

  function downscale(source: RasterSource, max: number): RasterSource {
    const scale = Math.min(1, max / Math.max(source.width, source.height));
    if (scale >= 1) return source;
    const w = Math.max(1, Math.round(source.width * scale));
    const h = Math.max(1, Math.round(source.height * scale));
    const from = new OffscreenCanvas(source.width, source.height);
    from
      .getContext('2d')!
      .putImageData(new ImageData(new Uint8ClampedArray(source.data), source.width, source.height), 0, 0);
    const to = new OffscreenCanvas(w, h);
    const ctx = to.getContext('2d')!;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(from, 0, 0, w, h);
    const data = ctx.getImageData(0, 0, w, h);
    return { width: w, height: h, data: data.data };
  }

  function usePreset(id: TracePresetId) {
    preset = id;
    const next = tracePreset(id).options;
    options = { ...next };
    autoThreshold = next.threshold < 0;
    if (next.mode === 'bw') powerByShade = false;
  }

  function set<K extends keyof TraceOptions>(key: K, value: TraceOptions[K]) {
    options = { ...options, [key]: value };
    preset = null;
  }

  function close() {
    if (timer) clearTimeout(timer);
    stopTrace();
    ui.traceImageId = null;
  }

  function apply() {
    const target = image;
    if (!target || !result) return;
    const traced = burnableLayers(traceLayersToPaths(result, target.width, target.height));
    if (traced.length === 0) {
      toast.warning('The trace is empty. Try a lower threshold or fewer specks removed.');
      return;
    }
    let ids: string[] = [];
    editor.commit((p) => {
      const placed = placeTrace(p, target, traced, { mode: layerMode, powerByShade, keepImage }, makeId);
      ids = placed.objectIds;
      return placed.project;
    });
    editor.select(ids);
    close();
    toast.success(`Traced ${traced.length} ${traced.length === 1 ? 'shape' : 'colors'}`);
  }

  const summary = $derived(
    result
      ? `${result.layers.length} ${result.layers.length === 1 ? 'color' : 'colors'} · ${result.nodes.toLocaleString('en-US')} nodes`
      : '',
  );

  const VIEWS = [
    { id: 'result', label: 'Result', icon: Shapes },
    { id: 'outline', label: 'Outlines over the image', icon: Spline },
    { id: 'original', label: 'Original image', icon: ImageIcon },
  ] as const;
</script>

<Dialog bind:open title="Trace image" width={900} onclose={close} testid="trace-dialog">
  <div class="layout">
    <div class="stage">
      <TracePreview {pixels} {result} {view} />
      <div class="views" role="radiogroup" aria-label="Preview">
        {#each VIEWS as v (v.id)}
          <button
            type="button"
            class="icon-btn"
            role="radio"
            aria-checked={view === v.id}
            aria-label={v.label}
            onclick={() => (view = v.id)}
          >
            <v.icon size={16} />
          </button>
        {/each}
      </div>
      <div class="status mono">
        {#if !pixels}
          <LoaderCircle size={13} class="spin" />Reading image…
        {:else if progress !== null}
          <LoaderCircle size={13} class="spin" />Tracing {Math.round(progress * 100)}%
        {:else if result}
          {summary}
        {/if}
      </div>
    </div>

    <div class="controls">
      <div class="presets" role="radiogroup" aria-label="Presets">
        {#each TRACE_PRESETS as p (p.id)}
          <button
            type="button"
            class="chip"
            role="radio"
            aria-checked={preset === p.id}
            onclick={() => usePreset(p.id)}
            data-testid="trace-preset-{p.id}">{p.label}</button
          >
        {/each}
      </div>

      <div class="segmented" role="group" aria-label="Mode">
        <button
          type="button"
          aria-pressed={options.mode === 'color'}
          title="One layer per color"
          onclick={() => set('mode', 'color')}>Color</button
        >
        <button
          type="button"
          aria-pressed={options.mode === 'gray'}
          title="One layer per shade of gray"
          onclick={() => set('mode', 'gray')}>Gray</button
        >
        <button
          type="button"
          aria-pressed={options.mode === 'bw'}
          title="One layer: everything darker than the threshold"
          onclick={() => set('mode', 'bw')}>B&amp;W</button
        >
      </div>

      <div class="grid">
        {#if options.mode === 'bw'}
          <NumberField
            label="Threshold"
            hint="Gray level that splits dark from light, 0 to 255"
            value={autoThreshold ? 128 : options.threshold}
            min={0}
            max={255}
            disabled={autoThreshold}
            onchange={(v) => set('threshold', v)}
          />
          <div class="auto">
            <Toggle
              label="Auto threshold"
              hint="Picks the threshold from the image's own tones"
              checked={autoThreshold}
              onchange={(c) => (autoThreshold = c)}
            />
          </div>
        {:else}
          <NumberField
            label="Colors"
            hint="How many colors the image is reduced to. Each becomes a layer"
            value={options.colors}
            min={2}
            max={64}
            onchange={(v) => set('colors', v)}
          />
          <NumberField
            label="Denoise"
            hint="Blurs grain away before tracing, in pixels"
            unit="px"
            value={options.denoise}
            min={0}
            max={3}
            onchange={(v) => set('denoise', v)}
          />
        {/if}
        <NumberField
          label="Smoothness"
          hint="How much the traced curves are smoothed. Higher drops small bumps"
          value={options.smoothness}
          min={0}
          max={100}
          onchange={(v) => set('smoothness', v)}
        />
        <NumberField
          label="Corners"
          hint="How readily a bend becomes a sharp corner. Higher keeps more corners"
          value={options.corners}
          min={0}
          max={100}
          onchange={(v) => set('corners', v)}
        />
        <NumberField
          label="Ignore specks under"
          hint="Drops regions smaller than this many pixels"
          unit="px"
          value={options.speckle}
          min={0}
          max={500}
          onchange={(v) => set('speckle', v)}
        />
        {#if options.mode === 'bw'}
          <NumberField
            label="Denoise"
            hint="Blurs grain away before tracing, in pixels"
            unit="px"
            value={options.denoise}
            min={0}
            max={3}
            onchange={(v) => set('denoise', v)}
          />
        {/if}
      </div>

      <div class="toggles">
        <Toggle
          label="Drop background color"
          hint="Leaves out the color along the image edges"
          checked={options.ignoreBackground}
          onchange={(c) => set('ignoreBackground', c)}
        />
        <Toggle
          label="Stack layers (overlap burns twice)"
          hint="Each color's shape also covers the colors under it, as in a print. Overlaps burn more than once"
          checked={options.stacked}
          onchange={(c) => set('stacked', c)}
        />
      </div>

      <h3>On the laser</h3>
      <div class="segmented" role="group" aria-label="Layer mode">
        <button type="button" aria-pressed={layerMode === 'fill'} onclick={() => (layerMode = 'fill')}
          >Engrave areas</button
        >
        <button type="button" aria-pressed={layerMode === 'line'} onclick={() => (layerMode = 'line')}
          >Cut outlines</button
        >
      </div>
      <div class="toggles">
        {#if options.mode !== 'bw'}
          <Toggle
            label="Darker colors burn harder"
            hint="Sets each layer's power from how dark its color is"
            checked={powerByShade}
            onchange={(c) => (powerByShade = c)}
          />
        {/if}
        <Toggle
          label="Keep the image underneath"
          hint="Keeps the photo, hidden, under the trace"
          checked={keepImage}
          onchange={(c) => (keepImage = c)}
        />
      </div>
    </div>
  </div>
  {#snippet footer()}
    <button type="button" class="btn" onclick={close}>Cancel</button>
    <button
      type="button"
      class="btn start"
      disabled={!result || progress !== null}
      onclick={apply}
      data-testid="trace-apply"><Wand size={15} />Trace</button
    >
  {/snippet}
</Dialog>

<style>
  .layout {
    display: flex;
    gap: 20px;
    min-height: 460px;
  }

  .stage {
    position: relative;
    flex: 1.3;
    display: flex;
    flex-direction: column;
    gap: 8px;
    min-width: 0;
  }

  .views {
    position: absolute;
    top: 8px;
    right: 8px;
    display: flex;
    gap: 2px;
    padding: 3px;
    border-radius: var(--ol-radius-md);
    background: var(--ol-surface);
    border: 1px solid var(--ol-border);
  }

  .views [aria-checked='true'] {
    background: var(--ol-border);
    color: var(--ol-text);
  }

  .status {
    display: flex;
    align-items: center;
    gap: 6px;
    min-height: 18px;
    font-size: var(--ol-fs-sm);
    color: var(--ol-text-muted);
  }

  .controls {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 12px;
    min-width: 0;
  }

  .presets {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  .chip {
    padding: 5px 10px;
    border-radius: 999px;
    border: 1px solid var(--ol-border);
    background: var(--ol-bg);
    font-size: var(--ol-fs-sm);
  }

  .chip[aria-checked='true'] {
    border-color: var(--ol-signal);
    background: var(--ol-signal-tint);
  }

  .grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
  }

  .auto {
    display: flex;
    align-items: flex-end;
    padding-bottom: 4px;
  }

  .toggles {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  h3 {
    margin: 4px 0 0;
    font-size: var(--ol-fs-sm);
    font-weight: 600;
    color: var(--ol-text-2);
  }
</style>
