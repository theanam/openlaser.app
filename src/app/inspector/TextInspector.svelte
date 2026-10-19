<script lang="ts">
  import AlignStart from '@lucide/svelte/icons/text-align-start';
  import AlignCenter from '@lucide/svelte/icons/text-align-center';
  import AlignEnd from '@lucide/svelte/icons/text-align-end';
  import Italic from '@lucide/svelte/icons/italic';
  import LoaderCircle from '@lucide/svelte/icons/loader-circle';
  import { onMount } from 'svelte';
  import NumberField from '$lib/ui/NumberField.svelte';
  import { findFont, loadCatalog, nearestWeight, styleLabel, type CatalogFont } from '$lib/fonts/catalog';
  import type { TextAlign, TextObject } from '$lib/project/types';
  import { editor } from '../state/editor.svelte';
  import { textOutlines } from '../state/text.svelte';
  import FontPicker from './FontPicker.svelte';

  let { object }: { object: TextObject } = $props();

  let catalog = $state.raw<CatalogFont[]>([]);
  onMount(() => {
    void loadCatalog().then((list) => (catalog = list));
  });

  const font = $derived(findFont(catalog, object.fontFamily));
  const weights = $derived(font?.weights ?? [400, 700]);
  const canItalic = $derived(font?.italic ?? true);
  const projectFonts = $derived([
    ...new Set(editor.project?.objects.flatMap((o) => (o.kind === 'text' ? [o.fontFamily] : [])) ?? []),
  ]);
  const ALIGNS: Array<{ id: TextAlign; label: string; icon: typeof AlignStart }> = [
    { id: 'left', label: 'Align left', icon: AlignStart },
    { id: 'center', label: 'Align center', icon: AlignCenter },
    { id: 'right', label: 'Align right', icon: AlignEnd },
  ];

  function pickFont(next: CatalogFont) {
    textOutlines.update(object.id, {
      fontFamily: next.family,
      fontWeight: nearestWeight(next.weights, object.fontWeight),
      italic: object.italic && next.italic,
    });
  }
</script>

<section class="text" aria-label="Text" data-testid="text-inspector">
  <div class="head">
    <h2>Text</h2>
    {#if textOutlines.pending.has(object.id)}<LoaderCircle
        size={14}
        class="spin"
        aria-label="Loading font"
      />{/if}
  </div>
  <textarea
    class="input content"
    rows={Math.min(6, Math.max(2, object.text.split('\n').length))}
    value={object.text}
    aria-label="Text"
    spellcheck="false"
    oninput={(e) =>
      textOutlines.update(object.id, { text: e.currentTarget.value }, { live: true, field: 'text' })}
    onblur={() => editor.sealHistory()}
    data-testid="text-content"
  ></textarea>
  <FontPicker value={object.fontFamily} {projectFonts} onpick={pickFont} />
  <div class="row">
    <select
      class="input weight"
      aria-label="Weight"
      value={nearestWeight(weights, object.fontWeight)}
      onchange={(e) => textOutlines.update(object.id, { fontWeight: Number(e.currentTarget.value) })}
    >
      {#each weights as w (w)}<option value={w}>{styleLabel(w)}</option>{/each}
    </select>
    <button
      type="button"
      class="icon-btn"
      aria-label="Italic"
      aria-pressed={object.italic}
      disabled={!canItalic}
      onclick={() => textOutlines.update(object.id, { italic: !object.italic })}><Italic size={16} /></button
    >
    <div class="segmented align" role="group" aria-label="Alignment">
      {#each ALIGNS as a (a.id)}
        <button
          type="button"
          aria-pressed={object.align === a.id}
          aria-label={a.label}
          title={a.label}
          onclick={() => textOutlines.update(object.id, { align: a.id })}
        >
          <a.icon size={15} />
        </button>
      {/each}
    </div>
  </div>
  <div class="grid">
    <NumberField
      label="Size"
      unit="mm"
      decimals={1}
      step={0.5}
      min={0.5}
      max={500}
      value={object.fontSize}
      onchange={(v, live) => textOutlines.update(object.id, { fontSize: v }, { live, field: 'size' })}
      testid="text-size"
    />
    <NumberField
      label="Line height"
      unit="×"
      decimals={2}
      step={0.05}
      min={0.5}
      max={5}
      value={object.lineHeight}
      onchange={(v, live) => textOutlines.update(object.id, { lineHeight: v }, { live, field: 'leading' })}
    />
    <NumberField
      label="Letter spacing"
      unit="‰"
      step={5}
      min={-500}
      max={2000}
      value={object.letterSpacing}
      onchange={(v, live) =>
        textOutlines.update(object.id, { letterSpacing: v }, { live, field: 'tracking' })}
    />
  </div>
</section>

<style>
  .text {
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 10px;
    border-bottom: 1px solid var(--ol-border);
  }

  .head {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  h2 {
    margin: 0;
    font-size: var(--ol-fs-md);
    font-weight: 600;
  }

  .content {
    height: auto;
    padding: 8px 10px;
    resize: vertical;
    line-height: 1.4;
  }

  .row {
    display: flex;
    gap: 6px;
    align-items: center;
  }

  .weight {
    flex: 1;
    min-width: 0;
    appearance: auto;
  }

  .align button {
    padding: 0 8px;
    display: inline-flex;
    align-items: center;
  }

  .grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
  }
</style>
