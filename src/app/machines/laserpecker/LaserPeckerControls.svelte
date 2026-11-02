<script lang="ts">
  import Play from '@lucide/svelte/icons/play';
  import Pause from '@lucide/svelte/icons/pause';
  import Scan from '@lucide/svelte/icons/scan';
  import CircleStop from '@lucide/svelte/icons/circle-stop';
  import { laserpecker } from './session.svelte';
  import StopButton from '../../machine/StopButton.svelte';

  const activity = $derived(laserpecker.state.activity);
</script>

<!-- Pinned below the scrolling side panel, so Stop never scrolls out of view (DESIGN §7). -->
<div class="controls" data-testid="lp-controls">
  <div class="row">
    {#if activity === 'framing'}
      <button
        type="button"
        class="btn cta grow"
        onclick={() => laserpecker.stopFrame()}
        data-testid="lp-stop-frame"><CircleStop size={14} />Stop framing</button
      >
    {:else}
      <button
        type="button"
        class="btn cta grow"
        disabled={activity !== 'idle'}
        title="Trace the outline at the lowest power"
        onclick={() => laserpecker.frame()}
        data-testid="lp-frame"><Scan size={14} />Frame</button
      >
    {/if}
    {#if activity === 'paused'}
      <button
        type="button"
        class="btn start cta grow"
        onclick={() => laserpecker.resume()}
        data-testid="lp-resume"><Play size={14} />Resume</button
      >
    {:else if activity === 'engraving'}
      <button type="button" class="btn cta grow" onclick={() => laserpecker.pause()} data-testid="lp-pause"
        ><Pause size={14} />Pause</button
      >
    {:else}
      <button
        type="button"
        class="btn start cta grow"
        disabled={activity !== 'idle'}
        onclick={() => laserpecker.startJob()}
        data-testid="lp-start"><Play size={14} />Start job</button
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
</style>
