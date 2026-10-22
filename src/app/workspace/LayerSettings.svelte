<script lang="ts">
  import NumberField from '$lib/ui/NumberField.svelte';
  import Toggle from '$lib/ui/Toggle.svelte';
  import { DEFAULT_IMAGE_SETTINGS } from '$lib/cam/raster/defaults';
  import { DEFAULT_FILL_SETTINGS, DEFAULT_LINE_SETTINGS } from '$lib/import/layer-defaults';
  import { layerAccepts } from '$lib/project/layer-fit';
  import { updateLayer } from '$lib/project/operations';
  import type {
    DitherAlgorithm,
    FillSettings,
    ImageSettings,
    Layer,
    LayerMode,
    LineSettings,
  } from '$lib/project/types';
  import { editor } from '../state/editor.svelte';
  import { machine } from '../state/machine.svelte';
  import { profiles } from '../state/profiles.svelte';
  import { withMode } from '../lib/layers';
  import { CO2_MIN_FIRING_PERCENT, speedFromUnit, speedToUnit } from '../lib/units';

  let { layer }: { layer: Layer } = $props();

  const line = $derived(layer.line ?? DEFAULT_LINE_SETTINGS);
  const fill = $derived(layer.fill ?? DEFAULT_FILL_SETTINGS);
  const image = $derived(layer.image ?? DEFAULT_IMAGE_SETTINGS);
  const maxRate = $derived(
    machine.limits?.maxRateX && machine.limits?.maxRateY
      ? Math.min(machine.limits.maxRateX, machine.limits.maxRateY)
      : 60000,
  );
  const mismatched = $derived(
    editor.project?.objects.some((o) => o.layerId === layer.id && !layerAccepts(layer.mode, o.kind)) ?? false,
  );

  const speedUnit = $derived(profiles.active.speedUnit);
  const weakForTube = $derived(
    profiles.active.laserType === 'co2' && layer.power > 0 && layer.power < CO2_MIN_FIRING_PERCENT,
  );

  /** Common laser power levels; any other value can still be typed. */
  const POWER_PRESETS = [5, 10, 15, 20, 25, 30, 40, 50, 60, 70, 80, 90, 100];

  const ALGORITHMS: Array<{ id: DitherAlgorithm; label: string }> = [
    { id: 'floyd-steinberg', label: 'Floyd–Steinberg' },
    { id: 'atkinson', label: 'Atkinson' },
    { id: 'jarvis', label: 'Jarvis' },
    { id: 'stucki', label: 'Stucki' },
    { id: 'ordered', label: 'Bayer 8×8' },
    { id: 'threshold', label: 'Threshold' },
    { id: 'grayscale', label: 'Grayscale' },
  ];

  function set(change: Partial<Layer>, live = false, field = 'x') {
    const id = layer.id;
    editor.commit((p) => updateLayer(p, id, change), { coalesce: `layer-${id}-${field}` });
    if (!live) editor.sealHistory();
  }

  const setLine = (c: Partial<LineSettings>, live: boolean, f: string) =>
    set({ line: { ...line, ...c } }, live, f);
  const setFill = (c: Partial<FillSettings>, live: boolean, f: string) =>
    set({ fill: { ...fill, ...c } }, live, f);
  const setImage = (c: Partial<ImageSettings>, live: boolean, f: string) =>
    set({ image: { ...image, ...c } }, live, f);
  const setMode = (mode: LayerMode) => set(withMode(layer, mode), false, 'mode');
</script>

<div class="settings" data-testid="layer-settings">
  <div class="segmented" role="group" aria-label="Layer mode">
    {#each ['line', 'fill', 'image'] as const as mode (mode)}
      <button
        type="button"
        aria-pressed={layer.mode === mode}
        onclick={() => setMode(mode)}
        data-testid="mode-{mode}"
      >
        {mode === 'line' ? 'Line' : mode === 'fill' ? 'Fill' : 'Image'}
      </button>
    {/each}
  </div>

  {#if mismatched}
    <p class="note">
      {layer.mode === 'image' ? 'Vectors on this layer are skipped.' : 'Images on this layer are skipped.'}
    </p>
  {/if}

  <div class="grid">
    <NumberField
      label="Speed"
      unit={speedUnit}
      value={speedToUnit(layer.speed, speedUnit)}
      decimals={speedUnit === 'mm/s' ? 1 : 0}
      min={speedToUnit(1, speedUnit)}
      max={speedToUnit(maxRate, speedUnit)}
      step={speedUnit === 'mm/s' ? 1 : 10}
      onchange={(v, l) => set({ speed: speedFromUnit(v, speedUnit) }, l, 'speed')}
      testid="layer-speed"
    />
    <NumberField
      label="Power"
      presets={POWER_PRESETS}
      unit="%"
      value={layer.power}
      min={0}
      max={100}
      step={1}
      onchange={(v, l) => set({ power: v }, l, 'power')}
      testid="layer-power"
    />
    <NumberField
      label="Passes"
      value={layer.passes}
      min={1}
      max={100}
      step={1}
      onchange={(v, l) => set({ passes: v }, l, 'passes')}
    />
    {#if weakForTube}
      <p class="tube-hint" data-testid="co2-power-hint">
        CO₂ tubes rarely fire below {CO2_MIN_FIRING_PERCENT}%.
      </p>
    {/if}

    {#if layer.mode === 'line'}
      <NumberField
        label="Kerf offset"
        unit="mm"
        decimals={3}
        value={line.kerfOffset}
        min={-5}
        max={5}
        step={0.01}
        onchange={(v, l) => setLine({ kerfOffset: v }, l, 'kerf')}
      />
    {:else if layer.mode === 'fill'}
      <NumberField
        label="Interval"
        unit="mm"
        decimals={3}
        value={fill.interval}
        min={0.01}
        max={10}
        step={0.01}
        onchange={(v, l) => setFill({ interval: v }, l, 'interval')}
      />
      <NumberField
        label="Angle"
        unit="°"
        decimals={1}
        value={fill.angle}
        min={-360}
        max={360}
        step={1}
        onchange={(v, l) => setFill({ angle: v }, l, 'angle')}
      />
      <NumberField
        label="Overscan"
        unit="mm"
        decimals={1}
        value={fill.overscan}
        min={0}
        max={50}
        step={0.5}
        onchange={(v, l) => setFill({ overscan: v }, l, 'overscan')}
      />
    {:else}
      <NumberField
        label="Min power"
        presets={POWER_PRESETS}
        unit="%"
        value={layer.minPower}
        min={0}
        max={layer.power}
        step={1}
        onchange={(v, l) => set({ minPower: v }, l, 'minPower')}
      />
      <NumberField
        label="Line density"
        unit="dpi"
        value={image.dpi}
        min={10}
        max={1270}
        step={1}
        onchange={(v, l) => setImage({ dpi: v }, l, 'dpi')}
      />
      <NumberField
        label="Overscan"
        unit="mm"
        decimals={1}
        value={image.overscan}
        min={0}
        max={50}
        step={0.5}
        onchange={(v, l) => setImage({ overscan: v }, l, 'overscan')}
      />
    {/if}
  </div>

  {#if layer.mode === 'image'}
    <label class="field">
      Dithering
      <select
        class="input"
        value={image.algorithm}
        onchange={(e) =>
          setImage({ algorithm: e.currentTarget.value as DitherAlgorithm }, false, 'algorithm')}
        data-testid="layer-algorithm"
      >
        {#each ALGORITHMS as a (a.id)}<option value={a.id}>{a.label}</option>{/each}
      </select>
    </label>
    <div class="grid">
      {#if image.algorithm === 'threshold'}
        <NumberField
          label="Threshold"
          value={image.threshold}
          min={0}
          max={255}
          step={1}
          onchange={(v, l) => setImage({ threshold: v }, l, 'threshold')}
        />
      {/if}
      <NumberField
        label="Brightness"
        value={image.brightness}
        min={-100}
        max={100}
        step={1}
        onchange={(v, l) => setImage({ brightness: v }, l, 'brightness')}
      />
      <NumberField
        label="Contrast"
        value={image.contrast}
        min={-100}
        max={100}
        step={1}
        onchange={(v, l) => setImage({ contrast: v }, l, 'contrast')}
      />
      <NumberField
        label="Gamma"
        decimals={2}
        value={image.gamma}
        min={0.1}
        max={5}
        step={0.05}
        onchange={(v, l) => setImage({ gamma: v }, l, 'gamma')}
      />
    </div>
    <div class="segmented small" role="group" aria-label="Scan direction">
      <button
        type="button"
        aria-pressed={image.scanAngle === 0}
        onclick={() => setImage({ scanAngle: 0 }, false, 'scan')}>Horizontal</button
      >
      <button
        type="button"
        aria-pressed={image.scanAngle === 90}
        onclick={() => setImage({ scanAngle: 90 }, false, 'scan')}>Vertical</button
      >
    </div>
    <div class="toggles">
      <Toggle
        label="Bidirectional"
        checked={image.bidirectional}
        onchange={(c) => setImage({ bidirectional: c }, false, 'bidi')}
      />
      <Toggle
        label="Invert"
        checked={image.invert}
        onchange={(c) => setImage({ invert: c }, false, 'invert')}
      />
      <Toggle
        label="Pass-through"
        checked={image.passThrough}
        onchange={(c) => setImage({ passThrough: c }, false, 'pass')}
      />
    </div>
  {:else if layer.mode === 'fill'}
    <div class="toggles">
      <Toggle
        label="Bidirectional"
        checked={fill.bidirectional}
        onchange={(c) => setFill({ bidirectional: c }, false, 'bidi')}
      />
      <Toggle
        label="Cross-hatch"
        checked={fill.crossHatch}
        onchange={(c) => setFill({ crossHatch: c }, false, 'hatch')}
      />
    </div>
  {/if}

  {#if profiles.active.supportsAirAssist}
    <Toggle
      label="Air assist"
      checked={layer.airAssist}
      onchange={(c) => set({ airAssist: c }, false, 'air')}
    />
  {/if}
</div>

<style>
  .settings {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
  }

  .tube-hint {
    grid-column: 1 / -1;
    margin: -4px 0 0;
    font-size: var(--ol-fs-sm);
    color: var(--ol-hold);
  }

  .toggles {
    display: flex;
    flex-wrap: wrap;
    column-gap: 16px;
  }

  .note {
    font-size: var(--ol-fs-sm);
    color: var(--ol-hold);
  }

  select.input {
    appearance: auto;
  }
</style>
