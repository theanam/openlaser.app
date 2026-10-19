<script lang="ts">
  import ChevronUp from '@lucide/svelte/icons/chevron-up';
  import ChevronDown from '@lucide/svelte/icons/chevron-down';
  import ChevronLeft from '@lucide/svelte/icons/chevron-left';
  import ChevronRight from '@lucide/svelte/icons/chevron-right';
  import House from '@lucide/svelte/icons/house';
  import type { Component } from 'svelte';
  import { machine } from '../state/machine.svelte';
  import { coord } from '../lib/format';

  let { disabled = false }: { disabled?: boolean } = $props();

  const STEPS = [0.1, 1, 10, 50];
  /** Holding a jog button longer than this switches to continuous jogging. */
  const HOLD_MS = 350;

  let holdTimer: ReturnType<typeof setTimeout> | null = null;
  let continuous = false;

  function down(event: PointerEvent, dx: number, dy: number) {
    if (disabled || event.button !== 0) return;
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    continuous = false;
    holdTimer = setTimeout(() => {
      continuous = true;
      machine.startContinuousJog(dx, dy);
    }, HOLD_MS);
  }

  function up(dx: number, dy: number) {
    if (holdTimer) clearTimeout(holdTimer);
    holdTimer = null;
    if (continuous) machine.cancelJog();
    else if (!disabled) void machine.jog(dx * machine.jogStep, dy * machine.jogStep);
    continuous = false;
  }

  function cancel() {
    if (holdTimer) clearTimeout(holdTimer);
    holdTimer = null;
    if (continuous) machine.cancelJog();
    continuous = false;
  }

  const pad: Array<{ dx: number; dy: number; label: string; icon: Component } | null> = [
    null,
    { dx: 0, dy: 1, label: 'Jog Y plus', icon: ChevronUp },
    null,
    { dx: -1, dy: 0, label: 'Jog X minus', icon: ChevronLeft },
    null,
    { dx: 1, dy: 0, label: 'Jog X plus', icon: ChevronRight },
    null,
    { dx: 0, dy: -1, label: 'Jog Y minus', icon: ChevronDown },
    null,
  ];
</script>

<div class="jog" class:off={disabled} aria-disabled={disabled}>
  <div class="pad">
    {#each pad as cell, i (i)}
      {#if i === 4}
        <button
          type="button"
          class="key home"
          aria-label="Home"
          title="Home ($H)"
          {disabled}
          onclick={() => machine.home()}
          data-testid="home"><House size={16} /></button
        >
      {:else if cell}
        <button
          type="button"
          class="key"
          aria-label={cell.label}
          title="{cell.label} · hold to move continuously"
          {disabled}
          onpointerdown={(e) => down(e, cell.dx, cell.dy)}
          onpointerup={() => up(cell.dx, cell.dy)}
          onpointercancel={cancel}
          onkeydown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              void machine.jog(cell.dx * machine.jogStep, cell.dy * machine.jogStep);
            }
          }}
          data-testid="jog-{cell.dx}-{cell.dy}"><cell.icon size={16} /></button
        >
      {:else}
        <span></span>
      {/if}
    {/each}
  </div>
  <div class="readout">
    <div class="pos mono" data-testid="position">
      <span><span class="muted">X</span> {coord(machine.position?.x ?? 0)}</span>
      <span><span class="muted">Y</span> {coord(machine.position?.y ?? 0)}</span>
    </div>
    <div class="steps" role="group" aria-label="Jog step">
      {#each STEPS as s (s)}
        <button
          type="button"
          class="step mono"
          aria-pressed={machine.jogStep === s}
          onclick={() => (machine.jogStep = s)}
          {disabled}>{s}</button
        >
      {/each}
    </div>
    <span class="unit">Step, mm</span>
  </div>
</div>

<style>
  .jog {
    display: flex;
    gap: 14px;
    align-items: stretch;
  }

  .jog.off {
    opacity: 0.4;
  }

  .pad {
    display: grid;
    grid-template-columns: repeat(3, 42px);
    gap: 4px;
    flex-shrink: 0;
  }

  .key {
    width: 42px;
    height: 42px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border: 0;
    border-radius: 8px;
    background: var(--ol-surface-2);
    color: var(--ol-text-2);
    touch-action: none;
  }

  .key:hover:not(:disabled) {
    color: var(--ol-text);
    background: var(--ol-border);
  }

  .key:disabled {
    opacity: 1;
  }

  .home {
    background: var(--ol-border);
  }

  .readout {
    flex: 1;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    gap: 8px;
    min-width: 0;
  }

  .pos {
    display: flex;
    flex-direction: column;
    font-size: var(--ol-fs-lg);
    font-weight: 500;
    line-height: 1.5;
  }

  .steps {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 3px;
  }

  .step {
    height: 28px;
    border-radius: 6px;
    border: 1px solid var(--ol-border);
    background: transparent;
    color: var(--ol-text-2);
    font-size: var(--ol-fs-xs);
    font-weight: 500;
  }

  .step[aria-pressed='true'] {
    border-color: var(--ol-signal);
    background: var(--ol-signal-tint);
    color: var(--ol-signal-text);
  }

  .unit {
    font-size: var(--ol-fs-xs);
    color: var(--ol-text-muted);
  }
</style>
