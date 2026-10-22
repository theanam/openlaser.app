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

  const MODE_HINTS: Record<LayerMode, string> = {
    line: 'Burns along the outlines: cuts and scores',
    fill: 'Engraves the inside of shapes with scan lines',
    image: 'Engraves photos as dots or grayscale power',
  };

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
        title={MODE_HINTS[mode]}
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
      hint="How fast the head moves while the laser burns"
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
      hint="Laser power while burning, as a share of the machine's maximum"
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
      hint="How many times the whole layer is burned. More passes cut deeper"
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
        hint="Shifts cut lines by half the beam width so parts come out at size: outlines grow, holes shrink. Negative does the reverse"
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
        hint="Distance between fill lines. Smaller is denser and slower"
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
        hint="Direction of the fill lines. 0° runs them horizontally"
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
        hint="Laser-off run past each line end, so the head is at full speed while it burns"
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
        hint="Power for the lightest gray in Grayscale mode. White stays off"
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
        hint="Scan lines per inch. Higher is finer and slower"
        unit="dpi"
        value={image.dpi}
        min={10}
        max={1270}
        step={1}
        onchange={(v, l) => setImage({ dpi: v }, l, 'dpi')}
      />
      <NumberField
        label="Overscan"
        hint="Laser-off run past each line end, so the head is at full speed while it burns"
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
    <label class="field" title="How gray tones become dots. Grayscale varies the power per pixel">
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
          hint="Gray level that splits burn from no burn, 0 to 255"
          value={image.threshold}
          min={0}
          max={255}
          step={1}
          onchange={(v, l) => setImage({ threshold: v }, l, 'threshold')}
        />
      {/if}
      <NumberField
        label="Brightness"
        hint="Lightens or darkens the whole image before dithering"
        value={image.brightness}
        min={-100}
        max={100}
        step={1}
        onchange={(v, l) => setImage({ brightness: v }, l, 'brightness')}
      />
      <NumberField
        label="Contrast"
        hint="Spreads or squeezes the tones. Higher makes lights lighter and darks darker"
        value={image.contrast}
        min={-100}
        max={100}
        step={1}
        onchange={(v, l) => setImage({ contrast: v }, l, 'contrast')}
      />
      <NumberField
        label="Gamma"
        hint="Mid-tone curve. Above 1 lightens mid-tones, below 1 darkens them"
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
        title="Scan lines run left to right"
        onclick={() => setImage({ scanAngle: 0 }, false, 'scan')}>Horizontal</button
      >
      <button
        type="button"
        aria-pressed={image.scanAngle === 90}
        title="Scan lines run bottom to top"
        onclick={() => setImage({ scanAngle: 90 }, false, 'scan')}>Vertical</button
      >
    </div>
    <div class="toggles">
      <Toggle
        label="Bidirectional"
        hint="Burns on the way back too. Faster, with slight line offsets on some machines"
        checked={image.bidirectional}
        onchange={(c) => setImage({ bidirectional: c }, false, 'bidi')}
      />
      <Toggle
        label="Invert"
        hint="Burns the light areas and leaves the dark ones"
        checked={image.invert}
        onchange={(c) => setImage({ invert: c }, false, 'invert')}
      />
      <Toggle
        label="Pass-through"
        hint="Sends the image as it is, with no tone changes or dithering. For images you dithered yourself"
        checked={image.passThrough}
        onchange={(c) => setImage({ passThrough: c }, false, 'pass')}
      />
    </div>
  {:else if layer.mode === 'fill'}
    <div class="toggles">
      <Toggle
        label="Bidirectional"
        hint="Burns on the way back too. Faster, with slight line offsets on some machines"
        checked={fill.bidirectional}
        onchange={(c) => setFill({ bidirectional: c }, false, 'bidi')}
      />
      <Toggle
        label="Cross-hatch"
        hint="Adds a second fill pass turned 90°, for a denser, more even engrave"
        checked={fill.crossHatch}
        onchange={(c) => setFill({ crossHatch: c }, false, 'hatch')}
      />
    </div>
  {/if}

  {#if profiles.active.supportsAirAssist}
    <Toggle
      label="Air assist"
      hint="Runs the air pump while this layer burns (M8). Clears smoke and cuts cleaner"
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
