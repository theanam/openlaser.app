<script lang="ts">
  import Dialog from '$lib/ui/Dialog.svelte';
  import NumberField from '$lib/ui/NumberField.svelte';
  import { DXF_UNITS, dxfResult, type DxfUnit } from '$lib/import/dxf';
  import { IGNORED_HINTS, importSvg, type SvgColorGroup } from '$lib/import/svg';
  import type { Id } from '$lib/project/types';
  import { cancelVectorImport, completeVectorImport } from '../actions';
  import { previewSvg } from '../lib/vector-preview';
  import { editor } from '../state/editor.svelte';
  import { ui } from '../state/ui.svelte';

  /** SVG and DXF share this dialog: size, scale (ppi for SVG, units for DXF), colors → layers. */
  const pending = $derived(ui.vectorImport);
  const UNITS = Object.keys(DXF_UNITS) as DxfUnit[];
  let dpi = $state(96);
  let units = $state<DxfUnit>('mm');
  let choices = $state<Record<string, Id | 'new'>>({});
  let open = $state(false);

  $effect(() => {
    open = pending !== null;
    if (pending) {
      dpi = 96;
      units = pending.format === 'dxf' ? (pending.drawing.fileUnits ?? 'mm') : 'mm';
      choices = {};
    }
  });

  const result = $derived.by(() => {
    if (!pending) return null;
    if (pending.format === 'dxf') return dxfResult(pending.drawing, units);
    if (dpi === 96) return pending.result;
    try {
      return importSvg(pending.text, { dpi });
    } catch {
      return pending.result;
    }
  });

  const keyOf = (g: SvgColorGroup) => `${g.kind}:${g.color}`;
  const layers = $derived(editor.project?.layers.filter((l) => l.mode !== 'image') ?? []);

  function defaultChoice(g: SvgColorGroup): Id | 'new' {
    return layers.find((l) => l.color.toLowerCase() === g.color.toLowerCase())?.id ?? 'new';
  }

  const previewUrl = $derived.by(() => {
    if (!pending || !result) return '';
    const svg = pending.format === 'svg' ? pending.text : previewSvg(result);
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  });

  function confirmImport() {
    if (!result) return;
    const mapping = new Map<SvgColorGroup, Id | 'new'>();
    for (const g of result.groups) mapping.set(g, choices[keyOf(g)] ?? defaultChoice(g));
    completeVectorImport(result, mapping);
  }
</script>

<Dialog
  bind:open
  title="Import {pending?.fileName ?? ''}"
  width={560}
  onclose={() => ui.vectorImport && cancelVectorImport()}
  testid="vector-import-dialog"
>
  {#if pending && result}
    <div class="layout">
      <div class="preview"><img src={previewUrl} alt="Preview of {pending.fileName}" /></div>
      <div class="side">
        <div class="size mono">{result.width.toFixed(1)} × {result.height.toFixed(1)} mm</div>
        {#if pending.format === 'svg'}
          <NumberField
            label="Pixels per inch"
            unit="ppi"
            value={dpi}
            min={1}
            max={2400}
            onchange={(v) => (dpi = v)}
          />
          <div class="segmented quick" role="group" aria-label="Common sizes">
            <button type="button" aria-pressed={dpi === 96} onclick={() => (dpi = 96)}>96</button>
            <button type="button" aria-pressed={dpi === 72} onclick={() => (dpi = 72)}>72</button>
          </div>
        {:else}
          <span class="label">Drawing units</span>
          <div class="segmented quick units" role="group" aria-label="Drawing units" data-testid="dxf-units">
            {#each UNITS as u (u)}
              <button type="button" aria-pressed={units === u} onclick={() => (units = u)}>{u}</button>
            {/each}
          </div>
          {#if !pending.drawing.fileUnits}<span class="muted note">The file sets no units.</span>{/if}
        {/if}
      </div>
    </div>

    <h3>Colors → layers</h3>
    <ul class="groups">
      {#each result.groups as g (keyOf(g))}
        <li>
          <span class="swatch-chip" style="background: {g.color}"></span>
          <span class="mono">{g.color}</span>
          <span class="muted kind">{g.kind === 'stroke' ? 'Line' : 'Fill'} · {g.paths.length}</span>
          <select
            class="input"
            aria-label="Layer for {g.color}"
            value={choices[keyOf(g)] ?? defaultChoice(g)}
            onchange={(e) => (choices[keyOf(g)] = e.currentTarget.value)}
          >
            <option value="new">New {g.kind === 'stroke' ? 'line' : 'fill'} layer</option>
            {#each layers as l (l.id)}<option value={l.id}>{l.name}</option>{/each}
          </select>
        </li>
      {/each}
      {#if result.images.length}
        <li>
          <span class="swatch-chip photo"></span><span
            >{result.images.length} embedded {result.images.length === 1 ? 'image' : 'images'}</span
          ><span class="muted kind">Image layer</span>
        </li>
      {/if}
    </ul>

    {#if Object.keys(result.ignored).length}
      <ul class="ignored">
        {#each Object.entries(result.ignored) as [kind, n] (kind)}
          <li>
            <span class="mono">{n} × {kind}</span>{#if IGNORED_HINTS[kind]}<span class="muted">
                · {IGNORED_HINTS[kind]}</span
              >{/if}
          </li>
        {/each}
      </ul>
    {/if}
  {/if}
  {#snippet footer()}
    <button type="button" class="btn" onclick={() => cancelVectorImport()}>Cancel</button>
    <button type="button" class="btn start" onclick={confirmImport} data-testid="vector-import-confirm"
      >Import</button
    >
  {/snippet}
</Dialog>

<style>
  .layout {
    display: flex;
    gap: 16px;
  }

  .preview {
    flex: 1;
    height: 180px;
    border-radius: var(--ol-radius-md);
    background: var(--ol-bed);
    border: 1px solid var(--ol-border);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 12px;
  }

  .preview img {
    max-width: 100%;
    max-height: 100%;
    background: white;
  }

  .side {
    width: 180px;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .units button {
    padding: 0;
    min-width: 0;
  }

  .label {
    font-size: var(--ol-fs-sm);
    color: var(--ol-text-muted);
  }

  .note {
    font-size: var(--ol-fs-sm);
  }

  .size {
    font-size: var(--ol-fs-lg);
    font-weight: 500;
  }

  h3 {
    margin: 16px 0 8px;
    font-size: var(--ol-fs-md);
    font-weight: 600;
  }

  .groups,
  .ignored {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .groups li {
    display: grid;
    grid-template-columns: 14px 80px 1fr 180px;
    align-items: center;
    gap: 10px;
  }

  .swatch-chip {
    width: 14px;
    height: 14px;
    border-radius: 4px;
    border: 1px solid var(--ol-border-strong);
  }

  .swatch-chip.photo {
    background: var(--ol-photo);
  }

  .kind {
    font-size: var(--ol-fs-sm);
  }

  .groups .input {
    height: 30px;
    appearance: auto;
  }

  .ignored {
    margin-top: 12px;
    font-size: var(--ol-fs-sm);
    padding: 10px 12px;
    border-radius: var(--ol-radius-md);
    background: var(--ol-hold-tint);
  }
</style>
