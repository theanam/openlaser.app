<script lang="ts">
  import type { Anchor } from '$lib/project/types';

  interface Props {
    value: Anchor;
    onchange: (anchor: Anchor) => void;
    label?: string;
    size?: 'sm' | 'md';
  }

  let { value, onchange, label = 'Anchor', size = 'sm' }: Props = $props();

  const GRID: Anchor[] = ['tl', 't', 'tr', 'l', 'c', 'r', 'bl', 'b', 'br'];
  const NAMES: Record<Anchor, string> = {
    tl: 'top left',
    t: 'top',
    tr: 'top right',
    l: 'left',
    c: 'center',
    r: 'right',
    bl: 'bottom left',
    b: 'bottom',
    br: 'bottom right',
  };
</script>

<div class="anchor {size}" role="radiogroup" aria-label={label}>
  {#each GRID as a (a)}
    <button
      type="button"
      role="radio"
      aria-checked={value === a}
      aria-label="{label}: {NAMES[a]}"
      title={NAMES[a]}
      class:on={value === a}
      onclick={() => onchange(a)}
    ></button>
  {/each}
</div>

<style>
  .anchor {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 3px;
    width: 21px;
    flex-shrink: 0;
  }

  .anchor.md {
    width: 40px;
    gap: 4px;
  }

  button {
    aspect-ratio: 1;
    padding: 0;
    border: 0;
    border-radius: 1px;
    background: var(--ol-anchor-off);
    min-width: 5px;
  }

  .md button {
    border-radius: 2px;
  }

  button:hover {
    background: var(--ol-text-muted);
  }

  button.on {
    background: var(--ol-signal);
  }
</style>
