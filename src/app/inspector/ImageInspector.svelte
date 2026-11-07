<script lang="ts">
  import SectionToggle from '../workspace/SectionToggle.svelte';
  import { sections } from '../state/sections.svelte';
  import Wand from '@lucide/svelte/icons/wand-sparkles';
  import type { ImageObject } from 'libopenlaser/project';
  import { ui } from '../state/ui.svelte';

  let { object }: { object: ImageObject } = $props();
  const asset = $derived(object.name);
</script>

<section class="image" aria-label="Image" data-testid="image-inspector">
  <div class="head">
    <SectionToggle id="inspector">Image</SectionToggle>
    <span class="muted small" title={asset}>{asset}</span>
  </div>
  {#if sections.isOpen('inspector')}
    <button type="button" class="btn" onclick={() => (ui.traceImageId = object.id)} data-testid="trace-open">
      <Wand size={15} />Trace to vectors
    </button>
  {/if}
</section>

<style>
  .image {
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 10px;
    border-bottom: 1px solid var(--ol-border);
  }

  .head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 8px;
    min-width: 0;
  }

  .small {
    font-size: var(--ol-fs-sm);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
</style>
