<script lang="ts">
  import Dialog from '$lib/ui/Dialog.svelte';
  import NumberField from '$lib/ui/NumberField.svelte';
  import Toggle from '$lib/ui/Toggle.svelte';
  import type { ThemePreference } from '$lib/storage/preferences';
  import { preferences } from '../state/preferences.svelte';
  import { ui } from '../state/ui.svelte';
  import { resetTour } from '../state/tour';
  import { toast } from '$lib/ui/toasts.svelte';

  const p = $derived(preferences.value);
  const THEMES: Array<{ id: ThemePreference; label: string }> = [
    { id: 'system', label: 'System' },
    { id: 'dark', label: 'Dark' },
    { id: 'light', label: 'Light' },
  ];
</script>

<Dialog bind:open={ui.preferencesOpen} title="Preferences" width={480} testid="preferences-dialog">
  <div class="stack">
    <div class="field">
      Theme
      <div class="segmented" role="group" aria-label="Theme">
        {#each THEMES as t (t.id)}
          <button
            type="button"
            aria-pressed={p.theme === t.id}
            onclick={() => preferences.update({ theme: t.id })}>{t.label}</button
          >
        {/each}
      </div>
    </div>

    <div class="field">
      When a line fails during a job
      <div class="segmented" role="group" aria-label="Error policy">
        <button
          type="button"
          aria-pressed={p.errorPolicy === 'stop'}
          title="Holds the job on a controller error and waits for you"
          onclick={() => preferences.update({ errorPolicy: 'stop' })}>Pause and ask</button
        >
        <button
          type="button"
          aria-pressed={p.errorPolicy === 'continue'}
          title="Notes the error in the console and keeps going"
          onclick={() => preferences.update({ errorPolicy: 'continue' })}>Log and continue</button
        >
      </div>
    </div>

    <NumberField
      label="Status poll interval"
      hint="How often the machine is asked for its position and state"
      unit="ms"
      value={p.statusPollMs}
      min={50}
      max={1000}
      step={10}
      onchange={(v) => preferences.update({ statusPollMs: v })}
    />

    <Toggle
      label="Hide status reports and ok lines in the console"
      checked={p.quietConsole}
      onchange={(c) => preferences.update({ quietConsole: c })}
    />
    <Toggle
      label="Auto-scroll the console to the newest line"
      checked={p.consoleAutoScroll}
      onchange={(c) => preferences.update({ consoleAutoScroll: c })}
    />

    <h3>Units</h3>
    <p class="muted">Millimetres and mm/min throughout.</p>

    <h3>G-code debugging</h3>
    <Toggle
      label="Layer comments in output"
      hint="Writes a comment with the layer name before each layer's moves"
      checked={p.debug.gcodeComments}
      onchange={(c) => preferences.update({ debug: { ...p.debug, gcodeComments: c } })}
    />
    <Toggle
      label="Turn off the optimizer"
      hint="Keeps every repeated word and zero-length move, for comparing output"
      checked={p.debug.disableOptimizer}
      onchange={(c) => preferences.update({ debug: { ...p.debug, disableOptimizer: c } })}
    />
    <Toggle
      label="Leading zero in decimals (0.5)"
      hint="Writes 0.5 where the optimizer would write .5"
      checked={p.debug.leadingZero}
      onchange={(c) => preferences.update({ debug: { ...p.debug, leadingZero: c } })}
    />

    <h3>Tour</h3>
    <button
      type="button"
      class="btn small fit"
      onclick={() => {
        resetTour();
        ui.preferencesOpen = false;
        ui.tourOpen = true;
        toast.info('Starting the tour');
      }}>Show the tour again</button
    >
  </div>
</Dialog>

<style>
  .stack {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  h3 {
    margin-top: 6px;
    font-size: var(--ol-fs-md);
    font-weight: 600;
  }

  .fit {
    align-self: flex-start;
  }
</style>
