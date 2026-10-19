<script lang="ts">
  import TriangleAlert from '@lucide/svelte/icons/triangle-alert';
  import RotateCcw from '@lucide/svelte/icons/rotate-ccw';
  import type { Snippet } from 'svelte';
  import { reportError } from './errors';

  interface Props {
    /** Short name of the region, shown in the fallback. */
    name: string;
    children: Snippet;
    /** Compact fallback for small regions (toolbars, rows). */
    compact?: boolean;
  }

  let { name, children, compact = false }: Props = $props();
</script>

<svelte:boundary onerror={(error) => reportError(error, name)}>
  {@render children()}
  {#snippet failed(error, reset)}
    <div class="boundary" class:compact role="alert" data-testid="error-boundary">
      <TriangleAlert size={compact ? 14 : 18} />
      <div class="text">
        <strong>{name} stopped working</strong>
        {#if !compact}
          <span class="detail mono">{error instanceof Error ? error.message : String(error)}</span>
        {/if}
      </div>
      <button type="button" class="btn small" onclick={reset}><RotateCcw size={14} />Retry</button>
    </div>
  {/snippet}
</svelte:boundary>

<style>
  .boundary {
    display: flex;
    align-items: center;
    gap: 10px;
    margin: 12px;
    padding: 12px 14px;
    border-radius: var(--ol-radius-md);
    border: 1px solid var(--ol-hold);
    background: var(--ol-hold-tint);
    color: var(--ol-text);
  }

  .boundary :global(svg) {
    color: var(--ol-hold);
    flex-shrink: 0;
  }

  .boundary.compact {
    margin: 4px;
    padding: 6px 8px;
  }

  .text {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }

  .detail {
    font-size: var(--ol-fs-xs);
    color: var(--ol-text-muted);
    overflow-wrap: anywhere;
  }
</style>
