<script lang="ts">
  import { Popover } from 'bits-ui';
  import { tick } from 'svelte';
  import type { Anchor } from '$lib/project/types';

  /** A small button showing the current anchor; it opens a 3×3 grid of large, labelled targets. */
  interface Props {
    value: Anchor;
    onchange: (anchor: Anchor) => void;
    label?: string;
    size?: 'sm' | 'md';
  }

  let { value, onchange, label = 'Anchor', size = 'sm' }: Props = $props();
  let open = $state(false);
  let grid = $state<HTMLDivElement | null>(null);

  const GRID: Anchor[] = ['tl', 't', 'tr', 'l', 'c', 'r', 'bl', 'b', 'br'];
  const NAMES: Record<Anchor, string> = {
    tl: 'Top left',
    t: 'Top',
    tr: 'Top right',
    l: 'Left',
    c: 'Center',
    r: 'Right',
    bl: 'Bottom left',
    b: 'Bottom',
    br: 'Bottom right',
  };
  /** Dot position inside the cell's box diagram (box spans 6..26 in a 32 viewBox). */
  const DOT: Record<Anchor, [number, number]> = {
    tl: [6, 6],
    t: [16, 6],
    tr: [26, 6],
    l: [6, 16],
    c: [16, 16],
    r: [26, 16],
    bl: [6, 26],
    b: [16, 26],
    br: [26, 26],
  };

  function pick(a: Anchor) {
    onchange(a);
    open = false;
  }

  async function focusCurrent() {
    await tick();
    grid?.querySelector<HTMLButtonElement>('[aria-checked="true"]')?.focus();
  }

  /** Arrow keys move across the grid, as in any radio group. */
  function onkeydown(e: KeyboardEvent) {
    const i = GRID.indexOf(value);
    const step: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -3, ArrowDown: 3 };
    const d = step[e.key];
    if (d === undefined) return;
    e.preventDefault();
    const next = i + d;
    const sameRow = Math.abs(d) === 3 || Math.floor(next / 3) === Math.floor(i / 3);
    if (next < 0 || next > 8 || !sameRow) return;
    onchange(GRID[next]!);
    void focusCurrent();
  }
</script>

<Popover.Root bind:open>
  <Popover.Trigger
    class="anchor-trigger {size}"
    aria-label="{label}: {NAMES[value].toLowerCase()}"
    data-tip="{label}: {NAMES[value].toLowerCase()}"
    data-testid="anchor-trigger"
  >
    <span class="mini" aria-hidden="true">
      {#each GRID as a (a)}<span class:on={value === a}></span>{/each}
    </span>
  </Popover.Trigger>
  <Popover.Portal>
    <Popover.Content
      class="ol-menu anchor-menu"
      sideOffset={6}
      align="start"
      onOpenAutoFocus={(e) => {
        e.preventDefault();
        void focusCurrent();
      }}
    >
      <div class="menu-head">
        <span>{label}</span>
        <span class="current">{NAMES[value]}</span>
      </div>
      <div class="cells" role="radiogroup" aria-label={label} bind:this={grid} tabindex="-1" {onkeydown}>
        {#each GRID as a (a)}
          <button
            type="button"
            role="radio"
            class="cell"
            aria-checked={value === a}
            aria-label="{label}: {NAMES[a].toLowerCase()}"
            tabindex={value === a ? 0 : -1}
            onclick={() => pick(a)}
          >
            <svg viewBox="0 0 32 32" aria-hidden="true">
              <rect x="6" y="6" width="20" height="20" rx="2" class="box" />
              <circle cx={DOT[a][0]} cy={DOT[a][1]} r="3.5" class="dot" />
            </svg>
          </button>
        {/each}
      </div>
    </Popover.Content>
  </Popover.Portal>
</Popover.Root>

<style>
  :global(.anchor-trigger) {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 34px;
    height: 34px;
    flex-shrink: 0;
    padding: 0;
    border-radius: var(--ol-radius-sm);
    border: 1px solid transparent;
    background: transparent;
  }

  :global(.anchor-trigger.md) {
    width: 46px;
    height: 46px;
    border-color: var(--ol-border);
    background: var(--ol-bg);
  }

  :global(.anchor-trigger:hover),
  :global(.anchor-trigger[data-state='open']) {
    background: var(--ol-surface-2);
    border-color: var(--ol-border-strong);
  }

  .mini {
    display: grid;
    grid-template-columns: repeat(3, 5px);
    gap: 3px;
  }

  :global(.anchor-trigger.md) .mini {
    grid-template-columns: repeat(3, 7px);
    gap: 4px;
  }

  .mini span {
    aspect-ratio: 1;
    border-radius: 1px;
    background: var(--ol-anchor-off);
  }

  .mini span.on {
    background: var(--ol-signal);
  }

  :global(.anchor-menu) {
    min-width: 0;
    width: 196px;
    padding: 10px;
  }

  .menu-head {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 8px;
    margin: 0 2px 8px;
    font-size: var(--ol-fs-sm);
    color: var(--ol-text-muted);
  }

  .current {
    color: var(--ol-text);
    font-weight: 500;
  }

  .cells {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 6px;
    outline: none;
  }

  .cell {
    aspect-ratio: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    border-radius: var(--ol-radius-md);
    border: 1px solid var(--ol-border);
    background: var(--ol-bg);
    transition:
      background 0.12s,
      border-color 0.12s;
  }

  .cell:hover {
    background: var(--ol-surface-2);
    border-color: var(--ol-border-strong);
  }

  .cell:focus-visible {
    outline: 2px solid var(--ol-beam);
    outline-offset: 1px;
  }

  .cell[aria-checked='true'] {
    border-color: var(--ol-signal);
    background: var(--ol-signal-tint);
  }

  svg {
    width: 34px;
    height: 34px;
  }

  .box {
    fill: none;
    stroke: var(--ol-text-dim);
    stroke-width: 1.5;
    stroke-dasharray: 3 2;
  }

  .dot {
    fill: var(--ol-text-muted);
  }

  .cell:hover .dot {
    fill: var(--ol-text);
  }

  .cell[aria-checked='true'] .box {
    stroke: var(--ol-signal);
    stroke-dasharray: none;
  }

  .cell[aria-checked='true'] .dot {
    fill: var(--ol-signal);
  }
</style>
