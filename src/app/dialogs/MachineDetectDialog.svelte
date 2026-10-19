<script lang="ts">
  import Dialog from '$lib/ui/Dialog.svelte';
  import { presetName, type MachinePreset } from '$lib/project/machine-presets';
  import { machine } from '../state/machine.svelte';
  import { profiles } from '../state/profiles.svelte';
  import PresetPicker from './PresetPicker.svelte';

  const request = $derived(machine.detectRequest);
  let open = $state(false);
  let chosen = $state<MachinePreset | null>(null);

  $effect(() => {
    open = request !== null;
    chosen = request?.best?.preset ?? null;
  });

  const suggestions = $derived(request?.candidates.slice(0, 3) ?? []);

  function answer(preset: MachinePreset | null) {
    request?.resolve(preset);
  }
</script>

<Dialog
  bind:open
  title="Which machine is this?"
  width={520}
  onclose={() => answer(null)}
  testid="machine-detect-dialog"
>
  {#if request}
    <p class="lead">
      {#if request.best}
        This looks like a <strong>{presetName(request.best.preset)}</strong> ({request.best.reasons.join(
          ', ',
        )}).
      {:else}
        Pick your machine so the bed size and limits match.
      {/if}
    </p>
    <div class="facts mono">
      {#if request.travelX !== null && request.travelY !== null}<span
          >Travel {request.travelX} × {request.travelY} mm</span
        >{/if}
      {#each request.info
        .split('\n')
        .filter((l) => /VER|Grbl|grbl/i.test(l))
        .slice(0, 2) as line (line)}<span>{line}</span>{/each}
    </div>
    {#if suggestions.length > 1 || (suggestions.length === 1 && !request.best)}
      <div class="chips" role="group" aria-label="Suggestions">
        {#each suggestions as s (presetName(s.preset))}
          <button
            type="button"
            class="chip"
            aria-pressed={chosen === s.preset}
            onclick={() => (chosen = s.preset)}>{presetName(s.preset)}</button
          >
        {/each}
      </div>
    {/if}
    <PresetPicker selected={chosen ? presetName(chosen) : null} onselect={(p) => (chosen = p)} height={220} />
  {/if}
  {#snippet footer()}
    <button type="button" class="btn" onclick={() => answer(null)}>Keep {profiles.active.name}</button>
    <button
      type="button"
      class="btn start"
      disabled={!chosen}
      onclick={() => answer(chosen)}
      data-testid="machine-detect-confirm"
    >
      {chosen ? `Use ${presetName(chosen)}` : 'Use machine'}
    </button>
  {/snippet}
</Dialog>

<style>
  .lead {
    color: var(--ol-text-2);
    line-height: 1.5;
    margin-bottom: 10px;
  }

  .facts {
    display: flex;
    flex-direction: column;
    gap: 2px;
    margin-bottom: 12px;
    font-size: var(--ol-fs-xs);
    color: var(--ol-text-muted);
  }

  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-bottom: 10px;
  }

  .chip {
    padding: 4px 10px;
    border-radius: 999px;
    border: 1px solid var(--ol-border);
    background: var(--ol-bg);
    font-size: var(--ol-fs-sm);
  }

  .chip[aria-pressed='true'] {
    border-color: var(--ol-signal);
    background: var(--ol-signal-tint);
  }
</style>
