<script lang="ts">
  import { Popover } from 'bits-ui';
  import ChevronsUpDown from '@lucide/svelte/icons/chevrons-up-down';
  import Check from '@lucide/svelte/icons/check';
  import Settings2 from '@lucide/svelte/icons/settings-2';
  import { defaultMachineProfile } from '$lib/project/factory';
  import {
    machineKind,
    presetName,
    presetProfileFields,
    type MachinePreset,
  } from '$lib/project/machine-presets';
  import { toast } from '$lib/ui/toasts.svelte';
  import PresetPicker from '../dialogs/PresetPicker.svelte';
  import { machine } from '../state/machine.svelte';
  import { profiles } from '../state/profiles.svelte';
  import { ui } from '../state/ui.svelte';

  let open = $state(false);
  const active = $derived(profiles.active);

  async function usePreset(preset: MachinePreset) {
    open = false;
    const name = presetName(preset);
    const existing = profiles.list.find((p) => p.name === name);
    if (existing) {
      await profiles.activate(existing.id);
    } else {
      const profile = defaultMachineProfile(presetProfileFields(preset));
      await profiles.save(profile);
      await profiles.activate(profile.id);
    }
    toast.success(`Machine set to ${name}`);
  }
  const details = $derived(
    [`${active.bedWidth} × ${active.bedHeight} mm`, machineKind(active)].filter(Boolean).join(' · '),
  );
</script>

<div class="switcher" data-testid="machine-switcher">
  <div class="current">
    <span class="name" data-testid="machine-name">{active.name}</span>
    <span class="mono muted small">{details}</span>
  </div>
  <Popover.Root bind:open>
    <Popover.Trigger
      class="icon-btn sm"
      aria-label="Change machine"
      disabled={machine.jobActive}
      data-testid="change-machine"
    >
      <ChevronsUpDown size={15} />
    </Popover.Trigger>
    <Popover.Portal>
      <Popover.Content class="ol-menu machine-pop" sideOffset={6} align="end">
        {#if profiles.list.length > 1}
          <div class="section">Your machines</div>
          {#each profiles.list as p (p.id)}
            <button
              type="button"
              class="saved"
              onclick={() => {
                open = false;
                void profiles.activate(p.id);
              }}
            >
              <span>{p.name}</span>
              <span class="mono dim">{p.bedWidth} × {p.bedHeight}</span>
              <span class="tick"
                >{#if p.id === active.id}<Check size={14} />{/if}</span
              >
            </button>
          {/each}
          <div class="section">All machines</div>
        {/if}
        <PresetPicker selected={active.name} onselect={usePreset} height={280} />
        <button
          type="button"
          class="btn small ghost edit"
          onclick={() => {
            open = false;
            ui.profilesOpen = true;
          }}><Settings2 size={14} />Edit machine profiles</button
        >
      </Popover.Content>
    </Popover.Portal>
  </Popover.Root>
</div>

<style>
  .switcher {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 6px 8px 12px;
    border-radius: var(--ol-radius-md);
    border: 1px solid var(--ol-border);
  }

  .current {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .name {
    font-weight: 500;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .small {
    font-size: var(--ol-fs-xs);
  }

  :global(.machine-pop) {
    width: 330px;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .section {
    padding: 2px 4px;
    font-size: var(--ol-fs-xs);
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--ol-text-dim);
  }

  .saved {
    display: grid;
    grid-template-columns: 1fr auto 16px;
    gap: 10px;
    align-items: center;
    padding: 7px 10px;
    border: 0;
    border-radius: var(--ol-radius-sm);
    background: none;
    text-align: left;
  }

  .saved:hover {
    background: var(--ol-surface-2);
  }

  .tick {
    display: flex;
    color: var(--ol-signal);
  }

  .edit {
    align-self: flex-start;
  }
</style>
