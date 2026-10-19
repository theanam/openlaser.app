<script lang="ts">
  import Play from '@lucide/svelte/icons/play';
  import Pause from '@lucide/svelte/icons/pause';
  import { machine } from '../state/machine.svelte';
  import StopButton from './StopButton.svelte';
  import FramePanel from './FramePanel.svelte';

  const progress = $derived(machine.progress);
  const running = $derived(machine.jobActive);
</script>

<!-- Pinned below the scrolling side panel, so Stop never scrolls out of view (DESIGN §7). -->
<div class="controls" data-testid="job-controls">
  {#if !running || machine.framing}
    <FramePanel />
  {/if}
  <div class="row">
    {#if running && progress.kind === 'job'}
      {#if progress.phase === 'paused'}
        <button type="button" class="btn start cta grow" onclick={() => machine.resume()} data-testid="resume"
          ><Play size={14} />Resume</button
        >
      {:else}
        <button type="button" class="btn cta grow" onclick={() => machine.pause()} data-testid="pause"
          ><Pause size={14} />Pause</button
        >
      {/if}
    {:else}
      <button
        type="button"
        class="btn start cta grow2"
        disabled={running}
        onclick={() => machine.startJob()}
        data-testid="start-job"><Play size={14} />Start job</button
      >
    {/if}
  </div>
  <StopButton />
</div>

<style>
  .controls {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 12px 16px 16px;
    border-top: 1px solid var(--ol-border);
    background: var(--ol-surface);
  }

  .row {
    display: flex;
    gap: 8px;
  }

  .grow {
    flex: 1;
  }

  .grow2 {
    flex: 1.4;
  }
</style>
