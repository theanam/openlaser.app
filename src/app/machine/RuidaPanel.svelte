<script lang="ts">
  import Usb from '@lucide/svelte/icons/usb';
  import FileDown from '@lucide/svelte/icons/file-down';
  import * as actions from '../actions';
  import { editor } from '../state/editor.svelte';

  /** Ruida controllers run jobs from their own panel: export, carry over on a USB stick, start there. */
  const STEPS = [
    'Export the job as a .rd file.',
    'Copy it to a USB stick and plug that into the laser.',
    'On the laser’s panel, load the file, press Frame to check placement, then Start.',
  ];
</script>

<div class="ruida" data-testid="ruida-panel">
  <div class="intro">
    <span class="tile" aria-hidden="true"><Usb size={20} /></span>
    <div>
      <strong>Runs from a USB stick</strong>
      <span class="muted">Ruida controller · jobs start on the laser</span>
    </div>
  </div>
  <button
    type="button"
    class="btn signal cta"
    disabled={!editor.project}
    onclick={() => void actions.exportJob()}
    data-testid="export-rd"><FileDown size={16} />Export .rd</button
  >
  <ol class="steps">
    {#each STEPS as step, i (i)}
      <li><span class="num">{i + 1}</span>{step}</li>
    {/each}
  </ol>
  <p class="note muted">Positions follow the bed, so the job burns where it sits on screen.</p>
</div>

<style>
  .ruida {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .intro {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .intro div {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .intro .muted {
    font-size: var(--ol-fs-sm);
  }

  .tile {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 38px;
    height: 38px;
    flex-shrink: 0;
    border-radius: var(--ol-radius-md);
    background: color-mix(in srgb, var(--ol-beam) 16%, transparent);
    color: var(--ol-beam);
  }

  .steps {
    margin: 0;
    padding: 0;
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: 8px;
    font-size: var(--ol-fs-sm);
    color: var(--ol-text-2);
    line-height: 1.45;
  }

  .steps li {
    display: flex;
    gap: 10px;
  }

  .num {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 20px;
    height: 20px;
    flex-shrink: 0;
    border-radius: 50%;
    background: var(--ol-surface-2);
    border: 1px solid var(--ol-border);
    font-size: var(--ol-fs-xs);
    font-weight: 600;
    color: var(--ol-text);
  }

  .note {
    margin: 0;
    font-size: var(--ol-fs-sm);
    line-height: 1.45;
  }
</style>
