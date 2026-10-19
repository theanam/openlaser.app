<script lang="ts">
  import Wand from '@lucide/svelte/icons/wand-sparkles';
  import type { ImageObject } from '$lib/project/types';
  import { ui } from '../state/ui.svelte';

  let { object }: { object: ImageObject } = $props();
  const asset = $derived(object.name);
</script>

<section class="image" aria-label="Image" data-testid="image-inspector">
  <div class="head">
    <h2>Image</h2>
    <span class="muted small" title={asset}>{asset}</span>
  </div>
  <button type="button" class="btn" onclick={() => (ui.traceImageId = object.id)} data-testid="trace-open">
    <Wand size={15} />Trace to vectors
  </button>
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

  h2 {
    margin: 0;
    font-size: var(--ol-fs-md);
    font-weight: 600;
  }

  .small {
    font-size: var(--ol-fs-sm);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
</style>
