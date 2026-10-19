<script lang="ts">
  import RotateCcw from '@lucide/svelte/icons/rotate-ccw';
  import { machine } from '../state/machine.svelte';
  import { OVERRIDE_MAX, OVERRIDE_MIN, overrideSteps, type OverrideAxis } from '../lib/overrides';

  const AXES: Array<{ axis: OverrideAxis; label: string; key: 'feed' | 'spindle' }> = [
    { axis: 'feed', label: 'Speed', key: 'feed' },
    { axis: 'spindle', label: 'Power', key: 'spindle' },
  ];

  function set(axis: OverrideAxis, key: 'feed' | 'spindle', target: number) {
    for (const cmd of overrideSteps(axis, machine.state.overrides[key], target)) machine.realtime(cmd);
  }
</script>

<div class="overrides" aria-label="Overrides" data-testid="overrides">
  {#each AXES as a (a.axis)}
    {@const value = machine.state.overrides[a.key]}
    <label class="row">
      <span class="label">{a.label}</span>
      <input
        type="range"
        min={OVERRIDE_MIN}
        max={OVERRIDE_MAX}
        step="1"
        {value}
        onchange={(e) => set(a.axis, a.key, Number(e.currentTarget.value))}
      />
      <span class="mono value">{value}%</span>
      <button
        type="button"
        class="icon-btn sm"
        aria-label="Reset {a.label.toLowerCase()} override"
        title="Reset to 100%"
        disabled={value === 100}
        onclick={() => set(a.axis, a.key, 100)}
      >
        <RotateCcw size={13} />
      </button>
    </label>
  {/each}
</div>

<style>
  .overrides {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .row {
    display: grid;
    grid-template-columns: 48px 1fr 44px 28px;
    align-items: center;
    gap: 8px;
    font-size: var(--ol-fs-sm);
    color: var(--ol-text-muted);
  }

  input {
    accent-color: var(--ol-beam);
  }

  .value {
    color: var(--ol-text);
    text-align: right;
  }
</style>
