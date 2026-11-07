<script lang="ts">
  import SectionToggle from '../workspace/SectionToggle.svelte';
  import { sections } from '../state/sections.svelte';
  import LocateFixed from '@lucide/svelte/icons/locate-fixed';
  import Flag from '@lucide/svelte/icons/flag';
  import ErrorBoundary from '$lib/ui/ErrorBoundary.svelte';
  import { setJobSettings } from 'libopenlaser/project';
  import type { JobSettings } from 'libopenlaser/project';
  import { editor } from '../state/editor.svelte';
  import { machine } from '../state/machine.svelte';
  import { shownAdapter } from '../machines/registry';
  import AnchorPicker from '../workspace/AnchorPicker.svelte';
  import MachineSwitcher from './MachineSwitcher.svelte';
  import AccessoryPicker from './AccessoryPicker.svelte';
  import { coord } from '../lib/format';

  /** The connected machine's panel, else the selected machine's. */
  const adapter = $derived(shownAdapter());
  const running = $derived(adapter.live?.session.jobActive ?? false);
  const jobSettings = $derived(editor.project?.jobSettings ?? null);

  const ORIGINS: Array<{ id: JobSettings['origin']; label: string; hint: string }> = [
    { id: 'absolute', label: 'Absolute', hint: 'Bed coordinates are machine coordinates' },
    { id: 'current-position', label: 'Current', hint: 'Start the job where the laser is now' },
    { id: 'user-origin', label: 'User', hint: 'Start the job at the origin you set' },
  ];

  function setOrigin(patch: Partial<JobSettings>) {
    editor.commit((p) => setJobSettings(p, patch));
  }
</script>

<section class="machine" aria-label="Machine" data-testid="machine-panel">
  <div class="head">
    <SectionToggle id="machine">Machine</SectionToggle>
    {#if adapter.badge}<adapter.badge />{/if}
  </div>

  {#if sections.isOpen('machine')}
    <MachineSwitcher />
    <ErrorBoundary name="Setup" compact><AccessoryPicker /></ErrorBoundary>

    <ErrorBoundary name={adapter.label} compact><adapter.panel /></ErrorBoundary>

    {#if jobSettings && !running && adapter.capabilities.jobOrigin}
      <div class="origin-block" data-testid="job-origin">
        <div class="origin-head">
          <h3>Job origin</h3>
          {#if jobSettings.origin === 'user-origin' && jobSettings.userOrigin}
            <span class="mono muted small"
              >{coord(jobSettings.userOrigin.x)}, {coord(jobSettings.userOrigin.y)}</span
            >
          {/if}
        </div>
        <div class="origin">
          <div class="segmented" role="group" aria-label="Job origin">
            {#each ORIGINS as o (o.id)}
              <button
                type="button"
                aria-pressed={jobSettings.origin === o.id}
                title={o.hint}
                onclick={() => setOrigin({ origin: o.id })}>{o.label}</button
              >
            {/each}
          </div>
          {#if jobSettings.origin !== 'absolute'}
            <AnchorPicker
              size="md"
              label="Job anchor"
              value={jobSettings.anchor}
              onchange={(a) => setOrigin({ anchor: a })}
            />
          {/if}
        </div>
        <div class="origin-actions">
          <button
            type="button"
            class="btn small"
            disabled={!machine.connected || running}
            title="Use the laser's current position as the job origin"
            onclick={() => machine.setUserOriginHere()}
            data-testid="set-origin"><Flag size={14} />Set origin here</button
          >
          <button
            type="button"
            class="btn small"
            disabled={!machine.connected || running}
            title="Move the laser to the job origin with the laser off"
            onclick={() => machine.goToOrigin()}><LocateFixed size={14} />Go to origin</button
          >
        </div>
      </div>
    {/if}
  {/if}
</section>

<style>
  .machine {
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 14px;
    border-bottom: 1px solid var(--ol-border);
  }

  .head {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .small {
    font-size: var(--ol-fs-xs);
  }

  .origin-block {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding-top: 12px;
    border-top: 1px solid var(--ol-border);
  }

  .origin-head {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
  }

  h3 {
    margin: 0;
    font-size: var(--ol-fs-sm);
    font-weight: 600;
    color: var(--ol-text-2);
  }

  .origin-actions {
    display: flex;
    gap: 6px;
  }

  .origin-actions .btn {
    flex: 1;
  }

  .origin {
    display: flex;
    gap: 10px;
    align-items: center;
  }

  .origin .segmented {
    flex: 1;
  }
</style>
