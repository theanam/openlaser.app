<script lang="ts">
  import { editor } from '../state/editor.svelte';
  import { canvas } from '../state/canvas.svelte';
  import { machine } from '../state/machine.svelte';
  import { pwa } from '../pwa.svelte';

  const objects = $derived(editor.project?.objects.length ?? 0);
  const laserMode = $derived(machine.state.settings[32]);
</script>

<div class="status" data-testid="status-bar">
  {#if editor.project}
    <span
      >{objects}
      {objects === 1 ? 'object' : 'objects'}{#if editor.selection.size}
        · {editor.selection.size} selected{/if}</span
    >
  {/if}
  {#if canvas.cursor}
    <span class="mono">Cursor {canvas.cursor.x.toFixed(1)}, {canvas.cursor.y.toFixed(1)} mm</span>
  {/if}
  <span class="spacer"></span>
  {#if machine.connected}
    {#if laserMode !== undefined}
      <span class="mono" class:warn={laserMode !== '1'}>Laser mode $32={laserMode}</span>
    {/if}
    <span class:go={machine.state.homed}>{machine.state.homed ? 'Homed' : 'Not homed'}</span>
  {/if}
  <span class:go={pwa.offlineReady}>{pwa.offlineReady ? 'Offline ready' : 'Online'}</span>
</div>

<style>
  .status {
    height: var(--ol-statusbar-h);
    display: flex;
    align-items: center;
    gap: 16px;
    padding: 0 16px;
    font-size: var(--ol-fs-sm);
    color: var(--ol-text-muted);
    white-space: nowrap;
  }

  .spacer {
    flex-grow: 1;
  }

  .go {
    color: var(--ol-go);
  }

  .warn {
    color: var(--ol-hold);
  }
</style>
