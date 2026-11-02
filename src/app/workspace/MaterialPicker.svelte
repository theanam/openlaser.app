<script lang="ts">
  import { Popover } from 'bits-ui';
  import Search from '@lucide/svelte/icons/search';
  import ChevronDown from '@lucide/svelte/icons/chevron-down';
  import ExternalLink from '@lucide/svelte/icons/external-link';
  import Check from '@lucide/svelte/icons/check';
  import {
    presetBasis,
    presetById,
    presetLayerPatch,
    presetName,
    presetsFor,
    wattClasses,
    type MaterialOperation,
    type MaterialPreset,
  } from '$lib/project/materials';
  import { updateLayer } from '$lib/project/operations';
  import type { Layer } from '$lib/project/types';
  import { DEFAULT_FILL_SETTINGS } from '$lib/import/layer-defaults';
  import { DEFAULT_IMAGE_SETTINGS } from '$lib/cam/raster/defaults';
  import { editor } from '../state/editor.svelte';
  import { profiles } from '../state/profiles.svelte';
  import { withMode } from '../lib/layers';
  import { speedLabel } from '../lib/units';
  import { laserSources, layerSource } from '$lib/project/accessories';

  const RESOLUTION_ORDER = ['1K', '1.3K', '2K', '4K'];

  /**
   * Published starting settings for a material, engraving and cutting kept apart. LaserPeckers
   * show their own tables; other machines the ones for their laser at their optical power.
   */
  let { layer }: { layer: Layer } = $props();

  let open = $state(false);
  let query = $state('');
  const profile = $derived(profiles.active);
  const basis = $derived(presetBasis(profile));
  /** Images only engrave; vector layers open on what they are doing now. */
  let operation = $state<MaterialOperation>('engrave');
  const operations = $derived<MaterialOperation[]>(layer.mode === 'image' ? ['engrave'] : ['engrave', 'cut']);
  const all = $derived(presetsFor(basis, operation));
  /** Images take presets made for pictures where a table has them; vector layers the rest. */
  const forLayer = $derived.by(() => {
    if (layer.mode !== 'image') return all.filter((p) => p.mode !== 'image');
    const pictures = all.filter((p) => p.mode === 'image');
    return pictures.length ? pictures : all;
  });
  // Two-laser machines: which laser; LaserPecker tables: which resolution the numbers are for.
  const sources = $derived(laserSources(profile));
  const wavelengths = $derived(
    [...new Set(forLayer.flatMap((p) => (p.wavelength ? [p.wavelength] : [])))].sort(),
  );
  let wavelength = $state<number | null>(null);
  const resolutions = $derived(
    RESOLUTION_ORDER.filter((r) =>
      forLayer.some((p) => p.resolution === r && (!wavelength || p.wavelength === wavelength)),
    ),
  );
  let resolution = $state<string | null>(null);
  const list = $derived(
    forLayer.filter(
      (p) =>
        (wavelengths.length < 2 || !wavelength || p.wavelength === wavelength) &&
        (!resolution || !p.resolution || p.resolution === resolution) &&
        `${presetName(p)} ${p.brand ?? ''}`.toLowerCase().includes(query.trim().toLowerCase()),
    ),
  );
  const applied = $derived(presetById(layer.materialId));
  /** The preset is shown only while the layer still has its numbers. */
  const current = $derived(
    applied &&
      applied.power === layer.power &&
      Math.abs(applied.speed - layer.speed) < 0.5 &&
      applied.passes === layer.passes
      ? applied
      : null,
  );
  const unit = $derived(profile.speedUnit);
  const basisLabel = $derived(
    basis.kind === 'model'
      ? basis.model
      : basis.kind === 'class'
        ? `${basis.laser === 'co2' ? 'CO₂' : 'Diode'} · ${basis.watts} W class`
        : '',
  );

  function onOpenChange(next: boolean) {
    open = next;
    if (next) {
      query = '';
      operation = layer.mode === 'line' ? 'cut' : 'engrave';
      wavelength = layerSource(profile, layer)?.wavelength ?? null;
      resolution = null;
    }
  }

  function apply(preset: MaterialPreset) {
    open = false;
    const id = layer.id;
    const patch = presetLayerPatch(layer, preset);
    const mode = patch.mode && patch.mode !== layer.mode ? withMode(layer, patch.mode) : {};
    const extra: Partial<Layer> = {};
    if (preset.interval) extra.fill = { ...(layer.fill ?? DEFAULT_FILL_SETTINGS), interval: preset.interval };
    if (preset.dpi && layer.mode === 'image')
      extra.image = { ...(layer.image ?? DEFAULT_IMAGE_SETTINGS), dpi: preset.dpi };
    // The preset's laser, on machines with more than one.
    const source = preset.wavelength ? sources.find((s) => s.wavelength === preset.wavelength) : undefined;
    if (source && sources.length > 1) extra.laserSourceId = source.id;
    editor.commit((p) => updateLayer(p, id, { ...mode, ...patch, ...extra }));
    editor.sealHistory();
  }

  function setWatts(watts: number) {
    void profiles.save({ ...profile, laserWatts: watts });
  }

  const MODE: Record<string, string> = { fill: 'Fill', line: 'Line', image: 'Picture' };
  const summary = (p: MaterialPreset) =>
    [
      p.brand ?? '',
      layer.mode === 'image' ? '' : MODE[p.mode],
      `${speedLabel(p.speed, unit)}${unit === 'depth' ? '' : ` ${unit}`}`,
      `${p.power}%`,
      `×${p.passes}`,
    ]
      .filter(Boolean)
      .join(' · ');
  $effect(() => {
    // Default to the first resolution the table has (1K where it exists).
    if (resolutions.length && (!resolution || !resolutions.includes(resolution)))
      resolution = resolutions[0]!;
  });
</script>

<Popover.Root {open} {onOpenChange}>
  <Popover.Trigger class="material-trigger" data-testid="material-picker">
    <span class="label">Material</span>
    <span class="value">{current ? presetName(current) : 'Pick a material'}</span>
    <ChevronDown size={14} />
  </Popover.Trigger>
  <Popover.Portal>
    <Popover.Content class="ol-menu material-pop" sideOffset={6} align="start">
      {#if basis.kind === 'none'}
        <div class="setup">
          <p>Your laser’s optical power picks the presets:</p>
          <div class="segmented" role="group" aria-label="Laser power">
            {#each wattClasses(basis.laser) as w (w)}
              <button type="button" onclick={() => setWatts(w)} data-testid="material-watts-{w}">{w} W</button
              >
            {/each}
          </div>
        </div>
      {:else}
        <div class="head">
          <span class="muted small">{basisLabel}</span>
          {#if operations.length > 1}
            <div class="segmented small" role="group" aria-label="Operation">
              {#each operations as op (op)}
                <button
                  type="button"
                  aria-pressed={operation === op}
                  onclick={() => (operation = op)}
                  data-testid="material-{op}">{op === 'engrave' ? 'Engrave' : 'Cut'}</button
                >
              {/each}
            </div>
          {/if}
        </div>
        {#if wavelengths.length > 1 || resolutions.length > 1}
          <div class="filters">
            {#if wavelengths.length > 1}
              <div class="segmented small" role="group" aria-label="Laser">
                {#each wavelengths as w (w)}
                  <button type="button" aria-pressed={wavelength === w} onclick={() => (wavelength = w)}
                    >{w} nm</button
                  >
                {/each}
              </div>
            {/if}
            {#if resolutions.length > 1}
              <div class="segmented small" role="group" aria-label="Resolution">
                {#each resolutions as r (r)}
                  <button type="button" aria-pressed={resolution === r} onclick={() => (resolution = r)}
                    >{r}</button
                  >
                {/each}
              </div>
            {/if}
          </div>
        {/if}
        <label class="search">
          <Search size={14} />
          <input placeholder="Search materials" aria-label="Search materials" bind:value={query} />
        </label>
        <div class="list" data-testid="material-list">
          {#each list as preset (preset.id)}
            <div class="row" class:on={current?.id === preset.id}>
              <button type="button" class="pick" onclick={() => apply(preset)} data-testid="material-preset">
                <span class="name">{presetName(preset)}</span>
                <span class="mono muted small">{summary(preset)}</span>
                {#if preset.notes}<span class="muted small note">{preset.notes}</span>{/if}
              </button>
              {#if current?.id === preset.id}<Check size={14} class="tick" />{/if}
              <a class="icon-btn sm" href={preset.source} target="_blank" rel="noopener" aria-label="Source"
                ><ExternalLink size={13} /></a
              >
            </div>
          {:else}
            <p class="muted small empty">
              {operation === 'cut' ? 'No published cutting settings for this laser.' : 'No presets found.'}
            </p>
          {/each}
        </div>
        <p class="muted small foot">Starting points: test on a scrap first.</p>
      {/if}
    </Popover.Content>
  </Popover.Portal>
</Popover.Root>

<style>
  :global(.material-trigger) {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 7px 10px;
    border: 1px solid var(--ol-border);
    border-radius: var(--ol-radius-md);
    background: none;
    color: var(--ol-text);
    text-align: left;
    cursor: pointer;
  }

  :global(.material-trigger:hover),
  :global(.material-trigger[data-state='open']) {
    border-color: var(--ol-border-strong);
    background: var(--ol-surface-2);
  }

  .label {
    font-size: var(--ol-fs-xs);
    color: var(--ol-text-muted);
  }

  .value {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  :global(.material-pop) {
    width: 340px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }

  .filters {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
  }

  .search {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 8px;
    border: 1px solid var(--ol-border);
    border-radius: var(--ol-radius-sm);
    color: var(--ol-text-muted);
  }

  .search input {
    flex: 1;
    border: 0;
    background: none;
    color: var(--ol-text);
    outline: none;
  }

  .list {
    max-height: 300px;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .row {
    display: flex;
    align-items: center;
    gap: 4px;
    border-radius: var(--ol-radius-sm);
  }

  .row:hover,
  .row.on {
    background: var(--ol-surface-2);
  }

  .pick {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 6px 8px;
    border: 0;
    background: none;
    color: var(--ol-text);
    text-align: left;
    cursor: pointer;
  }

  .name {
    font-weight: 500;
  }

  .small {
    font-size: var(--ol-fs-xs);
  }

  .note {
    line-height: 1.35;
  }

  :global(.material-pop .tick) {
    color: var(--ol-signal);
    flex-shrink: 0;
  }

  .setup p,
  .empty,
  .foot {
    margin: 0;
  }

  .setup {
    display: flex;
    flex-direction: column;
    gap: 8px;
    font-size: var(--ol-fs-sm);
  }
</style>
