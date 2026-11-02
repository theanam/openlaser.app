<script lang="ts">
  import type { Snippet } from 'svelte';
  import ChevronRight from '@lucide/svelte/icons/chevron-right';
  import { sections, type SectionId } from '../state/sections.svelte';

  /** A side-panel section's title that opens and closes the section. */
  let { id, children }: { id: SectionId; children: Snippet } = $props();
  const open = $derived(sections.isOpen(id));
</script>

<button
  type="button"
  class="section-toggle"
  aria-expanded={open}
  onclick={() => sections.toggle(id)}
  data-testid="section-{id}"
>
  <ChevronRight size={15} class="chevron" />
  <h2>{@render children()}</h2>
</button>

<style>
  .section-toggle {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    min-width: 0;
    margin-left: -4px;
    padding: 2px 4px;
    border: 0;
    border-radius: var(--ol-radius-sm);
    background: none;
    color: var(--ol-text);
    cursor: pointer;
  }

  .section-toggle:hover {
    background: var(--ol-surface-2);
  }

  .section-toggle :global(.chevron) {
    flex-shrink: 0;
    color: var(--ol-text-muted);
    transition: transform 0.15s ease;
  }

  .section-toggle[aria-expanded='true'] :global(.chevron) {
    transform: rotate(90deg);
  }

  h2 {
    margin: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: var(--ol-fs-md);
    font-weight: 600;
  }
</style>
